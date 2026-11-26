// src/services/voterIdService.js
//
// 익명 투표용 신원 (Semaphore 방식)
//   seed       : 학생만 아는 비밀 시드. 두 가지 중 하나로 만든다.
//                 - 패스키 PRF 출력 (기기 간 동기화, 서버는 모름)  ← 권장
//                 - 복구 코드(128비트 랜덤)                         ← 패스키가 안 되는 브라우저용
//                브라우저 localStorage 에는 캐시로만 둔다. 지워져도 패스키/복구 코드로 다시 얻을 수 있다.
//   secret     : Poseidon(seed, 선거 주소) — 선거마다 다르다 (선거 간 연결 불가)
//   commitment : Poseidon(secret). 서버가 학번 확인 후 선거 컨트랙트의 유권자 머클 트리에 등록한다.
//   투표 시     : "트리 안의 누군가" 임을 ZKP 로 증명 (어느 leaf 인지는 공개되지 않음)
//   nullifier  : Poseidon(secret, scope) — 회로 안에서 계산 (scope = 선거 컨트랙트 주소)
//
// ※ 서버가 seed 를 계산할 수 있으면 안 되므로 지갑 키(웹메일 + 서버시크릿)에서 만들지 않는다.
// ※ PIN 같은 짧은 값으로 만들면 안 된다: commitment 가 체인에 공개돼 있어 대입으로 바로 찾힌다.

import { buildPoseidon } from 'circomlibjs';

export const TREE_DEPTH = 16;
const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

let poseidonPromise = null;
const getPoseidon = () => (poseidonPromise ??= buildPoseidon());

const SEED_KEY = 'jnu-vote:voter-seed';
// 이전 버전(브라우저 랜덤 secret 을 선거별로 저장)과 호환
const legacyKey = (electionAddress) => `jnu-vote:voter-secret:${String(electionAddress).toLowerCase()}`;

function getStorage(storage) {
  try {
    return storage ?? globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** 바이트열 → 필드 원소 (0 이면 null) */
export function bytesToField(bytes) {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  v %= FIELD;
  return v === 0n ? null : v;
}

/** 이전 버전에서 저장한 선거별 secret (없으면 null) */
export function loadLegacySecret(electionAddress, storage) {
  try {
    const v = getStorage(storage)?.getItem(legacyKey(electionAddress));
    return v ? BigInt(v) : null;
  } catch {
    return null;
  }
}

/** 캐시된 시드 { seed, source } (없으면 null) */
export function loadSeed(storage) {
  try {
    const raw = getStorage(storage)?.getItem(SEED_KEY);
    if (!raw) return null;
    const { seed, source } = JSON.parse(raw);
    return { seed: BigInt(seed), source: source === 'passkey' ? 'passkey' : 'code' };
  } catch {
    return null;
  }
}

/** 시드 캐시 저장. 실패해도 패스키/복구 코드로 다시 얻을 수 있으므로 false 만 돌려준다. */
export function saveSeed(seed, source, storage) {
  try {
    getStorage(storage)?.setItem(SEED_KEY, JSON.stringify({ seed: BigInt(seed).toString(), source }));
    return true;
  } catch {
    return false;
  }
}

export function clearSeed(storage) {
  try {
    getStorage(storage)?.removeItem(SEED_KEY);
  } catch {
    /* 무시 */
  }
}

/** 선거별 secret = Poseidon(seed, 선거 주소) */
export async function deriveSecret(seed, electionAddress) {
  const poseidon = await getPoseidon();
  const s = poseidon.F.toObject(poseidon([BigInt(seed), BigInt(electionAddress)]));
  if (s === 0n) throw new Error('secret 생성 실패');
  return s;
}

/** 이 선거의 secret: 이전 버전 저장값 → 캐시된 시드 순서로 찾는다 (없으면 null) */
export async function resolveSecret(electionAddress, storage) {
  const legacy = loadLegacySecret(electionAddress, storage);
  if (legacy) return legacy;
  const cached = loadSeed(storage);
  return cached ? deriveSecret(cached.seed, electionAddress) : null;
}

// ───── 복구 코드 (128비트 + 체크섬 10비트, Crockford base32, 4글자씩 7묶음) ─────
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

async function checksum10(bytes) {
  const d = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return (d[0] << 2) | (d[1] >> 6);
}

export function newRecoveryBytes() {
  for (;;) {
    const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
    if (bytesToField(b) !== null) return b;
  }
}

export async function encodeRecoveryCode(bytes) {
  if (bytes.length !== 16) throw new Error('복구 코드 길이 오류');
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  v = (v << 10n) | BigInt(await checksum10(bytes)); // 138비트 → 28글자 (상위 2비트는 0)
  let s = '';
  for (let i = 0; i < 28; i++) {
    s = B32[Number(v & 31n)] + s;
    v >>= 5n;
  }
  return s.match(/.{4}/g).join('-');
}

export async function decodeRecoveryCode(code) {
  const clean = String(code || '')
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (clean.length !== 28) throw new Error('복구 코드는 28글자(4글자 × 7묶음)입니다.');
  let v = 0n;
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error(`복구 코드에 쓸 수 없는 글자: ${ch}`);
    v = (v << 5n) | BigInt(i);
  }
  const cs = Number(v & 1023n);
  v >>= 10n;
  if (v >> 128n !== 0n) throw new Error('복구 코드가 올바르지 않습니다.');
  const bytes = new Uint8Array(16);
  for (let i = 15; i >= 0; i--) {
    bytes[i] = Number(v & 255n);
    v >>= 8n;
  }
  if ((await checksum10(bytes)) !== cs) throw new Error('복구 코드가 올바르지 않습니다 (오타 확인).');
  return bytes;
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

/** 로그아웃 시: 이 브라우저에 남긴 투표권 바탕값(고유값 + 예전 방식의 선거별 값)을 모두 지운다 */
export function clearVoterKeys(storage) {
  const st = getStorage(storage);
  if (!st) return;
  try {
    const keys = [];
    for (let i = 0; i < st.length; i++) {
      const k = st.key(i);
      if (k === SEED_KEY || k?.startsWith("jnu-vote:voter-secret:")) keys.push(k);
    }
    keys.forEach((k) => st.removeItem(k));
  } catch {
    /* 무시 */
  }
}
