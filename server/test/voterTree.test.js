const test = require("node:test");
const assert = require("node:assert");
const { buildPoseidon } = require("circomlibjs");
const { buildMerklePath } = require("../src/services/voterTree");

// VotingSystem.zeros(i) 상수 (컨트랙트와 같은 빈 서브트리 해시인지 확인)
const ZEROS = [
  0n,
  14744269619966411208579211824598458697587494354926760081771325075741142829156n,
  7423237065226347324353380772367382631490014989348495481811164164159255474657n,
  11286972368698509976183087595462810875513684078608517520839298933882497716792n,
];
const EMPTY_ROOT = 19217088683336594659449020493828377907203207941212636669271704950158751593251n;

test("단일 leaf: 형제 노드가 컨트랙트 zeros 상수와 같다", async () => {
  const { siblings } = await buildMerklePath([5n], 0);
  for (let i = 0; i < ZEROS.length; i++) assert.strictEqual(siblings[i], ZEROS[i]);
  assert.strictEqual(siblings.length, 16);
});

test("경로로 다시 계산한 root 가 같고, leaf 를 바꾸면 root 가 바뀐다", async () => {
  const poseidon = await buildPoseidon();
  const H = (a, b) => poseidon.F.toObject(poseidon([a, b]));
  const leaves = [11n, 22n, 33n, 44n, 55n];
  for (let idx = 0; idx < leaves.length; idx++) {
    const { root, siblings } = await buildMerklePath(leaves, idx);
    let cur = leaves[idx];
    let i2 = idx;
    for (const s of siblings) {
      cur = i2 % 2 === 0 ? H(cur, s) : H(s, cur);
      i2 = Math.floor(i2 / 2);
    }
    assert.strictEqual(cur, root, `idx ${idx}`);
  }
  const a = (await buildMerklePath(leaves, 0)).root;
  const b = (await buildMerklePath([11n, 99n, 33n, 44n, 55n], 0)).root;
  assert.notStrictEqual(a, b);
});

test("빈 트리 root 상수와 zeros(16) 이 맞물린다", async () => {
  const poseidon = await buildPoseidon();
  const H = (a, b) => poseidon.F.toObject(poseidon([a, b]));
  let z = 0n;
  for (let i = 0; i < 16; i++) z = H(z, z);
  assert.strictEqual(z, EMPTY_ROOT);
});

test("범위 밖 leaf index 는 거절", async () => {
  await assert.rejects(() => buildMerklePath([1n], 1));
  await assert.rejects(() => buildMerklePath([1n], -1));
});
