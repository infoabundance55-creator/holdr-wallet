# Install a wallet and add Robinhood Chain

Holdrs doesn't hold your funds. You connect your own wallet, and it signs every transaction. This guide sets up MetaMask or Rabby and adds Robinhood Chain.

## 1. Install a wallet

Install only from the official site or your browser's official extension store. Check the publisher before you click install.

| Wallet | Get it from | Good for |
|---|---|---|
| **MetaMask** | [metamask.io](https://metamask.io) | The most widely supported wallet, desktop and mobile |
| **Rabby** | [rabby.io](https://rabby.io) | Desktop; shows what a transaction will do before you sign |

Both work the same way with Holdrs. OKX Wallet, Coinbase Wallet, Bitget Wallet, Trust Wallet and any WalletConnect wallet also work.

## 2. Create and back up your wallet

1. Open the extension and choose **Create a new wallet**.
2. Set a password. It unlocks the wallet on this device only.
3. Write down the **recovery phrase** (12 words) on paper, in order. Keep it offline.

> **Warning** The recovery phrase is your wallet. Anyone who has it controls your funds. Holdrs will never ask for it. Never type it into a website, send it to anyone or store it in a screenshot.

## 3. Add Robinhood Chain

The easy way: connect on [holdrs.xyz](https://holdrs.xyz) and tap **Switch network**. Your wallet asks to add Robinhood Chain testnet; approve it.

To add it by hand (MetaMask: **Settings → Networks → Add a network manually**; Rabby: **More → Add custom network**), enter:

| Field | Testnet |
|---|---|
| Network name | Robinhood Chain Testnet |
| RPC URL | `https://rpc.testnet.chain.robinhood.com` |
| Chain ID | 46630 |
| Currency symbol | ETH |
| Block explorer | `https://explorer.testnet.chain.robinhood.com` |

Mainnet details are on [Testnet](/docs/testnet#network-details). Holdrs runs on testnet only for now.

## 4. On your phone

- **WalletConnect:** on Holdrs, tap **Connect wallet → WalletConnect** and scan the QR code with your wallet app.
- **In-app browser:** open MetaMask, OKX or another wallet app, go to its browser and visit holdrs.xyz.

## Used the old Holdr wallet?

Holdrs started as a browser wallet (v0.1). If you created a wallet there, open **Me** on holdrs.xyz in the same browser. You'll see **This browser has an old Holdr wallet. Export it**. Tap it, enter your password to view the recovery phrase, import it into MetaMask or Rabby, then remove the old wallet from the browser.

## Next

- [Quickstart](/docs/quickstart)
- [Stay safe](/docs/wallet-security)
