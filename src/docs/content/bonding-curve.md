# Bonding curve and price

Before graduation, every Holdr token trades against its own **curve pool** rather than an order book. The pool always quotes a price, so you can buy or sell at any time, and the price rises as more tokens are bought.

## How the price works

The curve is a constant-product curve with a **virtual USDG reserve**, the same family as pump.fun:

- **x** = virtual USDG + real USDG in the pool
- **y** = tokens still on the curve (virtual)
- **x × y** never goes down, and **price = x ÷ y**

The virtual reserve sets the opening price and keeps the curve smooth. Its size is chosen so the **last curve price equals the Uniswap opening price**: at graduation the price never drops.

| Parameter | Value |
|---|---|
| Virtual USDG | 3,333.33 (graduation threshold ÷ 3) |
| Initial virtual tokens | about 1,066,666,667 |
| Opening price | 0.000003125 USDG |
| Graduation | 10,000 USDG raised, about 800,000,000 tokens sold |
| Price at graduation | 0.00005 USDG (10,000 USDG ÷ 200,000,000 tokens) |

## Price as the curve fills

Market cap = price × 1,000,000,000 tokens.

| USDG raised | Progress | Tokens sold | Price (USDG) | Market cap |
|---|---|---|---|---|
| 0 | 0% | 0 | 0.000003125 | $3,125 |
| 1,000 | 10% | 246M | 0.00000528 | $5,281 |
| 2,500 | 25% | 457M | 0.00000957 | $9,570 |
| 5,000 | 50% | 640M | 0.0000195 | $19,531 |
| 7,500 | 75% | 739M | 0.0000330 | $33,008 |
| 10,000 | 100% | 800M | 0.00005 | $50,000 |

Example: a $100 buy at the open (after the first 5 seconds) puts $99 into the curve after the 1% fee and gets about 30.77 million tokens, 3.1% of the supply.

## Buying and selling

- **Buy:** you pay USDG. 1% goes to fees; the rest goes into the curve and you receive tokens.
- **Sell:** you return tokens and the curve pays USDG; 1% of that goes to fees.
- **Slippage and deadline:** every trade sets the least you will accept and a deadline, so a trade that would fill at a much worse price, or too late, fails instead. The app's default slippage is 2%.
- **No approval needed to sell:** a token's own curve pool can take back the tokens you sell without a separate approval transaction.

## Why the pool can always pay

Every calculation rounds in the pool's favour, so x × y can only grow. That guarantees the pool always holds enough USDG for every holder to sell back at once, before graduation. This is checked by invariant tests that run thousands of random trading sequences (see [Security reviews](/docs/security-reviews)).
