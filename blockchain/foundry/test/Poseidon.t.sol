// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Test.sol";
import "jnu/PoseidonHasher.sol";

contract PoseidonTest is Test {
    function test_matchesCircomlib() public {
        PoseidonHasher h = new PoseidonHasher();
        uint g = gasleft();
        uint r = h.poseidon([uint(5), uint(9)]);
        emit log_named_uint("poseidon gas", g - gasleft());
        assertEq(r, 2046061026757605145648934375530781408765546393983200800628234446163090055163);
        // 빈 트리 zeros(1) = Poseidon(0,0)
        assertEq(h.poseidon([uint(0), uint(0)]), 14744269619966411208579211824598458697587494354926760081771325075741142829156);
    }
}
