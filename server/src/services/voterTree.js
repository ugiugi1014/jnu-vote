// 유권자 머클 트리 경로 계산 (VotingSystem.registerVoter / replaceVoter 와 같은 규칙)
// 빈 칸 = zeros(level), zeros(0)=0, zeros(i)=Poseidon(zeros(i-1), zeros(i-1))

const TREE_DEPTH = 16;

let poseidonPromise = null;
const getPoseidon = () => (poseidonPromise ??= require("circomlibjs").buildPoseidon());

async function buildMerklePath(commitments, leafIndex) {
  const poseidon = await getPoseidon();
  const H = (a, b) => poseidon.F.toObject(poseidon([a, b]));
  const leaves = commitments.map((c) => BigInt(c));
  if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= leaves.length) {
    throw new Error("leaf index 범위 오류");
  }
  const zeros = [0n];
  for (let i = 0; i < TREE_DEPTH; i++) zeros.push(H(zeros[i], zeros[i]));

  let level = leaves;
  let idx = leafIndex;
  const siblings = [];
  for (let i = 0; i < TREE_DEPTH; i++) {
    siblings.push(idx % 2 === 0 ? (level[idx + 1] ?? zeros[i]) : level[idx - 1]);
    const next = [];
    for (let j = 0; j < level.length; j += 2) next.push(H(level[j], level[j + 1] ?? zeros[i]));
    level = next.length ? next : [zeros[i + 1]];
    idx = Math.floor(idx / 2);
  }
  return { root: level[0], siblings };
}

module.exports = { buildMerklePath, TREE_DEPTH };
