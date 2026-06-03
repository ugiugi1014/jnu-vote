const { expect } = require("chai");
const hre = require("hardhat");

async function deployFactory() {
    const [deployer, electionAdmin, other] = await hre.ethers.getSigners();

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

    return {
        deployer,
        electionAdmin,
        other,
        tokenImpl,
        systemImpl,
        voteVerifier,
        tallyVerifier,
        factory,
        VotingToken,
        VotingSystem,
    };
}

async function createElection(ctx, electionId = 1) {
    const tx = await ctx.factory
        .connect(ctx.deployer)
        .createElection(electionId, ctx.electionAdmin.address);
    const receipt = await tx.wait();
    const event = receipt.logs
        .map((log) => {
            try {
                return ctx.factory.interface.parseLog(log);
            } catch {
                return null;
            }
        })
        .find((parsed) => parsed && parsed.name === "ElectionCreated");

    const votingSystem = ctx.VotingSystem.attach(event.args.votingSystem);
    const votingToken = ctx.VotingToken.attach(event.args.votingToken);

    return { event, votingSystem, votingToken };
}

describe("ElectionFactory", function () {
    it("createElection은 owner만 호출할 수 있다", async function () {
        const ctx = await deployFactory();

        await expect(
            ctx.factory.connect(ctx.other).createElection(1, ctx.electionAdmin.address)
        ).to.be.reverted;
    });

    it("VotingSystem과 VotingToken clone을 생성하고 주소를 매핑한다", async function () {
        const ctx = await deployFactory();
        const { event } = await createElection(ctx, 1);

        expect(event.args.electionId).to.equal(1);
        expect(event.args.votingSystem).to.not.equal(await ctx.systemImpl.getAddress());
        expect(event.args.votingToken).to.not.equal(await ctx.tokenImpl.getAddress());

        const deployed = await ctx.factory.elections(1);
        expect(deployed.votingSystem).to.equal(event.args.votingSystem);
        expect(deployed.votingToken).to.equal(event.args.votingToken);
    });

    it("같은 electionId는 다시 배포할 수 없다", async function () {
        const ctx = await deployFactory();

        await createElection(ctx, 1);
        await expect(
            ctx.factory.connect(ctx.deployer).createElection(1, ctx.electionAdmin.address)
        ).to.be.revertedWith("election already deployed");
    });

    it("VotingSystem에 vote/tally verifier 주소를 정확히 주입한다", async function () {
        const ctx = await deployFactory();
        const { votingSystem } = await createElection(ctx, 1);

        expect(await votingSystem.voteVerifier()).to.equal(await ctx.voteVerifier.getAddress());
        expect(await votingSystem.tallyVerifier()).to.equal(await ctx.tallyVerifier.getAddress());
    });

    it("VotingToken에 VotingSystem 소각 권한을 연결한다", async function () {
        const ctx = await deployFactory();
        const { votingSystem, votingToken } = await createElection(ctx, 1);

        expect(await votingToken.votingSystem()).to.equal(await votingSystem.getAddress());
    });
});
