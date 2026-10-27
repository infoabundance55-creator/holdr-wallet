// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {HoldrGenesis} from "../src/HoldrGenesis.sol";

/// @notice Deploys HoldrGenesis. All addresses come from environment variables; no keys in code.
///   GENESIS_OWNER     Safe multisig that will own the contract
///   GENESIS_SIGNER    address of the server key that signs mint permits
///   GENESIS_ROYALTY   address that receives the 2.5% royalty
///   GENESIS_BASE_URI  metadata base URL, e.g. https://holdr-wallet.vercel.app/api/nft/
/// Run (testnet): forge script script/DeployGenesis.s.sol --rpc-url $RPC_URL --broadcast --private-key $DEPLOYER_KEY
contract DeployGenesis is Script {
    function run() external returns (HoldrGenesis nft) {
        address owner = vm.envAddress("GENESIS_OWNER");
        address signer = vm.envAddress("GENESIS_SIGNER");
        address royalty = vm.envAddress("GENESIS_ROYALTY");
        string memory baseURI = vm.envString("GENESIS_BASE_URI");

        vm.startBroadcast();
        nft = new HoldrGenesis(owner, signer, royalty, baseURI);
        vm.stopBroadcast();

        console.log("HoldrGenesis deployed at", address(nft));
    }
}
