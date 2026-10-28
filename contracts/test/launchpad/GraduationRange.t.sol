// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {LaunchpadFactory} from "../../src/launchpad/LaunchpadFactory.sol";
import {CurvePool} from "../../src/launchpad/CurvePool.sol";
import {HoldrToken} from "../../src/launchpad/HoldrToken.sol";
import {HoldrLiquidityLocker} from "../../src/launchpad/HoldrLiquidityLocker.sol";
import {LaunchParams} from "../../src/launchpad/interfaces/ILaunchpad.sol";
import {HookMiner} from "../../script/HookMiner.sol";
import {MockUSDG} from "../mocks/MockUSDG.sol";

/// Graduation must succeed for every allowed G / fee and both currency orders, and the
/// locker must never pay the PoolManager with USDG it holds for other people.
abstract contract GraduationRangeBase is Test {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    IPoolManager pm;
    MockUSDG usdg;
    HoldrLiquidityLocker locker;
    LaunchpadFactory factory;
    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");
    address creator = makeAddr("creator");
    address alice = makeAddr("alice");

    function _usdgAddress() internal pure virtual returns (address);

    function setUp() public {
        vm.warp(1_800_000_000);
        pm = IPoolManager(deployCode("out/PoolManager.sol/PoolManager.json", abi.encode(address(this))));
        deployCodeTo("out/MockUSDG.sol/MockUSDG.json", _usdgAddress());
        usdg = MockUSDG(_usdgAddress());
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        (bytes32 salt,) = HookMiner.find(predicted, pm);
        locker = new HoldrLiquidityLocker(pm, address(usdg), salt);
        factory = new LaunchpadFactory(owner, usdg, _cfg(10_000e6, 100), 0);
        locker.setFactory(address(factory));
        usdg.mint(alice, 10_000_000e6);
        usdg.mint(creator, 10_000_000e6);
        vm.deal(creator, 10 ether);
    }

    function _cfg(uint256 g, uint16 fee) internal view returns (LaunchpadFactory.Config memory c) {
        c.params = LaunchParams({
            gradThreshold: g,
            firstBuyMaxTokens: 50_000_000 ether,
            migrator: address(locker),
            feeBps: fee,
            creatorShareBps: 7_000,
            surchargeBps: [uint16(9_900 - fee), 2_475, 619, 155, 39]
        });
        c.launchFee = 0;
        c.treasury = treasury;
    }

    function testFuzz_graduationAnyGAnyFee(uint256 g, uint16 fee, uint256 otherUsdg) public {
        g = bound(g, 1_000e6, 1_000_000e6);
        fee = uint16(bound(fee, 0, 500));
        otherUsdg = bound(otherUsdg, 0, 1_000_000e6);
        vm.prank(owner);
        factory.proposeConfig(_cfg(g, fee));
        vm.warp(block.timestamp + 48 hours);
        vm.prank(owner);
        factory.executeConfig();

        // USDG the locker already holds for other people (fees owed from earlier tokens)
        usdg.mint(address(locker), otherUsdg);

        vm.prank(creator);
        (address t, address p) = factory.createToken("T", "T", "", 0, 0);
        vm.warp(block.timestamp + 5);
        uint256 lockerBefore = usdg.balanceOf(address(locker));
        vm.startPrank(alice);
        usdg.approve(p, type(uint256).max);
        CurvePool(p).buy(g * 2, 0, block.timestamp);
        vm.stopPrank();
        assertTrue(CurvePool(p).graduated(), "graduated");

        HoldrLiquidityLocker.Position memory pos = locker.positionOf(t);
        assertGt(pos.liquidity, 0);
        assertEq(HoldrToken(t).balanceOf(address(locker)), 0, "token dust burned");
        // locker's USDG only grew by the dust it books for the platform
        assertEq(usdg.balanceOf(address(locker)) - lockerBefore, locker.protocolOwed(address(usdg)), "dust == owed");
        assertLe(usdg.balanceOf(address(pm)), g, "PM received <= G");
        assertGe(usdg.balanceOf(address(pm)) + 10, g, "PM received ~G");

        // the last curve price is never above the pool's actual opening price
        (uint256 x, uint256 y) = CurvePool(p).reserves();
        PoolKey memory key = locker.poolKeyFor(t);
        (uint160 sqrtP,,,) = pm.getSlot0(key.toId());
        uint256 s2 = uint256(sqrtP) * uint256(sqrtP);
        if (Currency.unwrap(key.currency0) == t) {
            assertLe(FullMath.mulDivRoundingUp(x, 1 << 192, y), s2, "curve end above pool open");
        } else {
            assertLe(FullMath.mulDivRoundingUp(x, s2, 1 << 192), y, "curve end above pool open");
        }
    }
}

contract GraduationRangeUsdgFirstTest is GraduationRangeBase {
    function _usdgAddress() internal pure override returns (address) {
        return address(0x0000000000000000000000000000000000010000);
    }
}

contract GraduationRangeTokenFirstTest is GraduationRangeBase {
    function _usdgAddress() internal pure override returns (address) {
        return address(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF);
    }
}
