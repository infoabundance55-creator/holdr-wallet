# Launchpad risks

Read this before you trade or launch.

## Market risk

Launchpad tokens are highly speculative. Most lose most of their value. Price moves fast, and anyone can launch any token, including copies of famous names. Check the contract address and creator in the app, and only use money you can afford to lose.

## No paid audit yet

The contracts have had an independent AI security review, a large automated test suite, static analysis and a public testnet trial. They have **not** had a paid third-party audit. At mainnet launch, each buy is capped (for example $500 per buy) while the contracts prove themselves. The cap can only be raised or removed, never lowered.

## USDG can be frozen

USDG is issued by Paxos. Its contract can be upgraded, and the issuer can freeze or take balances from addresses. Curve pools and the locker hold USDG, so they depend on that issuer.

## Locked liquidity

Graduated liquidity is locked forever. Nobody can rug it, but nobody can return it either: if every curve buyer sold into Uniswap together, they would get back about 80% of the 10,000 USDG, not 100% as on the curve.

## Pause

Holdr's admin can pause **launches and buys** in an emergency. Selling and claiming fees always work. While paused, no token can graduate.

## Things that are expected

- **Unlimited allowance.** Wallet scanners show every launchpad token approving its own curve pool for an unlimited amount, and you can't remove it. That's by design: it lets you sell without a separate approval, and the pool can only take tokens from whoever calls sell, and only before graduation.
- **The per-buy cap is per transaction,** not per person. It limits mistakes, not whales.
- **Sending tokens or USDG straight to a pool or the locker loses them.** Always trade through the app.

## Smart-contract risk

Robinhood Chain is a young network, and smart contracts can have bugs no test finds. See [Security reviews](/docs/security-reviews) and [Admin controls](/docs/admin-controls).
