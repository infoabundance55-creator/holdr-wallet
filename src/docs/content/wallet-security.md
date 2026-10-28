# Wallet security

Holdr is built so that Holdr itself never has access to your funds.

## Where your key lives

- Your key is created on your device and stored there only as an **encrypted keystore** (scrypt + AES, the standard Ethereum keystore format), locked with your password.
- Your recovery phrase, private key and password are never sent to Holdr or anyone else.
- Holdr has no server that can sign for you, freeze your wallet or move your funds.

## What Holdr records

Holdr counts anonymous page views to see which screens people use. It never records keys, phrases, passwords, balances or wallet addresses.

## Protect yourself

- **Nobody from Holdr will ever ask for your recovery phrase.** Anyone who does is trying to steal your funds.
- Check that you are on the real Holdr site before you type your password.
- Check the recipient address and amount on the review screen before you send. Blockchain transfers can't be reversed.
- Use a strong unlock password and keep your device's own screen lock on.
- Approvals: before approving a token for any app, make sure you trust it. Launchpad tokens show an unlimited allowance to their own curve pool; that one is expected and safe (see [Launchpad risks](/docs/launchpad-risks)).

## Security of the code

The wallet's code is open source. Every change runs automated tests, CodeQL code scanning, a dependency audit and an OpenSSF Scorecard check. The site sends strict security headers: it can only load its own scripts and talk to Robinhood Chain RPCs. It has not had a paid third-party audit yet.

Found a problem? See [SECURITY.md](https://github.com/infoabundance55-creator/holdr-wallet/blob/main/SECURITY.md) for how to report it privately.
