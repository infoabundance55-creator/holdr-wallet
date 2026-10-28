// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice TESTNET ONLY. A 6-decimal stand-in for USDG that anyone can mint for free, so testers
///         can try the launchpad without a stablecoin faucet. Worthless; never deploy on mainnet.
contract TestUSDG is ERC20 {
    uint256 public constant MAX_MINT = 100_000e6;

    error TooMuch();

    constructor() ERC20("Holdr Test USDG", "tUSDG") {
        require(block.chainid != 4663, "testnet only");
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mints up to 100,000 tUSDG to the caller.
    function faucet(uint256 amount) external {
        if (amount > MAX_MINT) revert TooMuch();
        _mint(msg.sender, amount);
    }
}
