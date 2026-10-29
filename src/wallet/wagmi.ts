import { connectorsForWallets, type WalletList } from '@rainbow-me/rainbowkit';
import {
  bitgetWallet, coinbaseWallet, injectedWallet, metaMaskWallet, okxWallet, rabbyWallet, trustWallet, walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { createConfig, http } from 'wagmi';
import { robinhood, robinhoodTestnet } from 'wagmi/chains';
import type { Chain } from 'viem';
import { NETWORKS, type NetworkId } from '../config';

/** Robinhood Chain networks, with our RPC (env override) first. */
export const CHAINS: Record<NetworkId, Chain> = {
  testnet: { ...robinhoodTestnet, rpcUrls: { default: { http: [NETWORKS.testnet.rpc] } } },
  mainnet: { ...robinhood, rpcUrls: { default: { http: [NETWORKS.mainnet.rpc] } } },
};

/** WalletConnect / Reown project id (free at cloud.reown.com). Without it only browser-extension wallets work. */
export const WC_PROJECT_ID: string = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';
export const HAS_WALLETCONNECT = WC_PROJECT_ID.length > 0;

const APP = { appName: 'Holdr', appDescription: 'Fair-launch tokens on Robinhood Chain', appUrl: 'https://holdr-wallet.vercel.app', appIcon: 'https://holdr-wallet.vercel.app/icon.svg' };

// Coinbase smart wallets do not support Robinhood Chain; use the regular Coinbase Wallet app / extension.
coinbaseWallet.preference = 'eoaOnly';

const wallets: WalletList = HAS_WALLETCONNECT
  ? [
      { groupName: 'Popular', wallets: [metaMaskWallet, okxWallet, rabbyWallet, coinbaseWallet] },
      { groupName: 'More', wallets: [bitgetWallet, trustWallet, walletConnectWallet] },
    ]
  : [
      // No project id: mobile QR / deep links are unavailable, so only offer extensions.
      { groupName: 'Browser wallets', wallets: [injectedWallet, rabbyWallet] },
    ];

const connectors = connectorsForWallets(wallets, { ...APP, projectId: WC_PROJECT_ID || 'missing' });

export const wagmiConfig = createConfig({
  connectors,
  chains: [CHAINS.testnet, CHAINS.mainnet],
  transports: {
    [CHAINS.testnet.id]: http(NETWORKS.testnet.rpc, { batch: false }),
    [CHAINS.mainnet.id]: http(NETWORKS.mainnet.rpc, { batch: false }),
  },
  // No multicall batching: every read is its own eth_call, so nothing depends on Multicall3 being deployed.
  batch: { multicall: false },
  ssr: false,
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
