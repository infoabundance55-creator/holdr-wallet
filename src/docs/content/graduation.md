# Graduation

When a token's curve pool reaches **10,000 USDG**, the token graduates to Uniswap v4 automatically, in the same transaction as the buy that filled it.

## What happens, step by step

1. **The last buy is trimmed.** The buy that reaches 10,000 USDG only takes the USDG needed to fill the pool exactly; you are never charged for more.
2. **The curve closes.** No more buying or selling on the curve.
3. **Unsold tokens are burned.** Any tokens left on the curve (there are some only if anti-snipe surcharges were paid) are destroyed, reducing the total supply.
4. **The Uniswap pool is created.** Token / USDG, 1% fee, Holdr's official hook.
5. **Liquidity is added and locked forever.** 200,000,000 tokens and the 10,000 USDG are added across the full price range. The position is held by Holdr's liquidity locker, which has no function to remove it.

## Opening price

The pool opens at **0.00005 USDG** per token (10,000 USDG ÷ 200,000,000 tokens), a market cap of **$50,000**. The last price on the curve is never higher than this, so holders never see a drop at graduation. Tests check this exactly against the real pool for every allowed setting.

## The official pool

Anyone can create Uniswap pools, so look-alike pools can exist. The **official** pool is the one with Holdr's hook, and the Holdr app only uses that one. The hook does one thing: it lets only Holdr's locker create a pool with it. That stops anyone from setting up the official pool early at a wrong price. It never touches swaps or liquidity.

## After graduation

- Trade on Uniswap. The pool's 1% fee is split 70% creator, 30% Holdr. See [Fees](/docs/fees).
- Curve fees earned before graduation can still be claimed.

## Gas

The graduating buy does a lot more work than a normal buy: it creates the pool and adds liquidity. It costs about 515,000 gas, against about 24,000 for a normal buy. The Holdr app raises the gas limit automatically for buys close to graduation.

> **Note** Locked liquidity is permanent. Once graduated, the 200,000,000 tokens and 10,000 USDG stay in the pool forever. That means everyone who bought on the curve, selling together into Uniswap, would get back less than they paid in. That is the trade-off of liquidity nobody can ever pull. See [Launchpad risks](/docs/launchpad-risks).
