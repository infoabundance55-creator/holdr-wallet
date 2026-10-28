# Anti-snipe

Bots try to buy a new token in the very first seconds, before real people can, then sell to them at a higher price. Holdr makes that unprofitable with a **surcharge on buys in the first 5 seconds**, falling fast to zero.

## The schedule

Seconds are counted from the launch transaction.

| Time after launch | Surcharge | Plus 1% fee | Of $100, goes into the curve |
|---|---|---|---|
| Second 0 | 98% | 99% | about $1 |
| Second 1 | 24.75% | 25.75% | about $74 |
| Second 2 | 6.19% | 7.19% | about $93 |
| Second 3 | 1.55% | 2.55% | about $97 |
| Second 4 | 0.39% | 1.39% | about $99 |
| Second 5 onwards | 0 | 1% | $99 |

## Where the surcharge goes

The surcharge **stays in the token's own pool**. It adds USDG without releasing tokens, so it raises the price for everyone who holds the token. It also counts towards the 10,000 USDG graduation threshold. Holdr does not receive it.

Because surcharges push the price up without selling tokens, a token that was sniped graduates with fewer than 800 million tokens sold. The unsold remainder is burned at graduation (see [Graduation](/docs/graduation)).

## Notes

- Only buys pay the surcharge. Sells never do.
- The creator's first buy, made inside the launch transaction, is exempt; it is already capped at 5%.
- Robinhood Chain timestamps are in whole seconds, so the schedule is by second, not by block.
