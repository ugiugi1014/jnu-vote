// 직접 해 보기: 데모·서버 없이 이 브라우저에서 실제 계산을 돌린다 (투표 화면과 같은 코드)
import { useState } from "react";
import { buildBabyjub, buildPoseidon } from "circomlibjs";
import {
  bytesToField, newRecoveryBytes, deriveSecret, computeCommitment, buildMerkleProof,
} from "../../services/voterIdService";
import { encryptVote, SNARK_FIELD } from "../../services/ecdhService";
import { generateVoteProof } from "../../services/zkpService";

const DEMO_SCOPE = "0x00000000000000000000000000000000000000E1"; // 체험용 가상의 선거 주소
const CANDIDATES = ["기호 0", "기호 1", "기호 2"];
const short = (v) => {
  const s = String(v);
  return s.length > 26 ? `${s.slice(0, 12)}…${s.slice(-10)}` : s;
};

function Row({ k, v, note }) {
  return (
    <div className="hiw-kv">
      <span className="hiw-k">{k}</span>
      <span className="hiw-v" title={String(v)}>{short(v)}</span>
      {note && <span className="hiw-note">{note}</span>}
    </div>
  );
}

// 체험용 코디네이터 키 (실제 선거에서는 선거 생성 때 만들어 공개키만 체인에 고정)
async function makeCoordinator() {
  const babyjub = await buildBabyjub();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  let priv = 0n;
  for (const b of bytes) priv = (priv << 8n) | BigInt(b);
  priv = (priv % (babyjub.subOrder - 1n)) + 1n;
  const pub = babyjub.mulPointEscalar(babyjub.Base8, priv);
  return { priv, x: babyjub.F.toObject(pub[0]), y: babyjub.F.toObject(pub[1]) };
}

// 코디네이터 개인키로 복호화 (개표 때 관리자가 하는 일)
async function decrypt(coord, ciphertext, ephPubX, ephPubY) {
  const babyjub = await buildBabyjub();
  const poseidon = await buildPoseidon();
  const F = babyjub.F;
  const shared = babyjub.mulPointEscalar([F.e(ephPubX), F.e(ephPubY)], coord.priv);
  const ks = poseidon.F.toObject(poseidon([F.toObject(shared[0]), F.toObject(shared[1])]));
  return ((ciphertext - ks) % SNARK_FIELD + SNARK_FIELD) % SNARK_FIELD;
}

