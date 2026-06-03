// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// 단위 테스트용 mock — 실제 ZKP 검증 없이 setShouldVerify(false) 로 분기 테스트 가능
contract MockVoteVerifier {
    bool public shouldVerify = true;

    function setShouldVerify(bool v) external {
        shouldVerify = v;
    }

    function verifyProof(
        uint[2] calldata,
        uint[2][2] calldata,
        uint[2] calldata,
        uint[1] calldata
    ) external view returns (bool) {
        return shouldVerify;
    }
}
