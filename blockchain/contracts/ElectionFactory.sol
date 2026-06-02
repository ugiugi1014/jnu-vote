// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./VotingSystem.sol";
import "./VotingToken.sol";

contract ElectionFactory is Ownable {

    address public immutable votingSystemImpl;
    address public immutable votingTokenImpl;
    address public immutable voteVerifier;

    struct DeployedElection {
        address votingSystem;
        address votingToken;
    }

    mapping(uint256 => DeployedElection) public elections;

    event ElectionCreated(
        uint256 indexed electionId,
        address votingSystem,
        address votingToken
    );

    constructor(
        address _votingSystemImpl,
        address _votingTokenImpl,
        address _voteVerifier
    ) Ownable(msg.sender) {
        require(_votingSystemImpl != address(0), unicode"유효하지 않은 VotingSystem impl");
        require(_votingTokenImpl != address(0), unicode"유효하지 않은 VotingToken impl");
        require(_voteVerifier != address(0), unicode"유효하지 않은 verifier 주소");
        votingSystemImpl = _votingSystemImpl;
        votingTokenImpl = _votingTokenImpl;
        voteVerifier = _voteVerifier;
    }

    function createElection(
        uint256 electionId,
        address electionAdmin
    ) external onlyOwner returns (address votingSystem, address votingToken) {
        require(electionAdmin != address(0), unicode"유효하지 않은 관리자 주소");
        require(
            elections[electionId].votingSystem == address(0),
            unicode"이미 배포된 선거입니다."
        );

        // 1. clone 생성
        votingToken = Clones.clone(votingTokenImpl);
        votingSystem = Clones.clone(votingSystemImpl);

        // 2. initialize
        VotingToken(votingToken).initialize(address(this));
        VotingSystem(votingSystem).initialize(votingToken, electionAdmin, address(this), voteVerifier);

        // 3. VotingToken에 VotingSystem 소각 권한 부여
        VotingToken(votingToken).setVotingSystem(votingSystem);

        // 4. owner를 electionAdmin으로 이전
        VotingToken(votingToken).transferOwnership(electionAdmin);
        VotingSystem(votingSystem).transferOwnership(electionAdmin);

        // 5. 매핑 기록
        elections[electionId] = DeployedElection(votingSystem, votingToken);

        emit ElectionCreated(electionId, votingSystem, votingToken);
    }
}