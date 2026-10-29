// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";

/// @title HoldrTestnetRouter
/// @notice TESTNET ONLY. The testnet copy of the Uniswap v4 PoolManager has no Universal Router or
///         Quoter, so the website trades graduated Holdr tokens through this contract.
///         Exact-input swaps with a minimum output and a deadline; the caller pays and receives.
///         On mainnet the site will use Uniswap's own router instead.
/// @dev Holds no funds and no state. Approve it for the input token, then call swapExactIn.
contract HoldrTestnetRouter is IUnlockCallback {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    IPoolManager public immutable poolManager;

    event Swapped(
        address indexed trader, PoolId indexed poolId, bool zeroForOne, uint256 amountIn, uint256 amountOut
    );

    error Expired();
    error ZeroAmount();
    error TooLittleReceived(uint256 amountOut);
    error OnlyPoolManager();
    /// @dev Carries a simulated result out of quoteExactIn.
    error QuoteResult(uint256 amountOut, uint160 sqrtPriceAfter);

    struct Call {
        bool quote;
        address payer;
        PoolKey key;
        bool zeroForOne;
        uint256 amountIn;
    }

    constructor(IPoolManager poolManager_) {
        poolManager = poolManager_;
    }

    /// @notice Swaps exactly `amountIn` of the input currency for at least `minOut` of the other one.
    function swapExactIn(PoolKey calldata key, bool zeroForOne, uint256 amountIn, uint256 minOut, uint256 deadline)
        external
        returns (uint256 amountOut)
    {
        if (block.timestamp > deadline) revert Expired();
        if (amountIn == 0) revert ZeroAmount();
        amountOut = abi.decode(
            poolManager.unlock(abi.encode(Call(false, msg.sender, key, zeroForOne, amountIn))), (uint256)
        );
        if (amountOut < minOut) revert TooLittleReceived(amountOut);
        emit Swapped(msg.sender, key.toId(), zeroForOne, amountIn, amountOut);
    }

    /// @notice What swapExactIn would return right now, and the pool price after it. Not a view
    ///         (it simulates the swap and reverts); call it with eth_call.
    function quoteExactIn(PoolKey calldata key, bool zeroForOne, uint256 amountIn)
        external
        returns (uint256 amountOut, uint160 sqrtPriceAfter)
    {
        if (amountIn == 0) revert ZeroAmount();
        try poolManager.unlock(abi.encode(Call(true, address(0), key, zeroForOne, amountIn))) {
            revert(); // unreachable: the quote path always reverts
        } catch (bytes memory r) {
            if (r.length == 68 && bytes4(r) == QuoteResult.selector) {
                assembly {
                    amountOut := mload(add(r, 36))
                    sqrtPriceAfter := mload(add(r, 68))
                }
                return (amountOut, sqrtPriceAfter);
            }
            assembly {
                revert(add(r, 32), mload(r))
            }
        }
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        Call memory c = abi.decode(data, (Call));
        BalanceDelta d = poolManager.swap(
            c.key,
            IPoolManager.SwapParams({
                zeroForOne: c.zeroForOne,
                amountSpecified: -int256(c.amountIn),
                sqrtPriceLimitX96: c.zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );
        (Currency inC, Currency outC) = c.zeroForOne ? (c.key.currency0, c.key.currency1) : (c.key.currency1, c.key.currency0);
        uint256 paid = uint256(uint128(-(c.zeroForOne ? d.amount0() : d.amount1())));
        uint256 got = uint256(uint128(c.zeroForOne ? d.amount1() : d.amount0()));

        if (c.quote) {
            (uint160 sqrtP,,,) = poolManager.getSlot0(c.key.toId());
            revert QuoteResult(got, sqrtP);
        }

        poolManager.sync(inC);
        IERC20(Currency.unwrap(inC)).safeTransferFrom(c.payer, address(poolManager), paid);
        poolManager.settle();
        poolManager.take(outC, c.payer, got);
        return abi.encode(got);
    }
}
