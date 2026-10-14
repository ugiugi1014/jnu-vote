// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./RealBase.sol";

// 실제 익명 투표 60개(62명 등록) -> 서버 코드(buildTallyBatchInputs)로 만든 실제 집계 증명 2배치 -> recordTallyBatch
contract RealTallyTest is RealBase {
    uint constant N = 60;

    function setUp() public {
        _deploy(); _registerAndOpen();
        tj = vm.readFile("fixtures/tally_e2e.json");
        for (uint i = 0; i < N; i++) { (bool ok,) = _castFromFixture(i, false); require(ok, "cast"); }
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
        assertEq(sys.getVoteCount(100), 0);
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
        r[0] -= 1; r[1] += 1; ps[155] -= 1; ps[156] += 1;
        vm.prank(admin);
        vm.expectRevert(bytes("tally proof failed"));
        sys.recordTallyBatch(1, _ids(), r, p.a, p.b, p.c, ps);
    }
}
