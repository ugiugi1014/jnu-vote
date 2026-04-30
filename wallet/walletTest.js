import { createWallet, encryptWallet, decryptWallet, recoverWalletFromMnemonic } from './walletService.js';
import { contractMock } from './mock/contractMock.js';

const PIN = '123456';

async function test() {
  console.log('=== 1. 지갑 생성 ===');
  const { address, privateKey, mnemonic, wallet } = await createWallet();
  console.log('address:', address);
  console.log('privateKey:', privateKey);
  console.log('mnemonic:', mnemonic);

  console.log('\n=== 2. PIN으로 암호화 → localStorage 저장 ===');
  const json = await encryptWallet(wallet, PIN);
  localStorage.setItem('wallet_keystore', json);
  console.log('저장 완료');

  console.log('\n=== 3. PIN으로 복호화 ===');
  const storedJson = localStorage.getItem('wallet_keystore');
  const decrypted = await decryptWallet(storedJson, PIN);
  console.log('복호화된 address:', decrypted.address);
  console.log('원본과 일치?', decrypted.address === address);

  console.log('\n=== 4. 니모닉으로 복구 ===');
  const recovered = await recoverWalletFromMnemonic(mnemonic);
  console.log('복구된 address:', recovered.address);
  console.log('원본과 일치?', recovered.address === address);

  console.log('\n=== 5. 컨트랙트 호출 (mock) ===');
  await contractMock.castVote('nullifier_값', 'proof_값', 'ciphertext_값');

  console.log('\n=== 6. 계정 탈퇴 ===');
  localStorage.removeItem('wallet_keystore');
  console.log('삭제 후 조회:', localStorage.getItem('wallet_keystore'));
}

test().catch(console.error);
