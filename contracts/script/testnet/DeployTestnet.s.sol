// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {LaunchpadFactory} from "../../src/launchpad/LaunchpadFactory.sol";
import {HoldrLiquidityLocker} from "../../src/launchpad/HoldrLiquidityLocker.sol";
import {LaunchParams} from "../../src/launchpad/interfaces/ILaunchpad.sol";
import {HookMiner} from "../HookMiner.sol";
import {TestUSDG} from "./TestUSDG.sol";

/// @notice TESTNET deployment of the launchpad on Robinhood Chain testnet (46630):
///         a PoolManager copy, a free-mint test USDG, the locker (+ hook) and the factory.
///         The deployer is the owner and the treasury (testnet only). Addresses are written to
///         deployments/46630.json.
/// Env (all optional): MAX_BUY_USDG (default 0 = no cap)
contract DeployTestnet is Script {
    function run() external {
        require(block.chainid == 46630, "Robinhood Chain testnet only");
        uint256 maxBuy = vm.envOr("MAX_BUY_USDG", uint256(0));

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        console.log("deployer", deployer, "balance (wei)", deployer.balance);

        IPoolManager pm = IPoolManager(vm.deployCode("out/PoolManager.sol/PoolManager.json", abi.encode(deployer)));
        TestUSDG usdg = new TestUSDG();

        address predicted = vm.computeCreateAddress(deployer, vm.getNonce(deployer));
        (bytes32 salt, address hook) = HookMiner.find(predicted, pm);
        HoldrLiquidityLocker locker = new HoldrLiquidityLocker(pm, address(usdg), salt);
        require(address(locker) == predicted && address(locker.hook()) == hook, "address prediction failed");

        LaunchpadFactory.Config memory c;
        c.params = LaunchParams({
            gradThreshold: 10_000e6,
            firstBuyMaxTokens: 50_000_000 ether,
            migrator: address(locker),
            feeBps: 100,
            creatorShareBps: 7_000,
            surchargeBps: [uint16(9_800), 2_475, 619, 155, 39]
        });
        c.launchFee = 0.0005 ether;
        c.treasury = deployer;
        LaunchpadFactory factory = new LaunchpadFactory(deployer, IERC20(address(usdg)), c, maxBuy);
        locker.setFactory(address(factory));
        vm.stopBroadcast();

        string memory o = "deploy";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "deployer", deployer);
        vm.serializeAddress(o, "poolManager", address(pm));
        vm.serializeAddress(o, "testUsdg", address(usdg));
        vm.serializeAddress(o, "liquidityLocker", address(locker));
        vm.serializeAddress(o, "launchHook", hook);
        string memory json = vm.serializeAddress(o, "launchpadFactory", address(factory));
        vm.writeJson(json, "deployments/46630.json");

        console.log("PoolManager      ", address(pm));
        console.log("TestUSDG         ", address(usdg));
        console.log("LiquidityLocker  ", address(locker));
        console.log("LaunchHook       ", hook);
        console.log("LaunchpadFactory ", address(factory));
    }
}
