const { expect } = require("chai");
const hre = require("hardhat");
const { deployVotingTokenViaFactory } = require("./VotingToken.test");

describe("VotingSystem", function () {
    let token, system, voteVerifier, tallyVerifier;
    let deployer, electionAdmin, voter1, voter2, voter3, other;

    const dummyNullifier  = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("secret1"));
    const coder = hre.ethers.AbiCoder.defaultAbiCoder();
    // castVote 형식: encryptedData = abi.encode(uint256 ciphertext), voterPubKey = abi.encode(uint256 ephPubX, uint256 ephPubY)
    const enc = (ct) => coder.encode(["uint256"], [ct]);
    const pub = (x, y) => coder.encode(["uint256", "uint256"], [x, y]);
    const dummyEncrypted  = enc(7);
    const dummyPubKey     = pub(9, 11);
    const dummyPA = [0, 0];
    const dummyPB = [[0, 0], [0, 0]];
    const dummyPC = [0, 0];
    const COORD_X = 111n, COORD_Y = 222n;

    // pubSignals layout (157 slots, Tally(50,5)):
    //   [0] coordPubX, [1] coordPubY
    //   [2..51] ciphertext, [52..101] ephPubX, [102..151] ephPubY  (padding: 0, 0, 1)
    //   [152..156] voteCounts for 5 candidates
    function buildPubSignals(voteCounts /* up to 5 */, votes = [] /* [{ct, x, y}] */) {
        const arr = new Array(157).fill(0);
        arr[0] = COORD_X; arr[1] = COORD_Y;
        for (let i = 0; i < 50; i++) arr[102 + i] = 1;
        votes.forEach((v, i) => { arr[2 + i] = v.ct; arr[52 + i] = v.x; arr[102 + i] = v.y; });
        voteCounts.forEach((c, i) => { arr[152 + i] = c; });
        return arr;
    }

    // 투표 시작 전 코디네이터 공개키 + 후보 수(3) 설정 후 시작
    async function openConfigured() {
        await system.connect(electionAdmin).configureElection(COORD_X, COORD_Y, 3);
        await openConfigured();
    }

    beforeEach(async function () {
        const signers = await hre.ethers.getSigners();
        deployer = signers[0];
        electionAdmin = signers[1];
        voter1 = signers[2]; voter2 = signers[3]; voter3 = signers[4]; other = signers[5];

        ({ token, system, voteVerifier, tallyVerifier } =
            await deployVotingTokenViaFactory(deployer, electionAdmin));

        // 토큰 있는 유권자 2명 (voter1, voter3)
        await token.connect(electionAdmin).issueToken(voter1.address);
        await token.connect(electionAdmin).issueToken(voter3.address);
    });

    // ───────────── 선거 관리자 설정 ─────────────

    it("초기화 후 electionAdmin 이 올바르게 설정된다", async function () {
        expect(await system.electionAdmin()).to.equal(electionAdmin.address);
    });

    it("owner(electionAdmin) 가 관리자를 교체할 수 있다", async function () {
        // Factory.createElection 마지막에 transferOwnership(electionAdmin) → owner = electionAdmin
        await system.connect(electionAdmin).setElectionAdmin(other.address);
        expect(await system.electionAdmin()).to.equal(other.address);
    });

    it("owner 가 아니면 관리자 교체 불가", async function () {
        await expect(
            system.connect(voter1).setElectionAdmin(other.address)
        ).to.be.reverted;
    });

    // ───────────── 선거 시작/종료 ─────────────

    it("선거 관리자가 선거를 시작할 수 있다", async function () {
        await openConfigured();
        expect(await system.electionOpen()).to.equal(true);
    });

    it("선거 관리자가 선거를 종료할 수 있다", async function () {
        await openConfigured();
        await system.connect(electionAdmin).closeElection();
        expect(await system.electionOpen()).to.equal(false);
    });

    it("선거 관리자가 아니면 선거 시작 불가", async function () {
        await expect(
            system.connect(voter1).openElection()
        ).to.be.reverted;
    });

    it("이미 시작된 선거를 다시 시작할 수 없다", async function () {
        await openConfigured();
        await expect(
            system.connect(electionAdmin).openElection()
        ).to.be.reverted;
    });

    it("코디네이터 키·후보 수 설정 전에는 선거 시작 불가", async function () {
        await expect(
            system.connect(electionAdmin).openElection()
        ).to.be.revertedWith("election not configured");
    });

    it("열리지 않은 선거를 닫을 수 없다", async function () {
        await expect(
            system.connect(electionAdmin).closeElection()
        ).to.be.reverted;
    });

    // ───────────── 투표 ─────────────

    it("토큰 있는 유권자가 선거 중 투표 가능", async function () {
        await openConfigured();
        await system.connect(voter1).castVote(dummyNullifier, dummyEncrypted, dummyPubKey, dummyPA, dummyPB, dummyPC);
        expect(await system.getTotalVotes()).to.equal(1);
    });

    it("castVote 성공 시 토큰 1개가 burn 된다 (soulbound)", async function () {
        await openConfigured();
        expect(await token.balanceOf(voter1.address)).to.equal(1);
        await system.connect(voter1).castVote(dummyNullifier, dummyEncrypted, dummyPubKey, dummyPA, dummyPB, dummyPC);
        expect(await token.balanceOf(voter1.address)).to.equal(0);
    });

    it("토큰 없는 유권자는 투표 불가", async function () {
        await openConfigured();
        await expect(
            system.connect(voter2).castVote(dummyNullifier, dummyEncrypted, dummyPubKey, dummyPA, dummyPB, dummyPC)
        ).to.be.reverted;
    });

    it("선거가 열리지 않으면 투표 불가", async function () {
        await expect(
            system.connect(voter1).castVote(dummyNullifier, dummyEncrypted, dummyPubKey, dummyPA, dummyPB, dummyPC)
        ).to.be.reverted;
    });

    it("이중 투표 불가 (nullifier 재사용 방지)", async function () {
        await openConfigured();
        await system.connect(voter1).castVote(dummyNullifier, dummyEncrypted, dummyPubKey, dummyPA, dummyPB, dummyPC);
        await expect(
            system.connect(voter3).castVote(dummyNullifier, dummyEncrypted, dummyPubKey, dummyPA, dummyPB, dummyPC)
        ).to.be.reverted;
    });

    it("다른 nullifier 면 다른 유권자도 투표 가능", async function () {
        const nullifier2 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("secret2"));
        await openConfigured();
        await system.connect(voter1).castVote(dummyNullifier, dummyEncrypted, dummyPubKey, dummyPA, dummyPB, dummyPC);
        await system.connect(voter3).castVote(nullifier2, dummyEncrypted, dummyPubKey, dummyPA, dummyPB, dummyPC);
        expect(await system.getTotalVotes()).to.equal(2);
    });

    it("vote verifier 가 false 반환 시 castVote revert", async function () {
        await voteVerifier.setShouldVerify(false);
        await openConfigured();
        await expect(
            system.connect(voter1).castVote(dummyNullifier, dummyEncrypted, dummyPubKey, dummyPA, dummyPB, dummyPC)
        ).to.be.reverted;
    });

    // ───────────── 개표 ─────────────

    it("선거 종료 후 관리자가 개표 결과 기록 가능 (votes=0)", async function () {
        await openConfigured();
        await system.connect(electionAdmin).closeElection();

        const pubSignals = buildPubSignals([0, 0, 0]); // votes=0 → voteCount 도 0
        await system.connect(electionAdmin).recordTally(
            [101, 102, 103, 104, 105], [0, 0, 0, 0, 0],
            dummyPA, dummyPB, dummyPC, pubSignals
        );
        expect(await system.getVoteCount(101)).to.equal(0);
        expect(await system.getVoteCount(102)).to.equal(0);
        expect(await system.getVoteCount(103)).to.equal(0);
    });

    it("선거 진행 중에는 개표 결과 기록 불가", async function () {
        await openConfigured();
        const pubSignals = buildPubSignals([0, 0, 0]);
        await expect(
            system.connect(electionAdmin).recordTally(
                [1, 2, 3, 4, 5], [0, 0, 0, 0, 0],
                dummyPA, dummyPB, dummyPC, pubSignals
            )
        ).to.be.reverted;
    });

    it("배열 길이 불일치 시 개표 기록 실패", async function () {
        await openConfigured();
        await system.connect(electionAdmin).closeElection();
        const pubSignals = buildPubSignals([0, 0, 0]);
        await expect(
            system.connect(electionAdmin).recordTally(
                [1, 2, 3], [10, 5],   // 길이 불일치
                dummyPA, dummyPB, dummyPC, pubSignals
            )
        ).to.be.reverted;
    });

    it("후보 수 ≠ 3 시 개표 기록 실패", async function () {
        await openConfigured();
        await system.connect(electionAdmin).closeElection();
        const pubSignals = buildPubSignals([0, 0, 0]);
        await expect(
            system.connect(electionAdmin).recordTally(
                [1, 2], [10, 5],     // 후보 2명 (3명 고정 위반)
                dummyPA, dummyPB, dummyPC, pubSignals
            )
        ).to.be.reverted;
    });

    it("pubSignals 의 voteCount 매핑 불일치 시 revert", async function () {
        await openConfigured();
        await system.connect(electionAdmin).closeElection();
        const pubSignals = buildPubSignals([10, 5, 0]);  // pubSignals 는 [10,5,0]
        await expect(
            system.connect(electionAdmin).recordTally(
                [1, 2, 3, 4, 5], [99, 5, 0, 0, 0],   // voteCounts[0]=99 ≠ pubSignals[20]=10
                dummyPA, dummyPB, dummyPC, pubSignals
            )
        ).to.be.reverted;
    });

    it("tally verifier 가 false 반환 시 recordTally revert", async function () {
        await tallyVerifier.setShouldVerify(false);
        await openConfigured();
        await system.connect(electionAdmin).closeElection();
        const pubSignals = buildPubSignals([0, 0, 0]);
        await expect(
            system.connect(electionAdmin).recordTally(
                [1, 2, 3, 4, 5], [0, 0, 0, 0, 0],
                dummyPA, dummyPB, dummyPC, pubSignals
            )
        ).to.be.reverted;
    });

    it("관리자가 아니면 recordTally 호출 불가", async function () {
        await openConfigured();
        await system.connect(electionAdmin).closeElection();
        const pubSignals = buildPubSignals([0, 0, 0]);
        await expect(
            system.connect(voter1).recordTally(
                [1, 2, 3, 4, 5], [0, 0, 0, 0, 0],
                dummyPA, dummyPB, dummyPC, pubSignals
            )
        ).to.be.reverted;
    });

    // ───────────── 집계 무결성 / BabyJubJub 레이아웃 ─────────────

    it("형식이 깨진 암호문은 castVote 단계에서 거절된다 (개표 DoS 방지)", async function () {
        await openConfigured();
        await expect(
            system.connect(voter1).castVote(dummyNullifier, hre.ethers.toUtf8Bytes("garbage"), dummyPubKey, dummyPA, dummyPB, dummyPC)
        ).to.be.reverted;
    });

    it("임시 공개키 x=0 (패딩 표식)은 거절된다", async function () {
        await openConfigured();
        await expect(
            system.connect(voter1).castVote(dummyNullifier, enc(5), pub(0, 1), dummyPA, dummyPB, dummyPC)
        ).to.be.revertedWith("invalid ephemeral key");
    });

    it("필드 범위를 넘는 값은 거절된다", async function () {
        const P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
        await openConfigured();
        await expect(
            system.connect(voter1).castVote(dummyNullifier, enc(P), dummyPubKey, dummyPA, dummyPB, dummyPC)
        ).to.be.revertedWith("value out of field");
    });

    it("득표 합계가 투표 수와 다르면 recordTally 실패 (표 누락 차단)", async function () {
        await openConfigured();
        await system.connect(voter1).castVote(dummyNullifier, enc(7), pub(9, 11), dummyPA, dummyPB, dummyPC);
        const n2 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("secret2"));
        await system.connect(voter3).castVote(n2, enc(8), pub(10, 12), dummyPA, dummyPB, dummyPC);
        await system.connect(electionAdmin).closeElection();
        const votes = [{ ct: 7, x: 9, y: 11 }, { ct: 8, x: 10, y: 12 }];
        const ids = [0, 1, 2, 3, 4];

        await expect(
            system.connect(electionAdmin).recordTally(ids, [1, 0, 0, 0, 0], dummyPA, dummyPB, dummyPC, buildPubSignals([1, 0, 0, 0, 0], votes))
        ).to.be.revertedWith("tally total mismatch");

        await expect(
            system.connect(electionAdmin).recordTally(ids, [1, 0, 0, 0, 0], dummyPA, dummyPB, dummyPC, buildPubSignals([1, 0, 0, 0, 0], votes.slice(0, 1)))
        ).to.be.revertedWith("tally ciphertext mismatch");

        await system.connect(electionAdmin).recordTally(ids, [1, 1, 0, 0, 0], dummyPA, dummyPB, dummyPC, buildPubSignals([1, 1, 0, 0, 0], votes));
        expect(await system.getVoteCount(1)).to.equal(1);

        await expect(
            system.connect(electionAdmin).recordTally(ids, [1, 1, 0, 0, 0], dummyPA, dummyPB, dummyPC, buildPubSignals([1, 1, 0, 0, 0], votes))
        ).to.be.revertedWith("already tallied");
    });

    it("코디네이터 공개키가 다르면 recordTally 실패", async function () {
        await openConfigured();
        await system.connect(electionAdmin).closeElection();
        const ps = buildPubSignals([0, 0, 0, 0, 0]);
        ps[0] = 999;
        await expect(
            system.connect(electionAdmin).recordTally([0, 1, 2, 3, 4], [0, 0, 0, 0, 0], dummyPA, dummyPB, dummyPC, ps)
        ).to.be.revertedWith("tally coordinator key mismatch");
    });
});
