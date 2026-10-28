// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {LaunchpadFactory} from "../../src/launchpad/LaunchpadFactory.sol";
import {CurvePool} from "../../src/launchpad/CurvePool.sol";
import {HoldrToken} from "../../src/launchpad/HoldrToken.sol";
import {HoldrLiquidityLocker} from "../../src/launchpad/HoldrLiquidityLocker.sol";
import {LaunchParams} from "../../src/launchpad/interfaces/ILaunchpad.sol";
import {HookMiner} from "../../script/HookMiner.sol";
import {MockUSDG} from "../mocks/MockUSDG.sol";
import {SwapHelper} from "./Graduation.t.sol";

/// @dev After graduation: random swaps, fee collections, claims and creator changes.
contract LockerHandler is Test {
    HoldrLiquidityLocker public locker;
    SwapHelper public swapper;
    HoldrToken public token;
    CurvePool public pool;
    MockUSDG public usdg;
    PoolKey internal key;
    address[] public traders;
    address[] public creators; // everyone who has ever been creator

    constructor(HoldrLiquidityLocker l, SwapHelper s, HoldrToken t, CurvePool p, MockUSDG u, address[] memory tr) {
        locker = l;
        swapper = s;
        token = t;
        pool = p;
        usdg = u;
        traders = tr;
        key = l.poolKeyFor(address(t));
        creators.push(p.creator());
    }

    function creatorsLength() external view returns (uint256) {
        return creators.length;
    }

    function buy(uint256 who, uint256 amount) external {
        address t = traders[who % traders.length];
        amount = bound(amount, 1e6, 50_000e6);
        vm.startPrank(t);
        usdg.approve(address(swapper), amount);
        swapper.swap(key, Currency.unwrap(key.currency0) == address(usdg), amount);
        vm.stopPrank();
    }

    function sell(uint256 who, uint256 amount) external {
        address t = traders[who % traders.length];
        uint256 bal = token.balanceOf(t);
        if (bal < 1e18) return;
        amount = bound(amount, 1e18, bal);
        vm.startPrank(t);
        token.approve(address(swapper), amount);
        swapper.swap(key, Currency.unwrap(key.currency0) == address(token), amount);
        vm.stopPrank();
    }

    function collect() external {
        locker.collectFees(address(token));
    }

    function claim(uint256 who, bool inUsdg) external {
        address c = creators[who % creators.length];
        address currency = inUsdg ? address(usdg) : address(token);
        if (locker.owed(c, currency) == 0) return;
        vm.prank(c);
        locker.claim(currency, c);
    }

    function withdrawProtocol(bool inUsdg) external {
        address currency = inUsdg ? address(usdg) : address(token);
        if (locker.protocolOwed(currency) == 0) return;
        locker.withdrawProtocolFees(currency);
    }

    function changeCreator(uint256 who) external {
        address next = traders[who % traders.length];
        address current = pool.creator();
        if (next == current) return;
        vm.prank(current);
        pool.proposeCreator(next);
        vm.prank(next);
        pool.acceptCreator();
        creators.push(next);
    }
}

contract LockerInvariantTest is Test {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    IPoolManager pm;
    MockUSDG usdg;
    HoldrLiquidityLocker locker;
    HoldrToken token;
    CurvePool pool;
    LockerHandler handler;
    uint128 lockedLiquidity;

    function setUp() public {
        vm.warp(1_800_000_000);
        pm = IPoolManager(deployCode("out/PoolManager.sol/PoolManager.json", abi.encode(address(this))));
        usdg = new MockUSDG();
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        (bytes32 salt,) = HookMiner.find(predicted, pm);
        locker = new HoldrLiquidityLocker(pm, address(usdg), salt);

        LaunchpadFactory.Config memory c;
        c.params = LaunchParams({
            gradThreshold: 10_000e6,
            firstBuyMaxTokens: 50_000_000 ether,
            migrator: address(locker),
            feeBps: 100,
            creatorShareBps: 7_000,
            surchargeBps: [uint16(9_800), 2_475, 619, 155, 39]
        });
        c.launchFee = 0;
        c.treasury = makeAddr("treasury");
        LaunchpadFactory factory = new LaunchpadFactory(makeAddr("owner"), usdg, c, 0);
        locker.setFactory(address(factory));

        address[] memory traders = new address[](4);
        for (uint256 i; i < 4; ++i) {
            traders[i] = address(uint160(0xA000 + i));
            usdg.mint(traders[i], 100_000_000e6);
        }
        vm.prank(traders[0]);
        (address t, address p) = factory.createToken("Whale", "WHALE", "", 0, 0);
        token = HoldrToken(t);
        pool = CurvePool(p);
        vm.warp(block.timestamp + 5);
        vm.startPrank(traders[1]);
        usdg.approve(p, 20_000e6);
        pool.buy(20_000e6, 0, block.timestamp);
        vm.stopPrank();
        require(pool.graduated(), "not graduated");
        lockedLiquidity = locker.positionOf(t).liquidity;

        SwapHelper swapper = new SwapHelper(pm);
        handler = new LockerHandler(locker, swapper, token, pool, usdg, traders);
        targetContract(address(handler));
    }

    /// The locked position never shrinks and is the only liquidity in the pool.
    function invariant_liquidityLockedForever() public view {
        PoolKey memory key = locker.poolKeyFor(address(token));
        assertEq(locker.positionOf(address(token)).liquidity, lockedLiquidity);
        assertEq(pm.getLiquidity(key.toId()), lockedLiquidity);
    }

    /// The locker always holds what it owes to creators and the platform.
    function invariant_lockerCoversWhatItOwes() public view {
        uint256 owedUsdg = locker.protocolOwed(address(usdg));
        uint256 owedTokens = locker.protocolOwed(address(token));
        uint256 n = handler.creatorsLength();
        for (uint256 i; i < n; ++i) {
            address c = handler.creators(i);
            // a wallet can appear more than once in the list; count it once
            bool dup;
            for (uint256 j; j < i; ++j) {
                if (handler.creators(j) == c) dup = true;
            }
            if (dup) continue;
            owedUsdg += locker.owed(c, address(usdg));
            owedTokens += locker.owed(c, address(token));
        }
        assertGe(usdg.balanceOf(address(locker)), owedUsdg);
        assertGe(token.balanceOf(address(locker)), owedTokens);
    }

    function invariant_supplyNeverGrows() public view {
        assertLe(token.totalSupply(), 1_000_000_000 ether);
        assertEq(IERC20(address(token)).balanceOf(address(pool)), 0);
    }
}
