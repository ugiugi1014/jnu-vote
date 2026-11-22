// 개발용: 개표 zkey 를 새로 만든 뒤 Foundry 실증명 fixture(tally_e2e.json)를 다시 만든다.
//   vote_e2e.json 의 실제 투표 암호문을 서버 코드(decryptVote → buildTallyBatchInputs → proveTallyBatches)로
//   그대로 개표해 배치 증명을 만든다. zkp/build/tally_js, zkp/keys/tally_final.zkey 필요.
// 사용: cd server && node scripts/regenTallyFixture.js
const fs = require("fs");
const path = require("path");
const { decryptVote } = require("../src/services/ecdhDecrypt");
const { buildTallyBatchInputs, proveTallyBatches } = require("../src/services/zkpServices");

const FIX = path.join(__dirname, "..", "..", "blockchain", "foundry", "fixtures");

(async () => {
  const v = JSON.parse(fs.readFileSync(path.join(FIX, "vote_e2e.json"), "utf8"));
  const zkpVotes = [];
  for (const vote of v.votes) {
    const d = await decryptVote({ ciphertext: vote.ciphertext }, v.coordPriv, { x: vote.ephPubX, y: vote.ephPubY });
    zkpVotes.push({ candidateId: d.candidateId, ciphertext: d.ciphertext, ephPubX: d.ephPubX, ephPubY: d.ephPubY });
  }
  const batches = await buildTallyBatchInputs({
    coordPriv: v.coordPriv,
    coordPub: { x: v.coordPubX, y: v.coordPubY },
    zkpVotes,
    candidatesCount: Number(v.numCandidates),
  });
  const proofs = await proveTallyBatches(batches, "fixture");
  const out = {
    batches: batches.map((b, k) => {
      const { proof, publicSignals } = proofs[k];
      return {
        result: b.result,
        pA: proof.pi_a.slice(0, 2),
        pB: [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]],
        pC: proof.pi_c.slice(0, 2),
        publicSignals,
      };
    }),
  };
  fs.writeFileSync(path.join(FIX, "tally_e2e.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`tally_e2e.json: 배치 ${out.batches.length}개, 결과 ${JSON.stringify(out.batches.at(-1).result)}`);
})().catch((e) => { console.error(e); process.exit(1); });
