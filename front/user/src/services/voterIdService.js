// src/services/voterIdService.js
//
// 익명 투표용 신원 (Semaphore 방식)
//   secret     : 브라우저가 만든 랜덤 값. 이 브라우저(localStorage)에만 저장, 서버로 보내지 않는다.
//   commitment : Poseidon(secret). 서버가 학번 확인 후 선거 컨트랙트의 유권자 머클 트리에 등록한다.
//   투표 시     : "트리 안의 누군가" 임을 ZKP 로 증명 (어느 leaf 인지는 공개되지 않음)
//   nullifier  : Poseidon(secret, scope) — 회로 안에서 계산 (scope = 선거 컨트랙트 주소)
//
// ※ secret 을 잃으면(브라우저 변경/기록 삭제) 그 선거에는 다시 등록할 수 없다 (학생 1명당 1회 등록).
//   재등록을 허용하면 한 사람이 두 개의 commitment 로 두 번 투표할 수 있기 때문.

import { buildPoseidon } from 'circomlibjs';

export const TREE_DEPTH = 16;
const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

let poseidonPromise = null;
const getPoseidon = () => (poseidonPromise ??= buildPoseidon());

const storageKey = (electionAddress) => `jnu-vote:voter-secret:${String(electionAddress).toLowerCase()}`;

function getStorage(storage) {
  try {
    return storage ?? globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** 저장된 secret 불러오기 (없으면 null) */
export function loadSecret(electionAddress, storage) {
  try {
    const v = getStorage(storage)?.getItem(storageKey(electionAddress));
    return v ? BigInt(v) : null;
  } catch {
    return null;
  }
}

/** 새 secret 생성 + 저장. 저장에 실패하면 예외 (저장 못 하면 나중에 투표 불가) */
export function createSecret(electionAddress, storage) {
  const bytes = new Uint8Array(32);
  for (;;) {
    globalThis.crypto.getRandomValues(bytes);
    let v = 0n;
    for (const b of bytes) v = (v << 8n) | BigInt(b);
    v %= FIELD;
    if (v !== 0n) {
      const s = getStorage(storage);
      if (!s) throw new Error('이 브라우저에 투표 키를 저장할 수 없습니다 (저장소 차단/시크릿 모드).');
      s.setItem(storageKey(electionAddress), v.toString());
      if (s.getItem(storageKey(electionAddress)) !== v.toString()) {
        throw new Error('투표 키 저장 확인 실패');
      }
      return v;
    }
  }
}

export async function computeCommitment(secret) {
  const poseidon = await getPoseidon();
  return poseidon.F.toObject(poseidon([BigInt(secret)]));
}

/**
 * 체인의 commitments 배열(등록 순서)로 증분 머클 트리를 재구성해 내 leaf 의 경로를 만든다.
 * 컨트랙트 VotingSystem.registerVoter 와 같은 규칙 (빈 칸 = zeros(level)).
 * @returns {{ root: bigint, pathElements: bigint[], pathIndices: number[], leafIndex: number }}
 */
export async function buildMerkleProof(commitments, leaf) {
  const poseidon = await getPoseidon();
  const H = (a, b) => poseidon.F.toObject(poseidon([a, b]));
  const leaves = commitments.map((c) => BigInt(c));
  const leafIndex = leaves.findIndex((c) => c === BigInt(leaf));
  if (leafIndex < 0) throw new Error('내 commitment 가 유권자 트리에 없습니다 (등록 확인 필요).');

  const zeros = [0n];
  for (let i = 0; i < TREE_DEPTH; i++) zeros.push(H(zeros[i], zeros[i]));

  let level = leaves;
  let idx = leafIndex;
  const pathElements = [];
  const pathIndices = [];
  for (let i = 0; i < TREE_DEPTH; i++) {
    const sibling = idx % 2 === 0 ? (level[idx + 1] ?? zeros[i]) : level[idx - 1];
    pathElements.push(sibling);
    pathIndices.push(idx % 2);
    const next = [];
    for (let j = 0; j < level.length; j += 2) {
      next.push(H(level[j], level[j + 1] ?? zeros[i]));
    }
    level = next.length ? next : [zeros[i + 1]];
    idx = Math.floor(idx / 2);
  }
  return { root: level[0], pathElements, pathIndices, leafIndex };
}
