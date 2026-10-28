// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LaunchpadFactory} from "../../src/launchpad/LaunchpadFactory.sol";
import {CurvePool} from "../../src/launchpad/CurvePool.sol";
import {HoldrLiquidityLocker} from "../../src/launchpad/HoldrLiquidityLocker.sol";
import {TestUSDG} from "./TestUSDG.sol";
import {TestnetSwapper} from "./TestnetSwapper.sol";

/// @notice TESTNET walkthrough of the whole launchpad with one wallet: get test USDG, launch a
///         token with a first buy, buy, sell half, buy to graduation, trade on Uniswap, collect
///         and claim fees. Reads deployments/46630.json, writes deployments/46630-smoke.json.
///         Run launch(), wait over 5 seconds, then trade(). On-chain results are read back by the workflow.
contract SmokeTestnet is Script {
    function _deployments()
        internal
        view
        returns (LaunchpadFactory factory, HoldrLiquidityLocker locker, TestUSDG usdg, IPoolManager pm)
    {
        require(block.chainid == 46630, "Robinhood Chain testnet only");
        string memory d = vm.readFile("deployments/46630.json");
        factory = LaunchpadFactory(vm.parseJsonAddress(d, ".launchpadFactory"));
        locker = HoldrLiquidityLocker(vm.parseJsonAddress(d, ".liquidityLocker"));
        usdg = TestUSDG(vm.parseJsonAddress(d, ".testUsdg"));
        pm = IPoolManager(vm.parseJsonAddress(d, ".poolManager"));
    }

    /// Part 1: get test USDG and launch a token with a 50 USDG first buy (no surcharge, ~15.6M tokens).
    function launch() external {
        (LaunchpadFactory factory,, TestUSDG usdg,) = _deployments();
        vm.startBroadcast();
        usdg.faucet(30_000e6);
        usdg.approve(address(factory), 50e6);
        (address token, address p) = factory.createToken{value: factory.launchFee()}(
            "Holdr Smoke Test", "SMOKE", "ipfs://holdr-smoke-test", 50e6, 0
        );
        vm.stopBroadcast();

        string memory o = "smoke";
        vm.serializeAddress(o, "token", token);
        string memory json = vm.serializeAddress(o, "curvePool", p);
        vm.writeJson(json, "deployments/46630-smoke.json");
        console.log("token", token);
        console.log("curve pool", p);
    }

    /// Part 2 (run after the 5-second anti-snipe window): buy, sell half, buy to graduation,
    /// trade on the official Uniswap v4 pool, then collect and claim all fees.
    function trade() external {
        (, HoldrLiquidityLocker locker, TestUSDG usdg, IPoolManager pm) = _deployments();
        string memory s = vm.readFile("deployments/46630-smoke.json");
        address token = vm.parseJsonAddress(s, ".token");
        CurvePool pool = CurvePool(vm.parseJsonAddress(s, ".curvePool"));
        require(pool.currentSurchargeBps() == 0, "still inside the anti-snipe window");

        vm.startBroadcast();
        (, address me,) = vm.readCallers();
        usdg.approve(address(pool), type(uint256).max);
        uint256 bought = pool.buy(1_000e6, 0, block.timestamp + 10 minutes);
        pool.sell(bought / 2, 0, block.timestamp + 10 minutes);
        pool.buy(20_000e6, 0, block.timestamp + 10 minutes); // only the USDG needed is taken
        require(pool.graduated(), "did not graduate");

        TestnetSwapper swapper = new TestnetSwapper(pm);
        PoolKey memory key = locker.poolKeyFor(token);
        bool usdgIs0 = Currency.unwrap(key.currency0) == address(usdg);
        usdg.approve(address(swapper), 100e6);
        swapper.swap(key, usdgIs0, 100e6);
        IERC20(token).approve(address(swapper), 1_000_000 ether);
        swapper.swap(key, !usdgIs0, 1_000_000 ether);

        pool.claimCreatorFees(me);
        pool.withdrawProtocolFees();
        locker.collectFees(token);
        locker.claim(address(usdg), me);
        locker.claim(token, me);
        locker.withdrawProtocolFees(address(usdg));
        locker.withdrawProtocolFees(token);
        vm.stopBroadcast();

        string memory o = "smoke2";
        vm.serializeAddress(o, "token", token);
        vm.serializeAddress(o, "curvePool", address(pool));
        vm.serializeAddress(o, "swapper", address(swapper));
        string memory json = vm.serializeBytes32(o, "uniswapPoolId", keccak256(abi.encode(key)));
        vm.writeJson(json, "deployments/46630-smoke.json");
    }
}
