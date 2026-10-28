// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

/// @notice TESTNET ONLY. Minimal exact-input swaps on a v4 pool (there is no Universal Router on
///         the testnet copy of the PoolManager). The caller pays and receives.
contract TestnetSwapper is IUnlockCallback {
    IPoolManager public immutable pm;

    constructor(IPoolManager pm_) {
        pm = pm_;
    }

    function swap(PoolKey memory key, bool zeroForOne, uint256 amountIn) external returns (uint256) {
        return abi.decode(pm.unlock(abi.encode(msg.sender, key, zeroForOne, amountIn)), (uint256));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(pm), "only pm");
        (address payer, PoolKey memory key, bool z, uint256 amountIn) = abi.decode(data, (address, PoolKey, bool, uint256));
        BalanceDelta d = pm.swap(
            key,
            IPoolManager.SwapParams({
                zeroForOne: z,
                amountSpecified: -int256(amountIn),
                sqrtPriceLimitX96: z ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );
        (Currency inC, Currency outC) = z ? (key.currency0, key.currency1) : (key.currency1, key.currency0);
        uint256 paid = uint256(uint128(-(z ? d.amount0() : d.amount1())));
        uint256 got = uint256(uint128(z ? d.amount1() : d.amount0()));
        pm.sync(inC);
        require(IERC20(Currency.unwrap(inC)).transferFrom(payer, address(pm), paid), "pay failed");
        pm.settle();
        pm.take(outC, payer, got);
        return abi.encode(got);
    }
}
