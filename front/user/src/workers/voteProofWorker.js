// 투표 증명(ZKP ①) 생성 전용 Web Worker
// groth16.fullProve 는 수 초간 CPU 를 점유하므로 메인 스레드에서 돌리면 화면이 멈춘다.
// 워커에서 실행하고, 회로 파일(wasm/zkey)은 페이지 진입 시 미리 받아 캐시한다.
import { groth16 } from 'snarkjs';

const WASM_URL = '/voteProof.wasm';
const ZKEY_URL = '/voteProof_final.zkey';

let artifactsPromise = null;

function loadArtifacts() {
  if (!artifactsPromise) {
    artifactsPromise = Promise.all(
      [WASM_URL, ZKEY_URL].map(async (url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url} 로드 실패 (${res.status})`);
        return new Uint8Array(await res.arrayBuffer());
      })
    ).catch((err) => {
      artifactsPromise = null; // 다음 요청에서 재시도
      throw err;
    });
  }
  return artifactsPromise;
}

self.onmessage = async (event) => {
  const { id, type, payload } = event.data;
  try {
    if (type === 'preload') {
      await loadArtifacts();
      self.postMessage({ id, ok: true, result: null });
      return;
    }
    if (type === 'prove') {
      const [wasm, zkey] = await loadArtifacts();
      const { proof, publicSignals } = await groth16.fullProve(payload, wasm, { type: 'mem', data: zkey });
      self.postMessage({ id, ok: true, result: { proof, publicSignals } });
      return;
    }
    throw new Error(`알 수 없는 요청: ${type}`);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message || String(err) });
  }
};
