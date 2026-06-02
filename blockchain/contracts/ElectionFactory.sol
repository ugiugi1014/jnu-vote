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
    address public immutable tallyVerifier;

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
        address _voteVerifier,
        address _tallyVerifier
    ) Ownable(msg.sender) {
        require(_votingSystemImpl != address(0), "invalid VotingSystem implementation");
        require(_votingTokenImpl != address(0), "invalid VotingToken implementation");
        require(_voteVerifier != address(0), "invalid vote verifier");
        require(_tallyVerifier != address(0), "invalid tally verifier");

        votingSystemImpl = _votingSystemImpl;
        votingTokenImpl = _votingTokenImpl;
        voteVerifier = _voteVerifier;
        tallyVerifier = _tallyVerifier;
    }

    function createElection(
        uint256 electionId,
        address electionAdmin
    ) external onlyOwner returns (address votingSystem, address votingToken) {
        require(electionAdmin != address(0), "invalid election admin");
        require(elections[electionId].votingSystem == address(0), "election already deployed");

        votingToken = Clones.clone(votingTokenImpl);
        votingSystem = Clones.clone(votingSystemImpl);

        VotingToken(votingToken).initialize(address(this));
        VotingSystem(votingSystem).initialize(
            votingToken,
            electionAdmin,
            address(this),
            voteVerifier,
            tallyVerifier
        );

        VotingToken(votingToken).setVotingSystem(votingSystem);

        VotingToken(votingToken).transferOwnership(electionAdmin);
        VotingSystem(votingSystem).transferOwnership(electionAdmin);

        elections[electionId] = DeployedElection(votingSystem, votingToken);

        emit ElectionCreated(electionId, votingSystem, votingToken);
    }
}
