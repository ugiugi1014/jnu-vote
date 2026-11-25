// 흐름도에 보여 줄 실제 값: 페이지를 열 때 브라우저에서 한 번 계산한다 (투표 화면과 같은 계산)
import { buildBabyjub, buildPoseidon } from "circomlibjs";
import { bytesToField, newRecoveryBytes, deriveSecret, computeCommitment, buildMerkleProof } from "../../services/voterIdService";
import { encryptVote } from "../../services/ecdhService";

export const SAMPLE_SCOPE = "0x00000000000000000000000000000000000000E1"; // 설명용 가상 선거 주소

export async function makeSample() {
  const babyjub = await buildBabyjub();
  const poseidon = await buildPoseidon();
  const H = (xs) => poseidon.F.toObject(poseidon(xs.map(BigInt)));

  const seed = bytesToField(newRecoveryBytes());
  const secret = await deriveSecret(seed, SAMPLE_SCOPE);
  const commitment = await computeCommitment(secret);
  const others = [1, 2, 3].map(() => bytesToField(newRecoveryBytes()));
  const { root } = await buildMerkleProof([...others, commitment], commitment);

  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  let coordPriv = 0n;
  for (const b of bytes) coordPriv = (coordPriv << 8n) | BigInt(b);
  coordPriv = (coordPriv % (babyjub.subOrder - 1n)) + 1n;
  const pub = babyjub.mulPointEscalar(babyjub.Base8, coordPriv);
  const coord = { x: babyjub.F.toObject(pub[0]), y: babyjub.F.toObject(pub[1]) };

  const enc = await encryptVote(1, coord);
  return {
    seed, secret, commitment, root,
    coordX: coord.x, coordY: coord.y,
    ephPubX: enc.ephPubX, ciphertext: enc.ciphertext,
    nullifier: H([secret, BigInt(SAMPLE_SCOPE)]),
    candidate: "기호 1",
  };
}
