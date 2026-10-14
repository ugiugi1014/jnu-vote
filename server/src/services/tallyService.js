// 개표 비즈니스 로직 (라우터 ↔ 스케줄러 공유)
//
// performTally(electionId) :
//   1) closed 상태 확인 + 코디네이터 키/컨트랙트 주소 확인
//   2) 후보/유권자/체인 vote 데이터 조회
//   3) BabyJubJub ECDH 복호화 → candidateID 복원 → 집계
//   4) 표를 50개씩 배치로 나눠 ZKP② proof 생성 (병렬, TALLY_PROOF_CONCURRENCY)
//      배치 사이에는 누적 득표 커밋먼트만 이어지고, 최종 득표는 마지막 배치에서만 공개
//   5) 체인 recordTallyBatch 를 배치 순서대로 호출
//      - 이미 체인에 기록된 배치(batchesProcessed)는 건너뜀 -> 중간 실패 시 재실행하면 이어서 진행
//      - salt 가 코디 개인키에서 결정적으로 나오므로 재실행해도 커밋먼트가 같다
//   6) 마지막 배치까지 성공한 뒤에만 DB tally_results 저장 + tallied + coord_private_key 폐기
//
// 정상 케이스 → { tally, batches, tallyTxHashes }
// 실패 → throw Error (HTTP 400 매핑용 statusCode 첨부). DB 는 변경되지 않음.

const db = require("../db");
const { getVotingContract } = require("../blockchain/votingContract");
const {
  decryptVote,
  parseEncryptedData,
  parseVoterPublicKey,
} = require("./ecdhDecrypt");
const { buildTallyBatchInputs, proveTallyBatches, TALLY_CANDIDATES } = require("./zkpServices");

function tallyError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function toSolidityProof(proof, publicSignals) {
  if (!proof?.pi_a || !proof?.pi_b || !proof?.pi_c) {
    throw new Error("tally proof 형식 오류");
  }
  if (!Array.isArray(publicSignals) || publicSignals.length !== 160) {
    throw new Error("tally publicSignals는 160개여야 합니다.");
  }

  return {
    pA: proof.pi_a.slice(0, 2).map(BigInt),
    // pi_b inner pair swap (snarkjs exportSolidityCallData 규약과 동일)
    pB: [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ],
    pC: proof.pi_c.slice(0, 2).map(BigInt),
    pubSignals: publicSignals.map(BigInt),
  };
}

