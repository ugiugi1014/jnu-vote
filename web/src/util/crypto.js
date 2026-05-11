import { buildPoseidon } from 'circomlibjs';

/**
 * Poseidon 기반 스트림 암호를 사용하여 candidateID를 암호화합니다.
 */
export async function encryptCandidate(candidateID, sharedKey) {
  const poseidon = await buildPoseidon();
  
  const randomValues = new BigUint64Array(1);
  globalThis.crypto.getRandomValues(randomValues);
  const nonce = randomValues[0];

  const hash = poseidon([BigInt(sharedKey), BigInt(nonce)]);
  const keystream = poseidon.F.toObject(hash);

  const ciphertext = BigInt(candidateID) ^ keystream;

  return {
    ciphertext: ciphertext.toString(),
    nonce: nonce.toString()
  };
}

/**
 * 암호화된 candidateID를 복호화합니다.
 */
export async function decryptCandidate(ciphertext, sharedKey, nonce) {
  const poseidon = await buildPoseidon();
  
  const hash = poseidon([BigInt(sharedKey), BigInt(nonce)]);
  const keystream = poseidon.F.toObject(hash);

  const decryptedID = BigInt(ciphertext) ^ keystream;
  
  return decryptedID.toString();
}