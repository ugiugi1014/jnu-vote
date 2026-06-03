// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// 단위 테스트용 mock — pubSignals[23] 시그니처 일치
contract MockTallyVerifier {
    bool public shouldVerify = true;

    function setShouldVerify(bool v) external {
        shouldVerify = v;
    }

    function verifyProof(
        uint[2] calldata,
        uint[2][2] calldata,
        uint[2] calldata,
        uint[23] calldata
    ) external view returns (bool) {
        return shouldVerify;
    }
}
