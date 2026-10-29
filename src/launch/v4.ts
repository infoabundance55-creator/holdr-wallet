import { AbiCoder, keccak256, toBeHex, zeroPadValue } from 'ethers';

/** The official Holdr pool for a token (HoldrLiquidityLocker.poolKeyFor): token / USDG, 1% fee, Holdr hook. */
export interface PoolKey {
  currency0: `0x${string}`;
  currency1: `0x${string}`;
  fee: number;
  tickSpacing: number;
  hooks: `0x${string}`;
}

export const POOL_FEE = 10_000; // 1%
export const TICK_SPACING = 200;
/** PoolManager storage slot of the pools mapping (v4-core StateLibrary.POOLS_SLOT). */
const POOLS_SLOT = 6n;

const coder = AbiCoder.defaultAbiCoder();
const hex = (a: string) => a as `0x${string}`;

export function poolKeyFor(token: string, usdg: string, hook: string): PoolKey {
  const tokenFirst = BigInt(token) < BigInt(usdg);
  return {
    currency0: hex(tokenFirst ? token : usdg),
    currency1: hex(tokenFirst ? usdg : token),
    fee: POOL_FEE,
    tickSpacing: TICK_SPACING,
    hooks: hex(hook),
  };
}

export function tokenIs0(key: PoolKey, token: string): boolean {
  return key.currency0.toLowerCase() === token.toLowerCase();
}

/** keccak256(abi.encode(PoolKey)) */
export function poolId(key: PoolKey): string {
  return keccak256(coder.encode(['address', 'address', 'uint24', 'int24', 'address'], [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]));
}

/** Storage slot of a pool's state; slot0 is word 0 and liquidity is word 3. */
export function poolStateSlot(id: string): string {
  return keccak256(coder.encode(['bytes32', 'uint256'], [id, POOLS_SLOT]));
}

export function slotPlus(slot: string, n: number): string {
  return zeroPadValue(toBeHex(BigInt(slot) + BigInt(n)), 32);
}

/** USDG (6 decimals) per whole token (18 decimals) from the pool's sqrtPriceX96. */
export function priceFromSqrt(sqrtPriceX96: bigint, tokenIsCurrency0: boolean): number {
  if (sqrtPriceX96 === 0n) return 0;
  const s = Number(sqrtPriceX96) / 2 ** 96;
  const raw = s * s; // currency1 per currency0, raw units
  return tokenIsCurrency0 ? raw * 1e12 : 1e12 / raw;
}

/** Full-range pool reserves (raw units) from liquidity and price. */
export function reserves(liquidity: bigint, sqrtPriceX96: bigint, tokenIsCurrency0: boolean): { usdg: number; tokens: number } {
  if (sqrtPriceX96 === 0n) return { usdg: 0, tokens: 0 };
  const L = Number(liquidity);
  const s = Number(sqrtPriceX96) / 2 ** 96;
  const amount0 = L / s, amount1 = L * s;
  return tokenIsCurrency0 ? { tokens: amount0 / 1e18, usdg: amount1 / 1e6 } : { usdg: amount0 / 1e6, tokens: amount1 / 1e18 };
}

/** Lower 160 bits of slot0. */
export function sqrtFromSlot0(word: string): bigint {
  return BigInt(word) & ((1n << 160n) - 1n);
}
