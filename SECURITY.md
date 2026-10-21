# Security

Holdr is a self-custody wallet. Your recovery phrase and private key are created in your browser,
stored there only as an encrypted keystore, and never sent to any server.

## Report a vulnerability

Please report security issues privately through
[GitHub private vulnerability reporting](https://github.com/infoabundance55-creator/holdr-wallet/security/advisories/new).
Do not open a public issue for security problems.

We aim to acknowledge reports within 3 days and will credit reporters who want to be named.

Out of scope: issues that require a compromised device or browser, phishing sites that copy Holdr,
and missing best practices without a concrete impact.

## How Holdr protects keys

- Keys are generated with the browser's secure random source (via ethers.js).
- The key is stored only as an encrypted JSON keystore (scrypt + AES-128-CTR), unlocked with your password.
- The unlocked key lives only in memory and is cleared on lock, auto-lock or page reload.
- The site sends a strict Content-Security-Policy: scripts load only from Holdr's own origin, network
  requests go only to Robinhood Chain RPC endpoints, and the app cannot be embedded in other sites.
- Usage analytics are anonymous and never include addresses, amounts, keys or passwords.

## Current status

- Automated checks on every change: unit tests, CodeQL code scanning, dependency audit, Dependabot, OpenSSF Scorecard.
- **Not yet audited by a third-party security firm.** Use small amounts on mainnet.
