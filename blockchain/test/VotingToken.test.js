const { expect } = require("chai");
const hre = require("hardhat");

// 운영 코드와 동일한 흐름으로 setup:
//   impl 배포 (_disableInitializers) → Factory.createElection → clone + initialize + setVotingSystem + transferOwnership(electionAdmin)
//   → token.owner = electionAdmin
async function deployVotingTokenViaFactory(deployer, electionAdmin, electionId = 1) {
    const VotingToken = await hre.ethers.getContractFactory("VotingToken");
    const VotingSystem = await hre.ethers.getContractFactory("VotingSystem");
    const MockVoteVerifier = await hre.ethers.getContractFactory("MockVoteVerifier");
    const MockTallyVerifier = await hre.ethers.getContractFactory("MockTallyVerifier");
    const ElectionFactory = await hre.ethers.getContractFactory("ElectionFactory");

    const tokenImpl = await VotingToken.connect(deployer).deploy();
    const systemImpl = await VotingSystem.connect(deployer).deploy();
    const voteVerifier = await MockVoteVerifier.connect(deployer).deploy();
    const tallyVerifier = await MockTallyVerifier.connect(deployer).deploy();

    const factory = await ElectionFactory.connect(deployer).deploy(
        await systemImpl.getAddress(),
        await tokenImpl.getAddress(),
        await voteVerifier.getAddress(),
        await tallyVerifier.getAddress()
    );

    const tx = await factory.connect(deployer).createElection(electionId, electionAdmin.address);
    const receipt = await tx.wait();
    const ev = receipt.logs
        .map(l => { try { return factory.interface.parseLog(l); } catch { return null; } })
        .find(p => p && p.name === "ElectionCreated");

    const token = VotingToken.attach(ev.args.votingToken);
    const system = VotingSystem.attach(ev.args.votingSystem);

    return { token, system, voteVerifier, tallyVerifier, factory };
}

describe("VotingToken", function () {
    let token;             // VotingToken clone
    let electionAdmin;     // token.owner — 운영에서 selectVote() 시점에 transferOwnership 됨
    let voter1, voter2, voter3;

    beforeEach(async function () {
        const [deployer, admin, v1, v2, v3] = await hre.ethers.getSigners();
        electionAdmin = admin;
        voter1 = v1; voter2 = v2; voter3 = v3;

        ({ token } = await deployVotingTokenViaFactory(deployer, electionAdmin));
    });

    it("관리자가 토큰을 발급하면 잔액이 1이어야 한다.", async function () {
        await token.connect(electionAdmin).issueToken(voter1.address);
        expect(await token.balanceOf(voter1.address)).to.equal(1);
    });

    it("토큰이 있으면 isTokenValid = true", async function () {
        await token.connect(electionAdmin).issueToken(voter1.address);
        expect(await token.isTokenValid(voter1.address)).to.equal(true);
    });

    it("토큰이 없으면 isTokenValid = false", async function () {
        expect(await token.isTokenValid(voter2.address)).to.equal(false);
    });

    it("관리자가 아니면 토큰 발급 불가", async function () {
        await expect(
            token.connect(voter1).issueToken(voter2.address)
        ).to.be.reverted;
    });

    it("같은 유권자에게 토큰을 두 번 발급할 수 없다", async function () {
        await token.connect(electionAdmin).issueToken(voter1.address);
        await expect(
            token.connect(electionAdmin).issueToken(voter1.address)
        ).to.be.reverted;
    });

    it("투표 토큰은 다른 사람에게 전송할 수 없다 (soulbound)", async function () {
        await token.connect(electionAdmin).issueToken(voter1.address);
        await expect(
            token.connect(voter1).transfer(voter2.address, 1)
        ).to.be.reverted;
    });

    it("투표 토큰의 decimals는 0이어야 한다", async function () {
        expect(await token.decimals()).to.equal(0);
    });

    it("투표 토큰은 위임(approve)할 수 없다", async function () {
        await token.connect(electionAdmin).issueToken(voter1.address);
        await expect(
            token.connect(voter1).approve(voter2.address, 1)
        ).to.be.reverted;
    });

    it("일괄 발급 시 모든 유권자의 잔액이 1이어야 한다", async function () {
        await token.connect(electionAdmin).issueTokenBatch([voter1.address, voter2.address, voter3.address]);
        expect(await token.balanceOf(voter1.address)).to.equal(1);
        expect(await token.balanceOf(voter2.address)).to.equal(1);
        expect(await token.balanceOf(voter3.address)).to.equal(1);
    });

    it("일괄 발급 시 이미 토큰이 있는 유권자는 건너뛴다", async function () {
        await token.connect(electionAdmin).issueToken(voter1.address);
        await token.connect(electionAdmin).issueTokenBatch([voter1.address, voter2.address]);
        expect(await token.balanceOf(voter1.address)).to.equal(1);
        expect(await token.balanceOf(voter2.address)).to.equal(1);
    });

    it("관리자가 아니면 일괄 발급 불가", async function () {
        await expect(
            token.connect(voter1).issueTokenBatch([voter2.address, voter3.address])
        ).to.be.reverted;
    });

    it("빈 배열로 일괄 발급 시 오류 없이 처리된다", async function () {
        await expect(
            token.connect(electionAdmin).issueTokenBatch([])
        ).to.not.be.reverted;
    });

    // 신규: burnToken — 다이어그램에는 있지만 기존 테스트 없음
    it("VotingSystem 이 아닌 주소에서 burnToken 호출 시 revert", async function () {
        await token.connect(electionAdmin).issueToken(voter1.address);
        await expect(
            token.connect(electionAdmin).burnToken(voter1.address)
        ).to.be.reverted;
    });
});

module.exports = { deployVotingTokenViaFactory };
