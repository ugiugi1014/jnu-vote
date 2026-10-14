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
        uint[160] calldata input
    ) external view returns (bool);
}

contract VotingSystem is Initializable, OwnableUpgradeable {
    // tally 회로 1배치당 표 수 (배치 수 제한 없음)
    uint256 private constant TALLY_BATCH_SIZE = 50;
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

    // 배치 집계 상태: 누적 득표 커밋먼트 Poseidon(누적득표[5], salt)
    // 초기값 = Poseidon(0,0,0,0,0,0)
    uint256 private constant INITIAL_TALLY_COMMIT =
        14408838593220040598588012778523101864903887657864399481915450526643617223637;
    // ※ clone(EIP-1167) 은 선언부 초기값이 적용되지 않으므로 initialize 에서 설정
    uint256 public tallyCommit;
    uint256 public batchesProcessed;

    event ElectionAdminSet(address indexed admin);
    event ElectionOpened();
    event ElectionClosed();
    event VoteCast(bytes32 indexed nullifier);
    event TallyRecorded(uint256 indexed candidateId, uint256 voteCount);
    event ElectionConfigured(uint256 coordPubX, uint256 coordPubY, uint256 numCandidates);
    event TallyBatchRecorded(uint256 indexed batchIndex, uint256 tallyCommit);

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
        tallyCommit = INITIAL_TALLY_COMMIT;

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

    // tally 배치 공개 신호 레이아웃 (Tally(50,5), 160개)
    //   [0] coordPubX, [1] coordPubY
    //   [2 .. 51]    ciphertext[i]   (i = 배치 내 순번)
    //   [52 .. 101]  ephPubX[i]
    //   [102 .. 151] ephPubY[i]
    //   [152] prevCommit, [153] newCommit, [154] isFinal
    //   [155 .. 159] 최종 득표수 (마지막 배치에서만, 그 외 0)
    // 패딩 슬롯(마지막 배치의 남는 칸): ciphertext = 0, ephPub = (0, 1)

    /// @notice 필요한 배치 수 (표가 0개여도 결과 기록을 위해 1배치)
    function totalBatches() public view returns (uint256) {
        if (votes.length == 0) return 1;
        return (votes.length + TALLY_BATCH_SIZE - 1) / TALLY_BATCH_SIZE;
    }

    /// @notice 배치 순서대로 집계 증명을 제출한다. 배치를 건너뛰거나 표를 빼면 커밋먼트가 이어지지 않아 실패.
    ///         candidateIds/voteCounts 는 마지막 배치에서만 사용 (그 외에는 0 배열).
    function recordTallyBatch(
        uint256 batchIndex,
        uint256[] calldata candidateIds,
        uint256[] calldata voteCounts,
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[160] calldata _pubSignals
    ) external onlyElectionAdmin whenElectionClosed {
        require(!tallied, "already tallied");
        require(batchIndex == batchesProcessed, "wrong batch order");
        require(candidateIds.length == TALLY_CANDIDATES && voteCounts.length == TALLY_CANDIDATES, "candidate count mismatch");

        require(_pubSignals[0] == coordPubX && _pubSignals[1] == coordPubY, "tally coordinator key mismatch");

        uint256 start = batchIndex * TALLY_BATCH_SIZE;
        for (uint256 i = 0; i < TALLY_BATCH_SIZE; i++) {
            uint256 ct = 0;
            uint256 ex = 0;
            uint256 ey = 1;
            if (start + i < votes.length) {
                ct = abi.decode(votes[start + i].encryptedData, (uint256));
                (ex, ey) = abi.decode(votes[start + i].voterPublicKey, (uint256, uint256));
            }
            require(_pubSignals[2 + i] == ct, "tally ciphertext mismatch");
            require(_pubSignals[2 + TALLY_BATCH_SIZE + i] == ex, "tally ephPubX mismatch");
            require(_pubSignals[2 + 2 * TALLY_BATCH_SIZE + i] == ey, "tally ephPubY mismatch");
        }

        uint256 base = 2 + 3 * TALLY_BATCH_SIZE;
        require(_pubSignals[base] == tallyCommit, "tally commitment mismatch");
        bool isFinal = batchIndex + 1 == totalBatches();
        require(_pubSignals[base + 2] == (isFinal ? 1 : 0), "tally final flag mismatch");

        uint256 totalCounted = 0;
        for (uint256 c = 0; c < TALLY_CANDIDATES; c++) {
            require(_pubSignals[base + 3 + c] == voteCounts[c], "tally result mismatch");
            totalCounted += voteCounts[c];
        }
        // 마지막 배치: 모든 표가 집계에 포함되어야 한다 (회로 제약과 이중 방어)
        // 중간 배치: 결과는 0 이어야 한다 (회로가 강제, 중간 득표 비공개)
        require(totalCounted == (isFinal ? votes.length : 0), "tally total mismatch");

        require(tallyVerifier.verifyProof(_pA, _pB, _pC, _pubSignals), "tally proof failed");

        tallyCommit = _pubSignals[base + 1];
        batchesProcessed = batchIndex + 1;
        emit TallyBatchRecorded(batchIndex, tallyCommit);

        if (isFinal) {
            tallied = true;
            for (uint256 i = 0; i < candidateIds.length; i++) {
                tallyResult[candidateIds[i]] = voteCounts[i];
                emit TallyRecorded(candidateIds[i], voteCounts[i]);
            }
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
