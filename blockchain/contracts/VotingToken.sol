// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract VotingToken is Initializable, ERC20Upgradeable, OwnableUpgradeable {

    address public votingSystem;

    event TokenIssued(address indexed to);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _owner) external initializer {
        __ERC20_init("VotingToken", "VOTE");
        __Ownable_init(_owner);
    }

    function decimals() public pure override returns (uint8) {
        return 0;
    }

    function setVotingSystem(address _votingSystem) external onlyOwner {
        require(_votingSystem != address(0), unicode"유효하지 않은 주소입니다.");
        votingSystem = _votingSystem;
    }

    function issueToken(address to) public onlyOwner {
        require(balanceOf(to) == 0, unicode"이미 토큰이 발급된 유권자입니다.");
        _mint(to, 1);
        emit TokenIssued(to);
    }

    function issueTokenBatch(address[] calldata recipients) public onlyOwner {
        for (uint256 i = 0; i < recipients.length; i++) {
            if (balanceOf(recipients[i]) == 0) {
                _mint(recipients[i], 1);
                emit TokenIssued(recipients[i]);
            }
        }
    }

    function isTokenValid(address holder) public view returns (bool) {
        return balanceOf(holder) >= 1;
    }

    function burnToken(address voter) external {
        require(msg.sender == votingSystem, unicode"VotingSystem만 소각할 수 있습니다.");
        require(balanceOf(voter) >= 1, unicode"소각할 토큰이 없습니다.");
        _burn(voter, 1);
    }

    function transfer(address, uint256) public pure override returns (bool) {
        revert(unicode"투표 토큰은 전송할 수 없습니다.");
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert(unicode"투표 토큰은 전송할 수 없습니다.");
    }

    function approve(address, uint256) public pure override returns (bool) {
        revert(unicode"투표 토큰은 위임할 수 없습니다.");
    }
}