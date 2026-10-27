// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {LaunchpadFactory} from "../../src/launchpad/LaunchpadFactory.sol";
import {CurvePool} from "../../src/launchpad/CurvePool.sol";
import {HoldrToken} from "../../src/launchpad/HoldrToken.sol";
import {LaunchParams} from "../../src/launchpad/interfaces/ILaunchpad.sol";
import {MockUSDG, MockMigrator} from "../mocks/MockUSDG.sol";

/// @dev Random buys, sells, transfers, fee claims, pauses and time jumps on one launched token.
contract CurveHandler is Test {
    LaunchpadFactory public factory;
    CurvePool public pool;
    HoldrToken public token;
    MockUSDG public usdg;
    address public owner;
    address[] public traders;

    uint256 public lastK;
    bool public kDecreased;
    uint256 public buys;
    uint256 public sells;

    constructor(LaunchpadFactory f, CurvePool p, MockUSDG u, address owner_, address[] memory traders_) {
        factory = f;
        pool = p;
        token = p.token();
        usdg = u;
        owner = owner_;
        traders = traders_;
        lastK = _k();
    }

    function _k() internal view returns (uint256) {
        (uint256 x, uint256 y) = pool.reserves();
        return x * y;
    }

    function _checkK() internal {
        uint256 k = _k();
        if (k < lastK) kDecreased = true;
        lastK = k;
    }

    function tradersLength() external view returns (uint256) {
        return traders.length;
    }

    function buy(uint256 who, uint256 amount) external {
        if (pool.graduated() || factory.paused()) return;
        address t = traders[who % traders.length];
        amount = bound(amount, 1e6, 3_000e6);
        vm.startPrank(t);
        usdg.approve(address(pool), amount);
        pool.buy(amount, 0, block.timestamp);
        vm.stopPrank();
        ++buys;
        if (!pool.graduated()) _checkK();
    }

    function sell(uint256 who, uint256 amount) external {
        if (pool.graduated()) return;
        address t = traders[who % traders.length];
        uint256 bal = token.balanceOf(t);
        if (bal == 0) return;
        amount = bound(amount, 1, bal);
        (uint256 out,) = pool.quoteSell(amount);
        if (out == 0) return;
        vm.prank(t);
        pool.sell(amount, 0, block.timestamp);
        ++sells;
        _checkK();
    }

    function transfer(uint256 from, uint256 to, uint256 amount) external {
        address a = traders[from % traders.length];
        address b = traders[to % traders.length];
        uint256 bal = token.balanceOf(a);
        if (bal == 0) return;
        vm.prank(a);
        token.transfer(b, bound(amount, 0, bal));
    }

    function claimCreator() external {
        address c = pool.creator();
        if (pool.creatorFeesOf(c) == 0) return;
        vm.prank(c);
        pool.claimCreatorFees(c);
    }

    function withdrawProtocol() external {
        if (pool.protocolFees() == 0) return;
        pool.withdrawProtocolFees();
    }

    function togglePause() external {
        bool isPaused = factory.paused();
        vm.prank(owner);
        if (isPaused) factory.unpause();
        else factory.pause();
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 0, 3));
    }
}

contract LaunchpadInvariantTest is Test {
    MockUSDG usdg;
    MockMigrator migrator;
    LaunchpadFactory factory;
    CurvePool pool;
    HoldrToken token;
    CurveHandler handler;
    address owner = makeAddr("owner");
    address creator = makeAddr("creator");

    function setUp() public {
        vm.warp(1_800_000_000);
        usdg = new MockUSDG();
        migrator = new MockMigrator(usdg);
        LaunchpadFactory.Config memory c;
        c.params = LaunchParams({
            gradThreshold: 10_000e6,
            firstBuyMaxTokens: 50_000_000 ether,
            migrator: address(migrator),
            feeBps: 100,
            creatorShareBps: 7_000,
            surchargeBps: [uint16(9_800), 2_475, 619, 155, 39]
        });
        c.launchFee = 0.0005 ether;
        c.treasury = makeAddr("treasury");
        factory = new LaunchpadFactory(owner, usdg, c, 0);

        address[] memory traders = new address[](5);
        traders[0] = creator;
        for (uint256 i = 1; i < 5; ++i) {
            traders[i] = address(uint160(0xBEEF00 + i));
        }
        for (uint256 i; i < 5; ++i) {
            usdg.mint(traders[i], 10_000_000e6);
        }
        vm.deal(creator, 1 ether);
        vm.startPrank(creator);
        usdg.approve(address(factory), 100e6);
        (address t, address p) = factory.createToken{value: 0.0005 ether}("Whale", "WHALE", "", 100e6, 0);
        vm.stopPrank();
        token = HoldrToken(t);
        pool = CurvePool(p);

        handler = new CurveHandler(factory, pool, usdg, owner, traders);
        targetContract(address(handler));
    }

    function _held() internal view returns (uint256 sum) {
        uint256 n = handler.tradersLength();
        for (uint256 i; i < n; ++i) {
            sum += token.balanceOf(handler.traders(i));
        }
    }

    /// The pool always holds enough USDG for the curve and every unclaimed fee.
    function invariant_solvent() public view {
        uint256 owed = pool.protocolFees() + pool.creatorFeesOf(creator);
        if (!pool.graduated()) owed += pool.realUsdg();
        assertGe(usdg.balanceOf(address(pool)), owed);
    }

    /// Selling every token in circulation at once never needs more USDG than the curve has.
    function invariant_everyoneCanExitTogether() public view {
        if (pool.graduated() || pool.tokensSold() == 0) return;
        (uint256 out, uint256 fee) = pool.quoteSell(pool.tokensSold());
        assertLe(out + fee, pool.realUsdg());
    }

    function invariant_kNeverDecreases() public view {
        assertFalse(handler.kDecreased());
        (uint256 x, uint256 y) = pool.reserves();
        assertGe(x * y, pool.virtualUsdg() * pool.initialVirtualTokens());
    }

    function invariant_supplyAndAccounting() public view {
        assertLe(pool.tokensSold(), pool.CURVE_SUPPLY());
        assertLe(pool.realUsdg(), pool.gradThreshold());
        assertEq(_held(), pool.tokensSold(), "tokens outside the pool = tokens sold");
        if (pool.graduated()) {
            assertEq(pool.realUsdg(), pool.gradThreshold());
            assertEq(token.totalSupply(), pool.tokensSold() + pool.LP_SUPPLY());
            assertEq(token.balanceOf(address(migrator)), pool.LP_SUPPLY());
            assertEq(usdg.balanceOf(address(migrator)), pool.gradThreshold());
        } else {
            assertEq(token.totalSupply(), 1_000_000_000 ether);
            assertEq(token.balanceOf(address(pool)), 1_000_000_000 ether - pool.tokensSold());
        }
    }

    function invariant_lastCurvePriceNotAboveUniswapOpen() public view {
        if (!pool.graduated()) return;
        (uint256 x, uint256 y) = pool.reserves();
        // x / y <= 10,000 USDG / 200M tokens
        assertLe(x * pool.LP_SUPPLY(), pool.gradThreshold() * y);
    }
}
