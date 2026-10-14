// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./VotingToken.sol";

interface IVoteVerifier {
    function verifyProof(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[7] calldata input
    ) external view returns (bool);
}

interface ITallyVerifier {
    function verifyProof(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[157] calldata input
    ) external view returns (bool);
}

contract VotingSystem is Initializable, OwnableUpgradeable {
    uint256 private constant TALLY_MAX_VOTES = 50;
    uint256 private constant TALLY_CANDIDATES = 5;
    uint256 private constant SNARK_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    VotingToken public votingToken;
    IVoteVerifier public voteVerifier;
    ITallyVerifier public tallyVerifier;

    address public electionAdmin;
    bool public electionOpen;

    mapping(bytes32 => bool) public nullifiers;

    struct EncryptedVote {
        bytes encryptedData;
        bytes voterPublicKey;
    }

    EncryptedVote[] public votes;
    mapping(uint256 => uint256) public tallyResult;

    // 선거 설정 (투표 시작 전 1회): 코디네이터 BabyJubJub 공개키 + 실제 후보 수
    uint256 public coordPubX;
    uint256 public coordPubY;
    uint256 public numCandidates;
    bool public tallied;

    event ElectionAdminSet(address indexed admin);
    event ElectionOpened();
    event ElectionClosed();
    event VoteCast(bytes32 indexed nullifier);
    event TallyRecorded(uint256 indexed candidateId, uint256 voteCount);
    event ElectionConfigured(uint256 coordPubX, uint256 coordPubY, uint256 numCandidates);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _votingToken,
        address _electionAdmin,
        address _owner,
        address _voteVerifier,
        address _tallyVerifier
    ) external initializer {
        __Ownable_init(_owner);
        require(_votingToken != address(0), "invalid voting token");
        require(_electionAdmin != address(0), "invalid election admin");
        require(_voteVerifier != address(0), "invalid vote verifier");
        require(_tallyVerifier != address(0), "invalid tally verifier");

        votingToken = VotingToken(_votingToken);
        electionAdmin = _electionAdmin;
        voteVerifier = IVoteVerifier(_voteVerifier);
        tallyVerifier = ITallyVerifier(_tallyVerifier);

        emit ElectionAdminSet(_electionAdmin);
    }

    modifier onlyElectionAdmin() {
        require(msg.sender == electionAdmin, "only election admin");
        _;
    }

    modifier whenElectionOpen() {
        require(electionOpen, "election is not open");
        _;
    }

    modifier whenElectionClosed() {
        require(!electionOpen, "election is open");
        _;
    }

    function setElectionAdmin(address _electionAdmin) external onlyOwner {
        require(_electionAdmin != address(0), "invalid election admin");
        electionAdmin = _electionAdmin;
        emit ElectionAdminSet(_electionAdmin);
    }

    /// @notice 투표 시작 전 코디네이터 공개키와 후보 수를 등록한다. 표가 하나라도 들어오면 변경 불가.
    ///         voteProof/tally 증명의 공개 입력이 이 값과 대조되므로, 서버가 다른 키를 몰래 쓸 수 없다.
    function configureElection(uint256 _coordPubX, uint256 _coordPubY, uint256 _numCandidates)
        external onlyElectionAdmin whenElectionClosed
    {
        require(votes.length == 0, "votes already cast");
        require(_numCandidates >= 1 && _numCandidates <= TALLY_CANDIDATES, "invalid candidate count");
        require(_coordPubX != 0 && _coordPubX < SNARK_SCALAR_FIELD && _coordPubY < SNARK_SCALAR_FIELD, "invalid coordinator key");
        coordPubX = _coordPubX;
        coordPubY = _coordPubY;
        numCandidates = _numCandidates;
        emit ElectionConfigured(_coordPubX, _coordPubY, _numCandidates);
    }

    function openElection() external onlyElectionAdmin whenElectionClosed {
        require(numCandidates != 0, "election not configured");
        require(!tallied, "already tallied");
        electionOpen = true;
        emit ElectionOpened();
    }

    function closeElection() external onlyElectionAdmin whenElectionOpen {
        electionOpen = false;
        emit ElectionClosed();
    }

    function castVote(
        bytes32 nullifier,
        bytes calldata encryptedData,
        bytes calldata voterPubKey,
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC
    ) external whenElectionOpen {
        require(votingToken.isTokenValid(msg.sender), "voting token required");
        require(!nullifiers[nullifier], "duplicate nullifier");
        // tally 회로 용량(TALLY_MAX_VOTES)을 넘는 표가 저장되면 recordTally가 영구 revert -> 개표 불능
        require(votes.length < TALLY_MAX_VOTES, "tally capacity reached");

        // 형식 검증 (깨진 데이터가 저장되면 recordTally 가 영구 revert -> 개표 불능)
        //   encryptedData = abi.encode(uint256 ciphertext)
        //   voterPubKey   = abi.encode(uint256 ephPubX, uint256 ephPubY)  (BabyJubJub 임시 공개키)
        uint256 ciphertext = abi.decode(encryptedData, (uint256));
        (uint256 ephPubX, uint256 ephPubY) = abi.decode(voterPubKey, (uint256, uint256));
        require(
            ciphertext < SNARK_SCALAR_FIELD && ephPubX < SNARK_SCALAR_FIELD && ephPubY < SNARK_SCALAR_FIELD,
            "value out of field"
        );
        // ephPubX = 0 은 tally 회로의 패딩 슬롯 표식이므로 실제 표로 쓸 수 없다
        require(ephPubX != 0, "invalid ephemeral key");

        // voteProof 공개 신호: [nullifier, numCandidates, coordPubX, coordPubY, ciphertext, ephPubX, ephPubY]
        // -> 암호문이 등록된 코디네이터 키로 유효 후보(0..numCandidates-1)를 암호화한 것임을 검증
        uint[7] memory pubSignals = [
            uint256(nullifier), numCandidates, coordPubX, coordPubY, ciphertext, ephPubX, ephPubY
        ];
        require(voteVerifier.verifyProof(_pA, _pB, _pC, pubSignals), "vote proof failed");

        nullifiers[nullifier] = true;
        votes.push(EncryptedVote({ encryptedData: encryptedData, voterPublicKey: voterPubKey }));
        votingToken.burnToken(msg.sender);
        emit VoteCast(nullifier);
    }

    // tally 공개 신호 레이아웃 (Tally(50,5), 157개)
    //   [0] coordPubX, [1] coordPubY
    //   [2 .. 51]    ciphertext[i]
    //   [52 .. 101]  ephPubX[i]
    //   [102 .. 151] ephPubY[i]
    //   [152 .. 156] 후보별 득표수
    // 패딩 슬롯(i >= votes.length): ciphertext = 0, ephPub = (0, 1)

    function recordTally(
        uint256[] calldata candidateIds,
        uint256[] calldata voteCounts,
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[157] calldata _pubSignals
    ) external onlyElectionAdmin whenElectionClosed {
        require(!tallied, "already tallied");
        require(candidateIds.length == voteCounts.length, "array length mismatch");
        require(candidateIds.length == TALLY_CANDIDATES, "candidate count mismatch");
        require(votes.length <= TALLY_MAX_VOTES, "vote count exceeds tally circuit");

        require(_pubSignals[0] == coordPubX && _pubSignals[1] == coordPubY, "tally coordinator key mismatch");

        for (uint256 i = 0; i < TALLY_MAX_VOTES; i++) {
            uint256 ct = 0;
            uint256 ex = 0;
            uint256 ey = 1;
            if (i < votes.length) {
                ct = abi.decode(votes[i].encryptedData, (uint256));
                (ex, ey) = abi.decode(votes[i].voterPublicKey, (uint256, uint256));
            }
            require(_pubSignals[2 + i] == ct, "tally ciphertext mismatch");
            require(_pubSignals[2 + TALLY_MAX_VOTES + i] == ex, "tally ephPubX mismatch");
            require(_pubSignals[2 + 2 * TALLY_MAX_VOTES + i] == ey, "tally ephPubY mismatch");
        }

        uint256 totalCounted = 0;
        for (uint256 i = 0; i < TALLY_CANDIDATES; i++) {
            require(_pubSignals[2 + 3 * TALLY_MAX_VOTES + i] == voteCounts[i], "tally result mismatch");
            totalCounted += voteCounts[i];
        }
        // 모든 표가 집계에 포함되어야 한다 (회로 제약과 이중 방어)
        require(totalCounted == votes.length, "tally total mismatch");

        require(tallyVerifier.verifyProof(_pA, _pB, _pC, _pubSignals), "tally proof failed");

        tallied = true;
        for (uint256 i = 0; i < candidateIds.length; i++) {
            tallyResult[candidateIds[i]] = voteCounts[i];
            emit TallyRecorded(candidateIds[i], voteCounts[i]);
        }
    }

    function getTotalVotes() external view returns (uint256) {
        return votes.length;
    }

    function getAllVotes() external view returns (EncryptedVote[] memory) {
        return votes;
    }

    function getVoteCount(uint256 candidateId) external view returns (uint256) {
        return tallyResult[candidateId];
    }
}
