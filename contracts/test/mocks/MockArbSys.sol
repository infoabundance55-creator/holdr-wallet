// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

/// @dev Stand-in for the Arbitrum ArbSys precompile at address(100). Tests etch its code there.
///      Like the real one, block hashes are only available for the last 256 blocks.
contract MockArbSys {
    function arbBlockNumber() external view returns (uint256) {
        return block.number;
    }

    function arbBlockHash(uint256 n) external view returns (bytes32) {
        require(n < block.number && n + 256 >= block.number, "arbBlockHash out of range");
        return keccak256(abi.encode("arb-block", n));
    }
}
