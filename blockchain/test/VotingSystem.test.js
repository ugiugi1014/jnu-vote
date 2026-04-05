const { expect } = require("chai");
const hre = require("hardhat");

describe("VotingSystem", function () {
    let token;           // VotingToken 컨트랙트
    let system;          // VotingSystem 컨트랙트
    let owner;           // 학교 (Super Admin)
    let electionAdmin;   // 선거 관리자 (1명)
    let voter1;          // 토큰 있는 유권자
    let voter2;          // 토큰 없는 유권자
    let voter3;          // 토큰 있는 유권자 (이중투표 테스트용)
    let other;           // 관계없는 주소

    const dummyNullifier = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("secret1"));
    const dummyEncryptedData = hre.ethers.toUtf8Bytes("encrypted_vote_data");
    const dummyPubKey = hre.ethers.toUtf8Bytes("voter_public_key");

    beforeEach(async function () {
        [owner, electionAdmin, voter1, voter2, voter3, other] = await hre.ethers.getSigners();

        // 1. VotingToken 배포
        const VotingToken = await hre.ethers.getContractFactory("VotingToken");
        token = await VotingToken.deploy();

        // 2. VotingSystem 배포 (VotingToken 주소 + 선거 관리자 주소 전달)
        const VotingSystem = await hre.ethers.getContractFactory("VotingSystem");
        system = await VotingSystem.deploy(await token.getAddress(), electionAdmin.address);

        // 3. VotingToken에 VotingSystem 주소 등록 (burnToken 호출 권한)
        await token.setVotingSystem(await system.getAddress());

        // 4. VotingToken에 선거 관리자 등록 → 토큰 발급
        await token.addElectionAdmin(electionAdmin.address);
        await token.connect(electionAdmin).issueToken(voter1.address);
        await token.connect(electionAdmin).issueToken(voter3.address);
    });

    // ─── 선거 관리자 설정 ────────────────────────

    it("배포 시 선거 관리자가 올바르게 설정된다", async function () {
        expect(await system.electionAdmin()).to.equal(electionAdmin.address);
    });

    it("학교가 선거 관리자를 교체할 수 있다", async function () {
        await system.setElectionAdmin(other.address);
        expect(await system.electionAdmin()).to.equal(other.address);
    });

    it("학교가 아니면 관리자 교체 불가", async function () {
        await expect(
            system.connect(electionAdmin).setElectionAdmin(other.address)
        ).to.be.reverted;
    });

    // ─── 선거 시작 / 종료 ────────────────────────

    it("선거 관리자가 선거를 시작할 수 있다", async function () {
        await system.connect(electionAdmin).openElection();
        expect(await system.electionOpen()).to.equal(true);
    });

    it("선거 관리자가 선거를 종료할 수 있다", async function () {
        await system.connect(electionAdmin).openElection();
        await system.connect(electionAdmin).closeElection();
        expect(await system.electionOpen()).to.equal(false);
    });

    it("선거 관리자가 아니면 선거 시작 불가", async function () {
        await expect(
            system.connect(voter1).openElection()
        ).to.be.reverted;
    });

    it("선거가 닫혀있을 때 다시 닫기 시도 → 실패", async function () {
        await expect(
            system.connect(electionAdmin).closeElection()
        ).to.be.reverted;
    });

    // ─── 투표 ────────────────────────────────────

    it("토큰 있는 유권자가 선거 중 투표 가능", async function () {
        await system.connect(electionAdmin).openElection();
        await system.connect(voter1).castVote(dummyNullifier, dummyEncryptedData, dummyPubKey);
        expect(await system.getTotalVotes()).to.equal(1);
    });

    it("토큰 없는 유권자는 투표 불가", async function () {
        await system.connect(electionAdmin).openElection();
        await expect(
            system.connect(voter2).castVote(dummyNullifier, dummyEncryptedData, dummyPubKey)
        ).to.be.reverted;
    });

    it("선거가 열리지 않으면 투표 불가", async function () {
        await expect(
            system.connect(voter1).castVote(dummyNullifier, dummyEncryptedData, dummyPubKey)
        ).to.be.reverted;
    });

    it("이중 투표 불가 (Nullifier 재사용 방지)", async function () {
        await system.connect(electionAdmin).openElection();
        await system.connect(voter1).castVote(dummyNullifier, dummyEncryptedData, dummyPubKey);
        await expect(
            system.connect(voter3).castVote(dummyNullifier, dummyEncryptedData, dummyPubKey)
        ).to.be.reverted;
    });

    it("다른 nullifier면 다른 유권자가 투표 가능", async function () {
        const nullifier2 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("secret2"));
        await system.connect(electionAdmin).openElection();
        await system.connect(voter1).castVote(dummyNullifier, dummyEncryptedData, dummyPubKey);
        await system.connect(voter3).castVote(nullifier2, dummyEncryptedData, dummyPubKey);
        expect(await system.getTotalVotes()).to.equal(2);
    });

    // ─── 개표 ────────────────────────────────────

    it("선거 종료 후 관리자가 개표 결과 기록 가능", async function () {
        await system.connect(electionAdmin).openElection();
        await system.connect(electionAdmin).closeElection();
        await system.connect(electionAdmin).recordTally([1, 2], [10, 5]);
        expect(await system.getVoteCount(1)).to.equal(10);
        expect(await system.getVoteCount(2)).to.equal(5);
    });

    it("선거 진행 중에는 개표 결과 기록 불가", async function () {
        await system.connect(electionAdmin).openElection();
        await expect(
            system.connect(electionAdmin).recordTally([1], [10])
        ).to.be.reverted;
    });

    it("배열 길이 불일치 시 개표 기록 실패", async function () {
        await system.connect(electionAdmin).openElection();
        await system.connect(electionAdmin).closeElection();
        await expect(
            system.connect(electionAdmin).recordTally([1, 2], [10])
        ).to.be.reverted;
    });
});
