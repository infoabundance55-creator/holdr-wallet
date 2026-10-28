# Security reviews

Holdr hasn't had a paid audit yet. Until it can fund one, it combines several free checks, publishes the results, and limits risk at launch.

## What has been done

| Check | Launchpad | Genesis NFT |
|---|---|---|
| Independent AI security review | Done: no critical or high issues; 1 medium and the lows fixed | Done: no critical or high issues; 2 medium and 5 lows fixed |
| Automated tests (Foundry) | 158 unit, fuzz and invariant tests, run against the real Uniswap v4 PoolManager | 60 unit, fuzz and invariant tests |
| Line coverage | 100% | 100% |
| Static analysis (Slither) | Only expected notes remain | Only expected notes remain |
| Public testnet trial | Full flow run on Robinhood testnet: launch, trade, graduate, Uniswap swaps, fees | After the launchpad |

## What the invariant tests check

Invariant tests run thousands of random sequences of buys, sells, transfers, pauses and time jumps, checking after every step that:

- each curve pool always holds enough USDG for every holder to sell at once, plus every unclaimed fee,
- x × y on the curve never goes down,
- no more than 800,000,000 tokens are ever sold on the curve,
- after graduation, the locked liquidity never changes and the locker always holds every fee it owes,
- the last curve price is never above the Uniswap opening price, for every graduation threshold from 1,000 to 1,000,000 USDG and every fee from 0 to 5%.

## Launchpad review: what was fixed

- **Medium.** The admin could have changed, after a 48-hour wait, where future tokens send their liquidity at graduation. That address is now fixed when the factory is deployed and can never change.
- **Low.** Launching is refused unless the locker is linked to the factory, so a misconfiguration can't create tokens that can never graduate.
- **Low.** At a creator handover, Uniswap fees not yet collected now go to the old creator.
- **Informational.** Price continuity at graduation is now exact.

## Limits at launch

- A cap per buy at mainnet launch (for example $500) that can only be raised or removed.
- An emergency pause for launches and buys only. Sells always work.

When the launchpad earns fees, part of them will fund a professional audit and a bug bounty.
