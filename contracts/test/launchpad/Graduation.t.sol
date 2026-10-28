// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {LaunchpadFactory} from "../../src/launchpad/LaunchpadFactory.sol";
import {CurvePool} from "../../src/launchpad/CurvePool.sol";
import {HoldrToken} from "../../src/launchpad/HoldrToken.sol";
import {HoldrLiquidityLocker} from "../../src/launchpad/HoldrLiquidityLocker.sol";
import {HoldrLaunchHook} from "../../src/launchpad/HoldrLaunchHook.sol";
import {LaunchParams} from "../../src/launchpad/interfaces/ILaunchpad.sol";
import {HookMiner} from "../../script/HookMiner.sol";
import {MockUSDG} from "../mocks/MockUSDG.sol";

/// @dev Exact-input swaps against a v4 pool for tests. The caller pays and receives.
contract SwapHelper is IUnlockCallback {
    IPoolManager public immutable pm;

    constructor(IPoolManager pm_) {
        pm = pm_;
    }

    function swap(PoolKey memory key, bool zeroForOne, uint256 amountIn) external returns (uint256) {
        return abi.decode(pm.unlock(abi.encode(msg.sender, key, zeroForOne, amountIn)), (uint256));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(pm), "only pm");
        (address payer, PoolKey memory key, bool z, uint256 amountIn) =
            abi.decode(data, (address, PoolKey, bool, uint256));
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
        IERC20(Currency.unwrap(inC)).transferFrom(payer, address(pm), paid);
        pm.settle();
        pm.take(outC, payer, got);
        return abi.encode(got);
    }
}

