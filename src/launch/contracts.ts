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
  /** Swap router for graduated tokens. Testnet: HoldrTestnetRouter (no Universal Router there). */
  router?: string;
}

const env = import.meta.env;

export const LAUNCH: Partial<Record<NetworkId, LaunchContracts>> = {
  testnet: {
    // Env overrides exist for local end-to-end tests against anvil; production uses the defaults.
    factory: env.VITE_LAUNCH_FACTORY_TESTNET || '0x662e5A937C762Cc624e7fCdaC0Bc3992F8e72Fa9',
    locker: env.VITE_LAUNCH_LOCKER_TESTNET || '0x62ba0bdd2cE287854907677Ef0577FF2BB313faf',
    hook: env.VITE_LAUNCH_HOOK_TESTNET || '0x5aeA1537Dd78ba39A09BF65d48Cc41862e42e000',
    poolManager: env.VITE_LAUNCH_PM_TESTNET || '0xF8d1C31c9C9f4f8327FC0AE25d6f163489cCC7F3',
    usdg: env.VITE_LAUNCH_USDG_TESTNET || '0xf820a6e153452B6699Ce9BD794C78E644284F033',
    usdgDecimals: 6,
    usdgFaucet: true,
    fromBlock: Number(env.VITE_LAUNCH_FROM_BLOCK_TESTNET || 144_070_082), // factory deploy block
    router: env.VITE_SWAP_ROUTER_TESTNET || '0xa3877fd7030a063cBB18c948a7153cF245F20AeA', // HoldrTestnetRouter
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

export const PM_ABI = [
  'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)',
];

export const ROUTER_EVENTS_ABI = [
  'event Swapped(address indexed trader, bytes32 indexed poolId, bool zeroForOne, uint256 amountIn, uint256 amountOut)',
];

export const ERC20_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
];
