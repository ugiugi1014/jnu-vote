// 테스트 결과 비교 도구 (예: expect(A).to.equal(B) → "A가 B와 같아야 한다")
const { expect } = require("chai");
// Hardhat 환경 불러오기 (컨트랙트 배포, 지갑 생성 등에 사용)
const hre = require("hardhat");

// "VotingToken" 이라는 이름으로 테스트 묶음 시작
describe("VotingToken", function () {
    // 테스트 전체에서 공유할 변수 선언
    let token;    // 배포된 VotingToken 컨트랙트
    let voter1;   // 테스트용 유권자 1
    let voter2;   // 테스트용 유권자 2
    let voter3;   // 테스트용 유권자 3 (배치 테스트용)

    // 각 테스트(it)가 실행되기 전마다 자동으로 실행되는 준비 코드
    beforeEach(async function () {
        // Hardhat이 자동으로 만들어주는 가상 지갑을 순서대로 가져옴
        // 첫 번째(owner)는 기본 서명자로 자동 사용되므로 변수 생략
        [, voter1, voter2, voter3] = await hre.ethers.getSigners();

        // 컨트랙트 배포 준비 (컨트랙트 이름은 .sol 파일의 contract 이름과 동일해야 함)
        const VotingToken = await hre.ethers.getContractFactory("VotingToken");

        // 실제로 로컬 블록체인에 배포 (배포자는 자동으로 owner가 됨)
        token = await VotingToken.deploy();
    });

    // 테스트 1: 관리자가 토큰 발급 후 잔액 확인
    it("관리자가 토큰을 발급하면 잔액이 1이어야 한다.", async function () {
        await token.issueToken(voter1.address);
        expect(await token.balanceOf(voter1.address)).to.equal(1);
    });

    // 테스트 2: 토큰 보유 시 isTokenValid가 true인지 확인
    it("토큰이 있으면 isTokenValid = true", async function () {
        await token.issueToken(voter1.address);
        expect(await token.isTokenValid(voter1.address)).to.equal(true);
    });

    // 테스트 3: 토큰 미보유 시 isTokenValid가 false인지 확인
    it("토큰이 없으면 isTokenValid = false", async function () {
        expect(await token.isTokenValid(voter2.address)).to.equal(false);
    });

    // 테스트 4: 관리자가 아니면 토큰 발급 불가
    it("관리자가 아니면 토큰 발급 불가", async function () {
        await expect(
            token.connect(voter1).issueToken(voter2.address)
        ).to.be.reverted;
    });

    // 테스트 5: 이중 발급 방지 확인
    it("같은 유권자에게 토큰을 두 번 발급할 수 없다", async function () {
        await token.issueToken(voter1.address);
        await expect(
            token.issueToken(voter1.address)
        ).to.be.reverted;
    });

    // 테스트 6: 토큰 전송 불가 확인
    it("투표 토큰은 다른 사람에게 전송할 수 없다", async function () {
        await token.issueToken(voter1.address);
        await expect(
            token.connect(voter1).transfer(voter2.address, 1)
        ).to.be.reverted;
    });

    // 테스트 7: decimals가 0인지 확인
    it("투표 토큰의 decimals는 0이어야 한다", async function () {
        expect(await token.decimals()).to.equal(0);
    });

    // 테스트 8: approve() 차단 확인
    it("투표 토큰은 위임(approve)할 수 없다", async function () {
        await token.issueToken(voter1.address);
        await expect(
            token.connect(voter1).approve(voter2.address, 1)
        ).to.be.reverted;
    });

    // 테스트 9: issueTokenBatch - 여러 유권자에게 일괄 발급
    it("일괄 발급 시 모든 유권자의 잔액이 1이어야 한다", async function () {
        await token.issueTokenBatch([voter1.address, voter2.address, voter3.address]);
        expect(await token.balanceOf(voter1.address)).to.equal(1);
        expect(await token.balanceOf(voter2.address)).to.equal(1);
        expect(await token.balanceOf(voter3.address)).to.equal(1);
    });

    // 테스트 10: issueTokenBatch - 이미 토큰이 있는 주소는 건너뜀
    it("일괄 발급 시 이미 토큰이 있는 유권자는 건너뛴다", async function () {
        await token.issueToken(voter1.address);
        // voter1은 이미 토큰 보유 → 건너뛰고 voter2만 발급
        await token.issueTokenBatch([voter1.address, voter2.address]);
        expect(await token.balanceOf(voter1.address)).to.equal(1);
        expect(await token.balanceOf(voter2.address)).to.equal(1);
    });

    // 테스트 11: issueTokenBatch - 관리자가 아니면 일괄 발급 불가
    it("관리자가 아니면 일괄 발급 불가", async function () {
        await expect(
            token.connect(voter1).issueTokenBatch([voter2.address, voter3.address])
        ).to.be.reverted;
    });

    // 테스트 12: issueTokenBatch - 빈 배열 입력 시 정상 처리
    it("빈 배열로 일괄 발급 시 오류 없이 처리된다", async function () {
        await expect(token.issueTokenBatch([])).to.not.be.reverted;
    });
});

