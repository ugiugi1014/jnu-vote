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
        uint[1] calldata input
    ) external view returns (bool);
}

interface ITallyVerifier {
    function verifyProof(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[105] calldata input
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

    event ElectionAdminSet(address indexed admin);
    event ElectionOpened();
    event ElectionClosed();
    event VoteCast(bytes32 indexed nullifier);
    event TallyRecorded(uint256 indexed candidateId, uint256 voteCount);

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

    function openElection() external onlyElectionAdmin whenElectionClosed {
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

        // 암호문 형식을 투표 시점에 검증한다.
        // - 형식이 깨진 데이터가 저장되면 recordTally의 abi.decode가 영구 revert -> 개표 불능(DoS)
        // - (0,0)은 tally 회로에서 패딩 슬롯 표식이므로 실제 표로 쓸 수 없다
        (uint256 ciphertext, uint256 nonce) = abi.decode(encryptedData, (uint256, uint256));
        require(ciphertext != 0 || nonce != 0, "invalid ciphertext");
        require(ciphertext < SNARK_SCALAR_FIELD && nonce < SNARK_SCALAR_FIELD, "ciphertext out of field");

        uint[1] memory pubSignals;
        pubSignals[0] = uint256(nullifier);
        require(voteVerifier.verifyProof(_pA, _pB, _pC, pubSignals), "vote proof failed");

        nullifiers[nullifier] = true;
        votes.push(EncryptedVote({ encryptedData: encryptedData, voterPublicKey: voterPubKey }));
        votingToken.burnToken(msg.sender);
        emit VoteCast(nullifier);
    }

    function recordTally(
        uint256[] calldata candidateIds,
        uint256[] calldata voteCounts,
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[105] calldata _pubSignals
    ) external onlyElectionAdmin whenElectionClosed {
        require(candidateIds.length == voteCounts.length, "array length mismatch");
        require(candidateIds.length == TALLY_CANDIDATES, "candidate count mismatch");
        require(votes.length <= TALLY_MAX_VOTES, "vote count exceeds tally circuit");

        for (uint256 i = 0; i < TALLY_MAX_VOTES; i++) {
            if (i < votes.length) {
                (uint256 ciphertext, uint256 nonce) = abi.decode(votes[i].encryptedData, (uint256, uint256));
                require(_pubSignals[i] == nonce, "tally nonce mismatch");
                require(_pubSignals[TALLY_MAX_VOTES + i] == ciphertext, "tally ciphertext mismatch");
            } else {
                require(_pubSignals[i] == 0, "invalid nonce padding");
                require(_pubSignals[TALLY_MAX_VOTES + i] == 0, "invalid ciphertext padding");
            }
        }

        uint256 totalCounted = 0;
        for (uint256 i = 0; i < TALLY_CANDIDATES; i++) {
            require(_pubSignals[2 * TALLY_MAX_VOTES + i] == voteCounts[i], "tally result mismatch");
            totalCounted += voteCounts[i];
        }
        // 모든 표가 집계에 포함되어야 한다 (표 누락 차단, tally 회로 제약과 이중 방어)
        require(totalCounted == votes.length, "tally total mismatch");

        require(tallyVerifier.verifyProof(_pA, _pB, _pC, _pubSignals), "tally proof failed");

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
