// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {HoldrToken} from "../../src/launchpad/HoldrToken.sol";
import {CurvePool} from "../../src/launchpad/CurvePool.sol";
import {HoldrTestnetRouter} from "../../script/testnet/HoldrTestnetRouter.sol";
import {GraduationBase} from "./Graduation.t.sol";

abstract contract RouterBase is GraduationBase {
    using PoolIdLibrary for PoolKey;

    HoldrTestnetRouter router;
    HoldrToken token;
    PoolKey key;

    function _setUpRouter() internal {
        router = new HoldrTestnetRouter(pm);
        (token,) = _graduated();
        key = locker.poolKeyFor(address(token));
    }

    function _zeroForOne(address tokenIn) internal view returns (bool) {
        return Currency.unwrap(key.currency0) == tokenIn;
    }

    function test_router_buyAndSellMatchQuotes() public {
        _setUpRouter();
        bool buyDir = _zeroForOne(address(usdg));

        (uint256 quoted, uint160 sqrtAfter) = router.quoteExactIn(key, buyDir, 100 * USD);
        assertGt(quoted, 0);
        assertGt(sqrtAfter, 0);

        uint256 tokBefore = token.balanceOf(alice);
        vm.startPrank(alice);
        usdg.approve(address(router), 100 * USD);
        vm.expectEmit(true, true, false, true, address(router));
        emit HoldrTestnetRouter.Swapped(alice, key.toId(), buyDir, 100 * USD, quoted);
        uint256 got = router.swapExactIn(key, buyDir, 100 * USD, quoted, block.timestamp);
        vm.stopPrank();
        assertEq(got, quoted, "quote is exact");
        assertEq(token.balanceOf(alice) - tokBefore, got);
        assertEq(usdg.balanceOf(address(router)), 0);
        assertEq(token.balanceOf(address(router)), 0);

        // sell it back
        (uint256 q2,) = router.quoteExactIn(key, !buyDir, got);
        uint256 usdgBefore = usdg.balanceOf(alice);
        vm.startPrank(alice);
        token.approve(address(router), got);
        uint256 back = router.swapExactIn(key, !buyDir, got, q2, block.timestamp);
        vm.stopPrank();
        assertEq(back, q2);
        assertEq(usdg.balanceOf(alice) - usdgBefore, back);
        assertLt(back, 100 * USD, "round trip pays the 1% fee twice");
        assertGt(back, 97 * USD);
    }

    function test_router_guards() public {
        _setUpRouter();
        bool buyDir = _zeroForOne(address(usdg));
        (uint256 quoted,) = router.quoteExactIn(key, buyDir, 50 * USD);

        vm.startPrank(alice);
        usdg.approve(address(router), type(uint256).max);
        vm.expectRevert(HoldrTestnetRouter.Expired.selector);
        router.swapExactIn(key, buyDir, 50 * USD, 0, block.timestamp - 1);
        vm.expectRevert(HoldrTestnetRouter.ZeroAmount.selector);
        router.swapExactIn(key, buyDir, 0, 0, block.timestamp);
        vm.expectRevert(abi.encodeWithSelector(HoldrTestnetRouter.TooLittleReceived.selector, quoted));
        router.swapExactIn(key, buyDir, 50 * USD, quoted + 1, block.timestamp);
        vm.stopPrank();

        vm.expectRevert(HoldrTestnetRouter.OnlyPoolManager.selector);
        router.unlockCallback("");
    }

    function test_router_cannotSpendSomeoneElsesApproval() public {
        _setUpRouter();
        bool buyDir = _zeroForOne(address(usdg));
        vm.prank(alice);
        usdg.approve(address(router), type(uint256).max);
        // bob has no approval: his swap pulls from bob, never from alice
        vm.prank(bob);
        vm.expectRevert();
        router.swapExactIn(key, buyDir, 10 * USD, 0, block.timestamp);
        assertEq(IERC20(address(usdg)).balanceOf(alice), 1_000_000 * USD - 3_000 * USD);
    }
}

contract RouterUsdgFirstTest is RouterBase {
    function _usdgAddress() internal pure override returns (address) {
        return address(0x0000000000000000000000000000000000010000);
    }
}

contract RouterTokenFirstTest is RouterBase {
    function _usdgAddress() internal pure override returns (address) {
        return address(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF);
    }
}
