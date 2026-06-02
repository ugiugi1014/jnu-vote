// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./VotingToken.sol";

// interface IVoteVerifier {
//     function verifyProof(
//         uint[2] calldata a,
//         uint[2][2] calldata b,
//         uint[2] calldata c,
//         uint[1] calldata input
//     ) external view returns (bool);
// }

contract VotingSystem is Initializable, OwnableUpgradeable {

    VotingToken public votingToken;
    // IVoteVerifier public voteVerifier;

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
        address _owner
    ) external initializer {
        __Ownable_init(_owner);
        require(_votingToken != address(0), unicode"유효하지 않은 토큰 주소입니다.");
        require(_electionAdmin != address(0), unicode"유효하지 않은 관리자 주소입니다.");
        votingToken = VotingToken(_votingToken);
        electionAdmin = _electionAdmin;
        emit ElectionAdminSet(_electionAdmin);
    }

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

    function setElectionAdmin(address _electionAdmin) external onlyOwner {
        require(_electionAdmin != address(0), unicode"유효하지 않은 주소입니다.");
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
        bytes calldata voterPubKey
    ) external whenElectionOpen {
        require(
            votingToken.isTokenValid(msg.sender),
            unicode"투표 토큰이 없습니다. 유권자 등록을 확인하세요."
        );
        require(!nullifiers[nullifier], unicode"이미 투표하셨습니다.");

        nullifiers[nullifier] = true;
        votes.push(EncryptedVote({
            encryptedData: encryptedData,
            voterPublicKey: voterPubKey
        }));
        votingToken.burnToken(msg.sender);

        emit VoteCast(nullifier);
    }

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