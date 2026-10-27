// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {Test, Vm} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {LaunchpadFactory} from "../../src/launchpad/LaunchpadFactory.sol";
import {CurvePool} from "../../src/launchpad/CurvePool.sol";
import {HoldrToken} from "../../src/launchpad/HoldrToken.sol";
import {LaunchParams} from "../../src/launchpad/interfaces/ILaunchpad.sol";
import {MockUSDG, MockMigrator, RejectEth} from "../mocks/MockUSDG.sol";

abstract contract LaunchpadBase is Test {
    MockUSDG usdg;
    MockMigrator migrator;
    LaunchpadFactory factory;

    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");
    address creator = makeAddr("creator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant USD = 1e6;
    uint256 constant LAUNCH_FEE = 0.0005 ether;

    function _params() internal view returns (LaunchParams memory p) {
        p.gradThreshold = 10_000 * USD;
        p.firstBuyMaxTokens = 50_000_000 ether;
        p.migrator = address(migrator);
        p.feeBps = 100;
        p.creatorShareBps = 7_000;
        p.surchargeBps = [uint16(9_800), 2_475, 619, 155, 39];
    }

    function _config() internal view returns (LaunchpadFactory.Config memory c) {
        c.params = _params();
        c.launchFee = LAUNCH_FEE;
        c.treasury = treasury;
    }

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        usdg = new MockUSDG();
        migrator = new MockMigrator(usdg);
        factory = new LaunchpadFactory(owner, usdg, _config(), 0);
        address[4] memory people = [creator, alice, bob, makeAddr("carol")];
        for (uint256 i; i < people.length; ++i) {
            usdg.mint(people[i], 1_000_000 * USD);
            vm.deal(people[i], 1 ether);
        }
    }

    function _launch(uint256 firstBuy) internal returns (HoldrToken token, CurvePool pool) {
        vm.startPrank(creator);
        usdg.approve(address(factory), firstBuy);
        (address t, address p) = factory.createToken{value: LAUNCH_FEE}("Whale", "WHALE", "ipfs://whale", firstBuy, 0);
        vm.stopPrank();
        return (HoldrToken(t), CurvePool(p));
    }

    function _buy(CurvePool pool, address who, uint256 usdgIn) internal returns (uint256 out) {
        vm.startPrank(who);
        usdg.approve(address(pool), usdgIn);
        out = pool.buy(usdgIn, 0, block.timestamp);
        vm.stopPrank();
    }

    function _sell(CurvePool pool, address who, uint256 tokensIn) internal returns (uint256 out) {
        vm.prank(who);
        out = pool.sell(tokensIn, 0, block.timestamp);
    }

    /// market cap in USDG units for 1B tokens at the current curve price
    function _mcap(CurvePool pool) internal view returns (uint256) {
        (uint256 x, uint256 y) = pool.reserves();
        return x * 1_000_000_000 ether / y;
    }
}

