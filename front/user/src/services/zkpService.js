// ※ 익명 투표 전환: secret 은 voterIdService 가 만든 랜덤 값 (지갑 개인키 기반 secret 은 서버가 재계산할 수 있어 제거)

// ── 증명 생성 워커 ─────────────────────────────────────────────
let worker = null;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (worker || typeof Worker === 'undefined') return worker;
  worker = new Worker(new URL('../workers/voteProofWorker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (event) => {
    const { id, ok, result, error } = event.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (ok) p.resolve(result);
    else p.reject(new Error(error));
  };
  worker.onerror = (event) => {
    for (const p of pending.values()) p.reject(new Error(event.message || '증명 워커 오류'));
    pending.clear();
    worker = null;
  };
  return worker;
}

function callWorker(type, payload) {
  const w = getWorker();
  if (!w) return null;
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, type, payload });
  });
}

// 투표 화면 진입 시 호출 -> 회로 파일을 미리 받아둔다 (확인 버튼 후 대기시간 감소)
export function preloadVoteProof() {
  callWorker('preload')?.catch(() => {});
}

const toStr = (v) => (Array.isArray(v) ? v.map(toStr) : typeof v === 'bigint' ? v.toString() : String(v));

/**
 * voteProof.circom 증명 생성 (워커에서 실행, 워커 미지원 환경이면 메인 스레드)
 * @param {object} input { secret, pathElements[16], pathIndices[16], candidateId, ephPriv,
 *                          merkleRoot, scope, numCandidates, coordPubX, coordPubY, ciphertext, ephPubX, ephPubY }
 * @returns {{proof, publicSignals, nullifier}}
 *   publicSignals = [nullifier, merkleRoot, scope, numCandidates, coordPubX, coordPubY, ciphertext, ephPubX, ephPubY]
 */
export async function generateVoteProof(input) {
  const circuitInput = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, toStr(v)]));

  let result = callWorker('prove', circuitInput);
  if (!result) {
    const { groth16 } = await import('snarkjs');
    result = groth16.fullProve(circuitInput, '/voteProof.wasm', '/voteProof_final.zkey');
  }
  const { proof, publicSignals } = await result;
  return { proof, publicSignals, nullifier: publicSignals[0] };
}
