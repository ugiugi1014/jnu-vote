// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Test.sol";
import "jnu/ElectionFactory.sol";
import "jnu/VotingSystem.sol";
import "jnu/VotingToken.sol";
import {Groth16Verifier as RealVoteVerifier} from "jnu/VoteVerifier.sol";
import {Groth16Verifier as RealTallyVerifier} from "jnu/TallyVerifier.sol";

// 실제 투표 증명 60개로 투표 -> 서버 코드(buildTallyBatchInputs)로 만든 실제 집계 증명 2배치로 recordTallyBatch
contract RealTallyTest is Test {
    VotingSystem sys; VotingToken tok;
    address admin = address(0xA11CE);
    string vj; string tj;
    uint constant N = 60;

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
        for (uint i = 0; i < N; i++) {
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

    function _signals(uint k) internal view returns (uint[160] memory ps) {
        uint[] memory s = vm.parseJsonUintArray(tj, string.concat(".batches[", vm.toString(k), "].publicSignals"));
        require(s.length == 160, "signals");
        for (uint i = 0; i < 160; i++) ps[i] = s[i];
    }
    function _ids() internal pure returns (uint256[] memory a) { a = new uint256[](5); for (uint c = 0; c < 5; c++) a[c] = 100 + c; }
    function _result(uint k) internal view returns (uint256[] memory) { return vm.parseJsonUintArray(tj, string.concat(".batches[", vm.toString(k), "].result")); }
    function _submit(uint k) internal returns (uint gasUsed) {
        P memory p = _proof(tj, string.concat(".batches[", vm.toString(k), "]"));
        uint[160] memory ps = _signals(k);
        uint256[] memory r = _result(k);
        vm.prank(admin);
        uint g = gasleft();
        sys.recordTallyBatch(k, _ids(), r, p.a, p.b, p.c, ps);
        gasUsed = g - gasleft();
    }

    function test_realBatchedTally() public {
        assertEq(sys.totalBatches(), 2);
        emit log_named_uint("recordTallyBatch[0] gas", _submit(0));
        assertFalse(sys.tallied());
        assertEq(sys.getVoteCount(100), 0); // 중간 배치 후에는 결과 비공개
        emit log_named_uint("recordTallyBatch[1] gas (final)", _submit(1));
        assertTrue(sys.tallied());
        assertEq(sys.getVoteCount(100) + sys.getVoteCount(101) + sys.getVoteCount(102), N);
        emit log_named_uint("candidate0", sys.getVoteCount(100));
        emit log_named_uint("candidate1", sys.getVoteCount(101));
        emit log_named_uint("candidate2", sys.getVoteCount(102));
    }

    function test_finalBatchFirstRejected() public {
        P memory p = _proof(tj, ".batches[1]");
        uint[160] memory ps = _signals(1);
        uint256[] memory r = _result(1);
        vm.prank(admin);
        vm.expectRevert(bytes("wrong batch order"));
        sys.recordTallyBatch(1, _ids(), r, p.a, p.b, p.c, ps);
    }

    function test_forgedFinalResultRejected() public {
        _submit(0);
        P memory p = _proof(tj, ".batches[1]");
        uint[160] memory ps = _signals(1);
        uint256[] memory r = _result(1);
        r[0] -= 1; r[1] += 1; ps[155] -= 1; ps[156] += 1;   // 후보0 표 1개를 후보1로
        vm.prank(admin);
        vm.expectRevert(bytes("tally proof failed"));
        sys.recordTallyBatch(1, _ids(), r, p.a, p.b, p.c, ps);
    }
}
