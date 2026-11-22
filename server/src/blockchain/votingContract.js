// 컨트랙트 호출 헬퍼 — lazy initialization
//
// 환경변수:
//   RPC_URL: 이더리움 RPC 엔드포인트 (Sepolia 등)
//   ADMIN_WALLET_PRIVATE_KEY: 백엔드가 컨트랙트 호출에 쓰는 관리자 지갑 개인키
//                              (registerVoter, replaceVoter, castVote(relay), recordTallyBatch 등)
//                              ※ 흐름도의 "코디네이터 BabyJubJub 키"와는 별개.
//                                ECDH 키는 elections.coord_private_key (DB) 에 보관됨.
//
// require 시점에 즉시 초기화하지 않음 — 환경변수 없어도 모듈 로드는 성공.
// 실제로 컨트랙트 호출 시점에 누락 검증.

const { ethers } = require("ethers");

const votingSystemAbi = [
  "function getAllVotes() view returns (tuple(bytes encryptedData, bytes voterPublicKey)[])",
  "function registerVoter(uint256 commitment) external",
  "function replaceVoter(uint256 leafIndex, uint256 oldCommitment, uint256 newCommitment, uint256[16] siblings) external",
  "function commitments(uint256 index) view returns (uint256)",
  "function getTotalVotes() view returns (uint256)",
  "event VoterRegistered(uint256 indexed leafIndex, uint256 commitment, uint256 root)",
  "function castVote(bytes32 nullifier, uint256 merkleRoot, bytes encryptedData, bytes voterPubKey, uint[2] pA, uint[2][2] pB, uint[2] pC) external",
  "function getLastRoot() view returns (uint256)",
  "function getCommitments() view returns (uint256[])",
  "function getVoteCount(uint256 candidateId) view returns (uint256)",
  "function recordTallyBatch(uint256 batchIndex, uint256[] candidateIds, uint256[] voteCounts, uint[2] pA, uint[2][2] pB, uint[2] pC, uint[160] pubSignals) external",
  "function totalBatches() view returns (uint256)",
  "function batchesProcessed() view returns (uint256)",
  "function tallyCommit() view returns (uint256)",
  "function configureElection(uint256 coordPubX, uint256 coordPubY, uint256 numCandidates) external",
  "function coordPubX() view returns (uint256)",
  "function coordPubY() view returns (uint256)",
  "function numCandidates() view returns (uint256)",
  "function openElection() external",
  "function closeElection() external",
  "function electionOpen() view returns (bool)",
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

// 체인 선거 종료 — whenElectionClosed(recordTallyBatch 전제)를 위해 호출.
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

module.exports = {
  getVotingContract,
  closeElectionOnChain,
  // 테스트/디버깅용
  getProvider,
  getWallet,
};
