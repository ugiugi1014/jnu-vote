import { ethers } from 'ethers';

// KDF로 privateKey 생성 (웹메일 + 서버시크릿)
export async function createWallet(webmail, serverSecret) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(webmail + serverSecret),
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('jnu-vote-wallet'),
      info: encoder.encode('privateKey'),
    },
    keyMaterial,
    256
  );

  const privateKey = '0x' + Array.from(new Uint8Array(derived))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const wallet = new ethers.Wallet(privateKey);
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    wallet,
  };
}

// Sepolia 연결
export function connectChain(rpcUrl) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return provider;
}

// 지갑 + 체인 연결
export function connectWalletToChain(wallet, provider) {
  return wallet.connect(provider);
}

// 잔액 조회
export async function getBalance(provider, address) {
  const balance = await provider.getBalance(address);
  return ethers.formatEther(balance);
}

// (투표 제출은 익명 투표 전환 후 relayer(/vote/relay)가 담당 — 학생 지갑으로 castVote 하지 않음)

// walletPrivateKey → BigInt 변환 (ZKP 입력용)
export function privateKeyToBigInt(privateKey) {
  return BigInt(privateKey);
}
