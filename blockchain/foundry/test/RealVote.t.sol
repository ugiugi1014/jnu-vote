// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./RealBase.sol";

// 프론트 코드 경로(voterIdService + encryptVote + 워커 입력 변환 + pi_b swap)로 만든 실제 익명 투표 증명을
// 실제 VoteVerifier + VotingSystem.castVote 로 검증. 제출은 relayer 주소 (토큰·학생 지갑 없음).
contract RealVoteTest is RealBase {
    function setUp() public { _deploy(); _registerAndOpen(); }

    function test_jsTreeMatchesOnChainTree() public view {
        assertEq(sys.getLastRoot(), vm.parseJsonUint(vj, ".votes[0].root"), "JS merkle root != on-chain root");
        assertEq(address(sys), vm.parseJsonAddress(vj, ".election"), "election address (scope) changed");
    }

    function test_realAnonymousVotesAccepted() public {
        for (uint i = 0; i < 3; i++) {
            (bool ok, uint g) = _castFromFixture(i, false);
            assertTrue(ok, "real proof rejected");
            emit log_named_uint("castVote gas (relayer, real proof, merkle 16)", g);
        }
        assertEq(sys.getTotalVotes(), 3);
    }

    function test_doubleVoteRejected() public {
        (bool ok,) = _castFromFixture(0, false); assertTrue(ok);
        (ok,) = _castFromFixture(0, false); assertFalse(ok, "same nullifier accepted twice");
    }

    function test_tamperedCiphertextRejected() public {
        (bool ok,) = _castFromFixture(0, true);
        assertFalse(ok, "tampered ciphertext accepted");
    }

    function test_proofBoundToElection() public {
        // 같은 증명을 다른 선거(다른 scope)에 내면 실패해야 한다
        ElectionFactory f = new ElectionFactory(address(new VotingSystem()), address(new VotingToken()),
            address(new RealVoteVerifier()), address(new RealTallyVerifier()), address(new PoseidonHasher()));
        (address s,) = f.createElection(2, admin);
        sys = VotingSystem(s);
        _registerAndOpen();
        (bool ok,) = _castFromFixture(0, false);
        assertFalse(ok, "proof replayed in another election");
    }

    function test_unregisteredTreeRejected() public {
        // 트리에 등록되지 않은(root 를 모르는) 상태에서는 거절
        ElectionFactory f = new ElectionFactory(address(new VotingSystem()), address(new VotingToken()),
            address(new RealVoteVerifier()), address(new RealTallyVerifier()), address(new PoseidonHasher()));
        (address s,) = f.createElection(3, admin);
        sys = VotingSystem(s);
        vm.startPrank(admin);
        sys.registerVoter(42);
        sys.configureElection(vm.parseJsonUint(vj, ".coordPubX"), vm.parseJsonUint(vj, ".coordPubY"), 3);
        sys.openElection();
        vm.stopPrank();
        (bool ok,) = _castFromFixture(0, false);
        assertFalse(ok, "vote accepted with root unknown to this election");
    }
}
