// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {LaunchpadFactory} from "../src/launchpad/LaunchpadFactory.sol";
import {HoldrLiquidityLocker} from "../src/launchpad/HoldrLiquidityLocker.sol";
import {LaunchParams} from "../src/launchpad/interfaces/ILaunchpad.sol";
import {HookMiner} from "./HookMiner.sol";

/// @notice Deploys the launchpad: locker (which deploys the hook), then the factory, then links them.
///         All addresses come from environment variables; no keys in code.
///   POOL_MANAGER       Uniswap v4 PoolManager on this chain
///   USDG               USDG token on this chain
///   LAUNCHPAD_OWNER    Safe multisig that will own the factory
///   TREASURY           receives platform fees
///   MAX_BUY_USDG       per-buy cap in USDG units (6 decimals), e.g. 500000000 for $500; 0 = none
/// Run (testnet): forge script script/DeployLaunchpad.s.sol --rpc-url $RPC_URL --broadcast --private-key $DEPLOYER_KEY
contract DeployLaunchpad is Script {
    function run() external returns (HoldrLiquidityLocker locker, LaunchpadFactory factory) {
        IPoolManager pm = IPoolManager(vm.envAddress("POOL_MANAGER"));
        address usdg = vm.envAddress("USDG");
        address owner = vm.envAddress("LAUNCHPAD_OWNER");
        address treasury = vm.envAddress("TREASURY");
        uint256 maxBuy = vm.envUint("MAX_BUY_USDG");
        require(address(pm).code.length > 0, "no PoolManager at POOL_MANAGER");
        require(usdg.code.length > 0, "no token at USDG");

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        address predicted = vm.computeCreateAddress(deployer, vm.getNonce(deployer));
        (bytes32 salt, address hook) = HookMiner.find(predicted, pm);

        locker = new HoldrLiquidityLocker(pm, usdg, salt);
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
        c.treasury = treasury;
        factory = new LaunchpadFactory(owner, IERC20(usdg), c, maxBuy);
        locker.setFactory(address(factory));
        vm.stopBroadcast();

        console.log("HoldrLiquidityLocker", address(locker));
        console.log("HoldrLaunchHook     ", hook);
        console.log("LaunchpadFactory    ", address(factory));
    }
}
