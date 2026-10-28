// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IHoldrMigrator} from "../../src/launchpad/interfaces/ILaunchpad.sol";

/// @dev 6-decimal stand-in for USDG. `skim` turns on a 1-unit transfer loss to test balance checks.
contract MockUSDG is ERC20 {
    bool public skim;

    constructor() ERC20("Global Dollar", "USDG") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setSkim(bool on) external {
        skim = on;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (skim && from != address(0) && to != address(0) && value > 0) {
            super._update(from, address(0xdead), 1);
            value -= 1;
        }
        super._update(from, to, value);
    }
}

/// @dev Records what a graduation hands over. Step 2 replaces it with the Uniswap v4 migrator.
contract MockMigrator is IHoldrMigrator {
    address public lastToken;
    uint256 public lastUsdg;
    uint256 public lastTokens;
    uint256 public calls;
    IERC20 public immutable usdg;

    constructor(IERC20 usdg_) {
        usdg = usdg_;
    }

    bool public unlinked;
    uint256 public collects;

    function setUnlinked(bool on) external {
        unlinked = on;
    }

    /// @dev Linked to whichever factory asks (so one mock serves every test factory), unless unlinked.
    function factory() external view returns (address) {
        return unlinked ? address(0xdead) : msg.sender;
    }

    function collectFees(address) external returns (uint256, uint256) {
        ++collects;
        return (0, 0);
    }

    function migrate(address token, uint256 usdgAmount, uint256 tokenAmount) external {
        require(IERC20(token).balanceOf(address(this)) >= tokenAmount, "tokens not received");
        require(usdg.balanceOf(address(this)) >= usdgAmount, "usdg not received");
        lastToken = token;
        lastUsdg = usdgAmount;
        lastTokens = tokenAmount;
        ++calls;
    }
}

/// @dev A treasury that refuses ETH.
contract RejectEth {
    receive() external payable {
        revert("no");
    }
}
