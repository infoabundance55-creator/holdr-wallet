// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.26;

// Makes Foundry compile the real Uniswap v4 PoolManager (solc 0.8.26) so tests can deploy it
// with deployCode("PoolManager.sol:PoolManager").
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
