import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.COORDINATOR_PRIVATE_KEY, provider);

// issueTokenBatch ABI 추가
const votingAbi = [
  "function issueTokenBatch(address[] calldata voters) external",
];

export function getVotingContract(contractAddress) {
  return new ethers.Contract(contractAddress, votingAbi, wallet);
}
