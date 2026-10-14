// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Test.sol";
import "jnu/ElectionFactory.sol";
import "jnu/VotingSystem.sol";
import "jnu/VotingToken.sol";
import {Groth16Verifier as RealVoteVerifier} from "jnu/VoteVerifier.sol";
import "jnu/mocks/MockTallyVerifier.sol";

// 프론트 코드 경로(encryptVote + generateVoteProof 입력 변환 + pi_b swap)로 만든 실제 증명을
// 실제 VoteVerifier 와 VotingSystem.castVote 로 검증한다.
contract RealVoteTest is Test {
    VotingSystem sys; VotingToken tok;
    address admin = address(0xA11CE);
    string json;

    function setUp() public {
        json = vm.readFile("fixtures/vote_e2e.json");
        ElectionFactory f = new ElectionFactory(address(new VotingSystem()), address(new VotingToken()), address(new RealVoteVerifier()), address(new MockTallyVerifier()));
        (address s, address t) = f.createElection(1, admin);
        sys = VotingSystem(s); tok = VotingToken(t);
        vm.startPrank(admin);
        sys.configureElection(vm.parseJsonUint(json, ".coordPubX"), vm.parseJsonUint(json, ".coordPubY"), vm.parseJsonUint(json, ".numCandidates"));
        sys.openElection();
        vm.stopPrank();
    }

    struct P { uint[2] a; uint[2][2] b; uint[2] c; bytes enc; bytes pub; bytes32 nul; }

    function _load(uint i, bool tamper) internal view returns (P memory p) {
        string memory k = string.concat(".votes[", vm.toString(i), "]");
        uint[] memory t = vm.parseJsonUintArray(json, string.concat(k, ".pA"));
        p.a = [t[0], t[1]];
        t = vm.parseJsonUintArray(json, string.concat(k, ".pB[0]"));
        p.b[0] = [t[0], t[1]];
        t = vm.parseJsonUintArray(json, string.concat(k, ".pB[1]"));
        p.b[1] = [t[0], t[1]];
        t = vm.parseJsonUintArray(json, string.concat(k, ".pC"));
        p.c = [t[0], t[1]];
        uint ct = vm.parseJsonUint(json, string.concat(k, ".ciphertext"));
        p.enc = abi.encode(tamper ? ct + 1 : ct);
        p.pub = abi.encode(vm.parseJsonUint(json, string.concat(k, ".ephPubX")), vm.parseJsonUint(json, string.concat(k, ".ephPubY")));
        p.nul = bytes32(vm.parseJsonUint(json, string.concat(k, ".nullifier")));
    }

    function _vote(uint i, address v, bool tamper) internal returns (bool ok, uint gasUsed) {
        P memory p = _load(i, tamper);
        vm.prank(v);
        uint g = gasleft();
        try sys.castVote(p.nul, p.enc, p.pub, p.a, p.b, p.c) { ok = true; } catch { ok = false; }
        gasUsed = g - gasleft();
    }

    function test_realProofsAccepted() public {
        for (uint i = 0; i < 3; i++) {
            address v = address(uint160(0x5000 + i));
            vm.prank(admin); tok.issueToken(v);
            (bool ok, uint g) = _vote(i, v, false);
            assertTrue(ok, "real proof rejected");
            emit log_named_uint("castVote gas (real Groth16 verify)", g);
        }
        assertEq(sys.getTotalVotes(), 3);
    }

    function test_tamperedCiphertextRejected() public {
        address v = address(0x6000);
        vm.prank(admin); tok.issueToken(v);
        (bool ok,) = _vote(0, v, true);
        assertFalse(ok, "tampered ciphertext accepted");
    }

    function test_wrongCoordinatorKeyRejected() public {
        // 다른 키로 설정된 선거에서는 같은 증명이 통과하면 안 된다
        ElectionFactory f = new ElectionFactory(address(new VotingSystem()), address(new VotingToken()), address(new RealVoteVerifier()), address(new MockTallyVerifier()));
        (address s, address t) = f.createElection(2, admin);
        sys = VotingSystem(s); tok = VotingToken(t);
        vm.startPrank(admin);
        sys.configureElection(vm.parseJsonUint(json, ".coordPubX") + 1, vm.parseJsonUint(json, ".coordPubY"), 3);
        sys.openElection();
        vm.stopPrank();
        address v = address(0x7000);
        vm.prank(admin); tok.issueToken(v);
        (bool ok,) = _vote(0, v, false);
        assertFalse(ok, "proof accepted under different coordinator key");
    }
}
