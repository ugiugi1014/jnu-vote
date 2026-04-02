// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract VotingToken is ERC20, Ownable {

    // 선거 관리자 목록 (주소 → 권한 여부)
    mapping(address => bool) public electionAdmins;

    // 선거 관리자가 추가/제거될 때 기록
    event ElectionAdminAdded(address indexed admin);
    event ElectionAdminRemoved(address indexed admin);

    // 유권자에게 토큰이 발급될 때 기록
    event TokenIssued(address indexed to);

    constructor() ERC20("VotingToken", "VOTE") Ownable(msg.sender) {}

    // 투표 토큰은 소수점이 필요 없으므로 decimals를 0으로 설정
    // 기본값은 18이라 _mint(to, 1)이 0.000...001개가 되는 문제를 방지
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    // 학교(owner)만 선거 관리자 지정 가능
    function addElectionAdmin(address admin) public onlyOwner {
        require(admin != address(0), unicode"유효하지 않은 주소입니다.");
        require(!electionAdmins[admin], unicode"이미 선거 관리자입니다.");
        electionAdmins[admin] = true;
        emit ElectionAdminAdded(admin);
    }

    // 학교(owner)만 선거 관리자 해제 가능
    function removeElectionAdmin(address admin) public onlyOwner {
        require(electionAdmins[admin], unicode"선거 관리자가 아닙니다.");
        electionAdmins[admin] = false;
        emit ElectionAdminRemoved(admin);
    }

    // 선거 관리자만 유권자에게 토큰 발급 가능
    function issueToken(address to) public {
        require(electionAdmins[msg.sender], unicode"선거 관리자만 토큰을 발급할 수 있습니다.");
        // 이중 발급 방지: 이미 토큰이 있는 유권자에게는 재발급 불가
        // (Nullifier와 다른 개념 - 이건 발급 단계, Nullifier는 투표 단계에서 이중 투표 방지)
        require(balanceOf(to) == 0, unicode"이미 토큰이 발급된 유권자입니다.");
        _mint(to, 1);
        emit TokenIssued(to);
    }

    // 토큰 보유 여부 확인
    function isTokenValid(address holder) public view returns (bool) {
        return balanceOf(holder) >= 1;
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
