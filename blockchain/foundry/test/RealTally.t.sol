// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Test.sol";
import "jnu/ElectionFactory.sol";
import "jnu/VotingSystem.sol";
import "jnu/VotingToken.sol";
import {Groth16Verifier as RealVoteVerifier} from "jnu/VoteVerifier.sol";
import {Groth16Verifier as RealTallyVerifier} from "jnu/TallyVerifier.sol";

// 실제 투표 증명 3개로 투표 -> 서버 코드로 만든 실제 집계 증명으로 recordTally (검증자 모두 실제)
contract RealTallyTest is Test {
    VotingSystem sys; VotingToken tok;
    address admin = address(0xA11CE);
    string vj; string tj;

    struct P { uint[2] a; uint[2][2] b; uint[2] c; }

    function _proof(string memory j, string memory k) internal pure returns (P memory p) {
        uint[] memory t = vm.parseJsonUintArray(j, string.concat(k, ".pA")); p.a = [t[0], t[1]];
        t = vm.parseJsonUintArray(j, string.concat(k, ".pB[0]")); p.b[0] = [t[0], t[1]];
        t = vm.parseJsonUintArray(j, string.concat(k, ".pB[1]")); p.b[1] = [t[0], t[1]];
        t = vm.parseJsonUintArray(j, string.concat(k, ".pC")); p.c = [t[0], t[1]];
    }

    function setUp() public {
        vj = vm.readFile("fixtures/vote_e2e.json"); tj = vm.readFile("fixtures/tally_e2e.json");
        ElectionFactory f = new ElectionFactory(address(new VotingSystem()), address(new VotingToken()), address(new RealVoteVerifier()), address(new RealTallyVerifier()));
        (address s, address t) = f.createElection(1, admin);
        sys = VotingSystem(s); tok = VotingToken(t);
        vm.startPrank(admin);
        sys.configureElection(vm.parseJsonUint(vj, ".coordPubX"), vm.parseJsonUint(vj, ".coordPubY"), 3);
        sys.openElection();
        vm.stopPrank();
        for (uint i = 0; i < 3; i++) {
            string memory k = string.concat(".votes[", vm.toString(i), "]");
            P memory p = _proof(vj, k);
            address v = address(uint160(0x5000 + i));
            vm.prank(admin); tok.issueToken(v);
            vm.prank(v);
            sys.castVote(bytes32(vm.parseJsonUint(vj, string.concat(k, ".nullifier"))),
                abi.encode(vm.parseJsonUint(vj, string.concat(k, ".ciphertext"))),
                abi.encode(vm.parseJsonUint(vj, string.concat(k, ".ephPubX")), vm.parseJsonUint(vj, string.concat(k, ".ephPubY"))),
                p.a, p.b, p.c);
        }
        vm.prank(admin); sys.closeElection();
    }

    function _signals() internal view returns (uint[157] memory ps) {
        uint[] memory s = vm.parseJsonUintArray(tj, ".publicSignals");
        require(s.length == 157, "signals");
        for (uint i = 0; i < 157; i++) ps[i] = s[i];
    }
    function _ids() internal pure returns (uint256[] memory a) { a = new uint256[](5); for (uint c = 0; c < 5; c++) a[c] = 100 + c; }
    function _counts() internal view returns (uint256[] memory) { return vm.parseJsonUintArray(tj, ".voteCounts"); }

    function test_realTallyRecorded() public {
        P memory p = _proof(tj, "");
        vm.prank(admin);
        uint g = gasleft();
        sys.recordTally(_ids(), _counts(), p.a, p.b, p.c, _signals());
        emit log_named_uint("recordTally gas (real Groth16, 157 signals)", g - gasleft());
        assertEq(sys.getVoteCount(100) + sys.getVoteCount(101) + sys.getVoteCount(102), 3);
        emit log_named_uint("candidate0", sys.getVoteCount(100));
        emit log_named_uint("candidate1", sys.getVoteCount(101));
        emit log_named_uint("candidate2", sys.getVoteCount(102));
    }

    function test_realTallyForgedResultRejected() public {
        // 증명은 그대로 두고 결과만 바꾸면(후보0 -> 후보1) 검증 실패해야 한다
        P memory p = _proof(tj, "");
        uint[157] memory ps = _signals();
        uint256[] memory c = _counts();
        require(c[0] > 0, "need a vote for candidate 0");
        c[0] -= 1; c[1] += 1; ps[152] -= 1; ps[153] += 1;
        vm.prank(admin);
        vm.expectRevert(bytes("tally proof failed"));
        sys.recordTally(_ids(), c, p.a, p.b, p.c, ps);
    }
}
