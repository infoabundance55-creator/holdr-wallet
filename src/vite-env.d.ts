/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RPC_TESTNET?: string;
  readonly VITE_RPC_MAINNET?: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_LAUNCH_FROM_BLOCK_TESTNET?: string;
}
