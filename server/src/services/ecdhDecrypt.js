// BabyJubJub ECDH + Poseidon 키스트림 복호화 모듈
// 프론트 ecdhService.js(encryptVote) 및 circuits/tally.circom 과 동일한 계산.
//
// 흐름:
//   1) shared = coordPriv * ephPub        (BabyJubJub ECDH)
//   2) keystream = Poseidon(shared.x, shared.y)
//   3) candidateId = ciphertext - keystream (mod p)
//
// 키 형식:
//   coord_private_key (DB) : 10진수 문자열 스칼라
//   coord_public_key  (DB) : JSON 문자열 {"x": "...", "y": "..."}
//   체인 voterPublicKey    : abi.encode(uint256 ephPubX, uint256 ephPubY)
//   체인 encryptedData     : abi.encode(uint256 ciphertext)

const crypto = require("crypto");
const { buildBabyjub, buildPoseidon } = require("circomlibjs");
const { ethers } = require("ethers");

const SNARK_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

let babyjubPromise = null;
let poseidonPromise = null;
const getBabyjub = () => (babyjubPromise ??= buildBabyjub());
const getPoseidon = () => (poseidonPromise ??= buildPoseidon());

function randomScalar(subOrder) {
  for (;;) {
    const v = BigInt("0x" + crypto.randomBytes(32).toString("hex")) % subOrder;
    if (v !== 0n) return v;
  }
}

function parsePoint(input) {
  if (!input) throw new Error("공개키가 비어있습니다.");
  const obj = typeof input === "string" ? JSON.parse(input) : input;
  if (obj.x === undefined || obj.y === undefined) {
    throw new Error("공개키 형식 오류 ({x, y} 필요)");
  }
  return { x: BigInt(obj.x), y: BigInt(obj.y) };
}

// 코디네이터 키쌍 생성 (선거 생성 시 호출)
async function generateCoordKeyPair() {
  const babyjub = await getBabyjub();
  const F = babyjub.F;
  const priv = randomScalar(babyjub.subOrder);
  const pub = babyjub.mulPointEscalar(babyjub.Base8, priv);
  return {
    publicKey: JSON.stringify({
      x: F.toObject(pub[0]).toString(),
      y: F.toObject(pub[1]).toString(),
    }),
    privateKey: priv.toString(),
  };
}

// 단일 투표 복호화
// 입력: { ciphertext }, 코디네이터 개인키(10진수 문자열), 투표자 임시 공개키 {x, y}
// 출력: { candidateId (유효 범위 밖이면 -1), ciphertext, ephPubX, ephPubY }
async function decryptVote({ ciphertext }, coordPrivKey, ephPub) {
  if (ciphertext === undefined) throw new Error("ciphertext 필수");
  const babyjub = await getBabyjub();
  const poseidon = await getPoseidon();
  const F = babyjub.F;

  const priv = BigInt(coordPrivKey);
  const p = parsePoint(ephPub);
  const shared = babyjub.mulPointEscalar([F.e(p.x), F.e(p.y)], priv);
  const keystream = poseidon.F.toObject(
    poseidon([F.toObject(shared[0]), F.toObject(shared[1])])
  );

  const ct = BigInt(ciphertext);
  const raw = (((ct - keystream) % SNARK_FIELD) + SNARK_FIELD) % SNARK_FIELD;
  const candidateId = raw < 256n ? Number(raw) : -1;

  return {
    candidateId,
    ciphertext: ct.toString(),
    ephPubX: p.x.toString(),
    ephPubY: p.y.toString(),
  };
}

// 체인 encryptedData (bytes) → { ciphertext }
function parseEncryptedData(encryptedData) {
  if (!encryptedData) throw new Error("encryptedData 비어있음");
  const [ciphertext] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], encryptedData);
  return { ciphertext: ciphertext.toString() };
}

// 체인 voterPublicKey (bytes) → { x, y }
function parseVoterPublicKey(input) {
  if (!input) throw new Error("voter_public_key 비어있음");
  if (typeof input === "string" && input.startsWith("0x")) {
    const [x, y] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "uint256"], input);
    return { x: x.toString(), y: y.toString() };
  }
  return parsePoint(input);
}

module.exports = {
  SNARK_FIELD,
  generateCoordKeyPair,
  decryptVote,
  parseEncryptedData,
  parseVoterPublicKey,
};
