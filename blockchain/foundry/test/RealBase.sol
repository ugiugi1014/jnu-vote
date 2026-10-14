// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Test.sol";
import "jnu/ElectionFactory.sol";
import "jnu/VotingSystem.sol";
import "jnu/VotingToken.sol";
import "jnu/PoseidonHasher.sol";
import {Groth16Verifier as RealVoteVerifier} from "jnu/VoteVerifier.sol";
import {Groth16Verifier as RealTallyVerifier} from "jnu/TallyVerifier.sol";

// 실제 Groth16 검증자로 선거를 배포하는 공통 베이스.
// 배포 순서가 같으면 선거 컨트랙트 주소(= nullifier scope)가 항상 같으므로, fixture 증명이 이 주소로 만들어진다.
abstract contract RealBase is Test {
    VotingSystem sys; VotingToken tok;
    address admin = address(0xA11CE);
    address relayer = address(0xBEEF);
    string vj; string tj;

    struct P { uint[2] a; uint[2][2] b; uint[2] c; }

    function _proof(string memory j, string memory k) internal pure returns (P memory p) {
        uint[] memory t = vm.parseJsonUintArray(j, string.concat(k, ".pA")); p.a = [t[0], t[1]];
        t = vm.parseJsonUintArray(j, string.concat(k, ".pB[0]")); p.b[0] = [t[0], t[1]];
        t = vm.parseJsonUintArray(j, string.concat(k, ".pB[1]")); p.b[1] = [t[0], t[1]];
        t = vm.parseJsonUintArray(j, string.concat(k, ".pC")); p.c = [t[0], t[1]];
    }

    function _deploy() internal {
        ElectionFactory f = new ElectionFactory(address(new VotingSystem()), address(new VotingToken()),
            address(new RealVoteVerifier()), address(new RealTallyVerifier()), address(new PoseidonHasher()));
        (address s, address t) = f.createElection(1, admin);
        sys = VotingSystem(s); tok = VotingToken(t);
    }

    /// fixture 의 commitments 를 순서대로 등록하고 선거 시작
    function _registerAndOpen() internal {
        vj = vm.readFile("fixtures/vote_e2e.json");
        uint[] memory cs = vm.parseJsonUintArray(vj, ".commitments");
        vm.startPrank(admin);
        for (uint i = 0; i < cs.length; i++) sys.registerVoter(cs[i]);
        sys.configureElection(vm.parseJsonUint(vj, ".coordPubX"), vm.parseJsonUint(vj, ".coordPubY"), 3);
        sys.openElection();
        vm.stopPrank();
    }

    function _castFromFixture(uint i, bool tamper) internal returns (bool ok, uint gasUsed) {
        string memory k = string.concat(".votes[", vm.toString(i), "]");
        P memory p = _proof(vj, k);
        uint ct = vm.parseJsonUint(vj, string.concat(k, ".ciphertext"));
        bytes memory enc = abi.encode(tamper ? ct + 1 : ct);
        bytes memory pub = abi.encode(vm.parseJsonUint(vj, string.concat(k, ".ephPubX")), vm.parseJsonUint(vj, string.concat(k, ".ephPubY")));
        bytes32 nul = bytes32(vm.parseJsonUint(vj, string.concat(k, ".nullifier")));
        uint root = vm.parseJsonUint(vj, string.concat(k, ".root"));
        vm.prank(relayer);
        uint g = gasleft();
        try sys.castVote(nul, root, enc, pub, p.a, p.b, p.c) { ok = true; } catch { ok = false; }
        gasUsed = g - gasleft();
    }
}

contract ElectionAddressProbe is RealBase {
    function test_printElectionAddress() public {
        _deploy();
        emit log_named_address("election", address(sys));
    }
}