abstract contract GraduationBase is Test {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    IPoolManager pm;
    MockUSDG usdg;
    HoldrLiquidityLocker locker;
    LaunchpadFactory factory;
    SwapHelper swapper;

    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");
    address creator = makeAddr("creator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    uint256 constant USD = 1e6;

    /// where USDG lives decides whether it is currency0 or currency1
    function _usdgAddress() internal pure virtual returns (address);

    function setUp() public {
        vm.warp(1_800_000_000);
        pm = IPoolManager(deployCode("out/PoolManager.sol/PoolManager.json", abi.encode(address(this))));
        deployCodeTo("out/MockUSDG.sol/MockUSDG.json", _usdgAddress());
        usdg = MockUSDG(_usdgAddress());

        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        (bytes32 salt, address hookAddr) = HookMiner.find(predicted, pm);
        locker = new HoldrLiquidityLocker(pm, address(usdg), salt);
        assertEq(address(locker), predicted);
        assertEq(address(locker.hook()), hookAddr);

        LaunchpadFactory.Config memory c;
        c.params = LaunchParams({
            gradThreshold: 10_000 * USD,
            firstBuyMaxTokens: 50_000_000 ether,
            migrator: address(locker),
            feeBps: 100,
            creatorShareBps: 7_000,
            surchargeBps: [uint16(9_800), 2_475, 619, 155, 39]
        });
        c.launchFee = 0.0005 ether;
        c.treasury = treasury;
        factory = new LaunchpadFactory(owner, usdg, c, 0);
        locker.setFactory(address(factory));
        swapper = new SwapHelper(pm);

        address[3] memory people = [creator, alice, bob];
        for (uint256 i; i < 3; ++i) {
            usdg.mint(people[i], 1_000_000 * USD);
            vm.deal(people[i], 1 ether);
        }
    }

    function _launch() internal returns (HoldrToken token, CurvePool pool) {
        vm.prank(creator);
        (address t, address p) = factory.createToken{value: 0.0005 ether}("Whale", "WHALE", "", 0, 0);
        return (HoldrToken(t), CurvePool(p));
    }

    function _buyCurve(CurvePool pool, address who, uint256 usdgIn) internal returns (uint256 out) {
        vm.startPrank(who);
        usdg.approve(address(pool), usdgIn);
        out = pool.buy(usdgIn, 0, block.timestamp);
        vm.stopPrank();
    }

    function _graduated() internal returns (HoldrToken token, CurvePool pool) {
        (token, pool) = _launch();
        vm.warp(block.timestamp + 5);
        _buyCurve(pool, alice, 3_000 * USD);
        _buyCurve(pool, bob, 20_000 * USD);
        assertTrue(pool.graduated());
    }

    function _swap(address who, PoolKey memory key, address tokenIn, uint256 amountIn) internal returns (uint256 out) {
        vm.startPrank(who);
        IERC20(tokenIn).approve(address(swapper), amountIn);
        out = swapper.swap(key, Currency.unwrap(key.currency0) == tokenIn, amountIn);
        vm.stopPrank();
    }

    /// market cap in USDG units (1B tokens) at the pool's current price
    function _poolMcap(address token) internal view returns (uint256) {
        PoolKey memory key = locker.poolKeyFor(token);
        (uint160 sqrtP,,,) = pm.getSlot0(key.toId());
        uint256 s = uint256(sqrtP);
        if (Currency.unwrap(key.currency0) == token) {
            // price = USDG per token (raw units)
            return FullMath.mulDiv(FullMath.mulDiv(s, s, 1 << 96), 1_000_000_000 ether, 1 << 96);
        }
        // price = tokens per USDG
        return FullMath.mulDiv(1_000_000_000 ether, 1 << 192, s * s);
    }

    // ---------------------------------------------------------------- migration

    function test_graduation_opensUniswapPoolAtCurvePrice() public {
        (HoldrToken token, CurvePool pool) = _graduated();
        PoolKey memory key = locker.poolKeyFor(address(token));
        HoldrLiquidityLocker.Position memory pos = locker.positionOf(address(token));

        assertEq(pos.curvePool, address(pool));
        assertGt(pos.liquidity, 0);
        assertEq(pm.getLiquidity(key.toId()), pos.liquidity, "all pool liquidity is the locked position");
        assertEq(address(key.hooks), address(locker.hook()));
        assertEq(key.fee, 10_000);
        assertEq(key.tickSpacing, 200);

        assertApproxEqRel(_poolMcap(address(token)), 50_000 * USD, 1e12, "opens at $50K market cap");
        // almost everything went in; dust is tiny
        assertApproxEqAbs(usdg.balanceOf(address(pm)), 10_000 * USD, 2);
        assertApproxEqRel(token.balanceOf(address(pm)), 200_000_000 ether, 1e12);
        assertEq(token.balanceOf(address(locker)), 0, "token dust burned");
        assertEq(usdg.balanceOf(address(locker)), locker.protocolOwed(address(usdg)), "USDG dust kept for platform");
        assertEq(token.totalSupply(), pool.tokensSold() + token.balanceOf(address(pm)));
    }

    function test_frontRunPoolCreation_isBlocked() public {
        (HoldrToken token, CurvePool pool) = _launch();
        PoolKey memory key = locker.poolKeyFor(address(token));
        uint160 silly = TickMath.getSqrtPriceAtTick(100_000);
        vm.prank(alice);
        vm.expectRevert();
        pm.initialize(key, silly);

        // a look-alike pool without the hook can be made, but it is not the official pool
        PoolKey memory fake = key;
        fake.hooks = IHooks(address(0));
        vm.prank(alice);
        pm.initialize(fake, silly);

        vm.warp(block.timestamp + 5);
        _buyCurve(pool, bob, 20_000 * USD);
        assertApproxEqRel(_poolMcap(address(token)), 50_000 * USD, 1e12);
    }

    function test_migrate_onlyFromTheTokensCurvePool() public {
        (HoldrToken token,) = _launch();
        vm.prank(alice);
        vm.expectRevert(HoldrLiquidityLocker.NotCurvePool.selector);
        locker.migrate(address(token), 1, 1);
        vm.expectRevert(HoldrLiquidityLocker.NotCurvePool.selector);
        locker.migrate(address(0xdead), 1, 1);
    }

    function test_migrate_onlyOnce() public {
        (HoldrToken token, CurvePool pool) = _graduated();
        vm.prank(address(pool));
        vm.expectRevert(HoldrLiquidityLocker.AlreadyMigrated.selector);
        locker.migrate(address(token), 1, 1);
    }

    function test_setFactory_onceByDeployer() public {
        vm.prank(alice);
        vm.expectRevert(HoldrLiquidityLocker.OnlyDeployer.selector);
        locker.setFactory(alice);
        vm.expectRevert(HoldrLiquidityLocker.FactoryAlreadySet.selector);
        locker.setFactory(alice);

        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        (bytes32 salt,) = HookMiner.find(predicted, pm);
        HoldrLiquidityLocker fresh = new HoldrLiquidityLocker(pm, address(usdg), salt);
        vm.expectRevert(HoldrLiquidityLocker.ZeroAddress.selector);
        fresh.setFactory(address(0));
        // without a factory nothing can migrate
        vm.expectRevert(HoldrLiquidityLocker.NotCurvePool.selector);
        fresh.migrate(address(1), 1, 1);
    }

    function test_constructor_rejectsBadInputs() public {
        vm.expectRevert(HoldrLiquidityLocker.ZeroAddress.selector);
        new HoldrLiquidityLocker(IPoolManager(address(0)), address(usdg), 0);
        vm.expectRevert(HoldrLiquidityLocker.ZeroAddress.selector);
        new HoldrLiquidityLocker(pm, address(0), 0);
        // a salt that gives the hook the wrong address bits fails
        vm.expectRevert();
        new HoldrLiquidityLocker(pm, address(usdg), bytes32(uint256(424242)));
    }

    function test_unlockCallback_onlyPoolManager() public {
        vm.expectRevert(HoldrLiquidityLocker.NotPoolManager.selector);
        locker.unlockCallback(abi.encode(uint8(1), address(0)));
    }

    // ---------------------------------------------------------------- trading and fees after graduation

    function test_tradeOnUniswap_andSplitFees70_30() public {
        (HoldrToken token, CurvePool pool) = _graduated();
        PoolKey memory key = locker.poolKeyFor(address(token));

        vm.expectRevert(HoldrLiquidityLocker.NothingToClaim.selector);
        vm.prank(creator);
        locker.claim(address(usdg), creator);

        uint256 got = _swap(alice, key, address(usdg), 1_000 * USD); // buy
        assertGt(got, 0);
        assertGt(_poolMcap(address(token)), 50_000 * USD, "buying pushed the price up");
        _swap(alice, key, address(token), got / 2); // sell half back

        uint256 lockedBefore = locker.positionOf(address(token)).liquidity;
        (uint256 tokenFees, uint256 usdgFees) = locker.collectFees(address(token));
        assertApproxEqAbs(usdgFees, 10 * USD, 1, "1% of the 1,000 USDG buy");
        assertApproxEqAbs(tokenFees, got / 2 / 100, 1, "1% of the tokens sold");
        assertEq(locker.positionOf(address(token)).liquidity, lockedBefore, "liquidity untouched");
        assertEq(pm.getLiquidity(key.toId()), lockedBefore);

        assertEq(locker.owed(creator, address(usdg)), usdgFees * 7_000 / 10_000);
        assertEq(locker.owed(creator, address(token)), tokenFees * 7_000 / 10_000);
        // protocol share, plus the USDG dust from migration
        assertGe(locker.protocolOwed(address(usdg)), usdgFees - usdgFees * 7_000 / 10_000);
        assertEq(locker.protocolOwed(address(token)), tokenFees - tokenFees * 7_000 / 10_000);

        // creator claims to another wallet
        uint256 bobBefore = usdg.balanceOf(bob);
        vm.startPrank(creator);
        vm.expectRevert(HoldrLiquidityLocker.ZeroAddress.selector);
        locker.claim(address(usdg), address(0));
        uint256 c = locker.claim(address(usdg), bob);
        locker.claim(address(token), creator);
        vm.stopPrank();
        assertEq(usdg.balanceOf(bob) - bobBefore, c);
        assertEq(token.balanceOf(creator), tokenFees * 7_000 / 10_000);

        // anyone pushes the platform share to the treasury
        uint256 p = locker.protocolOwed(address(usdg));
        vm.prank(bob);
        locker.withdrawProtocolFees(address(usdg));
        locker.withdrawProtocolFees(address(token));
        assertEq(usdg.balanceOf(treasury), p);
        assertEq(token.balanceOf(treasury), tokenFees - tokenFees * 7_000 / 10_000);
        vm.expectRevert(HoldrLiquidityLocker.NothingToClaim.selector);
        locker.withdrawProtocolFees(address(usdg));

        // the curve pool's own fees are separate and still claimable
        vm.prank(creator);
        pool.claimCreatorFees(creator);
    }

    function test_collectFees_withNoTradesIsZero_andBeforeGraduationReverts() public {
        (HoldrToken token,) = _launch();
        vm.expectRevert(HoldrLiquidityLocker.NotMigrated.selector);
        locker.collectFees(address(token));
        (HoldrToken t2,) = _graduated();
        (uint256 a, uint256 b) = locker.collectFees(address(t2));
        assertEq(a + b, 0);
    }

    function test_creatorTransferAfterGraduation_feesFollowNewCreator() public {
        (HoldrToken token, CurvePool pool) = _graduated();
        vm.prank(creator);
        pool.proposeCreator(bob);
        vm.prank(bob);
        pool.acceptCreator();
        _swap(alice, locker.poolKeyFor(address(token)), address(usdg), 500 * USD);
        locker.collectFees(address(token));
        assertGt(locker.owed(bob, address(usdg)), 0);
        assertEq(locker.owed(creator, address(usdg)), 0);
    }

    function test_bigSwapsBothWays_poolStaysUsable() public {
        (HoldrToken token,) = _graduated();
        PoolKey memory key = locker.poolKeyFor(address(token));
        uint256 got = _swap(alice, key, address(usdg), 100_000 * USD);
        assertGt(_poolMcap(address(token)), 500_000 * USD);
        uint256 back = _swap(alice, key, address(token), got);
        assertLt(back, 100_000 * USD, "round trip loses the fees");
        assertApproxEqRel(_poolMcap(address(token)), 50_000 * USD, 3e16);
    }

    /// The last curve price is never above the actual opening price of the pool (exact integer check
    /// against the pool's sqrtPrice, both currency orders).
    function _assertNoPriceDrop(CurvePool pool, address token) internal view {
        (uint256 x, uint256 y) = pool.reserves();
        PoolKey memory key = locker.poolKeyFor(token);
        (uint160 sqrtP,,,) = pm.getSlot0(key.toId());
        uint256 s2 = uint256(sqrtP) * uint256(sqrtP);
        if (Currency.unwrap(key.currency0) == token) {
            // pool price = s2 / 2^192 USDG per token; need x / y <= that
            assertLe(FullMath.mulDivRoundingUp(x, 1 << 192, y), s2, "curve end above pool open");
        } else {
            // pool price = s2 / 2^192 tokens per USDG; need x / y <= 2^192 / s2
            assertLe(FullMath.mulDivRoundingUp(x, s2, 1 << 192), y, "curve end above pool open");
        }
    }

    function test_priceContinuity_strictAgainstRealPool() public {
        (HoldrToken token, CurvePool pool) = _graduated();
        _assertNoPriceDrop(pool, address(token));
    }

    /// Review L-2: the graduating buy costs far more gas than a normal buy; the app must budget it.
    function test_graduatingBuy_gas() public {
        (, CurvePool pool) = _launch();
        vm.warp(block.timestamp + 5);
        _buyCurve(pool, alice, 3_000 * USD);
        vm.startPrank(bob);
        usdg.approve(address(pool), 20_000 * USD);
        uint256 g0 = gasleft();
        pool.buy(20_000 * USD, 0, block.timestamp);
        uint256 used = g0 - gasleft();
        vm.stopPrank();
        emit log_named_uint("graduating buy gas", used);
        assertLt(used, 800_000, "app sets a gas limit of 800k near graduation");
    }

    /// Review L-1: a locker linked to a different factory makes launches revert up front.
    function test_launch_rejectsLockerOfAnotherFactory() public {
        LaunchpadFactory.Config memory c = factory.config();
        LaunchpadFactory other = new LaunchpadFactory(owner, usdg, c, 0);
        vm.prank(creator);
        vm.expectRevert(LaunchpadFactory.MigratorNotLinked.selector);
        other.createToken{value: 0.0005 ether}("A", "A", "", 0, 0);
    }

    /// Review L-3: Uniswap fees earned before a creator handover go to the old creator.
    function test_creatorHandover_pendingUniswapFeesStayWithOldCreator() public {
        (HoldrToken token, CurvePool pool) = _graduated();
        _swap(alice, locker.poolKeyFor(address(token)), address(usdg), 1_000 * USD);
        vm.prank(creator);
        pool.proposeCreator(bob);
        vm.prank(bob);
        pool.acceptCreator(); // collects first
        assertApproxEqAbs(locker.owed(creator, address(usdg)), 7 * USD, 1);
        assertEq(locker.owed(bob, address(usdg)), 0);

        _swap(alice, locker.poolKeyFor(address(token)), address(usdg), 1_000 * USD);
        locker.collectFees(address(token));
        assertApproxEqAbs(locker.owed(bob, address(usdg)), 7 * USD, 1);
    }

    // ---------------------------------------------------------------- hook

    function test_hook_onlyPoolManagerAndLocker() public {
        HoldrLaunchHook hook = locker.hook();
        assertEq(hook.locker(), address(locker));
        assertEq(address(hook.poolManager()), address(pm));
        PoolKey memory key;
        vm.expectRevert(HoldrLaunchHook.NotPoolManager.selector);
        hook.beforeInitialize(address(locker), key, 0);
        vm.prank(address(pm));
        vm.expectRevert(HoldrLaunchHook.OnlyLocker.selector);
        hook.beforeInitialize(alice, key, 0);
        vm.prank(address(pm));
        assertEq(hook.beforeInitialize(address(locker), key, 0), IHooks.beforeInitialize.selector);
    }

    function test_hook_unusedCallbacksRevert() public {
        HoldrLaunchHook hook = locker.hook();
        PoolKey memory key;
        IPoolManager.ModifyLiquidityParams memory lp;
        IPoolManager.SwapParams memory sp;
        BalanceDelta zero;
        vm.expectRevert(HoldrLaunchHook.HookNotImplemented.selector);
        hook.afterInitialize(address(0), key, 0, 0);
        vm.expectRevert(HoldrLaunchHook.HookNotImplemented.selector);
        hook.beforeAddLiquidity(address(0), key, lp, "");
        vm.expectRevert(HoldrLaunchHook.HookNotImplemented.selector);
        hook.afterAddLiquidity(address(0), key, lp, zero, zero, "");
        vm.expectRevert(HoldrLaunchHook.HookNotImplemented.selector);
        hook.beforeRemoveLiquidity(address(0), key, lp, "");
        vm.expectRevert(HoldrLaunchHook.HookNotImplemented.selector);
        hook.afterRemoveLiquidity(address(0), key, lp, zero, zero, "");
        vm.expectRevert(HoldrLaunchHook.HookNotImplemented.selector);
        hook.beforeSwap(address(0), key, sp, "");
        vm.expectRevert(HoldrLaunchHook.HookNotImplemented.selector);
        hook.afterSwap(address(0), key, sp, zero, "");
        vm.expectRevert(HoldrLaunchHook.HookNotImplemented.selector);
        hook.beforeDonate(address(0), key, 0, 0, "");
        vm.expectRevert(HoldrLaunchHook.HookNotImplemented.selector);
        hook.afterDonate(address(0), key, 0, 0, "");
    }

    // ---------------------------------------------------------------- fuzz

    /// Whatever happened on the curve (snipes, sells), the pool opens at the same price or higher
    /// than the last curve price, holding the fixed 10,000 USDG.
    function testFuzz_graduationAfterRandomCurveTrading(uint256[4] memory buys, uint256 snipe, uint256 sellPart)
        public
    {
        (HoldrToken token, CurvePool pool) = _launch();
        if (snipe % 2 == 1) _buyCurve(pool, alice, bound(snipe, 1 * USD, 500 * USD));
        vm.warp(block.timestamp + 5);
        for (uint256 i; i < 4; ++i) {
            _buyCurve(pool, i % 2 == 0 ? alice : bob, bound(buys[i], 1 * USD, 2_000 * USD));
        }
        uint256 bal = token.balanceOf(alice);
        uint256 part = bound(sellPart, 0, bal);
        if (part > 0) {
            (uint256 out,) = pool.quoteSell(part);
            if (out > 0) {
                vm.prank(alice);
                pool.sell(part, 0, block.timestamp);
            }
        }
        _buyCurve(pool, bob, 20_000 * USD);
        assertTrue(pool.graduated());
        assertApproxEqRel(_poolMcap(address(token)), 50_000 * USD, 1e12);
        _assertNoPriceDrop(pool, address(token));
        assertEq(token.totalSupply(), pool.tokensSold() + token.balanceOf(address(pm)));
    }
}

/// USDG at a low address: USDG is currency0, the token is currency1.
contract GraduationUsdgFirstTest is GraduationBase {
    function _usdgAddress() internal pure override returns (address) {
        return address(0x0000000000000000000000000000000000010000);
    }
}

/// USDG at a high address: the token is currency0, USDG is currency1.
contract GraduationTokenFirstTest is GraduationBase {
    function _usdgAddress() internal pure override returns (address) {
        return address(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF);
    }
}
