# Contract reference

The functions and events you need to build on the Holdr launchpad. USDG has 6 decimals; tokens have 18.

## LaunchpadFactory

| Function | What it does |
|---|---|
| `createToken(name, symbol, metadataURI, firstBuyUsdg, minTokensOut)` | Launches a token. Send exactly `launchFee()` in ETH. For a first buy, approve the factory for `firstBuyUsdg` USDG first. Returns `(token, pool)`. |
| `poolOf(token)` | The token's curve pool |
| `config()` | Rules for new launches |
| `paused()`, `maxBuyUsdg()` | Emergency pause; per-buy cap (0 = none) |

Event: `TokenCreated(token, pool, creator, name, symbol, metadataURI, launchFee)`.

## CurvePool

| Function | What it does |
|---|---|
| `buy(usdgIn, minTokensOut, deadline)` | Buys with up to `usdgIn` USDG (fee included). Approve the pool for USDG first. |
| `sell(tokensIn, minUsdgOut, deadline)` | Sells tokens. No approval needed. |
| `quoteBuy(usdgIn)` | Returns USDG used, fee, surcharge, amount into the curve and tokens out |
| `quoteSell(tokensIn)` | Returns USDG out after fee, and the fee |
| `reserves()` | Curve reserves `x` (USDG) and `y` (tokens); spot price = x / y |
| `realUsdg()`, `tokensSold()`, `graduated()` | Progress towards graduation |
| `currentSurchargeBps()` | Anti-snipe surcharge for a buy now |
| `claimCreatorFees(to)` | Creator claims curve fees |
| `withdrawProtocolFees()` | Sends Holdr's share to the treasury (anyone) |
| `proposeCreator(next)`, `acceptCreator()` | Two-step creator handover |

Events: `Trade(trader, isBuy, usdgAmount, tokenAmount, fee, surcharge, realUsdgAfter, tokensSoldAfter)` and `Graduated(token, migrator, usdg, tokens, tokensBurned)`.

> **Note** After graduation, `realUsdg()` and `reserves()` keep their final values. Check `graduated()` first. A buy that will graduate the token needs a gas limit of about 800,000.

## HoldrLiquidityLocker

| Function | What it does |
|---|---|
| `poolKeyFor(token)` | The official Uniswap v4 pool key (token / USDG, fee 10000, tick spacing 200, Holdr hook) |
| `positionOf(token)` | The locked position |
| `collectFees(token)` | Pulls pool fees and splits them 70 / 30 (anyone) |
| `claim(currency, to)` | Creator claims collected fees in the token or USDG |
| `withdrawProtocolFees(currency)` | Sends Holdr's share to the treasury (anyone) |

Events: `Migrated(token, poolId, liquidity, sqrtPriceX96, usdgUsed, tokensUsed)` and `FeesCollected(token, creator, tokenFees, usdgFees)`.

## Indexing

List tokens only from the factory's `TokenCreated` events, and price graduated tokens only from `poolKeyFor(token)`. Look-alike tokens and pools can exist outside these.
