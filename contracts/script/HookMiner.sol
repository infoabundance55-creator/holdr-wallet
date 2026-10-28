// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HoldrLaunchHook} from "../src/launchpad/HoldrLaunchHook.sol";

/// @notice Finds a CREATE2 salt that gives HoldrLaunchHook an address whose lowest 14 bits are
///         exactly the BEFORE_INITIALIZE flag. The hook is deployed by the locker, so `locker` is
///         the locker's (future) address. About 1 in 16,384 salts works.
library HookMiner {
    uint160 internal constant FLAGS = Hooks.BEFORE_INITIALIZE_FLAG;

    error SaltNotFound();

    function find(address locker, IPoolManager poolManager) internal pure returns (bytes32 salt, address hook) {
        bytes32 initCodeHash =
            keccak256(abi.encodePacked(type(HoldrLaunchHook).creationCode, abi.encode(address(poolManager))));
        for (uint256 i; i < 400_000; ++i) {
            salt = bytes32(i);
            hook = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), locker, salt, initCodeHash)))));
            if (uint160(hook) & Hooks.ALL_HOOK_MASK == FLAGS) return (salt, hook);
        }
        revert SaltNotFound();
    }
}
