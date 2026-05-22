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

// 컨트랙트 호출 (투표)
export async function castVote(connectedWallet, contractAddress, abi, nullifier, proof, ciphertext) {
  const contract = new ethers.Contract(contractAddress, abi, connectedWallet);
  const tx = await contract.castVote(nullifier, proof, ciphertext);
  await tx.wait();
  return tx;
}

// walletPrivateKey → BigInt 변환 (ZKP 입력용)
export function privateKeyToBigInt(privateKey) {
  return BigInt(privateKey);
}
