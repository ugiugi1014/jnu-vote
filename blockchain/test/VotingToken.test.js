// 테스트 결과 비교 도구 (예: expect(A).to.equal(B) → "A가 B와 같아야 한다")
const { expect } = require("chai");
// Hardhat 환경 불러오기 (컨트랙트 배포, 지갑 생성 등에 사용)
const hre = require("hardhat");

// "VotingToken" 이라는 이름으로 테스트 묶음 시작
describe("VotingToken", function () {
        // 테스트 전체에서 공유할 변수 선언
    let token;          // 배포된 VotingToken 컨트랙트
    let owner;          // 학교 (컨트랙트 배포자, Super Admin)
    let electionAdmin;  // 선거 관리자 (학교가 권한 부여)
    let voter1;         // 테스트용 유권자 1
    let voter2;         // 테스트용 유권자 2

    // 각 테스트(it)가 실행되기 전마다 자동으로 실행되는 준비 코드
    beforeEach(async function (){
        // Hardhat이 자동으로 만들어주는 가상 지갑 4개를 순서대로 가져옴
        [owner, electionAdmin, voter1, voter2] = await hre.ethers.getSigners();

        // 컨트랙트 배포 준비 (컨트랙트 이름은 .sol 파일의 contract 이름과 동일해야 함)
        const VotingToken = await hre.ethers.getContractFactory("VotingToken");

        // 실제로 로컬 블록체인에 배포 (배포자는 자동으로 owner가 됨)
        token = await VotingToken.deploy();
    });

    // 테스트 1: 학교가 선거 관리자 지정 후 토큰 발급 확인
    it("선거 관리자가 토큰을 발급하면 잔액이 1이어야 한다.", async function () {
        // 학교(owner)가 electionAdmin에게 선거 관리자 권한 부여
        await token.addElectionAdmin(electionAdmin.address);
        // 선거 관리자가 voter1에게 토큰 발급
        await token.connect(electionAdmin).issueToken(voter1.address);
        // voter1의 잔액이 1인지 확인
        expect(await token.balanceOf(voter1.address)).to.equal(1);
    });

    // 테스트 2: 토큰 보유 시 isTokenValid가 true인지 확인
    it("토큰이 있으면 isTokenValid = true", async function () {
        // 학교가 권한 부여 후 토큰 발급
        await token.addElectionAdmin(electionAdmin.address);
        await token.connect(electionAdmin).issueToken(voter1.address);
        // isTokenValid가 true를 반환하는지 확인
        expect(await token.isTokenValid(voter1.address)).to.equal(true);
    });

    // 테스트 3: 토큰 미보유 시 isTokenValid가 false인지 확인
    it("토큰이 없으면 isTokenValid = false", async function () {
        // voter2는 토큰을 받은 적 없으므로 false여야 함
        expect(await token.isTokenValid(voter2.address)).to.equal(false);
    });

    // 테스트 4: 권한 없는 사람이 토큰 발급 시도 → 실패해야 함
    it("선거 관리자가 아니면 토큰 발급 불가", async function () {
        // voter1은 선거 관리자가 아니므로 발급 시도 시 revert되어야 함
        await expect(
            token.connect(voter1).issueToken(voter2.address)
        ).to.be.reverted;
    });

    // 테스트 5: 학교(owner)가 선거 관리자 권한 해제
    it("학교가 선거 관리자 권한을 해제할 수 있다", async function () {
        // 권한 부여 후 해제
        await token.addElectionAdmin(electionAdmin.address);
        await token.removeElectionAdmin(electionAdmin.address);
        // 권한 해제된 electionAdmin이 토큰 발급 시도 → 실패해야 함
        await expect(
            token.connect(electionAdmin).issueToken(voter1.address)
        ).to.be.reverted;
    });

    // 테스트 6: 이중 발급 방지 확인
    it("같은 유권자에게 토큰을 두 번 발급할 수 없다", async function () {
        await token.addElectionAdmin(electionAdmin.address);
        // 첫 번째 발급 → 성공
        await token.connect(electionAdmin).issueToken(voter1.address);
        // 두 번째 발급 시도 → 실패해야 함
        await expect(
            token.connect(electionAdmin).issueToken(voter1.address)
        ).to.be.reverted;
    });

    // 테스트 7: 토큰 전송 불가 확인
    it("투표 토큰은 다른 사람에게 전송할 수 없다", async function () {
        await token.addElectionAdmin(electionAdmin.address);
        await token.connect(electionAdmin).issueToken(voter1.address);
        // voter1이 voter2에게 토큰 전송 시도 → 실패해야 함
        await expect(
            token.connect(voter1).transfer(voter2.address, 1)
        ).to.be.reverted;
    });

    // 테스트 8: decimals가 0인지 확인
    it("투표 토큰의 decimals는 0이어야 한다", async function () {
        expect(await token.decimals()).to.equal(0);
    });

    // 테스트 9: approve() 차단 확인
    it("투표 토큰은 위임(approve)할 수 없다", async function () {
        await token.addElectionAdmin(electionAdmin.address);
        await token.connect(electionAdmin).issueToken(voter1.address);
        // voter1이 voter2에게 전송 권한 위임 시도 → 실패해야 함
        await expect(
            token.connect(voter1).approve(voter2.address, 1)
        ).to.be.reverted;
    });

    // 테스트 10: zero address로 선거 관리자 지정 시도 → 실패해야 함
    it("zero address를 선거 관리자로 지정할 수 없다", async function () {
        await expect(
            token.addElectionAdmin(ethers.ZeroAddress)
        ).to.be.reverted;
    });

    // 테스트 11: 이미 관리자인 주소를 다시 추가 시도 → 실패해야 함
    it("이미 선거 관리자인 주소를 중복 추가할 수 없다", async function () {
        await token.addElectionAdmin(electionAdmin.address);
        await expect(
            token.addElectionAdmin(electionAdmin.address)
        ).to.be.reverted;
    });

    // 테스트 12: 관리자가 아닌 주소를 해제 시도 → 실패해야 함
    it("선거 관리자가 아닌 주소를 해제할 수 없다", async function () {
        await expect(
            token.removeElectionAdmin(voter1.address)
        ).to.be.reverted;
    });

    // 테스트 13: 일괄 토큰 발급 확인
    it("issueTokenBatch로 여러 유권자에게 한번에 토큰 발급 가능", async function () {
        await token.addElectionAdmin(electionAdmin.address);
        await token.connect(electionAdmin).issueTokenBatch([voter1.address, voter2.address]);
        expect(await token.balanceOf(voter1.address)).to.equal(1);
        expect(await token.balanceOf(voter2.address)).to.equal(1);
    });

    // 테스트 14: 일괄 발급 시 이미 토큰 있는 주소는 건너뜀 (revert 없이)
    it("issueTokenBatch는 이미 토큰 있는 주소를 건너뜀", async function () {
        await token.addElectionAdmin(electionAdmin.address);
        await token.connect(electionAdmin).issueToken(voter1.address);
        // voter1은 이미 토큰 있음 → 건너뛰고 voter2만 발급
        await token.connect(electionAdmin).issueTokenBatch([voter1.address, voter2.address]);
        expect(await token.balanceOf(voter1.address)).to.equal(1);
        expect(await token.balanceOf(voter2.address)).to.equal(1);
    });

    // 테스트 15: 선거 관리자가 아니면 일괄 발급 불가
    it("선거 관리자가 아니면 issueTokenBatch 불가", async function () {
        await expect(
            token.connect(voter1).issueTokenBatch([voter2.address])
        ).to.be.reverted;
    });
});