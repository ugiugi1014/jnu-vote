const { ethers } = require("ethers");
const dotenv = require("dotenv");

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.COORDINATOR_PRIVATE_KEY, provider);

const votingSystemAbi = [
  "function getAllVotes() view returns (tuple(bytes encryptedData, bytes voterPublicKey)[])",
  "function getTotalVotes() view returns (uint256)",
  "function getVoteCount(uint256 candidateId) view returns (uint256)",
  "function recordTally(uint256[] candidateIds, uint256[] voteCounts) external",
];

const votingTokenAbi = [
  "function issueTokenBatch(address[] calldata voters) external",
];

function getVotingContract(contractAddress) {
  return new ethers.Contract(contractAddress, votingSystemAbi, wallet);
}

function getVotingTokenContract(contractAddress) {
  return new ethers.Contract(contractAddress, votingTokenAbi, wallet);
}

module.exports = { getVotingContract, getVotingTokenContract };
