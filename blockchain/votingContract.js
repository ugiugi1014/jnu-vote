import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

// 서버가 트랜잭션 보내는 지갑(관리자/코디네이터)
const wallet = new ethers.Wallet(process.env.COORDINATOR_PRIVATE_KEY, provider);

// castVote만 필요하면 ABI 최소로 선언
const votingAbi = [
  "function castVote(bytes encryptedVote) public",
];

export function getVotingContract(contractAddress) {
  return new ethers.Contract(contractAddress, votingAbi, wallet);
}
