// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {LaunchpadFactory} from "../../src/launchpad/LaunchpadFactory.sol";
import {CurvePool} from "../../src/launchpad/CurvePool.sol";
import {HoldrToken} from "../../src/launchpad/HoldrToken.sol";
import {LaunchParams} from "../../src/launchpad/interfaces/ILaunchpad.sol";
import {MockUSDG, MockMigrator} from "../mocks/MockUSDG.sol";

/// One actor who is also the creator (so it gets 70% of fees back) trades alone with dust and
/// large amounts, across the surcharge window. It must never end with more USDG than it started.
contract SoloHandler is Test {
    CurvePool public pool;
    HoldrToken public token;
    MockUSDG public usdg;
    address public actor;
    uint256 public g;

    constructor(CurvePool p, MockUSDG u, address a) {
        pool = p;
        token = p.token();
        usdg = u;
        actor = a;
        g = p.gradThreshold();
    }

    function buy(uint256 amount, bool dust) external {
        if (pool.graduated()) return;
        amount = dust ? bound(amount, 1, 1_000) : bound(amount, 1, g / 3);
        vm.startPrank(actor);
        usdg.approve(address(pool), amount);
        try pool.buy(amount, 0, block.timestamp) {} catch {}
        vm.stopPrank();
    }

    function sell(uint256 amount, bool dust) external {
        if (pool.graduated()) return;
        uint256 bal = token.balanceOf(actor);
        if (bal == 0) return;
        amount = dust ? bound(amount, 1, bal < 1e15 ? bal : 1e15) : bound(amount, 1, bal);
        vm.prank(actor);
        try pool.sell(amount, 0, block.timestamp) {} catch {}
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 0, 2));
    }
}

abstract contract CurveExtremesBase is Test {
    MockUSDG usdg;
    LaunchpadFactory factory;
    CurvePool pool;
    HoldrToken token;
    SoloHandler handler;
    address creator = makeAddr("creator");
    uint256 constant START = 100_000_000e6;

    function _g() internal pure virtual returns (uint256);
    function _fee() internal pure virtual returns (uint16);

    function setUp() public {
        vm.warp(1_800_000_000);
        usdg = new MockUSDG();
        MockMigrator migrator = new MockMigrator(usdg);
        LaunchpadFactory.Config memory c;
        c.params = LaunchParams({
            gradThreshold: _g(),
            firstBuyMaxTokens: 100_000_000 ether,
            migrator: address(migrator),
            feeBps: _fee(),
            creatorShareBps: 10_000, // worst case: creator gets every fee back
            surchargeBps: [uint16(9_900 - _fee()), 2_475, 619, 155, 39]
        });
        c.treasury = makeAddr("treasury");
        factory = new LaunchpadFactory(makeAddr("owner"), usdg, c, 0);
        usdg.mint(creator, START);
        vm.startPrank(creator);
        usdg.approve(address(factory), type(uint256).max);
        (address t, address p) = factory.createToken("T", "T", "", _g() / 1000, 0);
        vm.stopPrank();
        token = HoldrToken(t);
        pool = CurvePool(p);
        handler = new SoloHandler(pool, usdg, creator);
        targetContract(address(handler));
    }

    /// value = USDG held + fees claimable + what selling every token would return now
    function invariant_soloActorNeverProfits() public view {
        uint256 value = usdg.balanceOf(creator) + pool.creatorFeesOf(creator);
        uint256 bal = token.balanceOf(creator);
        if (!pool.graduated() && bal > 0) {
            (uint256 out, uint256 fee) = pool.quoteSell(bal);
            value += out + fee; // fee comes back to the creator too
        }
        assertLe(value, START, "solo actor extracted value");
    }

    function invariant_solvent() public view {
        assertGe(
            usdg.balanceOf(address(pool)),
            (pool.graduated() ? 0 : pool.realUsdg()) + pool.creatorFeesOf(creator) + pool.protocolFees()
        );
        assertLe(pool.tokensSold(), pool.CURVE_SUPPLY());
    }
}

contract CurveExtremesMinGMaxFeeTest is CurveExtremesBase {
    function _g() internal pure override returns (uint256) {
        return 1_000e6;
    }

    function _fee() internal pure override returns (uint16) {
        return 500;
    }
}

contract CurveExtremesMaxGZeroFeeTest is CurveExtremesBase {
    function _g() internal pure override returns (uint256) {
        return 1_000_000e6;
    }

    function _fee() internal pure override returns (uint16) {
        return 0;
    }
}

contract CurveExtremesMinGZeroFeeTest is CurveExtremesBase {
    function _g() internal pure override returns (uint256) {
        return 1_000e6;
    }

    function _fee() internal pure override returns (uint16) {
        return 0;
    }
}
