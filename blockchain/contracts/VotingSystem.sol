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
        uint[9] calldata input
    ) external view returns (bool);
}

/// circomlibjs poseidon_gencontract 로 생성한 Poseidon(2) 컨트랙트 (회로의 Poseidon 과 동일)
interface IPoseidonT3 {
    function poseidon(uint256[2] calldata input) external pure returns (uint256);
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

    VotingToken public votingToken;   // (익명 투표 전환 후 투표에는 사용하지 않음, 팩토리 호환용)
    IVoteVerifier public voteVerifier;
    ITallyVerifier public tallyVerifier;
    IPoseidonT3 public hasher;

    // ── 유권자 머클 트리 (증분 트리, 깊이 16 = 최대 65,536명) ──
    // leaf = Poseidon(secret). secret 은 학생 브라우저만 안다.
    // 서버(관리자)는 학번을 확인하고 commitment 를 등록할 뿐, 어떤 표가 어떤 leaf 인지 알 수 없다.
    uint256 public constant TREE_DEPTH = 16;
    uint256 private constant ROOT_HISTORY = 30;
    uint256[] public commitments;
    mapping(uint256 => bool) public commitmentUsed;
    uint256[16] private filledSubtrees;
    uint256[30] private roots;
    uint256 private currentRootIndex;

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
    event VoterRegistered(uint256 indexed leafIndex, uint256 commitment, uint256 root);
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
        address _tallyVerifier,
        address _hasher
    ) external initializer {
        __Ownable_init(_owner);
        require(_votingToken != address(0), "invalid voting token");
        require(_electionAdmin != address(0), "invalid election admin");
        require(_voteVerifier != address(0), "invalid vote verifier");
        require(_tallyVerifier != address(0), "invalid tally verifier");
        require(_hasher != address(0), "invalid hasher");

        votingToken = VotingToken(_votingToken);
        electionAdmin = _electionAdmin;
        voteVerifier = IVoteVerifier(_voteVerifier);
        tallyVerifier = ITallyVerifier(_tallyVerifier);
        tallyCommit = INITIAL_TALLY_COMMIT;
        hasher = IPoseidonT3(_hasher);
        roots[0] = zeros(TREE_DEPTH); // 빈 트리의 root

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

    /// @dev zeros(0) = 0, zeros(i) = Poseidon(zeros(i-1), zeros(i-1)) — 빈 서브트리 해시 (오프체인에서 계산한 상수)
    function zeros(uint256 i) public pure returns (uint256) {
        if (i == 0) return 0;
        if (i == 1) return 14744269619966411208579211824598458697587494354926760081771325075741142829156;
        if (i == 2) return 7423237065226347324353380772367382631490014989348495481811164164159255474657;
        if (i == 3) return 11286972368698509976183087595462810875513684078608517520839298933882497716792;
        if (i == 4) return 3607627140608796879659380071776844901612302623152076817094415224584923813162;
        if (i == 5) return 19712377064642672829441595136074946683621277828620209496774504837737984048981;
        if (i == 6) return 20775607673010627194014556968476266066927294572720319469184847051418138353016;
        if (i == 7) return 3396914609616007258851405644437304192397291162432396347162513310381425243293;
        if (i == 8) return 21551820661461729022865262380882070649935529853313286572328683688269863701601;
        if (i == 9) return 6573136701248752079028194407151022595060682063033565181951145966236778420039;
        if (i == 10) return 12413880268183407374852357075976609371175688755676981206018884971008854919922;
        if (i == 11) return 14271763308400718165336499097156975241954733520325982997864342600795471836726;
        if (i == 12) return 20066985985293572387227381049700832219069292839614107140851619262827735677018;
        if (i == 13) return 9394776414966240069580838672673694685292165040808226440647796406499139370960;
        if (i == 14) return 11331146992410411304059858900317123658895005918277453009197229807340014528524;
        if (i == 15) return 15819538789928229930262697811477882737253464456578333862691129291651619515538;
        if (i == 16) return 19217088683336594659449020493828377907203207941212636669271704950158751593251;
        revert("index out of bounds");
    }

    function _hash(uint256 a, uint256 b) internal view returns (uint256) {
        return hasher.poseidon([a, b]);
    }

    /// @notice 유권자 commitment 등록 (서버가 학번·자격 확인 후 호출, 학생 1명당 1번)
    ///         투표 중에도 등록 가능 (최근 ROOT_HISTORY 개 root 를 인정)
    function registerVoter(uint256 commitment) external onlyElectionAdmin {
        require(!tallied, "already tallied");
        require(commitment != 0 && commitment < SNARK_SCALAR_FIELD, "invalid commitment");
        require(!commitmentUsed[commitment], "commitment already registered");
        uint256 index = commitments.length;
        require(index < (1 << TREE_DEPTH), "voter tree full");

        uint256 cur = commitment;
        uint256 idx = index;
        for (uint256 i = 0; i < TREE_DEPTH; i++) {
            uint256 left;
            uint256 right;
            if (idx % 2 == 0) {
                left = cur;
                right = zeros(i);
                filledSubtrees[i] = cur;
            } else {
                left = filledSubtrees[i];
                right = cur;
            }
            cur = _hash(left, right);
            idx /= 2;
        }
        currentRootIndex = (currentRootIndex + 1) % ROOT_HISTORY;
        roots[currentRootIndex] = cur;
        commitmentUsed[commitment] = true;
        commitments.push(commitment);
        emit VoterRegistered(index, commitment, cur);
    }

    function getLastRoot() public view returns (uint256) {
        return roots[currentRootIndex];
    }

    function isKnownRoot(uint256 root) public view returns (bool) {
        if (root == 0) return false;
        uint256 i = currentRootIndex;
        for (uint256 n = 0; n < ROOT_HISTORY; n++) {
            if (roots[i] == root) return true;
            i = i == 0 ? ROOT_HISTORY - 1 : i - 1;
        }
        return false;
    }

    function getCommitments() external view returns (uint256[] memory) {
        return commitments;
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

    /// @notice 익명 투표 제출. relayer(서버)가 대신 보내므로 msg.sender 는 누구든 상관없다.
    ///         자격은 "유권자 트리 안의 누군가"라는 증명으로, 이중투표는 nullifier 로 막는다.
    function castVote(
        bytes32 nullifier,
        uint256 merkleRoot,
        bytes calldata encryptedData,
        bytes calldata voterPubKey,
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC
    ) external whenElectionOpen {
        require(!nullifiers[nullifier], "duplicate nullifier");
        require(isKnownRoot(merkleRoot), "unknown merkle root");

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

        // voteProof 공개 신호:
        //   [nullifier, merkleRoot, scope, numCandidates, coordPubX, coordPubY, ciphertext, ephPubX, ephPubY]
        // -> 등록된 유권자이고, 암호문이 등록된 코디 키로 유효 후보(0..numCandidates-1)를 암호화한 것임을 검증
        uint[9] memory pubSignals = [
            uint256(nullifier), merkleRoot, scope(), numCandidates, coordPubX, coordPubY, ciphertext, ephPubX, ephPubY
        ];
        require(voteVerifier.verifyProof(_pA, _pB, _pC, pubSignals), "vote proof failed");

        nullifiers[nullifier] = true;
        votes.push(EncryptedVote({ encryptedData: encryptedData, voterPublicKey: voterPubKey }));
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

    /// @notice nullifier 범위 = 이 선거 컨트랙트 주소 (선거마다 nullifier 가 달라져 선거 간 연결 불가)
    function scope() public view returns (uint256) {
        return uint256(uint160(address(this)));
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