export default function TryIt({ kind, lab, setLab }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [candidate, setCandidate] = useState(1);

  const run = async (label, fn) => {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy("");
    }
  };

  const ensureKey = async (cur) => {
    if (cur.secret) return cur;
    const seed = bytesToField(newRecoveryBytes());
    const secret = await deriveSecret(seed, DEMO_SCOPE);
    const commitment = await computeCommitment(secret);
    return { ...cur, seed, secret, commitment };
  };
  const ensureEncrypted = async (cur, cand) => {
    let next = await ensureKey(cur);
    if (next.ciphertext !== undefined && next.candidate === cand) return next;
    const coord = next.coord || (await makeCoordinator());
    const enc = await encryptVote(cand, coord);
    const opened = await decrypt(coord, enc.ciphertext, enc.ephPubX, enc.ephPubY);
    return { ...next, coord, candidate: cand, ...enc, opened, proof: undefined };
  };

  if (kind === "key") {
    return (
      <div className="hiw-try">
        <button className="hiw-btn" disabled={!!busy} onClick={() => run("key", async () => setLab({ ...(await ensureKey({})) }))}>
          {busy ? "만드는 중…" : lab.secret ? "새 투표권 다시 만들기" : "내 투표권 만들어 보기"}
        </button>
        {lab.secret && (
          <>
            <Row k="투표권" v={lab.secret} note="이 브라우저에만 있음" />
            <Row k="암호화된 투표권" v={lab.commitment} note="이것만 서버로 감" />
            <p className="hiw-hint">암호화된 값에서 투표권을 거꾸로 알아낼 수 없습니다. 같은 투표권이면 언제나 같은 값이 나옵니다.</p>
          </>
        )}
        {error && <div className="hiw-err">{error}</div>}
      </div>
    );
  }

  if (kind === "encrypt") {
    return (
      <div className="hiw-try">
        <div className="hiw-cands">
          {CANDIDATES.map((c, i) => (
            <button key={c} className={`hiw-chip ${candidate === i ? "on" : ""}`} onClick={() => setCandidate(i)}>{c}</button>
          ))}
        </div>
        <button className="hiw-btn" disabled={!!busy} onClick={() => run("enc", async () => setLab(await ensureEncrypted(lab, candidate)))}>
          {busy ? "잠그는 중…" : `${CANDIDATES[candidate]} 골라서 잠가 보기`}
        </button>
        {lab.ciphertext !== undefined && (
          <>
            <Row k="잠긴 투표 내용" v={lab.ciphertext} note="블록체인에 올라가는 값" />
            <Row k="일회용 열쇠" v={lab.ephPubX} />
            <Row k="관리자 개인키로 열면" v={`기호 ${lab.opened}`} note="개표 때 관리자만 가능" />
            <p className="hiw-hint">같은 후보를 다시 잠가도 일회용 열쇠가 매번 달라서 잠긴 값이 바뀝니다. 잠긴 값만 봐서는 같은 후보인지도 알 수 없습니다.</p>
          </>
        )}
        {error && <div className="hiw-err">{error}</div>}
      </div>
    );
  }

  if (kind === "prove") {
    const prove = () => run("prove", async () => {
      let cur = await ensureEncrypted(lab, lab.candidate ?? candidate);
      // 체험용 명단: 다른 학생 3명 + 나
      const others = cur.others || [1n, 2n, 3n].map(() => bytesToField(newRecoveryBytes()));
      const commitments = [...others, cur.commitment];
      const { root, pathElements, pathIndices } = await buildMerkleProof(commitments, cur.commitment);
      const t0 = performance.now();
      const { proof, publicSignals } = await generateVoteProof({
        secret: cur.secret, pathElements, pathIndices, candidateId: cur.candidate, ephPriv: cur.ephPriv,
        merkleRoot: root, scope: BigInt(DEMO_SCOPE), numCandidates: 3,
        coordPubX: cur.coord.x, coordPubY: cur.coord.y, ciphertext: cur.ciphertext, ephPubX: cur.ephPubX, ephPubY: cur.ephPubY,
      });
      const ms = Math.round(performance.now() - t0);
      const { groth16 } = await import("snarkjs");
      const vkey = await fetch("/voteProof_verification_key.json").then((r) => r.json());
      const valid = await groth16.verify(vkey, publicSignals, proof);
      setLab({ ...cur, others, root, proof, publicSignals, ms, valid, tampered: undefined });
    });
    const tamper = () => run("tamper", async () => {
      const { groth16 } = await import("snarkjs");
      const vkey = await fetch("/voteProof_verification_key.json").then((r) => r.json());
      const forged = [...lab.publicSignals];
      forged[6] = ((BigInt(forged[6]) + 1n) % SNARK_FIELD).toString(); // 암호문을 1 바꿈
      setLab({ ...lab, tampered: await groth16.verify(vkey, forged, lab.proof) });
    });
    return (
      <div className="hiw-try">
        <button className="hiw-btn" disabled={!!busy} onClick={prove}>
          {busy === "prove" ? "증명 만드는 중… (몇 초)" : "이 브라우저에서 유효한 투표 증명 만들기"}
        </button>
        {lab.proof && (
          <>
            <Row k="걸린 시간" v={`${(lab.ms / 1000).toFixed(1)}초`} />
            <Row k="중복투표방지 값" v={lab.publicSignals[0]} />
            <Row k="명단 요약값" v={lab.publicSignals[1]} />
            <Row k="잠긴 투표 내용" v={lab.publicSignals[6]} />
            <div className={`hiw-verdict ${lab.valid ? "ok" : "bad"}`}>
              확인 결과: {lab.valid ? "통과" : "실패"} — 투표권 없이 공개 값과 증명만으로 확인
            </div>
            <button className="hiw-btn ghost" disabled={!!busy} onClick={tamper}>잠긴 투표 내용을 1만 바꿔서 다시 확인</button>
            {lab.tampered !== undefined && (
              <div className={`hiw-verdict ${lab.tampered ? "ok" : "bad"}`}>
                바꾼 값으로 확인: {lab.tampered ? "통과" : "실패"} — 증명은 원래 값에만 맞습니다
              </div>
            )}
          </>
        )}
        {error && <div className="hiw-err">{error}</div>}
      </div>
    );
  }
  return null;
}
