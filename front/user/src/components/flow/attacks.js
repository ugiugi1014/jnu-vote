// 공격 시도: 흐름도 무대에서 재생할 순서 + 데모 체인에서 실제로 해 보는 함수
//  데모가 켜져 있으면 실제 블록체인에 보내 거절되는 것을 확인하고, 꺼져 있으면 같은 장면을 설명으로 보여 준다.
import { ethers } from "ethers";
import VotingSystemABI from "../../abi/VotingSystem.json";
import { bytesToField, newRecoveryBytes, deriveSecret, computeCommitment, buildMerkleProof } from "../../services/voterIdService";
import { encryptVote } from "../../services/ecdhService";
import { generateVoteProof } from "../../services/zkpService";

const API = import.meta.env.VITE_API_BASE_URL;
const coder = ethers.AbiCoder.defaultAbiCoder();
const VERIFIER_ABI = {
  vote: ["function verifyProof(uint[2] _pA, uint[2][2] _pB, uint[2] _pC, uint[9] _pubSignals) view returns (bool)"],
  tally: ["function verifyProof(uint[2] _pA, uint[2][2] _pB, uint[2] _pC, uint[160] _pubSignals) view returns (bool)"],
};

// 블록체인이 돌려주는 거절 이유 → 쉬운 말
const REASONS = {
  "duplicate nullifier": "이미 투표한 사람입니다",
  "unknown merkle root": "명단에 없는 사람입니다",
  "vote proof failed": "증명이 맞지 않습니다",
  "tally proof failed": "개표 증명이 맞지 않습니다",
};

export const ATTACKS = {
  double: {
    title: "한 번 더 투표하기",
    story: "이미 투표한 학생이 같은 투표권으로 다른 후보에게 한 번 더 냅니다.",
    actors: { student: { title: "공격자", role: "이미 투표한 학생", bad: true } },
    beats: [
      { app: { s: "ready", sel: 2, tap: "cand" }, at: "student", text: "다른 후보로 한 번 더 투표", value: "같은 투표권 사용", bad: true, note: "이미 투표한 학생이 마음을 바꿔 다른 후보로 한 번 더 냅니다." },
      { app: { s: "voting", stage: 1 }, at: "student", text: "중복투표방지 값 계산", value: "투표권이 같으니 값도 같음", note: "투표권이 같으면 중복투표방지 값도 같을 수밖에 없습니다." },
      { app: { s: "voting", stage: 2 }, send: ["student", "server"], text: "두 번째 표", value: "증명 + 잠긴 투표 내용", bad: true, note: "두 번째 표를 보냅니다." },
      { app: { s: "voting", stage: 2 }, send: ["server", "chain"], text: "블록체인에 표 제출", value: "castVote", bad: true, note: "서버가 블록체인에 제출합니다." },
      { app: { s: "voting", stage: 2 }, at: "chain", text: "이미 투표한 사람인가", block: true, note: "블록체인이 같은 중복투표방지 값을 찾습니다." },
    ],
  },
  outsider: {
    title: "명단에 없는 사람이 투표하기",
    story: "선거 명단에 없는 휴학생이 자기 투표권을 만들고, 진짜 증명까지 만들어서 냅니다.",
    actors: { student: { title: "공격자", role: "명단에 없는 휴학생", bad: true } },
    beats: [
      { app: { s: "ready" }, at: "student", text: "자기 투표권 만들기", value: "명단에는 등록 안 됨", bad: true, note: "명단에 없으니 서버가 등록해 주지 않습니다. 그래서 투표권을 혼자 만듭니다." },
      { app: { s: "voting", stage: 1, progress: true }, at: "student", text: "자기만 들어간 가짜 명단으로 증명 만들기", value: "증명은 만들어짐", bad: true, note: "자기만 들어간 명단을 만들면 증명 자체는 만들 수 있습니다. (이 브라우저에서 실제로 만듭니다)" },
      { app: { s: "voting", stage: 2 }, send: ["student", "server"], text: "증명 + 잠긴 투표 내용", bad: true, note: "만든 표를 보냅니다." },
      { app: { s: "voting", stage: 2 }, send: ["server", "chain"], text: "블록체인에 표 제출", value: "castVote", bad: true, note: "서버가 블록체인에 제출합니다." },
      { app: { s: "voting", stage: 2 }, at: "chain", text: "이미 투표한 사람인가", value: "아니오", ok: true, note: "처음 내는 표라 여기는 통과합니다." },
      { app: { s: "voting", stage: 2 }, at: "chain", text: "명단에 있는 사람인가", block: true, note: "증명에 쓴 명단이 블록체인이 가진 명단과 같은지 봅니다." },
    ],
  },
  swap: {
    title: "서버가 표 바꿔치기",
    story: "서버가 학생 표를 대신 제출하면서, 잠긴 투표 내용을 몰래 다른 값으로 바꿉니다.",
    actors: { server: { title: "공격자", role: "표를 바꾸려는 서버", bad: true } },
    beats: [
      { app: { s: "voting", stage: 2 }, send: ["student", "server"], text: "정상적인 표", value: "증명 + 잠긴 투표 내용", note: "학생은 정상적으로 투표했습니다." },
      { app: { s: "voting", stage: 2 }, at: "server", text: "잠긴 투표 내용을 몰래 바꾸기", value: "다른 값으로 바꿈", bad: true, note: "서버가 다른 후보 쪽으로 표를 바꾸려고 잠긴 값을 고칩니다." },
      { app: { s: "voting", stage: 2 }, send: ["server", "chain"], text: "바꾼 표 제출", value: "증명은 원래 것 그대로", bad: true, note: "증명은 다시 만들 수 없어서 원래 증명을 그대로 붙입니다." },
      { app: { s: "voting", stage: 2 }, at: "chain", text: "증명 확인", block: true, note: "증명은 원래 잠긴 값에만 맞습니다." },
    ],
  },
  tally: {
    title: "관리자가 개표 조작하기",
    story: "관리자가 표를 연 뒤, 한 후보의 득표를 1 올려서 블록체인에 기록하려고 합니다.",
    actors: { server: { title: "공격자", role: "결과를 바꾸려는 관리자", bad: true } },
    beats: [
      { app: { s: "closed" }, at: "server", text: "표 열어서 세기", value: "정상 결과", note: "관리자가 표를 열어 셉니다." },
      { app: { s: "closed" }, at: "server", text: "첫 번째 후보 득표를 1 올리기", value: "결과 조작", bad: true, note: "한 후보에게 유리하게 득표를 바꿉니다." },
      { app: { s: "closed" }, send: ["server", "chain"], text: "조작한 득표 + 원래 증명", bad: true, note: "개표 증명은 다시 만들 수 없어서 원래 증명을 붙입니다." },
      { app: { s: "closed" }, at: "chain", text: "개표 증명 확인", block: true, note: "개표 증명은 실제로 센 득표에만 맞습니다." },
    ],
  },
};

