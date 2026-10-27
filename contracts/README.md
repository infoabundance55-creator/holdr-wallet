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
- **Randomness trusts the Holdr server.** The server commits to its seed before the mint and the minter adds a seed, so a minter cannot pick a result. The server knows its own seeds, so it could steer outcomes for wallets it controls. Neither Chainlink VRF nor Pyth Entropy runs on Robinhood Chain today; switch when one does.
- The deck is an urn draw: each reveal picks from what is left, so the final split is exactly 1,500 / 1,500 / 1,500 / 500.
- **Fallback.** If the server has not revealed a token 1 hour after mint, anyone can call `requestFallback(id)`, then `fallbackReveal(id)` from the next L2 block on. The result uses the hash of the L2 block after the request (via the ArbSys precompile), which nobody knows at request time. A request that is not finished within 256 blocks expires and can be made again. Once requested, the server can no longer reveal that token.
- The server should reveal in mint order and handle each reveal on its own in a batch (one failure must not block the rest), and use a fresh commitment for every permit.
- Smart-contract wallets mint for themselves: the permit's `to` must be the wallet that calls `mint`.
- Equip: a manual change starts a 7-day cooldown. Sending away the equipped character unequips it; receiving one auto-equips it only when nothing is equipped and no cooldown is running. Transfers to yourself change nothing.
- The owner can open the 5 waves (start at most a year ahead), move the latest wave before it starts, pause new mints, rotate the signer, change the metadata URL and set royalties up to 2.5%. It cannot renounce, mint, or change a revealed character.
