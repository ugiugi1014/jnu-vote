// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Test.sol";
import "jnu/ElectionFactory.sol";
import "jnu/VotingSystem.sol";
import "jnu/VotingToken.sol";
import "jnu/mocks/MockVoteVerifier.sol";
import "jnu/mocks/MockTallyVerifier.sol";
import "jnu/PoseidonHasher.sol";

contract IntegrityTest is Test {
    VotingSystem sys; VotingToken tok; MockTallyVerifier tv;
    address admin = address(0xA11CE);
    uint[2] pA; uint[2][2] pB; uint[2] pC;
    uint256 constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 constant CX = 111; uint256 constant CY = 222;

    function setUp() public {
        MockVoteVerifier vv = new MockVoteVerifier(); tv = new MockTallyVerifier();
        ElectionFactory f = new ElectionFactory(address(new VotingSystem()), address(new VotingToken()), address(vv), address(tv), address(new PoseidonHasher()));
        (address s, address t) = f.createElection(1, admin);
        sys = VotingSystem(s); tok = VotingToken(t);
    }
    function open3() internal { vm.startPrank(admin); sys.configureElection(CX, CY, 3); sys.openElection(); vm.stopPrank(); }
    // 익명 투표: 등록(commitment) 후 아무 주소(relayer)나 제출. voter() 는 테스트 호환용으로 relayer 주소만 돌려준다.
    function voter(uint i) internal returns (address v) {
        v = address(uint160(0x1000 + i));
        vm.prank(admin); sys.registerVoter(1000 + i);
    }
    function cast(address v, uint i, uint ct, uint ex, uint ey) internal {
        uint root = sys.getLastRoot();
        vm.prank(v); sys.castVote(bytes32(i + 1), root, abi.encode(ct), abi.encode(ex, ey), pA, pB, pC);
    }

    function test_openRequiresConfig() public {
        vm.prank(admin); vm.expectRevert(bytes("election not configured")); sys.openElection();
    }
    function test_configLockedAfterVotes() public {
        open3(); cast(voter(1), 1, 5, 6, 7);
        vm.startPrank(admin); sys.closeElection();
        vm.expectRevert(bytes("votes already cast")); sys.configureElection(1, 2, 3);
        vm.stopPrank();
    }
    function test_rejectMalformed() public {
        open3(); address v = voter(1);
        uint r = sys.getLastRoot();
        vm.prank(v); vm.expectRevert();
        sys.castVote(bytes32(uint(1)), r, bytes("garbage"), abi.encode(uint(1), uint(2)), pA, pB, pC);
    }
    function test_rejectPaddingKey() public {
        open3(); address v = voter(1);
        uint r = sys.getLastRoot();
        vm.prank(v); vm.expectRevert(bytes("invalid ephemeral key"));
        sys.castVote(bytes32(uint(1)), r, abi.encode(uint(5)), abi.encode(uint(0), uint(1)), pA, pB, pC);
    }
    function test_rejectOutOfField() public {
        open3(); address v = voter(1);
        uint r = sys.getLastRoot();
        vm.prank(v); vm.expectRevert(bytes("value out of field"));
        sys.castVote(bytes32(uint(1)), r, abi.encode(P), abi.encode(uint(1), uint(2)), pA, pB, pC);
    }
    function test_noCapacityLimit() public {
        open3();
        for (uint i = 0; i < 120; i++) cast(voter(i), i, i + 7, i + 9, i + 11);
        assertEq(sys.getTotalVotes(), 120);
        vm.prank(admin); sys.closeElection();
        assertEq(sys.totalBatches(), 3);
    }

    // ───── 유권자 등록 / 익명 투표 ─────
    function test_registerOnlyAdmin() public {
        vm.expectRevert(bytes("only election admin")); sys.registerVoter(123);
    }
    function test_duplicateCommitmentRejected() public {
        vm.startPrank(admin); sys.registerVoter(123);
        vm.expectRevert(bytes("commitment already registered")); sys.registerVoter(123);
        vm.stopPrank();
    }
    function test_unknownRootRejected() public {
        open3(); voter(1);
        vm.expectRevert(bytes("unknown merkle root"));
        sys.castVote(bytes32(uint(1)), 999, abi.encode(uint(5)), abi.encode(uint(1), uint(2)), pA, pB, pC);
    }
    function test_oldRootStillAcceptedWithinHistory() public {
        open3(); voter(1);
        uint oldRoot = sys.getLastRoot();
        for (uint i = 2; i < 10; i++) voter(i);                  // 투표 중 추가 등록
        sys.castVote(bytes32(uint(1)), oldRoot, abi.encode(uint(5)), abi.encode(uint(1), uint(2)), pA, pB, pC);
        assertEq(sys.getTotalVotes(), 1);
    }
    function test_anyoneCanRelayNoToken() public {
        open3(); voter(1);
        vm.prank(address(0xBEEF));                               // 토큰 없는 relayer
        sys.castVote(bytes32(uint(1)), sys.getLastRoot(), abi.encode(uint(5)), abi.encode(uint(1), uint(2)), pA, pB, pC);
        assertEq(sys.getTotalVotes(), 1);
    }
    function test_duplicateNullifierRejected() public {
        open3(); voter(1);
        uint r = sys.getLastRoot();
        sys.castVote(bytes32(uint(7)), r, abi.encode(uint(5)), abi.encode(uint(1), uint(2)), pA, pB, pC);
        vm.expectRevert(bytes("duplicate nullifier"));
        sys.castVote(bytes32(uint(7)), r, abi.encode(uint(6)), abi.encode(uint(1), uint(2)), pA, pB, pC);
    }
    function test_registerGas() public {
        vm.startPrank(admin);
        sys.registerVoter(1);
        uint g = gasleft(); sys.registerVoter(2);
        emit log_named_uint("registerVoter gas (depth 16)", g - gasleft());
        vm.stopPrank();
    }

    // ───── 투표 키 분실 시 commitment 교체 (표가 없을 때만) ─────
    // 오프체인(서버)과 같은 규칙으로 leaf 경로를 계산한다 (빈 칸 = zeros(level))
    function _siblings(uint256[] memory leaves, uint256 index) internal view returns (uint256[16] memory sib) {
        IPoseidonT3 h = sys.hasher();
        uint256[] memory level = leaves;
        uint256 idx = index;
        for (uint256 i = 0; i < 16; i++) {
            uint256 z = sys.zeros(i);
            if (idx % 2 == 0) sib[i] = idx + 1 < level.length ? level[idx + 1] : z;
            else sib[i] = level[idx - 1];
            uint256 n = (level.length + 1) / 2;
            if (n == 0) n = 1;
            uint256[] memory next = new uint256[](n);
            for (uint256 j = 0; j < n; j++) {
                uint256 l = 2 * j < level.length ? level[2 * j] : z;
                uint256 r = 2 * j + 1 < level.length ? level[2 * j + 1] : z;
                next[j] = h.poseidon([l, r]);
            }
            level = next;
            idx /= 2;
        }
    }
    function _fresh(uint256[] memory leaves) internal returns (VotingSystem s2) {
        MockVoteVerifier vv = new MockVoteVerifier();
        ElectionFactory f = new ElectionFactory(address(new VotingSystem()), address(new VotingToken()), address(vv), address(tv), address(new PoseidonHasher()));
        (address s, ) = f.createElection(2, admin);
        s2 = VotingSystem(s);
        vm.startPrank(admin);
        for (uint256 i = 0; i < leaves.length; i++) s2.registerVoter(leaves[i]);
        vm.stopPrank();
    }
    function _arr(uint256 a, uint256 b, uint256 c) internal pure returns (uint256[] memory x) { x = new uint256[](3); x[0] = a; x[1] = b; x[2] = c; }
    function _arr4(uint256 a, uint256 b, uint256 c, uint256 d) internal pure returns (uint256[] memory x) { x = new uint256[](4); x[0] = a; x[1] = b; x[2] = c; x[3] = d; }

    function _replaceCase(uint256 index) internal {
        uint256[] memory before = _arr(1001, 1002, 1003);
        vm.startPrank(admin);
        for (uint256 i = 0; i < 3; i++) sys.registerVoter(before[i]);
        uint256 oldRoot = sys.getLastRoot();
        sys.replaceVoter(index, before[index], 9999, _siblings(before, index));
        vm.stopPrank();
        uint256[] memory afterLeaves = _arr(1001, 1002, 1003);
        afterLeaves[index] = 9999;
        // 처음부터 새 leaf 로 등록한 트리와 root 가 같아야 한다
        assertEq(sys.getLastRoot(), _fresh(afterLeaves).getLastRoot());
        assertEq(sys.commitments(index), 9999);
        assertFalse(sys.isKnownRoot(oldRoot));                     // 옛 root 로는 투표 불가
        // 교체 후 추가 등록해도 root 가 맞아야 한다 (filledSubtrees 갱신 확인)
        vm.prank(admin); sys.registerVoter(1004);
        assertEq(sys.getLastRoot(), _fresh(_arr4(afterLeaves[0], afterLeaves[1], afterLeaves[2], 1004)).getLastRoot());
    }
    function test_replaceFirstLeaf() public { _replaceCase(0); }
    function test_replaceMiddleLeaf() public { _replaceCase(1); }
    function test_replaceLastLeaf() public { _replaceCase(2); }
    function test_replaceOldCommitmentNotReusable() public {
        _replaceCase(1);
        vm.prank(admin); vm.expectRevert(bytes("commitment already registered")); sys.registerVoter(1002);
    }
    function test_replaceRejectedAfterVote() public {
        uint256[] memory leaves = _arr(1001, 1002, 1003);
        vm.startPrank(admin);
        for (uint256 i = 0; i < 3; i++) sys.registerVoter(leaves[i]);
        sys.configureElection(CX, CY, 3); sys.openElection();
        vm.stopPrank();
        sys.castVote(bytes32(uint(1)), sys.getLastRoot(), abi.encode(uint(5)), abi.encode(uint(1), uint(2)), pA, pB, pC);
        uint256[16] memory sib = _siblings(leaves, 1);             // expectRevert 전에 계산 (외부 호출 포함)
        vm.prank(admin); vm.expectRevert(bytes("votes already cast"));
        sys.replaceVoter(1, 1002, 9999, sib);
    }
    function test_replaceWrongProofRejected() public {
        uint256[] memory leaves = _arr(1001, 1002, 1003);
        vm.startPrank(admin);
        for (uint256 i = 0; i < 3; i++) sys.registerVoter(leaves[i]);
        uint256[16] memory good = _siblings(leaves, 1);
        uint256[16] memory bad = _siblings(leaves, 1);
        bad[0] = 12345;
        vm.expectRevert(bytes("invalid merkle proof")); sys.replaceVoter(1, 1002, 9999, bad);
        vm.expectRevert(bytes("old commitment mismatch")); sys.replaceVoter(1, 1003, 9999, good);
        vm.expectRevert(bytes("commitment already registered")); sys.replaceVoter(1, 1002, 1003, good);
        vm.stopPrank();
    }
    function test_replaceOnlyAdmin() public {
        uint256[] memory leaves = _arr(1001, 1002, 1003);
        vm.startPrank(admin);
        for (uint256 i = 0; i < 3; i++) sys.registerVoter(leaves[i]);
        vm.stopPrank();
        uint256[16] memory sib = _siblings(leaves, 1);
        vm.expectRevert(bytes("only election admin")); sys.replaceVoter(1, 1002, 9999, sib);
    }

    uint256 constant INIT = 14408838593220040598588012778523101864903887657864399481915450526643617223637;

    // 배치 k 의 공개 신호 (castVote 에서 i 번째 표 = (i+7, i+9, i+11))
    function signals(uint k, uint nVotes, uint prevC, uint newC, bool fin, uint[5] memory res) internal pure returns (uint[160] memory ps) {
        ps[0] = CX; ps[1] = CY;
        for (uint i = 0; i < 50; i++) {
            uint g = k * 50 + i;
            if (g < nVotes) { ps[2 + i] = g + 7; ps[52 + i] = g + 9; ps[102 + i] = g + 11; }
            else { ps[102 + i] = 1; }
        }
        ps[152] = prevC; ps[153] = newC; ps[154] = fin ? 1 : 0;
        for (uint c = 0; c < 5; c++) ps[155 + c] = res[c];
    }
    function ids5() internal pure returns (uint256[] memory a) { a = new uint256[](5); for (uint c = 0; c < 5; c++) a[c] = c; }
    function vc(uint[5] memory c) internal pure returns (uint256[] memory a) { a = new uint256[](5); for (uint i = 0; i < 5; i++) a[i] = c[i]; }
    function batchCall(uint k, uint[160] memory ps, uint[5] memory c) external { vm.prank(admin); sys.recordTallyBatch(k, ids5(), vc(c), pA, pB, pC, ps); }

    function _votes(uint n) internal {
        open3();
        for (uint i = 0; i < n; i++) cast(voter(i), i, i + 7, i + 9, i + 11);
        vm.prank(admin); sys.closeElection();
    }
    function _three() internal { _votes(3); }

    uint[5] Z;

    function test_tallyHappyPath() public {
        _three(); uint[5] memory c = [uint(1), 1, 1, 0, 0];
        assertEq(sys.tallyCommit(), INIT);
        this.batchCall(0, signals(0, 3, INIT, 777, true, c), c);
        assertEq(sys.getVoteCount(2), 1); assertTrue(sys.tallied());
        vm.expectRevert(bytes("already tallied")); this.batchCall(0, signals(0, 3, INIT, 777, true, c), c);
    }
    function test_tallyDroppedVote() public {
        _three(); uint[5] memory c = [uint(1), 1, 0, 0, 0];
        vm.expectRevert(bytes("tally total mismatch")); this.batchCall(0, signals(0, 3, INIT, 777, true, c), c);
    }
    function test_tallyRealVoteRelabeledAsPadding() public {
        _three(); uint[5] memory c = [uint(1), 1, 0, 0, 0];
        vm.expectRevert(bytes("tally ciphertext mismatch")); this.batchCall(0, signals(0, 2, INIT, 777, true, c), c);
    }
    function test_tallyWrongCoordinatorKey() public {
        _three(); uint[5] memory c = [uint(1), 1, 1, 0, 0];
        uint[160] memory ps = signals(0, 3, INIT, 777, true, c); ps[0] = 999;
        vm.expectRevert(bytes("tally coordinator key mismatch")); this.batchCall(0, ps, c);
    }
    function test_tallyVerifierRejects() public {
        _three(); uint[5] memory c = [uint(1), 1, 1, 0, 0];
        tv.setShouldVerify(false);
        vm.expectRevert(bytes("tally proof failed")); this.batchCall(0, signals(0, 3, INIT, 777, true, c), c);
    }
    function test_multiBatch() public {
        _votes(120);                               // 3 batches: 50, 50, 20
        uint[5] memory fin = [uint(40), 50, 30, 0, 0];
        // 순서 위반
        vm.expectRevert(bytes("wrong batch order")); this.batchCall(1, signals(1, 120, INIT, 2, false, Z), Z);
        // 중간 배치에 결과 공개 시도
        vm.expectRevert(bytes("tally total mismatch")); this.batchCall(0, signals(0, 120, INIT, 1, false, fin), fin);
        // 중간 배치를 final 로 위장
        vm.expectRevert(bytes("tally final flag mismatch")); this.batchCall(0, signals(0, 120, INIT, 1, true, fin), fin);
        this.batchCall(0, signals(0, 120, INIT, 1, false, Z), Z);
        assertEq(sys.tallyCommit(), 1); assertFalse(sys.tallied());
        // 커밋먼트 체인 끊기
        vm.expectRevert(bytes("tally commitment mismatch")); this.batchCall(1, signals(1, 120, 999, 2, false, Z), Z);
        this.batchCall(1, signals(1, 120, 1, 2, false, Z), Z);
        // 마지막 배치 전에 final 아닌 척
        vm.expectRevert(bytes("tally final flag mismatch")); this.batchCall(2, signals(2, 120, 2, 3, false, Z), Z);
        this.batchCall(2, signals(2, 120, 2, 3, true, fin), fin);
        assertTrue(sys.tallied()); assertEq(sys.getVoteCount(1), 50); assertEq(sys.batchesProcessed(), 3);
    }
    function test_zeroVotesSingleBatch() public {
        open3(); vm.prank(admin); sys.closeElection();
        assertEq(sys.totalBatches(), 1);
        this.batchCall(0, signals(0, 0, INIT, 5, true, Z), Z);
        assertTrue(sys.tallied());
    }
}
