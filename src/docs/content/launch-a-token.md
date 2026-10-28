# Launch a token

Anyone can launch a token on Holdr. Every token gets exactly the same rules, fixed at launch: neither the creator nor Holdr can change them afterwards.

> **Coming soon** The launchpad app is being built. The contracts are already live on testnet; see [Contract addresses](/docs/contracts).

## What you choose

| Field | Rule |
|---|---|
| Name | 1 to 32 bytes (about 32 letters) |
| Symbol (ticker) | 1 to 10 bytes |
| Description, logo, links | Stored off-chain (IPFS); the token keeps a link to them |
| First buy (optional) | Up to 50,000,000 tokens (5% of supply) in the same transaction |

## What every token gets

| | |
|---|---|
| Total supply | 1,000,000,000 tokens, 18 decimals, minted once |
| On the bonding curve | 800,000,000 |
| Reserved for Uniswap | 200,000,000 |
| Owner, minting, blacklist, transfer tax | None. The token has no owner and can never mint more. |
| Trading fee | 1% on every buy and sell: 70% to you, 30% to Holdr |
| Graduation | At 10,000 USDG raised |
| Launch fee | 0.0005 ETH, plus gas |

## The first buy

You can buy in the same transaction that launches the token, before anyone else can. The first buy:

- is capped at 50,000,000 tokens (5% of supply),
- pays the normal 1% fee,
- does **not** pay the anti-snipe surcharge (see [Anti-snipe](/docs/anti-snipe)).

At the opening price, 50 USDG buys about 15.6 million tokens (1.6%); filling the 5% cap costs about 165.6 USDG.

## After you launch

- Your token trades on its bonding curve right away. See [Bonding curve and price](/docs/bonding-curve).
- You earn 0.7% of every trade. See [Creator earnings](/docs/creator-earnings).
- When 10,000 USDG has been raised, the token moves to Uniswap automatically. See [Graduation](/docs/graduation).
