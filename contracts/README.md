# Holdr contracts

Smart contracts for Holdr on Robinhood Chain. Built with [Foundry](https://getfoundry.sh), OpenZeppelin Contracts 5.4 and Uniswap v4-core v4.0.0 (tests run against the real PoolManager).

| Contract | Status | What it does |
| --- | --- | --- |
| `HoldrGenesis` | written, tested, not deployed | 5,000 free-mint characters in 5 waves, commit-reveal randomness, equip with a 7-day cooldown, 2.5% royalty |
| `LaunchpadFactory`, `HoldrToken`, `CurvePool` | written, tested, not deployed | token launches on a USDG bonding curve: 1% fee (70% creator / 30% platform), 5-second anti-snipe surcharge, graduation at 10,000 USDG |
| `HoldrLiquidityLocker`, `HoldrLaunchHook` | written, tested, not deployed | at graduation: open the official Uniswap v4 pool (1% fee), add the liquidity full range and lock it forever; split pool fees 70 / 30 |

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

## Launchpad (step 1)

- `LaunchpadFactory.createToken` clones a `HoldrToken` (1B supply, no owner, no tax) and a `CurvePool`, and copies the current rules into the pool. Later rule changes never affect launched tokens.
- Curve: constant product with a virtual USDG reserve of G / 3 (G = graduation threshold), so the last curve price equals the Uniswap opening price G / 200M. At G = 10,000 USDG the opening market cap is $3,125 and the graduation market cap is $50,000.
- Every trade rounds in the pool's favour and fees round up, so x * y never goes down and the pool can always pay out every holder at once (checked by invariant tests).
- Anti-snipe: buys in seconds 0-4 after launch pay 98% / 24.75% / 6.19% / 1.55% / 0.39% on top of the 1% fee. The surcharge stays in the curve (it raises the price for all holders). The creator's first buy in the launch transaction is exempt and capped at 50M tokens.
- Graduation happens inside the buy that reaches G: only the USDG needed is taken, unsold curve tokens are burned, and 200M tokens plus G USDG go to the migrator.
- Owner (Safe): rule changes wait 48 hours; pausers can stop launches and buys at once (never sells or claims); the per-buy cap can only be raised or removed; renouncing is disabled.
- Creators claim their fee share with `claimCreatorFees(to)`; anyone can push platform fees to the treasury with `withdrawProtocolFees()`.
- USDG is upgradeable and its issuer can freeze or seize balances; the pools hold USDG, so that is an accepted external risk.

## Launchpad (step 2): Uniswap v4

- `HoldrLiquidityLocker` is the migrator and the locker in one contract. When a curve graduates, it creates the official pool (token / USDG, fee 1%, tick spacing 200, `HoldrLaunchHook`) at price 10,000 USDG / 200M tokens, adds both as full-range liquidity and keeps the position itself. There is no function to remove liquidity, and the position is not an NFT, so it cannot be transferred.
- Rounding dust from adding liquidity: leftover tokens are burned, leftover USDG goes to the platform.
- `collectFees(token)` (anyone): pulls the pool fees and splits them with the token's curve share (70% to the current creator, 30% to the platform), in both the token and USDG. Creators `claim(currency, to)`; anyone can push the platform share to the treasury with `withdrawProtocolFees(currency)`.
- `HoldrLaunchHook` only implements `beforeInitialize`: nobody but the locker can create a pool with this hook, so nobody can open the official pool early at a wrong price. It never touches swaps or liquidity. Look-alike pools without the hook can exist; the Holdr app only uses the official one (`poolKeyFor(token)`).
- The hook address must have exactly the `BEFORE_INITIALIZE` flag in its lowest 14 bits. The locker deploys it with CREATE2 using a salt found by `script/HookMiner.sol`.
- Tested against the real Uniswap v4 PoolManager (compiled from v4-core v4.0.0), with USDG as currency0 and as currency1.

## Deploying the launchpad

```sh
export POOL_MANAGER=0x...      # Uniswap v4 PoolManager on the chain (mainnet: 0x8366a39cc670b4001a1121b8f6a443a643e40951)
export USDG=0x...              # mainnet: 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168
export LAUNCHPAD_OWNER=0x...   # Safe multisig
export TREASURY=0x...
export MAX_BUY_USDG=500000000  # $500 per buy at launch; can only be raised or removed later
forge script script/DeployLaunchpad.s.sol --rpc-url $RPC_URL --broadcast --private-key $DEPLOYER_KEY
```

The script deploys the locker (which deploys the hook), then the factory, and links them. The deployer key needs only gas; it has no role afterwards.

## Security review (launchpad, 2026-10-28)

An independent AI review of all launchpad contracts found no critical or high issues. Fixed:

- **M-1** The migrator could be changed through the timelock, sending future launches' graduation money elsewhere. Now the migrator is fixed when the factory is deployed (`LaunchpadFactory.migrator`); rule changes cannot touch it.
- **L-1** A locker not linked to the factory would have made graduation impossible. `createToken` now reverts unless `migrator.factory() == factory`.
- **L-3** Uniswap fees not yet collected at a creator handover would have gone to the new creator. `acceptCreator` now collects them first.
- **I-1** Price continuity is now strict: the virtual USDG reserve is G / 3 rounded down plus 1, and the locker rounds the opening price up in USDG terms. Tests check it against the real pool's `sqrtPrice` for every G (1,000 to 1,000,000 USDG), every fee (0 to 5%) and both currency orders.

The reviewer's proof-of-concept fuzz tests are now part of the suite (`GraduationRange.t.sol`, `CurveExtremes.invariant.t.sol`).

## Trust assumptions and notes for the app (launchpad)

- **Graduating buy gas:** the buy that triggers graduation costs about 515k gas, against about 24k for a normal buy. When `realUsdg + toCurve` is close to the threshold, the app must set a gas limit of at least 800k.
- **Pause** stops launches and buys, so it also stops graduation; sells and claims always work. Only the Safe can unpause, so pausers should be keys the Safe owner controls.
- **Per-buy cap** is per call: several calls in one transaction get around it. It limits mistakes, not whales.
- **Donations are lost:** USDG sent straight to a curve pool, or anything sent to the locker, cannot be recovered. Tokens sent to a curve pool are burned at graduation.
- **After graduation**, `realUsdg` and `reserves()` keep their final values; the app must check `graduated()`.
- **The curve's allowance** shows as unlimited and cannot be removed in wallet approval scanners. That is safe: the curve only pulls from whoever calls `sell`, and selling stops at graduation.
- **The official pool** is `locker.poolKeyFor(token)`. Anyone can add their own liquidity to it, and look-alike pools or fake curve pools can exist. The app and indexer only list tokens from the factory's `TokenCreated` events.
- **Locked liquidity:** once graduated, the 200M tokens and G USDG stay in the pool forever, so if every curve buyer sold into Uniswap together they would get back about 80% of G, not 100% as on the curve. This is the cost of permanently locked liquidity.