// 데모가 꺼져 있을 때 보여 줄 결과 (실제로 돌렸을 때와 같은 거절)
const OFFLINE = {
  double: { raw: "duplicate nullifier" },
  outsider: { raw: "unknown merkle root" },
  swap: { raw: "vote proof failed" },
  tally: { raw: "tally proof failed" },
};

const reasonOf = (err) => err?.reason || err?.revert?.args?.[0] || err?.shortMessage || err?.message || String(err);
const friendly = (raw) => Object.entries(REASONS).find(([k]) => raw.includes(k))?.[1] || raw;

async function connect() {
  const info = await fetch(`${API}/demo/info`).then((r) => r.json()).catch(() => null);
  if (!info?.enabled) return null;
  const provider = new ethers.JsonRpcProvider(import.meta.env.VITE_RPC_URL);
  try {
    await provider.getBlockNumber();
  } catch {
    return null;
  }
  const elections = await fetch(`${API}/elections`).then((r) => r.json()).catch(() => []);
  return { provider, elections: (elections || []).filter((e) => e.contract_address) };
}

// 진행 중 선거 중 체인에 표가 있는 것 (공격 대상)
async function activeWithVotes(provider, elections) {
  for (const e of elections.filter((x) => x.status === "active")) {
    const vs = new ethers.Contract(e.contract_address, VotingSystemABI, provider);
    const cast = await vs.queryFilter(vs.filters.VoteCast(), 0);
    if (cast.length) return { e, vs, cast };
  }
  return null;
}

const NEED_RESET = "데모 데이터에 미리 넣어 둔 표가 없습니다. demo 폴더의 reset 을 실행해 데모를 처음 상태로 다시 시작해 주세요.";

