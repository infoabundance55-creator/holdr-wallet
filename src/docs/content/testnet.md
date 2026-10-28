# Testnet

Holdr runs on **Robinhood Chain**, an Ethereum layer 2 built on Arbitrum. Before mainnet, everything is tested on Robinhood Chain testnet, where tokens have no value.

## Network details

| | Testnet | Mainnet |
|---|---|---|
| Chain ID | 46630 | 4663 |
| Gas token | ETH (test) | ETH |
| Explorer | [explorer.testnet.chain.robinhood.com](https://explorer.testnet.chain.robinhood.com) | [robinhoodchain.blockscout.com](https://robinhoodchain.blockscout.com) |
| RPC | `https://rpc.testnet.chain.robinhood.com` | `https://rpc.mainnet.chain.robinhood.com` |

## What is different on testnet

- **USDG.** The launchpad uses Holdr's free **Test USDG** instead of real USDG. Mainnet uses USDG issued by Paxos.
- **Uniswap v4.** Uniswap has no official v4 deployment on Robinhood testnet, so Holdr deployed a copy of the same version (v4-core v4.0.0). On mainnet, Holdr uses Uniswap's official PoolManager.
- **Admin.** On testnet the admin and the treasury are a single test wallet. On mainnet they are a 2-of-3 Safe multisig. See [Admin controls](/docs/admin-controls).

All testnet addresses are on [Contract addresses](/docs/contracts).

## Why test first

Real users trying real flows find problems no test suite does. During testnet, everything resets freely: if something needs fixing, Holdr redeploys and you start again with new test funds.
