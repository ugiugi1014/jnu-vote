import { groth16 } from 'snarkjs';
import { buildPoseidon } from 'circomlibjs';

// secret 생성: Poseidon(walletPrivateKey, electionID)
export async function generateSecret(walletPrivateKeyBigInt, electionID) {
  const poseidon = await buildPoseidon();
  const hash = poseidon([walletPrivateKeyBigInt, BigInt(electionID)]);
  return poseidon.F.toObject(hash);
}

// proof + nullifier 생성
export async function generateVoteProof(secret, candidateId, maxCandidates) {
  const { proof, publicSignals } = await groth16.fullProve(
    {
      secret: secret.toString(),
      candidateId: candidateId.toString(),
    },
    '/voteProof.wasm',
    '/voteProof_final.zkey'
  );

  const nullifier = publicSignals[0];
  return { proof, publicSignals, nullifier };
}