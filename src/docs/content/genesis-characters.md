# Genesis characters

Genesis is Holdr's first collection: **5,000 characters**, free to mint. Each one boosts your points and is your player in Moon Jump.

> **Coming soon** The contract is written and reviewed; minting opens after testnet.

## The characters

| Character | Supply | Chance | Bonus |
|---|---|---|---|
| Degen Raccoon | 1,500 | 30% | Trading points +20% |
| Moon Frog | 1,500 | 30% | Launch points +20% |
| Laser Bull | 1,500 | 30% | Holding points +20% |
| **The Anon** | **500** | **10%** | **All points +10%** |

## Minting

- **Free.** You only pay gas.
- **One per wallet**, and only through the Holdr app: sign in and pick a username, and Holdr gives your wallet a one-time mint permit.
- **Five waves of 1,000**, one a week. Every wave has the same mix: 300 Raccoons, 300 Frogs, 300 Bulls, 100 Anons, so the rare Anon isn't gone in the first wave. The app shows what's left and the countdown to the next wave.
- Characters are standard ERC-721 NFTs with a serial number, for example Laser Bull #0042. You can transfer and trade them. Royalty on sales is 2.5%.

## How your character is picked

The draw is commit-reveal, so neither you nor anyone watching can pick the result:

1. Before you mint, Holdr commits to a secret seed (it publishes only its hash).
2. When you mint, your app adds its own random seed.
3. Seconds later Holdr reveals its seed. The contract checks it against the commitment and draws from the characters still left in the wave.

Every reveal is public on-chain, so anyone can verify it. Holdr's server is trusted not to pick seeds for its own wallets. Robinhood Chain has no verifiable random function (VRF) service yet; Holdr will switch to one when it does. If Holdr doesn't reveal within an hour, anyone can finish the reveal with a fallback that uses a future block hash.

## Binding

- You can own several characters but **bind one at a time**. Your bound character is your Moon Jump player and gives your bonus.
- With a single character, it's bound automatically and stays bound.
- Changing your bound character has a **7-day cooldown**. Sending your bound character away unbinds it.
- A bonus only counts on days your character was bound the whole day, so one character can't boost two wallets on the same day.
