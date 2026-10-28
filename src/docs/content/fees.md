# Fees

Holdr charges one simple fee, the same for every token.

## On the bonding curve

Every buy and every sell pays **1%**, in USDG:

| | Fee | Creator (70%) | Holdr (30%) | Into the curve |
|---|---|---|---|---|
| Buy $100 | $1.00 | $0.70 | $0.30 | $99.00 |
| Sell, $100 out | $1.00 | $0.70 | $0.30 | you receive $99.00 |

Fees are rounded up to the nearest 0.000001 USDG, so splitting one trade into many small ones never saves fees.

## After graduation (Uniswap)

The token's official Uniswap v4 pool also charges **1%** per swap. Those fees are split the same way, **70% creator, 30% Holdr**, in whichever currency was paid: the token or USDG.

## Other costs

| | |
|---|---|
| Launch fee | 0.0005 ETH per token launched |
| Anti-snipe surcharge | Only on buys in the first 5 seconds after launch; stays in the pool for all holders. See [Anti-snipe](/docs/anti-snipe). |
| Network fees (gas) | Paid in ETH to Robinhood Chain, not to Holdr |

## How fees are paid out

Fees are recorded with every trade and paid out on request, so a failed transfer can never block anyone's trade.

- **Creators** claim their share at any time. See [Creator earnings](/docs/creator-earnings).
- **Holdr's share** can be sent to the Holdr treasury by anyone. It can only go to the treasury.
