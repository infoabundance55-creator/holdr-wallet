// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {HoldrTestnetRouter} from "./HoldrTestnetRouter.sol";

/// @notice TESTNET: deploys the swap router the website uses for graduated tokens, next to the
///         PoolManager copy in deployments/46630.json, and adds its address there as "swapRouter".
contract DeployRouter is Script {
    function run() external {
        require(block.chainid == 46630, "Robinhood Chain testnet only");
        string memory path = "deployments/46630.json";
        address pm = vm.parseJsonAddress(vm.readFile(path), ".poolManager");
        require(pm.code.length > 0, "no PoolManager at the saved address");

        vm.startBroadcast();
        HoldrTestnetRouter router = new HoldrTestnetRouter(IPoolManager(pm));
        vm.stopBroadcast();

        // rewrite the file with every saved field plus swapRouter
        string memory saved = vm.readFile(path);
        string memory o = "deploy";
        vm.serializeUint(o, "chainId", vm.parseJsonUint(saved, ".chainId"));
        string[5] memory keys = ["deployer", "poolManager", "testUsdg", "liquidityLocker", "launchHook"];
        for (uint256 i; i < keys.length; ++i) {
            vm.serializeAddress(o, keys[i], vm.parseJsonAddress(saved, string.concat(".", keys[i])));
        }
        vm.serializeAddress(o, "launchpadFactory", vm.parseJsonAddress(saved, ".launchpadFactory"));
        vm.writeJson(vm.serializeAddress(o, "swapRouter", address(router)), path);
        console.log("HoldrTestnetRouter", address(router));
    }
}