/** 반환: { live, blocked, raw, reason, lines[] } 또는 { info } */
export async function runAttack(kind) {
  const c = await connect();
  if (!c) return { live: false, blocked: true, raw: OFFLINE[kind].raw, reason: friendly(OFFLINE[kind].raw), lines: [] };
  const { provider, elections } = c;

  if (kind === "double" || kind === "swap") {
    const found = await activeWithVotes(provider, elections);
    if (!found) return { info: NEED_RESET };
    const { e, vs, cast } = found;
    const tx = await provider.getTransaction(cast[0].transactionHash);
    const args = vs.interface.parseTransaction({ data: tx.data }).args;
    const [nullifier, root, encryptedData, voterPubKey, rA, rB, rC] = args;
    const pA = rA.map(BigInt);
    const pB = rB.map((r) => r.map(BigInt));
    const pC = rC.map(BigInt);

    if (kind === "double") {
      // 체인에 실제로 기록된 표를 그대로 한 번 더 보낸다
      try {
        await vs.castVote.staticCall(nullifier, root, encryptedData, voterPubKey, pA, pB, pC, { from: tx.from });
        return { live: true, blocked: false, raw: "통과", reason: "예상과 달리 통과", lines: [] };
      } catch (err) {
        const raw = reasonOf(err);
        return { live: true, blocked: true, raw, reason: friendly(raw), lines: [`선거: ${e.title}`, `이미 기록된 표를 그대로 다시 보냄`] };
      }
    }

    // swap: 같은 증명에 잠긴 값만 바꿔 투표 증명 검증 컨트랙트에 넣어 본다
    const verifier = new ethers.Contract(await vs.voteVerifier(), VERIFIER_ABI.vote, provider);
    const [ct] = coder.decode(["uint256"], encryptedData);
    const [ex, ey] = coder.decode(["uint256", "uint256"], voterPubKey);
    const signals = [BigInt(nullifier), BigInt(root), BigInt(e.contract_address), await vs.numCandidates(), await vs.coordPubX(), await vs.coordPubY(), ct, ex, ey];
    const original = await verifier.verifyProof(pA, pB, pC, signals);
    const forged = [...signals];
    forged[6] = ct + 1n;
    const changed = await verifier.verifyProof(pA, pB, pC, forged);
    return {
      live: true,
      blocked: original && !changed,
      raw: changed ? "통과" : "vote proof failed",
      reason: changed ? "예상과 달리 통과" : "증명이 맞지 않습니다",
      lines: [`선거: ${e.title}`, `원래 표로 확인: ${original ? "통과" : "실패"}`, `바꾼 표로 확인: ${changed ? "통과" : "실패"}`],
    };
  }

  if (kind === "outsider") {
    const e = elections.find((x) => x.status === "active");
    if (!e) return { info: NEED_RESET };
    const vs = new ethers.Contract(e.contract_address, VotingSystemABI, provider);
    const [cx, cy, nc] = await Promise.all([vs.coordPubX(), vs.coordPubY(), vs.numCandidates()]);
    // 명단에 없는 사람: 자기 투표권 + 자기만 들어간 명단으로 진짜 증명을 만든다
    const secret = await deriveSecret(bytesToField(newRecoveryBytes()), e.contract_address);
    const commitment = await computeCommitment(secret);
    const { root, pathElements, pathIndices } = await buildMerkleProof([commitment], commitment);
    const enc = await encryptVote(0, { x: cx, y: cy });
    const { proof, nullifier } = await generateVoteProof({
      secret, pathElements, pathIndices, candidateId: 0, ephPriv: enc.ephPriv, merkleRoot: root,
      scope: BigInt(e.contract_address), numCandidates: nc, coordPubX: cx, coordPubY: cy,
      ciphertext: enc.ciphertext, ephPubX: enc.ephPubX, ephPubY: enc.ephPubY,
    });
    try {
      await vs.castVote.staticCall(
        ethers.zeroPadValue(ethers.toBeHex(BigInt(nullifier)), 32), root,
        coder.encode(["uint256"], [enc.ciphertext]), coder.encode(["uint256", "uint256"], [enc.ephPubX, enc.ephPubY]),
        proof.pi_a.slice(0, 2), [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]], proof.pi_c.slice(0, 2)
      );
      return { live: true, blocked: false, raw: "통과", reason: "예상과 달리 통과", lines: [] };
    } catch (err) {
      const raw = reasonOf(err);
      return { live: true, blocked: true, raw, reason: friendly(raw), lines: [`선거: ${e.title}`, `이 브라우저에서 만든 진짜 증명으로 시도`] };
    }
  }

  if (kind === "tally") {
    const e = elections.find((x) => x.status === "tallied");
    if (!e) return { info: NEED_RESET };
    const vs = new ethers.Contract(e.contract_address, VotingSystemABI, provider);
    const recs = await vs.queryFilter(vs.filters.TallyBatchRecorded(), 0);
    if (!recs.length) return { info: NEED_RESET };
    const tx = await provider.getTransaction(recs[recs.length - 1].transactionHash);
    // recordTallyBatch(batchIndex, candidateIds, voteCounts, pA, pB, pC, pubSignals)
    const [, , , rA, rB, rC, pub] = vs.interface.parseTransaction({ data: tx.data }).args;
    const pA = rA.map(BigInt);
    const pB = rB.map((r) => r.map(BigInt));
    const pC = rC.map(BigInt);
    const signals = Array.from(pub, BigInt);
    const verifier = new ethers.Contract(await vs.tallyVerifier(), VERIFIER_ABI.tally, provider);
    const original = await verifier.verifyProof(pA, pB, pC, signals);
    const forged = [...signals];
    forged[155] += 1n; // 첫 번째 후보 득표 +1
    const changed = await verifier.verifyProof(pA, pB, pC, forged);
    return {
      live: true,
      blocked: original && !changed,
      raw: changed ? "통과" : "tally proof failed",
      reason: changed ? "예상과 달리 통과" : "개표 증명이 맞지 않습니다",
      lines: [`선거: ${e.title}`, `첫 번째 후보 득표 ${signals[155]} → ${forged[155]}`, `원래 결과로 확인: ${original ? "통과" : "실패"}`, `바꾼 결과로 확인: ${changed ? "통과" : "실패"}`],
    };
  }
  return null;
}