contract LaunchpadTest is LaunchpadBase {
    // ---------------------------------------------------------------- launch

    function test_launch_setsUpTokenAndPool() public {
        vm.recordLogs();
        (HoldrToken token, CurvePool pool) = _launch(0);
        bytes32 sig = keccak256("TokenCreated(address,address,address,string,string,string,uint256)");
        bool found;
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(factory) && logs[i].topics[0] == sig) {
                found = true;
                assertEq(logs[i].topics[1], bytes32(uint256(uint160(address(token)))));
                assertEq(logs[i].topics[2], bytes32(uint256(uint160(address(pool)))));
                assertEq(logs[i].topics[3], bytes32(uint256(uint160(creator))));
            }
        }
        assertTrue(found, "TokenCreated emitted");

        assertEq(token.name(), "Whale");
        assertEq(token.symbol(), "WHALE");
        assertEq(token.decimals(), 18);
        assertEq(token.metadataURI(), "ipfs://whale");
        assertEq(token.totalSupply(), 1_000_000_000 ether);
        assertEq(token.balanceOf(address(pool)), 1_000_000_000 ether);
        assertEq(token.curve(), address(pool));

        assertEq(pool.factory(), address(factory));
        assertEq(address(pool.token()), address(token));
        assertEq(address(pool.usdg()), address(usdg));
        assertEq(pool.creator(), creator);
        assertEq(pool.migrator(), address(migrator));
        assertEq(pool.launchTime(), block.timestamp);
        assertEq(pool.feeBps(), 100);
        assertEq(pool.creatorShareBps(), 7_000);
        assertEq(pool.gradThreshold(), 10_000 * USD);
        assertEq(pool.firstBuyMaxTokens(), 50_000_000 ether);
        uint16[5] memory s = pool.surchargeSchedule();
        assertEq(s[0], 9_800);
        assertEq(s[4], 39);

        assertEq(factory.poolOf(address(token)), address(pool));
        assertEq(factory.tokenCount(), 1);
        assertEq(address(factory).balance, LAUNCH_FEE);
    }

    function test_curveParameters_matchDesign() public {
        (, CurvePool pool) = _launch(0);
        assertEq(pool.virtualUsdg(), 3_333_333_334); // 3,333.333334 USDG
        assertApproxEqRel(pool.initialVirtualTokens(), 1_066_666_667 ether, 1e12);
        assertApproxEqRel(_mcap(pool), 3_125 * USD, 1e15); // opening market cap $3,125
    }

    function test_launch_revertsOnBadInput() public {
        vm.startPrank(creator);
        vm.expectRevert(abi.encodeWithSelector(LaunchpadFactory.WrongLaunchFee.selector, LAUNCH_FEE));
        factory.createToken{value: 0}("A", "A", "", 0, 0);
        vm.expectRevert(abi.encodeWithSelector(LaunchpadFactory.WrongLaunchFee.selector, LAUNCH_FEE));
        factory.createToken{value: 1 ether}("A", "A", "", 0, 0);
        vm.expectRevert(LaunchpadFactory.BadName.selector);
        factory.createToken{value: LAUNCH_FEE}("", "A", "", 0, 0);
        vm.expectRevert(LaunchpadFactory.BadName.selector);
        factory.createToken{value: LAUNCH_FEE}("123456789012345678901234567890123", "A", "", 0, 0);
        vm.expectRevert(LaunchpadFactory.BadSymbol.selector);
        factory.createToken{value: LAUNCH_FEE}("A", "", "", 0, 0);
        vm.expectRevert(LaunchpadFactory.BadSymbol.selector);
        factory.createToken{value: LAUNCH_FEE}("A", "12345678901", "", 0, 0);
        // the limits themselves are fine
        factory.createToken{value: LAUNCH_FEE}("12345678901234567890123456789012", "1234567890", "", 0, 0);
        vm.stopPrank();
    }

    function test_implementationsAndClonesCannotBeReinitialized() public {
        (HoldrToken token, CurvePool pool) = _launch(0);
        LaunchParams memory p = _params();
        address tokenImpl = factory.tokenImplementation();
        address poolImpl = factory.poolImplementation();
        vm.expectRevert(HoldrToken.AlreadyInitialized.selector);
        token.initialize("X", "X", "", alice);
        vm.expectRevert(CurvePool.AlreadyInitialized.selector);
        pool.initialize(address(token), address(usdg), alice, p);
        vm.expectRevert(HoldrToken.AlreadyInitialized.selector);
        HoldrToken(tokenImpl).initialize("X", "X", "", alice);
        vm.expectRevert(CurvePool.AlreadyInitialized.selector);
        CurvePool(poolImpl).initialize(address(token), address(usdg), alice, p);
    }

    function test_firstBuy_noSurchargeCappedAndFeeCharged() public {
        (HoldrToken token, CurvePool pool) = _launch(165 * USD);
        uint256 got = token.balanceOf(creator);
        assertGt(got, 49_000_000 ether);
        assertLe(got, 50_000_000 ether);
        assertEq(pool.creatorFeesOf(creator), 1_155_000); // 70% of 1.65
        assertEq(pool.protocolFees(), 495_000);
        assertEq(pool.realUsdg(), 165 * USD - 1_650_000);
        assertEq(usdg.balanceOf(address(pool)), 165 * USD);
    }

    function test_firstBuy_overCapReverts() public {
        vm.startPrank(creator);
        usdg.approve(address(factory), 166 * USD);
        vm.expectRevert(CurvePool.FirstBuyTooLarge.selector);
        factory.createToken{value: LAUNCH_FEE}("A", "A", "", 166 * USD, 0);
        vm.stopPrank();
    }

    function test_firstBuy_respectsMinTokensOut() public {
        vm.startPrank(creator);
        usdg.approve(address(factory), 50 * USD);
        vm.expectRevert(CurvePool.SlippageExceeded.selector);
        factory.createToken{value: LAUNCH_FEE}("A", "A", "", 50 * USD, 16_000_000 ether);
        // 50 USDG buys about 15.6M (1.6%)
        (address t,) = factory.createToken{value: LAUNCH_FEE}("A", "A", "", 50 * USD, 15_000_000 ether);
        vm.stopPrank();
        assertApproxEqRel(IERC20(t).balanceOf(creator), 15_600_000 ether, 1e16);
    }

    function test_firstBuy_onlyFactory() public {
        (, CurvePool pool) = _launch(0);
        vm.expectRevert(CurvePool.OnlyFactory.selector);
        pool.firstBuy(alice, 1 * USD, 0);
    }

    function test_firstBuy_detectsShortTransfer() public {
        usdg.setSkim(true);
        vm.startPrank(creator);
        usdg.approve(address(factory), 10 * USD);
        vm.expectRevert(LaunchpadFactory.UsdgNotReceived.selector);
        factory.createToken{value: LAUNCH_FEE}("A", "A", "", 10 * USD, 0);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- buy and sell

    function test_buy_feeSplitAndOpeningPrice() public {
        (HoldrToken token, CurvePool pool) = _launch(0);
        vm.warp(block.timestamp + 5);
        uint256 before = usdg.balanceOf(alice);
        CurvePool.BuyQuote memory q = pool.quoteBuy(100 * USD);
        uint256 out = _buy(pool, alice, 100 * USD);

        assertEq(out, q.tokensOut);
        assertApproxEqRel(out, 30_770_000 ether, 1e15); // design doc: about 30.77M for $100
        assertEq(token.balanceOf(alice), out);
        assertEq(before - usdg.balanceOf(alice), 100 * USD);
        assertEq(pool.creatorFeesOf(creator), 700_000);
        assertEq(pool.protocolFees(), 300_000);
        assertEq(pool.realUsdg(), 99 * USD);
        assertEq(pool.tokensSold(), out);
    }

    function test_buy_emitsTrade() public {
        (, CurvePool pool) = _launch(0);
        vm.warp(block.timestamp + 5);
        uint256 expected = pool.quoteBuy(10 * USD).tokensOut;
        vm.startPrank(alice);
        usdg.approve(address(pool), 10 * USD);
        vm.expectEmit(true, true, false, true);
        emit CurvePool.Trade(alice, true, 10 * USD, expected, 100_000, 0, 9_900_000, expected);
        pool.buy(10 * USD, expected, block.timestamp);
        vm.stopPrank();
    }

    function test_sell_returnsUsdgMinusFee_noApprovalNeeded() public {
        (HoldrToken token, CurvePool pool) = _launch(0);
        vm.warp(block.timestamp + 5);
        uint256 got = _buy(pool, alice, 100 * USD);
        assertEq(token.allowance(alice, address(pool)), type(uint256).max);

        (uint256 quoted, uint256 fee) = pool.quoteSell(got);
        uint256 before = usdg.balanceOf(alice);
        uint256 out = _sell(pool, alice, got);
        assertEq(out, quoted);
        assertEq(usdg.balanceOf(alice) - before, out);
        assertApproxEqAbs(out + fee, 99 * USD, 1); // the whole curve deposit comes back
        assertApproxEqAbs(out, 98_010_000, 1); // 99 - 1%
        assertEq(token.balanceOf(alice), 0);
        assertEq(pool.tokensSold(), 0);
        assertLe(pool.realUsdg(), 1); // only rounding dust stays
    }

    function test_sell_emitsTrade() public {
        (, CurvePool pool) = _launch(0);
        vm.warp(block.timestamp + 5);
        uint256 got = _buy(pool, alice, 100 * USD);
        (uint256 out, uint256 fee) = pool.quoteSell(got / 2);
        vm.expectEmit(true, true, false, false);
        emit CurvePool.Trade(alice, false, out, got / 2, fee, 0, 0, 0);
        _sell(pool, alice, got / 2);
    }

    function test_trade_guards() public {
        (HoldrToken token, CurvePool pool) = _launch(0);
        vm.warp(block.timestamp + 5);
        vm.startPrank(alice);
        usdg.approve(address(pool), type(uint256).max);
        vm.expectRevert(CurvePool.Expired.selector);
        pool.buy(1 * USD, 0, block.timestamp - 1);
        vm.expectRevert(CurvePool.ZeroAmount.selector);
        pool.buy(0, 0, block.timestamp);
        vm.expectRevert(CurvePool.SlippageExceeded.selector);
        pool.buy(1 * USD, 1_000_000_000 ether, block.timestamp);
        uint256 got = pool.buy(1 * USD, 0, block.timestamp);
        vm.expectRevert(CurvePool.Expired.selector);
        pool.sell(got, 0, block.timestamp - 1);
        vm.expectRevert(CurvePool.ZeroAmount.selector);
        pool.sell(0, 0, block.timestamp);
        vm.expectRevert(CurvePool.SlippageExceeded.selector);
        pool.sell(got, 1 * USD, block.timestamp);
        vm.expectRevert(CurvePool.SlippageExceeded.selector);
        pool.sell(1, 0, block.timestamp); // too small to return anything
        vm.stopPrank();

        // more tokens than ever left the curve (only possible with tokens from elsewhere)
        deal(address(token), bob, got + 1);
        vm.prank(bob);
        vm.expectRevert(CurvePool.NotEnoughSold.selector);
        pool.sell(got + 1, 0, block.timestamp);
    }

    function test_buy_detectsShortTransfer() public {
        (, CurvePool pool) = _launch(0);
        usdg.setSkim(true);
        vm.startPrank(alice);
        usdg.approve(address(pool), 10 * USD);
        vm.expectRevert(CurvePool.UsdgNotReceived.selector);
        pool.buy(10 * USD, 0, block.timestamp);
        vm.stopPrank();
    }

    function test_priceRisesWithBuys_andFallsWithSells() public {
        (, CurvePool pool) = _launch(0);
        vm.warp(block.timestamp + 5);
        uint256 m0 = _mcap(pool);
        uint256 got = _buy(pool, alice, 1_000 * USD);
        uint256 m1 = _mcap(pool);
        assertGt(m1, m0);
        _sell(pool, alice, got / 2);
        assertLt(_mcap(pool), m1);
    }

    function test_designPricePoints() public {
        (, CurvePool pool) = _launch(0);
        vm.warp(block.timestamp + 5);
        // buy until 2,500 / 5,000 / 7,500 USDG are in the curve
        _fillTo(pool, 2_500 * USD);
        assertApproxEqRel(_mcap(pool), 9_570 * USD, 2e15);
        assertApproxEqRel(pool.tokensSold(), 457_000_000 ether, 3e15);
        _fillTo(pool, 5_000 * USD);
        assertApproxEqRel(_mcap(pool), 19_531 * USD, 2e15);
        _fillTo(pool, 7_500 * USD);
        assertApproxEqRel(_mcap(pool), 33_008 * USD, 2e15);
    }

    function _fillTo(CurvePool pool, uint256 target) internal {
        uint256 toCurve = target - pool.realUsdg();
        _buy(pool, bob, toCurve * 10_000 / 9_900 + 1);
    }

    // ---------------------------------------------------------------- anti-snipe

    function test_surcharge_scheduleAndStaysInCurve() public {
        uint256[6] memory expectedBps = [uint256(9_800), 2_475, 619, 155, 39, 0];
        for (uint256 sec; sec < 6; ++sec) {
            uint256 snap = vm.snapshotState();
            (, CurvePool pool) = _launch(0);
            vm.warp(block.timestamp + sec);
            assertEq(pool.currentSurchargeBps(), expectedBps[sec]);
            CurvePool.BuyQuote memory q = pool.quoteBuy(100 * USD);
            assertEq(q.surcharge, 100 * USD * expectedBps[sec] / 10_000);
            _buy(pool, alice, 100 * USD);
            assertEq(pool.realUsdg(), 99 * USD, "fee aside, everything stays in the curve");
            assertEq(pool.protocolFees() + pool.creatorFeesOf(creator), 1 * USD);
            vm.revertToState(snap);
        }
    }

    function test_surcharge_sniperGetsAlmostNothing() public {
        (, CurvePool pool) = _launch(0);
        uint256 sniped = _buy(pool, alice, 100 * USD); // second 0
        vm.warp(block.timestamp + 5);
        uint256 fair = pool.quoteBuy(100 * USD).tokensOut;
        assertLt(sniped * 50, fair, "second-0 buy gets about 1% of a normal buy");
        // the surcharge lifted the price for everyone after
        (uint256 x, uint256 y) = pool.reserves();
        assertGt(x * 1e36 / y, (pool.virtualUsdg() + 1 * USD) * 1e36 / pool.initialVirtualTokens());
    }

    // ---------------------------------------------------------------- graduation

    function test_graduation_exactFillHandoffAndBurn() public {
        (HoldrToken token, CurvePool pool) = _launch(0);
        vm.warp(block.timestamp + 5);
        _buy(pool, alice, 5_000 * USD);
        uint256 room = 10_000 * USD - pool.realUsdg();

        uint256 before = usdg.balanceOf(bob);
        vm.startPrank(bob);
        usdg.approve(address(pool), 20_000 * USD);
        vm.expectEmit(true, true, false, false);
        emit CurvePool.Graduated(address(token), address(migrator), 0, 0, 0);
        pool.buy(20_000 * USD, 0, block.timestamp); // asks for far more than needed
        vm.stopPrank();
        uint256 paid = before - usdg.balanceOf(bob);

        assertApproxEqAbs(paid, room * 10_000 / 9_900, 1, "only what fills the curve is taken");
        assertTrue(pool.graduated());
        assertEq(pool.realUsdg(), 10_000 * USD);
        assertEq(migrator.calls(), 1);
        assertEq(migrator.lastToken(), address(token));
        assertEq(migrator.lastUsdg(), 10_000 * USD);
        assertEq(migrator.lastTokens(), 200_000_000 ether);
        assertEq(usdg.balanceOf(address(migrator)), 10_000 * USD);
        assertEq(token.balanceOf(address(migrator)), 200_000_000 ether);
        assertEq(token.balanceOf(address(pool)), 0);

        uint256 sold = pool.tokensSold();
        assertLe(sold, 800_000_000 ether);
        assertApproxEqRel(sold, 800_000_000 ether, 1e12); // no surcharge: about all 800M sold
        assertEq(token.totalSupply(), sold + 200_000_000 ether, "unsold curve tokens burned");
        assertApproxEqRel(_mcap(pool), 50_000 * USD, 1e12); // last curve price = Uniswap opening price
        (uint256 x, uint256 y) = pool.reserves();
        assertLe(x * 200_000_000 ether, 10_000 * USD * y, "never above it");

        // the pool keeps only the fees
        assertEq(usdg.balanceOf(address(pool)), pool.protocolFees() + pool.creatorFeesOf(creator));
    }

    function test_graduation_afterSnipesBurnsUnsoldAndOpensHigher() public {
        (HoldrToken token, CurvePool pool) = _launch(0);
        _buy(pool, alice, 400 * USD); // second 0: mostly surcharge
        vm.warp(block.timestamp + 5);
        _buy(pool, bob, 20_000 * USD);
        assertTrue(pool.graduated());
        uint256 sold = pool.tokensSold();
        assertLt(sold, 790_000_000 ether);
        assertEq(token.totalSupply(), sold + 200_000_000 ether);
        // curve end price <= Uniswap opening price (10,000 / 200M)
        (uint256 x, uint256 y) = pool.reserves();
        assertLe(x * 1e18 / y, 10_000 * USD * 1e18 / 200_000_000 ether);
    }

    function test_graduation_donatedTokensAreBurned() public {
        (HoldrToken token, CurvePool pool) = _launch(0);
        vm.warp(block.timestamp + 5);
        uint256 got = _buy(pool, alice, 1_000 * USD);
        vm.prank(alice);
        token.transfer(address(pool), got / 2); // donation, not a sell
        _buy(pool, bob, 20_000 * USD);
        assertEq(token.balanceOf(address(pool)), 0);
        assertEq(token.balanceOf(address(migrator)), 200_000_000 ether);
    }

    function test_afterGraduation_tradingClosed_feesStillClaimable() public {
        (, CurvePool pool) = _launch(0);
        vm.warp(block.timestamp + 5);
        uint256 got = _buy(pool, alice, 100 * USD);
        _buy(pool, bob, 20_000 * USD);

        vm.startPrank(alice);
        usdg.approve(address(pool), 1 * USD);
        vm.expectRevert(CurvePool.IsGraduated.selector);
        pool.buy(1 * USD, 0, block.timestamp);
        vm.expectRevert(CurvePool.IsGraduated.selector);
        pool.sell(got, 0, block.timestamp);
        vm.stopPrank();
        vm.expectRevert(CurvePool.IsGraduated.selector);
        pool.quoteBuy(1 * USD);
        vm.expectRevert(CurvePool.IsGraduated.selector);
        pool.quoteSell(got);

        uint256 owed = pool.creatorFeesOf(creator);
        assertGt(owed, 0);
        vm.prank(creator);
        pool.claimCreatorFees(creator);
        pool.withdrawProtocolFees();
        assertEq(usdg.balanceOf(address(pool)), 0);
    }

    function test_graduation_revertsIfMigratorFails_userCanStillSell() public {
        (, CurvePool pool) = _launch(0);
        vm.warp(block.timestamp + 5);
        uint256 got = _buy(pool, alice, 100 * USD);
        vm.mockCallRevert(address(migrator), abi.encodeWithSelector(MockMigrator.migrate.selector), "broken");
        vm.startPrank(bob);
        usdg.approve(address(pool), 20_000 * USD);
        vm.expectRevert("broken");
        pool.buy(20_000 * USD, 0, block.timestamp);
        vm.stopPrank();
        assertFalse(pool.graduated());
        _sell(pool, alice, got);
    }

    // ---------------------------------------------------------------- fees and creator role

    function test_claimCreatorFees() public {
        (, CurvePool pool) = _launch(0);
        vm.warp(block.timestamp + 5);
        _buy(pool, alice, 1_000 * USD);
        vm.expectRevert(CurvePool.NothingToClaim.selector);
        vm.prank(alice);
        pool.claimCreatorFees(alice);
        vm.startPrank(creator);
        vm.expectRevert(CurvePool.ZeroAddress.selector);
        pool.claimCreatorFees(address(0));
        vm.expectEmit(true, true, false, true);
        emit CurvePool.CreatorFeesClaimed(creator, bob, 7 * USD);
        pool.claimCreatorFees(bob);
        vm.stopPrank();
        assertEq(usdg.balanceOf(bob), 1_000_000 * USD + 7 * USD);
        assertEq(pool.creatorFeesOf(creator), 0);
    }

    function test_withdrawProtocolFees_anyoneToTreasury() public {
        (, CurvePool pool) = _launch(0);
        vm.expectRevert(CurvePool.NothingToClaim.selector);
        pool.withdrawProtocolFees();
        vm.warp(block.timestamp + 5);
        _buy(pool, alice, 1_000 * USD);
        vm.prank(bob);
        pool.withdrawProtocolFees();
        assertEq(usdg.balanceOf(treasury), 3 * USD);
        assertEq(pool.protocolFees(), 0);
    }

    function test_creatorTransfer_twoStep_oldFeesStay() public {
        (, CurvePool pool) = _launch(0);
        vm.warp(block.timestamp + 5);
        _buy(pool, alice, 1_000 * USD);

        vm.expectRevert(CurvePool.OnlyCreator.selector);
        vm.prank(alice);
        pool.proposeCreator(alice);

        vm.prank(creator);
        pool.proposeCreator(bob);
        vm.expectRevert(CurvePool.OnlyPendingCreator.selector);
        vm.prank(alice);
        pool.acceptCreator();
        vm.prank(bob);
        pool.acceptCreator();
        assertEq(pool.creator(), bob);
        assertEq(pool.pendingCreator(), address(0));

        _buy(pool, alice, 1_000 * USD);
        assertEq(pool.creatorFeesOf(creator), 7 * USD, "old creator keeps what was earned");
        assertEq(pool.creatorFeesOf(bob), 7 * USD);
    }

    function test_creatorTransfer_cancelWithZero() public {
        (, CurvePool pool) = _launch(0);
        vm.startPrank(creator);
        pool.proposeCreator(bob);
        pool.proposeCreator(address(0));
        vm.stopPrank();
        vm.prank(bob);
        vm.expectRevert(CurvePool.OnlyPendingCreator.selector);
        pool.acceptCreator();
    }

    // ---------------------------------------------------------------- emergency controls

    function test_pause_stopsLaunchAndBuy_notSell() public {
        (, CurvePool pool) = _launch(0);
        vm.warp(block.timestamp + 5);
        uint256 got = _buy(pool, alice, 100 * USD);

        address pauser = makeAddr("pauser");
        vm.expectRevert(LaunchpadFactory.NotPauser.selector);
        vm.prank(pauser);
        factory.pause();
        vm.prank(owner);
        factory.setPauser(pauser, true);
        vm.prank(pauser);
        factory.pause();
        assertTrue(factory.paused());

        vm.startPrank(alice);
        usdg.approve(address(pool), 1 * USD);
        vm.expectRevert(CurvePool.BuyPaused.selector);
        pool.buy(1 * USD, 0, block.timestamp);
        pool.sell(got, 0, block.timestamp); // sells always work
        vm.stopPrank();
        vm.prank(creator);
        vm.expectRevert(LaunchpadFactory.LaunchPaused.selector);
        factory.createToken{value: LAUNCH_FEE}("A", "A", "", 0, 0);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, pauser));
        vm.prank(pauser);
        factory.unpause();
        vm.prank(owner);
        factory.unpause();
        _buy(pool, alice, 1 * USD);
    }

    function test_ownerCanPauseToo() public {
        vm.prank(owner);
        factory.pause();
        assertTrue(factory.paused());
    }

    function test_maxBuy_onlyRisesOrRemoved() public {
        LaunchpadFactory capped = new LaunchpadFactory(owner, usdg, _config(), 500 * USD);
        vm.startPrank(creator);
        (, address p) = capped.createToken{value: LAUNCH_FEE}("A", "A", "", 0, 0);
        vm.stopPrank();
        CurvePool pool = CurvePool(p);
        vm.warp(block.timestamp + 5);

        vm.startPrank(alice);
        usdg.approve(address(pool), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(CurvePool.BuyTooLarge.selector, 500 * USD));
        pool.buy(501 * USD, 0, block.timestamp);
        pool.buy(500 * USD, 0, block.timestamp);
        vm.stopPrank();

        vm.startPrank(owner);
        vm.expectRevert(LaunchpadFactory.MaxBuyCanOnlyRise.selector);
        capped.setMaxBuyUsdg(400 * USD);
        vm.expectRevert(LaunchpadFactory.MaxBuyCanOnlyRise.selector);
        capped.setMaxBuyUsdg(500 * USD);
        capped.setMaxBuyUsdg(1_000 * USD);
        capped.setMaxBuyUsdg(0);
        vm.expectRevert(LaunchpadFactory.MaxBuyCanOnlyRise.selector);
        capped.setMaxBuyUsdg(5_000 * USD); // once removed, it stays removed
        vm.stopPrank();
        assertEq(capped.maxBuyUsdg(), 0);

        vm.prank(alice);
        pool.buy(20_000 * USD, 0, block.timestamp);
        assertTrue(pool.graduated());
    }

    function test_maxBuy_appliesToFirstBuy() public {
        LaunchpadFactory capped = new LaunchpadFactory(owner, usdg, _config(), 100 * USD);
        vm.startPrank(creator);
        usdg.approve(address(capped), 150 * USD);
        vm.expectRevert(abi.encodeWithSelector(CurvePool.BuyTooLarge.selector, 100 * USD));
        capped.createToken{value: LAUNCH_FEE}("A", "A", "", 150 * USD, 0);
        vm.stopPrank();
    }

    function test_withdrawLaunchFees() public {
        vm.expectRevert(LaunchpadFactory.NothingToWithdraw.selector);
        factory.withdrawLaunchFees();
        _launch(0);
        _launch(0);
        vm.prank(alice);
        factory.withdrawLaunchFees();
        assertEq(treasury.balance, 2 * LAUNCH_FEE);
        assertEq(address(factory).balance, 0);
    }

    function test_withdrawLaunchFees_rejectingTreasury() public {
        LaunchpadFactory.Config memory c = _config();
        c.treasury = address(new RejectEth());
        LaunchpadFactory f = new LaunchpadFactory(owner, usdg, c, 0);
        vm.prank(creator);
        f.createToken{value: LAUNCH_FEE}("A", "A", "", 0, 0);
        vm.expectRevert(LaunchpadFactory.EthTransferFailed.selector);
        f.withdrawLaunchFees();
    }

    // ---------------------------------------------------------------- rule changes

    function test_config_48hTimelock_onlyNewLaunchesAffected() public {
        (, CurvePool oldPool) = _launch(0);
        LaunchpadFactory.Config memory c = _config();
        c.params.feeBps = 200;
        c.params.surchargeBps[0] = 9_700;
        c.params.gradThreshold = 20_000 * USD;
        c.launchFee = 0.001 ether;

        vm.prank(owner);
        factory.proposeConfig(c);
        assertEq(factory.pendingConfigEta(), block.timestamp + 48 hours);
        assertEq(factory.pendingConfig().params.feeBps, 200);

        vm.warp(block.timestamp + 48 hours - 1);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(LaunchpadFactory.ConfigNotReady.selector, block.timestamp + 1));
        factory.executeConfig();
        vm.warp(block.timestamp + 1);
        vm.prank(owner);
        factory.executeConfig();
        assertEq(factory.pendingConfigEta(), 0);
        assertEq(factory.launchFee(), 0.001 ether);
        assertEq(factory.config().params.feeBps, 200);

        vm.prank(creator);
        (, address p) = factory.createToken{value: 0.001 ether}("B", "B", "", 0, 0);
        assertEq(CurvePool(p).feeBps(), 200);
        assertEq(CurvePool(p).gradThreshold(), 20_000 * USD);
        assertEq(oldPool.feeBps(), 100, "launched tokens keep their rules");
        assertEq(oldPool.gradThreshold(), 10_000 * USD);
    }

    function test_config_cancelAndAccess() public {
        LaunchpadFactory.Config memory c = _config();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        factory.proposeConfig(c);

        vm.startPrank(owner);
        vm.expectRevert(LaunchpadFactory.NoPendingConfig.selector);
        factory.executeConfig();
        vm.expectRevert(LaunchpadFactory.NoPendingConfig.selector);
        factory.cancelConfig();
        factory.proposeConfig(c);
        factory.cancelConfig();
        vm.expectRevert(LaunchpadFactory.NoPendingConfig.selector);
        factory.executeConfig();
        vm.stopPrank();
    }

    function test_config_validation() public {
        LaunchpadFactory.Config[9] memory bad;
        for (uint256 i; i < 9; ++i) {
            bad[i] = _config();
        }
        bad[0].treasury = address(0);
        bad[1].params.migrator = address(0);
        bad[2].launchFee = 0.2 ether;
        bad[3].params.feeBps = 501;
        bad[4].params.creatorShareBps = 10_001;
        bad[5].params.gradThreshold = 999 * USD;
        bad[6].params.gradThreshold = 1_000_001 * USD;
        bad[7].params.firstBuyMaxTokens = 100_000_001 ether;
        bad[8].params.surchargeBps[2] = 9_801; // with the 1% fee: over 99%
        vm.startPrank(owner);
        vm.expectRevert(LaunchpadFactory.ZeroAddress.selector);
        factory.proposeConfig(bad[0]);
        vm.expectRevert(LaunchpadFactory.ZeroAddress.selector);
        factory.proposeConfig(bad[1]);
        for (uint256 i = 2; i < 9; ++i) {
            vm.expectRevert(LaunchpadFactory.InvalidConfig.selector);
            factory.proposeConfig(bad[i]);
        }
        vm.stopPrank();

        vm.expectRevert(LaunchpadFactory.ZeroAddress.selector);
        new LaunchpadFactory(owner, MockUSDG(address(0)), _config(), 0);
    }

    function test_ownership_twoStep_noRenounce() public {
        vm.prank(owner);
        vm.expectRevert(LaunchpadFactory.RenounceDisabled.selector);
        factory.renounceOwnership();
        vm.prank(owner);
        factory.transferOwnership(alice);
        vm.prank(alice);
        factory.acceptOwnership();
        assertEq(factory.owner(), alice);
    }

    function test_onlyOwner_controls() public {
        bytes memory err = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice);
        vm.startPrank(alice);
        vm.expectRevert(err);
        factory.setPauser(alice, true);
        vm.expectRevert(err);
        factory.setMaxBuyUsdg(1);
        vm.expectRevert(err);
        factory.executeConfig();
        vm.expectRevert(err);
        factory.cancelConfig();
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- token

    function test_token_burnAndNormalAllowances() public {
        (HoldrToken token, CurvePool pool) = _launch(0);
        vm.warp(block.timestamp + 5);
        uint256 got = _buy(pool, alice, 100 * USD);
        vm.prank(alice);
        token.burn(got / 2);
        assertEq(token.totalSupply(), 1_000_000_000 ether - got / 2);

        assertEq(token.allowance(alice, bob), 0);
        vm.prank(alice);
        token.approve(bob, 10);
        vm.prank(bob);
        token.transferFrom(alice, bob, 10);
        assertEq(token.allowance(alice, bob), 0);
    }

    // ---------------------------------------------------------------- fuzz

    /// A round trip (buy then sell everything) never makes money.
    function testFuzz_roundTripNeverProfits(uint256 seedBuy, uint256 usdgIn, uint256 wait) public {
        (, CurvePool pool) = _launch(0);
        vm.warp(block.timestamp + bound(wait, 0, 10));
        uint256 seed = bound(seedBuy, 0, 9_000 * USD);
        if (seed >= 1 * USD) _buy(pool, bob, seed);
        usdgIn = bound(usdgIn, 1 * USD, 20_000 * USD);
        if (pool.graduated()) return;
        uint256 before = usdg.balanceOf(alice);
        uint256 got = _buy(pool, alice, usdgIn);
        if (pool.graduated()) return;
        _sell(pool, alice, got);
        assertLe(usdg.balanceOf(alice), before);
    }

    /// Splitting a buy into two never gets more tokens than one buy of the same total.
    function testFuzz_splitBuyNoBetter(uint256 a, uint256 b) public {
        (, CurvePool pool) = _launch(0);
        vm.warp(block.timestamp + 5);
        a = bound(a, 1 * USD, 4_000 * USD);
        b = bound(b, 1 * USD, 4_000 * USD);
        uint256 one = pool.quoteBuy(a + b).tokensOut;
        uint256 two = _buy(pool, alice, a);
        two += _buy(pool, alice, b);
        assertLe(two, one + 1);
    }

    /// Whatever the order of trades, every holder can always sell out.
    function testFuzz_everyoneCanExit(uint256[6] memory amounts) public {
        (HoldrToken token, CurvePool pool) = _launch(0);
        address[3] memory who = [alice, bob, makeAddr("carol")];
        for (uint256 i; i < 6; ++i) {
            vm.warp(block.timestamp + 1);
            _buy(pool, who[i % 3], bound(amounts[i], 1 * USD, 1_600 * USD));
        }
        for (uint256 i; i < 3; ++i) {
            uint256 bal = token.balanceOf(who[i]);
            if (bal > 0) _sell(pool, who[i], bal);
        }
        assertEq(pool.tokensSold(), 0);
        assertGe(usdg.balanceOf(address(pool)), pool.protocolFees() + pool.creatorFeesOf(creator));
    }
}
