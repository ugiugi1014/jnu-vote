// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./VotingToken.sol";

// ─────────────────────────────────────────────
//  Verifier 인터페이스 (ZKP ① vote.circom)
//  → Circom 팀에서 verifier.sol 완성되면
//    주석 해제 후 실제 주소로 배포
// ─────────────────────────────────────────────
// interface IVoteVerifier {
//     function verifyProof(
//         uint[2] calldata a,
//         uint[2][2] calldata b,
//         uint[2] calldata c,
//         uint[1] calldata input   // public input: hash
//     ) external view returns (bool);
// }

contract VotingSystem is Ownable {

    // ─── 외부 컨트랙트 참조 ─────────────────────
    // 유권자 토큰 확인용 (발급 여부 검증)
    VotingToken public votingToken;

    // ZKP verifier (Circom 팀 완성 후 연결)
    // IVoteVerifier public voteVerifier;

    // ─── 선거 관리자 (1명) ───────────────────────
    // 학교(owner)가 지정한 단일 선거 관리자
    // 선거 시작/종료, 개표 등 모든 관리 권한 보유
    address public electionAdmin;

    // ─── 선거 상태 ───────────────────────────────
    // 선거가 현재 열려있는지 여부
    bool public electionOpen;

    // ─── 투표 데이터 ─────────────────────────────
    // Nullifier: 이중 투표 방지 (secret의 해시값을 key로 사용)
    // 유권자가 투표하면 해당 nullifier를 true로 표시
    // → 같은 secret으로 두 번 투표 불가
    mapping(bytes32 => bool) public nullifiers;

    // 암호화된 투표 내용 저장
    // encryptedVote = AES/ECDH 암호화된 { candidateId, nonce }
    // 나중에 개표 시 선거 관리자 개인키로 복호화
    struct EncryptedVote {
        bytes encryptedData;   // 암호화된 투표 데이터
        bytes voterPublicKey;  // 유권자 ECDH 공개키 (복호화 시 필요)
    }
    EncryptedVote[] public votes;

    // 후보자 득표수 (개표 후 채워짐)
    mapping(uint256 => uint256) public tallyResult;

    // ─── 이벤트 ──────────────────────────────────
    event ElectionAdminSet(address indexed admin);
    event ElectionOpened();
    event ElectionClosed();
    event VoteCast(bytes32 indexed nullifier);
    event TallyRecorded(uint256 indexed candidateId, uint256 voteCount);

    // ─── 생성자 ──────────────────────────────────
    // 배포 시 VotingToken 주소와 선거 관리자 주소를 함께 받음
    constructor(address votingTokenAddress, address _electionAdmin) Ownable(msg.sender) {
        require(votingTokenAddress != address(0), unicode"유효하지 않은 토큰 주소입니다.");
        require(_electionAdmin != address(0), unicode"유효하지 않은 관리자 주소입니다.");
        votingToken = VotingToken(votingTokenAddress);
        electionAdmin = _electionAdmin;
        emit ElectionAdminSet(_electionAdmin);
    }

    // ─── 접근 제어 모디파이어 ────────────────────
    modifier onlyElectionAdmin() {
        require(msg.sender == electionAdmin, unicode"선거 관리자만 실행할 수 있습니다.");
        _;
    }

    modifier whenElectionOpen() {
        require(electionOpen, unicode"선거가 열려있지 않습니다.");
        _;
    }

    modifier whenElectionClosed() {
        require(!electionOpen, unicode"선거가 진행 중입니다.");
        _;
    }

    // ─── 선거 관리자 교체 (학교 전용) ───────────
    // 관리자를 교체해야 할 경우 학교(owner)만 변경 가능
    function setElectionAdmin(address _electionAdmin) external onlyOwner {
        require(_electionAdmin != address(0), unicode"유효하지 않은 주소입니다.");
        electionAdmin = _electionAdmin;
        emit ElectionAdminSet(_electionAdmin);
    }

    // ─── 선거 시작 / 종료 (관리자 전용) ─────────
    function openElection() external onlyElectionAdmin whenElectionClosed {
        electionOpen = true;
        emit ElectionOpened();
    }

    function closeElection() external onlyElectionAdmin whenElectionOpen {
        electionOpen = false;
        emit ElectionClosed();
    }

    // ─── 투표 함수 ───────────────────────────────
    /**
     * @param nullifier     secret의 Poseidon 해시값 (ZKP public input과 동일)
     * @param encryptedData ECDH로 암호화된 투표 데이터
     * @param voterPubKey   유권자 ECDH 공개키
     *
     * TODO (Circom 연동 시): proof_a, proof_b, proof_c 파라미터 추가 후
     * voteVerifier.verifyProof(a, b, c, [uint256(nullifier)]) 검증 추가
     */
    function castVote(
        bytes32 nullifier,
        bytes calldata encryptedData,
        bytes calldata voterPubKey
    ) external whenElectionOpen {
        // 1. 유권자 토큰 보유 확인
        require(
            votingToken.isTokenValid(msg.sender),
            unicode"투표 토큰이 없습니다. 유권자 등록을 확인하세요."
        );

        // 2. 이중 투표 방지 (Nullifier 확인)
        require(!nullifiers[nullifier], unicode"이미 투표하셨습니다.");

        // 3. Nullifier 등록 (재사용 불가 처리)
        nullifiers[nullifier] = true;

        // 4. 암호화된 투표 저장
        votes.push(EncryptedVote({
            encryptedData: encryptedData,
            voterPublicKey: voterPubKey
        }));

        // 5. 토큰 소각 (다음 선거에서 재발급 가능하도록)
        votingToken.burnToken(msg.sender);

        emit VoteCast(nullifier);
    }

    // ─── 개표 함수 (관리자 전용) ─────────────────
    /**
     * 프론트엔드에서 복호화 후 집계 결과를 온체인에 기록
     * (복호화는 선거 관리자 개인키로 오프체인에서 수행)
     *
     * @param candidateIds  후보자 ID 배열
     * @param voteCounts    각 후보자 득표수 배열
     *
     * TODO (ZKP ② 연동 시): tally.circom proof를 검증한 후 기록하도록 변경
     */
    function recordTally(
        uint256[] calldata candidateIds,
        uint256[] calldata voteCounts
    ) external onlyElectionAdmin whenElectionClosed {
        require(candidateIds.length == voteCounts.length, unicode"배열 길이가 일치하지 않습니다.");

        for (uint256 i = 0; i < candidateIds.length; i++) {
            tallyResult[candidateIds[i]] = voteCounts[i];
            emit TallyRecorded(candidateIds[i], voteCounts[i]);
        }
    }

    // ─── 조회 함수 ───────────────────────────────
    // 총 투표 수
    function getTotalVotes() external view returns (uint256) {
        return votes.length;
    }

    // 특정 후보 득표수 조회
    function getVoteCount(uint256 candidateId) external view returns (uint256) {
        return tallyResult[candidateId];
    }
}