async function performTally(electionId) {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // 1) 선거 상태 확인
    const [electionRows] = await conn.query(
      `SELECT * FROM elections WHERE id = ?`,
      [electionId]
    );

    if (electionRows.length === 0) {
      await conn.rollback();
      throw tallyError("선거 없음", 404);
    }

    const election = electionRows[0];

    if (election.status !== "closed") {
      await conn.rollback();
      throw tallyError("개표 가능한 상태가 아님 (closed만 가능)");
    }

    if (!election.coord_private_key) {
      await conn.rollback();
      throw tallyError("coord_private_key 없음 — 선거 생성 시 자동 생성됐어야 함");
    }

    if (!election.contract_address) {
      await conn.rollback();
      throw tallyError("contract_address 없음");
    }

    // 2) 후보 목록
    const [candidateRows] = await conn.query(
      `SELECT * FROM candidates WHERE election_id = ? ORDER BY candidate_index ASC`,
      [electionId]
    );

    if (candidateRows.length === 0) {
      await conn.rollback();
      throw tallyError("후보 없음");
    }

    const candidatesCount = candidateRows.length;
    const candidateMap = {};
    for (const c of candidateRows) {
      candidateMap[c.candidate_index] = c.id;
    }

    // 4) 체인에서 encryptedVotes 조회
    const contract = getVotingContract(election.contract_address);
    const encryptedVotes = await contract.getAllVotes();

    if (!encryptedVotes || encryptedVotes.length === 0) {
      await conn.rollback();
      throw tallyError("투표 데이터 없음");
    }

    // 5) 집계 초기화
    const tally = {};
    for (const c of candidateRows) {
      tally[c.candidate_index] = 0;
    }

    // 6) 복호화 + 집계
    //    체인의 모든 표는 voteProof 로 "유효 후보를 등록된 코디네이터 키로 암호화"한 것이 검증됐으므로
    //    복호화 실패는 정상적으로 일어날 수 없다 -> 건너뛰지 않고 즉시 중단 (tally 회로도 누락을 허용하지 않음)
    const coordPub = JSON.parse(election.coord_public_key);
    const zkpVotes = [];
    for (let i = 0; i < encryptedVotes.length; i++) {
      const vote = encryptedVotes[i];
      const encryptedDataBytes = vote.encryptedData ?? vote[0];
      const voterPubKeyBytes = vote.voterPublicKey ?? vote[1];

      const { ciphertext } = parseEncryptedData(encryptedDataBytes);
      const ephPub = parseVoterPublicKey(voterPubKeyBytes);

      const decrypted = await decryptVote({ ciphertext }, election.coord_private_key, ephPub);

      if (tally[decrypted.candidateId] === undefined) {
        throw tallyError(`vote ${i} 복호화 결과(${decrypted.candidateId})가 후보 목록에 없음`, 500);
      }

      tally[decrypted.candidateId] += 1;
      zkpVotes.push({
        candidateId: decrypted.candidateId,
        ciphertext: decrypted.ciphertext,
        ephPubX: decrypted.ephPubX,
        ephPubY: decrypted.ephPubY,
      });
    }

    // 7) 배치 입력 생성 + ZKP② proof 병렬 생성 (아직 체인에 기록되지 않은 배치만)
    const batches = await buildTallyBatchInputs({
      coordPriv: election.coord_private_key,
      coordPub,
      zkpVotes,
      candidatesCount,
    });
    const onChainTotal = Number(await contract.totalBatches());
    if (onChainTotal !== batches.length) {
      throw tallyError(`배치 수 불일치: 체인=${onChainTotal}, 서버=${batches.length}`, 500);
    }
    const done = Number(await contract.batchesProcessed());
    const pending = batches.slice(done);

    let proofs;
    try {
      proofs = await proveTallyBatches(pending, `tally_${electionId}`);
    } catch (err) {
      console.error("[tally] ZKP proof 생성 실패:", err.message);
      throw new Error(`ZKP proof 생성 실패: ${err.message}`);
    }

    // 8) 체인에 recordTallyBatch 순서대로 (DB 커밋 전 — 실패하면 롤백되어 코디 키가 남고, 재실행 시 이어서 진행)
    const candidateIds = [];
    for (let c = 0; c < TALLY_CANDIDATES; c++) {
      const id = candidateMap[c]; // 해당 index의 후보 id, 없으면 0
      candidateIds.push(id != null ? id : 0);
    }
    const tallyTxHashes = [];
    for (let j = 0; j < pending.length; j++) {
      const k = done + j;
      const solidityProof = toSolidityProof(proofs[j].proof, proofs[j].publicSignals);
      try {
        const tx = await contract.recordTallyBatch(
          k,
          candidateIds,
          pending[j].result,
          solidityProof.pA,
          solidityProof.pB,
          solidityProof.pC,
          solidityProof.pubSignals
        );
        const receipt = await tx.wait();
        tallyTxHashes.push(receipt?.hash || tx.hash);
      } catch (err) {
        console.error(`[tally] recordTallyBatch(${k}) 체인 호출 실패:`, err.message);
        throw tallyError(
          `recordTallyBatch ${k}/${batches.length - 1} 실패 (DB 변경 없음, 재실행하면 이 배치부터 이어서 진행): ${err.message}`,
          502
        );
      }
    }

    // 9) DB tally_results 저장
    await conn.query(`DELETE FROM tally_results WHERE election_id = ?`, [electionId]);

    for (const candidateIndex in tally) {
      const candidateId = candidateMap[candidateIndex];
      await conn.query(
        `INSERT INTO tally_results (election_id, candidate_id, vote_count)
         VALUES (?, ?, ?)`,
        [electionId, candidateId, tally[candidateIndex]]
      );
    }

    // 10) elections.status = tallied + 코디네이터 개인키 폐기 (체인 기록 성공 후에만)
    await conn.query(
      `UPDATE elections
       SET status = 'tallied', coord_private_key = NULL
       WHERE id = ?`,
      [electionId]
    );

    await conn.commit();

    return {
      electionId,
      tally,
      batches: batches.length,
      tallyTxHashes,
    };
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {}
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { performTally };
