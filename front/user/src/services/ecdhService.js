// src/services/ecdhService.js
//
// BabyJubJub ECDH + Poseidon 키스트림 암호화 (투표자 브라우저)
//
// 기존 Web Crypto P-256 ECDH는 ZKP 회로 안에서 계산할 수 없어서(비원시 필드 연산),
// 회로가 "이 암호문이 정말 유효한 후보를 암호화한 것"을 증명할 수 없었다.
// BabyJubJub은 BN254 스칼라 필드 위에서 정의된 곡선이라 회로 안에서 직접 계산 가능하다.
//
// 암호화:
//   ephPriv  : 랜덤 스칼라 (투표마다 새로 생성, 증명 생성 후 폐기)
//   ephPub   = ephPriv * Base8
//   shared   = ephPriv * coordPub
//   keystream = Poseidon(shared.x, shared.y)
//   ciphertext = candidateId + keystream  (mod p)
//
// voteProof.circom 이 위 계산을 그대로 검증하므로 두 구현은 반드시 일치해야 한다.

import { buildBabyjub, buildPoseidon } from 'circomlibjs';

export const SNARK_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

let babyjubPromise = null;
let poseidonPromise = null;
const getBabyjub = () => (babyjubPromise ??= buildBabyjub());
const getPoseidon = () => (poseidonPromise ??= buildPoseidon());

// [1, subOrder) 범위 랜덤 스칼라 (회로의 Num2Bits(253) 범위 안)
function randomScalar(subOrder) {
  const bytes = new Uint8Array(32);
  for (;;) {
    globalThis.crypto.getRandomValues(bytes);
    let v = 0n;
    for (const b of bytes) v = (v << 8n) | BigInt(b);
    v %= subOrder;
    if (v !== 0n) return v;
  }
}

/**
 * 후보 번호 암호화
 * @param {number|bigint} candidateId
 * @param {{x: bigint|string, y: bigint|string}} coordPub  체인에 등록된 코디네이터 공개키
 * @returns {{ciphertext: bigint, ephPriv: bigint, ephPubX: bigint, ephPubY: bigint}}
 *   ephPriv 는 증명 생성에만 쓰고 바로 버린다.
 */
export async function encryptVote(candidateId, coordPub) {
  const babyjub = await getBabyjub();
  const poseidon = await getPoseidon();
  const F = babyjub.F;

  const coord = [F.e(BigInt(coordPub.x)), F.e(BigInt(coordPub.y))];
  if (!babyjub.inSubgroup(coord)) {
    throw new Error('코디네이터 공개키가 BabyJubJub 부분군 위의 점이 아닙니다.');
  }

  const ephPriv = randomScalar(babyjub.subOrder);
  const ephPub = babyjub.mulPointEscalar(babyjub.Base8, ephPriv);
  const shared = babyjub.mulPointEscalar(coord, ephPriv);

  const keystream = poseidon.F.toObject(
    poseidon([F.toObject(shared[0]), F.toObject(shared[1])])
  );
  const ciphertext = (BigInt(candidateId) + keystream) % SNARK_FIELD;

  return {
    ciphertext,
    ephPriv,
    ephPubX: F.toObject(ephPub[0]),
    ephPubY: F.toObject(ephPub[1]),
  };
}
