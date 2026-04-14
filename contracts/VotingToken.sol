// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract VotingToken is ERC20, Ownable {

    // 유권자에게 토큰이 발급될 때 기록
    event TokenIssued(address indexed to);

    constructor() ERC20("VotingToken", "VOTE") Ownable(msg.sender) {}

    // 투표 토큰은 소수점이 필요 없으므로 decimals를 0으로 설정
    // 기본값은 18이라 _mint(to, 1)이 0.000...001개가 되는 문제를 방지
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    // 관리자(owner)만 유권자에게 토큰 단건 발급 가능
    function issueToken(address to) public onlyOwner {
        // 이중 발급 방지: 이미 토큰이 있는 유권자에게는 재발급 불가
        // (Nullifier와 다른 개념 - 이건 발급 단계, Nullifier는 투표 단계에서 이중 투표 방지)
        require(balanceOf(to) == 0, unicode"이미 토큰이 발급된 유권자입니다.");
        _mint(to, 1);
        emit TokenIssued(to);
    }

    // 관리자(owner)만 유권자에게 토큰 일괄 발급 가능 (선거 시작 시 사용)
    function issueTokenBatch(address[] calldata recipients) public onlyOwner {
        for (uint256 i = 0; i < recipients.length; i++) {
            if (balanceOf(recipients[i]) == 0) {
                _mint(recipients[i], 1);
                emit TokenIssued(recipients[i]);
            }
        }
    }

    // 토큰 보유 여부 확인
    function isTokenValid(address holder) public view returns (bool) {
        return balanceOf(holder) >= 1;
    }

    // VotingSystem 컨트랙트 주소 (소각 권한 부여용)
    address public votingSystem;

    // 관리자(owner)가 VotingSystem 주소 등록
    function setVotingSystem(address _votingSystem) external onlyOwner {
        require(_votingSystem != address(0), unicode"유효하지 않은 주소입니다.");
        votingSystem = _votingSystem;
    }

    // 투표 완료 후 토큰 소각 (VotingSystem 컨트랙트만 호출 가능)
    // 소각 후 다음 선거에서 토큰을 새로 발급받을 수 있게 됨
    function burnToken(address voter) external {
        require(msg.sender == votingSystem, unicode"VotingSystem만 소각할 수 있습니다.");
        require(balanceOf(voter) >= 1, unicode"소각할 토큰이 없습니다.");
        _burn(voter, 1);
    }

    // 투표 토큰은 전송 불가 - 전송되면 투표 권한이 타인에게 넘어갈 수 있음
    function transfer(address, uint256) public pure override returns (bool) {
        revert(unicode"투표 토큰은 전송할 수 없습니다.");
    }

    // 위임을 통한 전송도 불가
    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert(unicode"투표 토큰은 전송할 수 없습니다.");
    }

    // 전송 권한 위임 자체도 불가 - approve 후 transferFrom으로 우회하는 것 방지
    function approve(address, uint256) public pure override returns (bool) {
        revert(unicode"투표 토큰은 위임할 수 없습니다.");
    }
}
