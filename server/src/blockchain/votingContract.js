// 컨트랙트 호출 헬퍼 — lazy initialization
//
// 환경변수:
//   RPC_URL: 이더리움 RPC 엔드포인트 (Sepolia 등)
//   ADMIN_WALLET_PRIVATE_KEY: 백엔드가 컨트랙트 호출에 쓰는 관리자 지갑 개인키
//                              (issueTokenBatch, recordTally 등 onlyOwner/onlyElectionAdmin 호출용)
//                              ※ 흐름도의 "코디네이터 ECDH 키"와는 별개.
//                                ECDH 키는 elections.coord_private_key (DB) 에 보관됨.
//
// require 시점에 즉시 초기화하지 않음 — 환경변수 없어도 모듈 로드는 성공.
// 실제로 컨트랙트 호출 시점에 누락 검증.

const { ethers } = require("ethers");

const votingSystemAbi = [
  "function getAllVotes() view returns (tuple(bytes encryptedData, bytes voterPublicKey)[])",
  "function getTotalVotes() view returns (uint256)",
  "function getVoteCount(uint256 candidateId) view returns (uint256)",
  "function recordTally(uint256[] candidateIds, uint256[] voteCounts, uint[2] pA, uint[2][2] pB, uint[2] pC, uint[105] pubSignals) external",
  "function openElection() external",
  "function closeElection() external",
  "function electionOpen() view returns (bool)",
];

const votingTokenAbi = [
  "function issueTokenBatch(address[] calldata voters) external",
];

// 싱글톤 provider / wallet — 첫 호출 시 생성, 이후 재사용
let cachedProvider = null;
let cachedWallet = null;

function getAdminPrivateKey() {
  // 신규 변수명 우선, 기존 변수명도 backward compat 으로 인정
  const key = process.env.ADMIN_WALLET_PRIVATE_KEY || process.env.COORDINATOR_PRIVATE_KEY;
  if (!key) {
    throw new Error(
      "ADMIN_WALLET_PRIVATE_KEY 환경변수가 필요합니다 (컨트랙트 호출용 관리자 지갑 키)."
    );
  }
  return key;
}

function getProvider() {
  if (!cachedProvider) {
    if (!process.env.RPC_URL) {
      throw new Error("RPC_URL 환경변수가 필요합니다.");
    }
    cachedProvider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  }
  return cachedProvider;
}

function getWallet() {
  if (!cachedWallet) {
    cachedWallet = new ethers.Wallet(getAdminPrivateKey(), getProvider());
  }
  return cachedWallet;
}

function getVotingContract(contractAddress) {
  return new ethers.Contract(contractAddress, votingSystemAbi, getWallet());
}

// 체인 선거 종료 — whenElectionClosed(recordTally 전제)를 위해 호출.
// 이미 닫혀 있으면(electionOpen=false) 스킵(중복 호출 시 revert 방지). 멱등.
async function closeElectionOnChain(contractAddress) {
  if (!contractAddress) return { skipped: "no_contract" };
  const contract = getVotingContract(contractAddress);
  const isOpen = await contract.electionOpen();
  if (!isOpen) return { skipped: "already_closed" };
  const tx = await contract.closeElection();
  await tx.wait();
  return { txHash: tx.hash };
}

// 투표자 KDF 지갑에 가스용 ETH 발급 (관리자 지갑 → 투표자).
// 잔액이 VOTER_GAS_AMOUNT 미만일 때만 송금. castVote는 투표자 지갑이 직접 가스를 내므로 필요.
async function fundVoterGas(addresses) {
  const list = (Array.isArray(addresses) ? addresses : [addresses]).filter(Boolean);
  if (list.length === 0) return [];

  const amount = ethers.parseEther(process.env.VOTER_GAS_AMOUNT || "0.002");
  const wallet = getWallet();
  const provider = getProvider();
  const results = [];

  for (const addr of list) {
    try {
      const bal = await provider.getBalance(addr);
      if (bal >= amount) {
        results.push({ addr, funded: false, reason: "sufficient" });
        continue;
      }
      const tx = await wallet.sendTransaction({ to: addr, value: amount });
      await tx.wait();
      results.push({ addr, funded: true, txHash: tx.hash });
    } catch (err) {
      console.error(`[fundVoterGas] ${addr} 송금 실패:`, err.message);
      results.push({ addr, funded: false, error: err.message });
    }
  }
  return results;
}

function getVotingTokenContract(contractAddress) {
  return new ethers.Contract(contractAddress, votingTokenAbi, getWallet());
}

module.exports = {
  getVotingContract,
  getVotingTokenContract,
  closeElectionOnChain,
  fundVoterGas,
  // 테스트/디버깅용
  getProvider,
  getWallet,
};
