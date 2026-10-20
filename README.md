# Holdr Wallet

A self-custody web wallet for Robinhood Chain: hold tokenized stocks and crypto in one place.
Keys are generated and encrypted in the browser and never leave the device.

**Status: v0.1, testnet first.** Not security audited. Do not hold meaningful funds on mainnet yet.

## What works in v0.1

- Create a wallet (12-word phrase) with backup and a 3-word check
- Import with a recovery phrase or private key
- Unlock password; the key is stored only as an encrypted keystore (scrypt + AES)
- Auto-lock after inactivity (1 / 5 / 15 / 60 min) and "lock now"
- ETH balance on Robinhood Chain testnet / mainnet
- Receive (QR + address), send ETH with fee estimate and a review step
- Activity for transfers sent from this wallet
- Settings: view phrase, change password, language (简体中文 / English), network, remove wallet
- Works on phone and desktop browsers; can be added to the home screen

## Next

- Stock token and stablecoin balances
- Prices and daily change from Chainlink feeds on Robinhood Chain
- Full transaction history (incoming and outgoing)
- Desktop layout

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # wallet and format unit tests
npm run build    # production build in dist/
```

## Deploy

Any static host works. With Vercel: import the GitHub repo, framework preset **Vite**, no other settings needed.
Optionally set `VITE_RPC_TESTNET` / `VITE_RPC_MAINNET` (see `.env.example`) to use a private RPC.

## Networks

| | Chain ID | Explorer |
|---|---|---|
| Robinhood Chain Testnet | 46630 | explorer.testnet.chain.robinhood.com |
| Robinhood Chain | 4663 | robinhoodchain.blockscout.com |

Test ETH: https://www.alchemy.com/faucets/robinhood-testnet

## Project layout

```
src/
  config.ts          networks and constants
  i18n.tsx           Chinese / English strings
  state.tsx          app state: prefs, vault, unlocked wallet, auto-lock
  lib/vault.ts       create / import / encrypt / unlock (tested)
  lib/format.ts      address checks, amount parsing (tested)
  screens/           Onboarding, Unlock, Home (assets, activity, me), Send, Account
```
