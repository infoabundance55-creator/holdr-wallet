# Holdr contracts

Smart contracts for Holdr on Robinhood Chain. Built with [Foundry](https://getfoundry.sh) and OpenZeppelin Contracts 5.4.

| Contract | Status | What it does |
| --- | --- | --- |
| `HoldrGenesis` | written, tested, not deployed | 5,000 free-mint characters in 5 waves, commit-reveal randomness, equip with a 7-day cooldown, 2.5% royalty |
| Launchpad (factory, curve, migrator, hook, locker) | next | bonding-curve token launches that graduate to Uniswap v4 |

The full design is in the contract design doc (Holdr project docs).

## Commands

```sh
git submodule update --init --recursive
cd contracts
forge build
forge test                      # unit, fuzz and invariant tests
FOUNDRY_PROFILE=ci forge test   # 10,000 fuzz runs
forge coverage --ir-minimum
```

## Deploying HoldrGenesis

Never put a private key in code, chat or git. Set these as environment variables (or CI secrets):

```sh
export GENESIS_OWNER=0x...     # Safe multisig
export GENESIS_SIGNER=0x...    # server key that signs mint permits
export GENESIS_ROYALTY=0x...   # royalty receiver
export GENESIS_BASE_URI=https://holdr-wallet.vercel.app/api/nft/
forge script script/DeployGenesis.s.sol --rpc-url $RPC_URL --broadcast --private-key $DEPLOYER_KEY
```

After deploying, the owner opens wave 1 with `openWave(startTime)`.

## Trust assumptions (HoldrGenesis)

- The permit signer decides who may mint; it cannot mint for itself more than one per wallet, change odds, or touch anyone's token.
- Randomness: the server commits to its seed before the mint and the minter adds a seed, so neither picks the result alone. The server still knows its own seeds, so it could grind outcomes for wallets it controls; this is a known limit until a VRF is available on Robinhood Chain.
- If the server does not reveal within 1 hour, anyone can reveal with `fallbackReveal`.
