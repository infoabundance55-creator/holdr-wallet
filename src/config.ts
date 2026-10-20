export type NetworkId = 'testnet' | 'mainnet';

export interface Network {
  id: NetworkId;
  name: string;
  chainId: number;
  rpc: string;
  explorer: string;
  symbol: string;
  faucet?: string;
}

// Public RPCs are rate-limited. For production, set VITE_RPC_MAINNET / VITE_RPC_TESTNET
// to a provider URL (e.g. Alchemy) in the hosting environment.
const env = import.meta.env;

export const NETWORKS: Record<NetworkId, Network> = {
  testnet: {
    id: 'testnet',
    name: 'Robinhood Chain Testnet',
    chainId: 46630,
    rpc: env.VITE_RPC_TESTNET || 'https://rpc.testnet.chain.robinhood.com',
    explorer: 'https://explorer.testnet.chain.robinhood.com',
    symbol: 'ETH',
    faucet: 'https://www.alchemy.com/faucets/robinhood-testnet',
  },
  mainnet: {
    id: 'mainnet',
    name: 'Robinhood Chain',
    chainId: 4663,
    rpc: env.VITE_RPC_MAINNET || 'https://rpc.mainnet.chain.robinhood.com',
    explorer: 'https://robinhoodchain.blockscout.com',
    symbol: 'ETH',
  },
};

export const DEFAULT_NETWORK: NetworkId = 'testnet';
export const AUTO_LOCK_OPTIONS = [1, 5, 15, 60] as const; // minutes
