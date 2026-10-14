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
    function test_capacity50() public {
        open3();
        for (uint i = 0; i < 50; i++) cast(voter(i), i, i + 7, i + 9, i + 11);
        address v = voter(50);
        vm.prank(v); vm.expectRevert(bytes("tally capacity reached"));
        sys.castVote(bytes32(uint(51)), abi.encode(uint(1)), abi.encode(uint(1), uint(2)), pA, pB, pC);
    }

    function signals(uint n, uint[5] memory counts) internal pure returns (uint[157] memory ps) {
        ps[0] = CX; ps[1] = CY;
        for (uint i = 0; i < 50; i++) {
            if (i < n) { ps[2 + i] = i + 7; ps[52 + i] = i + 9; ps[102 + i] = i + 11; }
            else { ps[102 + i] = 1; }
        }
        for (uint c = 0; c < 5; c++) ps[152 + c] = counts[c];
    }
    function ids5() internal pure returns (uint256[] memory a) { a = new uint256[](5); for (uint c = 0; c < 5; c++) a[c] = c; }
    function vc(uint[5] memory c) internal pure returns (uint256[] memory a) { a = new uint256[](5); for (uint i = 0; i < 5; i++) a[i] = c[i]; }
    function tallyCall(uint[157] memory ps, uint[5] memory c) external { vm.prank(admin); sys.recordTally(ids5(), vc(c), pA, pB, pC, ps); }

    function _three() internal {
        open3();
        for (uint i = 0; i < 3; i++) cast(voter(i), i, i + 7, i + 9, i + 11);
        vm.prank(admin); sys.closeElection();
    }
    function test_tallyHappyPath() public {
        _three(); uint[5] memory c = [uint(1), 1, 1, 0, 0];
        this.tallyCall(signals(3, c), c);
        assertEq(sys.getVoteCount(2), 1); assertTrue(sys.tallied());
        vm.expectRevert(bytes("already tallied")); this.tallyCall(signals(3, c), c);
    }
    function test_tallyDroppedVote() public {
        _three(); uint[5] memory c = [uint(1), 1, 0, 0, 0];
        vm.expectRevert(bytes("tally total mismatch")); this.tallyCall(signals(3, c), c);
    }
    function test_tallyRealVoteRelabeledAsPadding() public {
        _three(); uint[5] memory c = [uint(1), 1, 0, 0, 0];
        uint[157] memory ps = signals(2, c);   // vote #2 presented as padding
        vm.expectRevert(bytes("tally ciphertext mismatch")); this.tallyCall(ps, c);
    }
    function test_tallyWrongCoordinatorKey() public {
        _three(); uint[5] memory c = [uint(1), 1, 1, 0, 0];
        uint[157] memory ps = signals(3, c); ps[0] = 999;
        vm.expectRevert(bytes("tally coordinator key mismatch")); this.tallyCall(ps, c);
    }
    function test_tallyVerifierRejects() public {
        _three(); uint[5] memory c = [uint(1), 1, 1, 0, 0];
        tv.setShouldVerify(false);
        vm.expectRevert(bytes("tally proof failed")); this.tallyCall(signals(3, c), c);
    }
}
