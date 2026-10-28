import type { NetworkId } from '../config';

/** Launchpad contracts per network. Mainnet has none yet. Source: contracts/deployments/46630.json. */
export interface LaunchContracts {
  factory: string;
  locker: string;
  hook: string;
  poolManager: string;
  usdg: string;
  usdgDecimals: number;
  /** Test USDG has a public faucet(amount). */
  usdgFaucet: boolean;
  /** First block to scan for launches (the factory's deploy block). */
  fromBlock: number;
}

const env = import.meta.env;

export const LAUNCH: Partial<Record<NetworkId, LaunchContracts>> = {
  testnet: {
    factory: '0x662e5A937C762Cc624e7fCdaC0Bc3992F8e72Fa9',
    locker: '0x62ba0bdd2cE287854907677Ef0577FF2BB313faf',
    hook: '0x5aeA1537Dd78ba39A09BF65d48Cc41862e42e000',
    poolManager: '0xF8d1C31c9C9f4f8327FC0AE25d6f163489cCC7F3',
    usdg: '0xf820a6e153452B6699Ce9BD794C78E644284F033',
    usdgDecimals: 6,
    usdgFaucet: true,
    fromBlock: Number(env.VITE_LAUNCH_FROM_BLOCK_TESTNET || 144_070_082), // factory deploy block
  },
};

/** Fixed by the contracts (HoldrToken / CurvePool). */
export const TOTAL_SUPPLY = 1_000_000_000n * 10n ** 18n;
export const CURVE_SUPPLY = 800_000_000n * 10n ** 18n;
export const TOKEN_DECIMALS = 18;

export const FACTORY_ABI = [
  'event TokenCreated(address indexed token, address indexed pool, address indexed creator, string name, string symbol, string metadataURI, uint256 launchFee)',
  'function launchFee() view returns (uint256)',
  'function paused() view returns (bool)',
  'function maxBuyUsdg() view returns (uint256)',
  'function tokenCount() view returns (uint256)',
];

export const POOL_ABI = [
  'event Trade(address indexed trader, bool indexed isBuy, uint256 usdgAmount, uint256 tokenAmount, uint256 fee, uint256 surcharge, uint256 realUsdgAfter, uint256 tokensSoldAfter)',
  'event Graduated(address indexed token, address indexed migrator, uint256 usdg, uint256 tokens, uint256 tokensBurned)',
  'event CreatorTransferred(address indexed previous, address indexed current)',
  'function virtualUsdg() view returns (uint256)',
  'function initialVirtualTokens() view returns (uint256)',
  'function gradThreshold() view returns (uint256)',
  'function realUsdg() view returns (uint256)',
  'function tokensSold() view returns (uint256)',
  'function graduated() view returns (bool)',
  'function creator() view returns (address)',
  'function launchTime() view returns (uint64)',
  'function feeBps() view returns (uint16)',
  'function creatorShareBps() view returns (uint16)',
  'function firstBuyMaxTokens() view returns (uint256)',
];

export const ERC20_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
];
