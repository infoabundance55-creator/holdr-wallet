# Admin controls

This page lists exactly what Holdr's admin can and can't do. Everything here is enforced by the contracts, not by promises.

## Who the admin is

On mainnet, the admin is a **2-of-3 Safe multisig**: any change needs two of three separate keys. Admin rights can be handed over in two steps, but never renounced, because that would freeze future rule updates. On testnet the admin is a single test wallet.

## Can do

| Action | Delay |
|---|---|
| Change the rules for **future** launches (fee, graduation threshold, first-buy cap, surcharge, launch fee, treasury) within fixed limits | 48 hours, visible on-chain first |
| Pause launches and buys in an emergency | Immediate |
| Unpause | Immediate (Safe only) |
| Raise or remove the per-buy cap | Immediate |

## Can never do

- Change the rules of a token that has already launched.
- Touch USDG in a curve pool, or the locked Uniswap liquidity.
- Pause selling or fee claims.
- Mint tokens, freeze holders or take anyone's tokens.
- Change where graduation liquidity goes (fixed when the factory is deployed).
- Lower the per-buy cap once it's raised.

## Limits on rule changes

Even with the 48-hour delay, new rules must stay within these limits:

| Rule | Limit |
|---|---|
| Trading fee | Up to 5% |
| Creator's share of the fee | 0 to 100% (70% today) |
| Fee plus anti-snipe surcharge | Up to 99% |
| Graduation threshold | 1,000 to 1,000,000 USDG |
| Creator first buy | Up to 100,000,000 tokens |
| Launch fee | Up to 0.1 ETH |

## Genesis NFT admin

The Genesis admin opens the five waves (each wave's start can be set at most a year ahead and moved only before it starts), pauses new mints, rotates the mint-permit key, updates the metadata link and sets royalties up to 2.5%. It can't mint for itself, change odds or change any revealed character.
