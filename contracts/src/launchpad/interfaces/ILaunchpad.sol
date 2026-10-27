// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

/// @notice Rules copied into every new curve pool at launch. A launched token never sees later changes.
struct LaunchParams {
    uint256 gradThreshold; // USDG (6 decimals) the curve must raise to graduate
    uint256 firstBuyMaxTokens; // most tokens the creator may buy in the launch transaction
    address migrator; // receives the liquidity at graduation
    uint16 feeBps; // trading fee on the curve
    uint16 creatorShareBps; // creator's share of the fee
    uint16[5] surchargeBps; // anti-snipe surcharge on buys in seconds 0..4 after launch
}

/// @notice What a curve pool reads from its factory at trade time.
interface ILaunchpadFactory {
    function paused() external view returns (bool);
    function maxBuyUsdg() external view returns (uint256);
    function treasury() external view returns (address);
}

/// @notice Moves a graduated token's liquidity into Uniswap v4 (written in step 2).
/// @dev The pool transfers `usdgAmount` USDG and `tokenAmount` tokens to the migrator before calling.
interface IHoldrMigrator {
    function migrate(address token, uint256 usdgAmount, uint256 tokenAmount) external;
}
