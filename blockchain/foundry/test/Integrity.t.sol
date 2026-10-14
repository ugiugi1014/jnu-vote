// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Test.sol";
import "jnu/ElectionFactory.sol";
import "jnu/VotingSystem.sol";
import "jnu/VotingToken.sol";
import "jnu/mocks/MockVoteVerifier.sol";
import "jnu/mocks/MockTallyVerifier.sol";

contract IntegrityTest is Test {
    VotingSystem sys; VotingToken tok; MockTallyVerifier tv;
    address admin = address(0xA11CE);
    uint[2] pA; uint[2][2] pB; uint[2] pC;
    uint256 constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 constant CX = 111; uint256 constant CY = 222;

    function setUp() public {
        MockVoteVerifier vv = new MockVoteVerifier(); tv = new MockTallyVerifier();
        ElectionFactory f = new ElectionFactory(address(new VotingSystem()), address(new VotingToken()), address(vv), address(tv));
        (address s, address t) = f.createElection(1, admin);
        sys = VotingSystem(s); tok = VotingToken(t);
    }
    function open3() internal { vm.startPrank(admin); sys.configureElection(CX, CY, 3); sys.openElection(); vm.stopPrank(); }
    function voter(uint i) internal returns (address v) { v = address(uint160(0x1000 + i)); vm.prank(admin); tok.issueToken(v); }
    function cast(address v, uint i, uint ct, uint ex, uint ey) internal {
        vm.prank(v); sys.castVote(bytes32(i + 1), abi.encode(ct), abi.encode(ex, ey), pA, pB, pC);
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
        vm.prank(v); vm.expectRevert();
        sys.castVote(bytes32(uint(1)), bytes("garbage"), abi.encode(uint(1), uint(2)), pA, pB, pC);
    }
    function test_rejectPaddingKey() public {
        open3(); address v = voter(1);
        vm.prank(v); vm.expectRevert(bytes("invalid ephemeral key"));
        sys.castVote(bytes32(uint(1)), abi.encode(uint(5)), abi.encode(uint(0), uint(1)), pA, pB, pC);
    }
    function test_rejectOutOfField() public {
        open3(); address v = voter(1);
        vm.prank(v); vm.expectRevert(bytes("value out of field"));
        sys.castVote(bytes32(uint(1)), abi.encode(P), abi.encode(uint(1), uint(2)), pA, pB, pC);
    }
    function test_noCapacityLimit() public {
        open3();
        for (uint i = 0; i < 120; i++) cast(voter(i), i, i + 7, i + 9, i + 11);
        assertEq(sys.getTotalVotes(), 120);
        vm.prank(admin); sys.closeElection();
        assertEq(sys.totalBatches(), 3);
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
