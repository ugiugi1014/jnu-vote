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
        uint[1050] calldata input
    ) external view returns (bool);
}

contract VotingSystem is Initializable, OwnableUpgradeable {
    uint256 private constant TALLY_MAX_VOTES = 500;
    uint256 private constant TALLY_CANDIDATES = 50;

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
        uint[1050] calldata _pubSignals
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

        for (uint256 i = 0; i < TALLY_CANDIDATES; i++) {
            require(_pubSignals[2 * TALLY_MAX_VOTES + i] == voteCounts[i], "tally result mismatch");
        }

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
