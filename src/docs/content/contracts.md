# Contract addresses

All Holdr contracts are open source. Check addresses here before you interact with anything.

## Robinhood Chain testnet (46630)

| Contract | Address |
|---|---|
| LaunchpadFactory | [0x662e5A937C762Cc624e7fCdaC0Bc3992F8e72Fa9](https://explorer.testnet.chain.robinhood.com/address/0x662e5A937C762Cc624e7fCdaC0Bc3992F8e72Fa9) |
| HoldrLiquidityLocker | [0x62ba0bdd2cE287854907677Ef0577FF2BB313faf](https://explorer.testnet.chain.robinhood.com/address/0x62ba0bdd2cE287854907677Ef0577FF2BB313faf) |
| HoldrLaunchHook | [0x5aeA1537Dd78ba39A09BF65d48Cc41862e42e000](https://explorer.testnet.chain.robinhood.com/address/0x5aeA1537Dd78ba39A09BF65d48Cc41862e42e000) |
| Uniswap v4 PoolManager (testnet copy) | [0xF8d1C31c9C9f4f8327FC0AE25d6f163489cCC7F3](https://explorer.testnet.chain.robinhood.com/address/0xF8d1C31c9C9f4f8327FC0AE25d6f163489cCC7F3) |
| Test USDG (free to mint) | [0xf820a6e153452B6699Ce9BD794C78E644284F033](https://explorer.testnet.chain.robinhood.com/address/0xf820a6e153452B6699Ce9BD794C78E644284F033) |

Each launched token and its curve pool get their own addresses. The factory's `TokenCreated` event and `poolOf(token)` list the real ones.

## Robinhood Chain mainnet (4663)

Holdr's contracts are **not deployed on mainnet yet**. The launchpad will use these existing contracts:

| Contract | Address |
|---|---|
| USDG (Paxos) | [0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168](https://robinhoodchain.blockscout.com/address/0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168) |
| Uniswap v4 PoolManager | [0x8366a39cc670b4001a1121b8f6a443a643e40951](https://robinhoodchain.blockscout.com/address/0x8366a39cc670b4001a1121b8f6a443a643e40951) |

## Source code

- Contracts: [`contracts/`](https://github.com/infoabundance55-creator/holdr-wallet/tree/contracts/contracts) on GitHub (Solidity, Foundry)
- Built with OpenZeppelin Contracts 5.4 and Uniswap v4-core v4.0.0
