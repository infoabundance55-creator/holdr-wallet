# Stay safe

Holdrs never holds your funds. Your own wallet keeps your keys and signs every transaction, so Holdrs can't move, freeze or recover anything.

## What connecting means

- Connecting shares your **address** only. Holdrs can read public on-chain data for it, like anyone can.
- Nothing happens without your approval. Every approval and trade opens in your wallet first.
- Holdrs has no server that can sign for you.

## Approvals

To buy, you approve USDG for the token's curve pool (or the factory, for a creator's first buy). Holdrs asks for **exactly the amount of that trade**, never an unlimited allowance. Selling on the curve needs no approval.

Before you sign, check in your wallet:

- the **network** is Robinhood Chain,
- the **contract** is the token's pool or a Holdrs contract on [Contract addresses](/docs/contracts),
- the **amount** matches what you typed.

## Protect yourself

- **Nobody from Holdrs will ever ask for your recovery phrase.** Anyone who does is trying to steal your funds.
- Check the address bar: the real site is **holdrs.xyz**.
- Look-alike tokens can copy a name or ticker. Check the contract address on the token page.
- Keep your wallet extension and app up to date, and lock your device.

## What Holdrs records

Holdrs counts anonymous page views to see which pages people use. It never records keys, phrases, passwords, balances or wallet addresses.

## Security of the code

The code is open source. Every change runs automated tests, CodeQL code scanning, a dependency audit and an OpenSSF Scorecard check. The site sends strict security headers: it only loads its own scripts and only talks to Robinhood Chain RPCs and wallet-connection services. It has not had a paid third-party audit yet; see [Security reviews](/docs/security-reviews).

Found a problem? See [SECURITY.md](https://github.com/infoabundance55-creator/holdr-wallet/blob/main/SECURITY.md) for how to report it privately.
