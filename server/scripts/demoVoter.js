// 데모 시드용 투표기: 브라우저(front/user/src/services)와 같은 계산을 Node 에서 한다.
//   투표 키(secret) → commitment, 코디 공개키로 암호화, voteProof 증명, relay 제출
// 회로 파일 경로: VOTE_WASM, VOTE_ZKEY (데모에서는 front/user/public 을 마운트)
const crypto = require("crypto");
const { ethers } = require("ethers");
const { buildBabyjub, buildPoseidon } = require("circomlibjs");
const { groth16 } = require("snarkjs");

const TREE_DEPTH = 16;
const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const ABI = [
  "function coordPubX() view returns (uint256)",
  "function coordPubY() view returns (uint256)",
  "function numCandidates() view returns (uint256)",
  "function getCommitments() view returns (uint256[])",
];
const coder = ethers.AbiCoder.defaultAbiCoder();

let cache = null;
async function lib() {
  if (!cache) cache = { babyjub: await buildBabyjub(), poseidon: await buildPoseidon() };
  return cache;
}

function randomScalar(max) {
  for (;;) {
    const v = BigInt("0x" + crypto.randomBytes(32).toString("hex")) % max;
    if (v !== 0n) return v;
  }
}

async function hash(inputs) {
  const { poseidon } = await lib();
  return poseidon.F.toObject(poseidon(inputs.map(BigInt)));
}

/** 새 투표 키 (선거 주소에 묶인 secret) */
async function newSecret(electionAddress) {
  const seed = randomScalar(FIELD);
  return hash([seed, BigInt(electionAddress)]);
}
const commitmentOf = (secret) => hash([secret]);

/** 시드용: 같은 (라벨, 선거 주소)면 언제나 같은 투표권 → 시드를 다시 돌려도 이어서 투표할 수 있다 */
async function seedSecret(label, electionAddress) {
  const seed = BigInt("0x" + crypto.createHash("sha256").update(label).digest("hex")) % FIELD;
  return hash([seed, BigInt(electionAddress)]);
}

async function merklePath(commitments, leaf) {
  const H = (a, b) => hash([a, b]);
  const leaves = commitments.map(BigInt);
  let idx = leaves.findIndex((c) => c === BigInt(leaf));
  if (idx < 0) throw new Error("commitment 가 체인 명단에 없습니다");
  const zeros = [0n];
  for (let i = 0; i < TREE_DEPTH; i++) zeros.push(await H(zeros[i], zeros[i]));
  let level = leaves;
  const pathElements = [];
  const pathIndices = [];
  for (let i = 0; i < TREE_DEPTH; i++) {
    const sib = idx % 2 === 0 ? (level[idx + 1] ?? zeros[i]) : level[idx - 1];
    pathElements.push(sib);
    pathIndices.push(idx % 2);
    const next = [];
    for (let j = 0; j < level.length; j += 2) next.push(await H(level[j], level[j + 1] ?? zeros[i]));
    level = next.length ? next : [zeros[i + 1]];
    idx = Math.floor(idx / 2);
  }
  return { root: level[0], pathElements, pathIndices };
}

async function encrypt(candidateId, cx, cy) {
  const { babyjub, poseidon } = await lib();
  const F = babyjub.F;
  const ephPriv = randomScalar(babyjub.subOrder);
  const ephPub = babyjub.mulPointEscalar(babyjub.Base8, ephPriv);
  const shared = babyjub.mulPointEscalar([F.e(cx), F.e(cy)], ephPriv);
  const ks = poseidon.F.toObject(poseidon([F.toObject(shared[0]), F.toObject(shared[1])]));
  return {
    ephPriv,
    ephPubX: F.toObject(ephPub[0]),
    ephPubY: F.toObject(ephPub[1]),
    ciphertext: (BigInt(candidateId) + ks) % FIELD,
  };
}

/** 증명을 만들어 relay 로 제출. 반환: fetch 응답 { status, data } */
async function castVote({ api, provider, election, secret, candidateId }) {
  const vs = new ethers.Contract(election.contract_address, ABI, provider);
  const [cx, cy, nc, commitments] = await Promise.all([vs.coordPubX(), vs.coordPubY(), vs.numCandidates(), vs.getCommitments()]);
  const { root, pathElements, pathIndices } = await merklePath(commitments, await commitmentOf(secret));
  const enc = await encrypt(candidateId, cx, cy);
  const input = {
    secret, pathElements, pathIndices, candidateId, ephPriv: enc.ephPriv, merkleRoot: root,
    scope: BigInt(election.contract_address), numCandidates: nc, coordPubX: cx, coordPubY: cy,
    ciphertext: enc.ciphertext, ephPubX: enc.ephPubX, ephPubY: enc.ephPubY,
  };
  const str = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, Array.isArray(v) ? v.map(String) : String(v)]));
  const { proof, publicSignals } = await groth16.fullProve(str, process.env.VOTE_WASM, process.env.VOTE_ZKEY);
  const r = await fetch(`${api}/vote/relay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      election_id: election.id,
      nullifier: ethers.zeroPadValue(ethers.toBeHex(BigInt(publicSignals[0])), 32),
      merkleRoot: root.toString(),
      encryptedData: coder.encode(["uint256"], [enc.ciphertext]),
      voterPubKey: coder.encode(["uint256", "uint256"], [enc.ephPubX, enc.ephPubY]),
      pA: proof.pi_a.slice(0, 2),
      pB: [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]],
      pC: proof.pi_c.slice(0, 2),
    }),
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

module.exports = { newSecret, seedSecret, commitmentOf, castVote };
