import { createWallet } from './walletService.js';
import { contractMock } from './mock/contractMock.js';

// 테스트용 mock 값 (실제는 백엔드에서 받아옴)
const MOCK_WEBMAIL = '20231234@jejunu.ac.kr';
const MOCK_SERVER_SECRET = 'test-server-secret-1234';

async function test() {
  console.log('=== 1. KDF 기반 지갑 생성 ===');
  const { address, privateKey } = await createWallet(MOCK_WEBMAIL, MOCK_SERVER_SECRET);
  console.log('address:', address);
  console.log('privateKey:', privateKey);

  console.log('\n=== 2. 같은 입력값으로 재생성 (일치 확인) ===');
  const { address: address2 } = await createWallet(MOCK_WEBMAIL, MOCK_SERVER_SECRET);
  console.log('재생성된 address:', address2);
  console.log('일치?', address === address2);

  console.log('\n=== 3. 다른 서버시크릿으로 생성 (불일치 확인) ===');
  const { address: address3 } = await createWallet(MOCK_WEBMAIL, 'other-secret');
  console.log('다른 address:', address3);
  console.log('불일치?', address !== address3);

  console.log('\n=== 4. 컨트랙트 호출 (mock) ===');
  await contractMock.castVote('nullifier_값', 'proof_값', 'ciphertext_값');
}

test().catch(console.error);
