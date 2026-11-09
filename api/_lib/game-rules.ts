/**
 * Moon Jump rules for the server (points plan v1.3 §3). Pure functions, unit tested.
 * The engine (src/game/engine.js) uses the same numbers: coin values, the 1,000 m line, mods.
 */

/** Scored runs per day. Practice is unlimited and never reaches the server. */
export const SCORED_RUNS = 3;
/** Coin value up to the bull-run line, and above it. */
export const COIN_LOW = 5;
export const COIN_HIGH = 10;
export const BULL_LINE_M = 1000;

/**
 * Game "day" is the UTC calendar day for now. Work 5 decides the points day's time zone;
 * change it here only (the engine shows whatever the server sends).
 */
export function dayKey(now: Date): number {
  return now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
}

/** Daily #1 was 2026-10-11 (UTC), as in the first game build. */
const EPOCH = Date.UTC(2026, 9, 11);
export function dayNumber(now: Date): number {
  const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(1, Math.floor((utc - EPOCH) / 86_400_000) + 1);
}

/** Everyone gets the same map on the same day. */
export function dailySeed(day: number): number {
  return (day * 7919) % 2147483647;
}

/** Today's map twist (index into the engine's MODS list). */
export const dailyMod = (n: number) => n % 4;

/**
 * Season window for the SEASON board, as YYYYMMDD. S1 starts with the launchpad on mainnet (date not set yet);
 * until then this is the testnet preview season.
 */
export const SEASON = { id: 'TESTNET', from: 20261101, to: 20991231 };

/** Seconds from the midnight that ends `now`'s game day. */
export function secondsToReset(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(0, Math.ceil((next - now.getTime()) / 1000));
}

export const pointsFor = (coinsLow: number, coinsHigh: number) => coinsLow * COIN_LOW + coinsHigh * COIN_HIGH;

/**
 * Reject results the game can't produce. Coins come at most ~1 per 15 m; normal climbing tops out
 * near 50 m/s with short rocket bursts. Coins above the line need the run to have reached it.
 * Replay verification (points plan §11) comes with the points backend; until then runs stay unverified.
 */
export function implausible(height: number, coinsLow: number, coinsHigh: number, durationMs: number): string | null {
  const int = (n: number) => Number.isInteger(n) && n >= 0;
  if (!int(height) || height > 200_000) return 'bad_height';
  if (!int(coinsLow) || !int(coinsHigh) || coinsLow > 10_000 || coinsHigh > 10_000) return 'bad_coins';
  if (!(durationMs >= 0)) return 'bad_time';
  const secs = durationMs / 1000;
  if (height > 90 * secs + 300) return 'too_fast';
  if (coinsLow > Math.min(height, BULL_LINE_M) / 15 + 30) return 'too_many_coins';
  if (coinsHigh > 0 && height < BULL_LINE_M) return 'too_many_coins';
  if (coinsHigh > Math.max(0, height - BULL_LINE_M) / 15 + 30) return 'too_many_coins';
  return null;
}
