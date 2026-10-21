/**
 * Moon Jump game rules shared by the server API. Pure functions, unit tested.
 * Keep the numbers in step with src/game/engine.js.
 */

export const LEVEL_XP = [0, 300, 800, 2000, 5000, 12000] as const;
export const LEVEL_NAMES = ['Paper Hands', 'Wood Hands', 'Stone Hands', 'Iron Hands', 'Gold Hands', 'Diamond Hands'] as const;
export const CHARS = ['boss', 'frog', 'laser', 'satoshi'] as const;
export type CharId = (typeof CHARS)[number];

/** Daily #1 was 2026-10-11 (UTC). */
const EPOCH = Date.UTC(2026, 9, 11);

export function levelOf(xp: number): number {
  let lvl = 0;
  for (let i = 0; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]) lvl = i;
  return lvl;
}

/** UTC calendar day as YYYYMMDD. Everyone shares the same daily map. */
export function dayKey(now: Date = new Date()): number {
  return now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
}

export function dayNumber(now: Date = new Date()): number {
  const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(1, Math.floor((utc - EPOCH) / 86_400_000) + 1);
}

export function isoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function dailySeed(day: number): number {
  return (day * 7919) % 2147483647;
}

export function xpFor(height: number, coins: number, firstDaily: boolean): number {
  return Math.floor(height / 100) + Math.floor(coins / 10) + (firstDaily ? 20 : 0);
}

/**
 * Reject results the game cannot produce in the time the run took.
 * Normal climbing tops out near 50 m/s; rockets and super jumps add bursts.
 */
export function plausible(height: number, coins: number, durationMs: number): string | null {
  if (!Number.isInteger(height) || height < 0 || height > 200_000) return 'bad_height';
  if (!Number.isInteger(coins) || coins < 0 || coins > 10_000) return 'bad_coins';
  const secs = durationMs / 1000;
  if (secs < 0) return 'bad_time';
  if (height > 90 * secs + 300) return 'too_fast';
  if (coins > height / 15 + 30) return 'too_many_coins';
  return null;
}

export const USERNAME = /^[A-Za-z0-9_]{3,15}$/;
export const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function signInMessage(address: string, nonce: string): string {
  return [
    'Sign in to Moon Jump on Holdr',
    '',
    'This only proves you own this wallet.',
    'It costs no gas and cannot move any funds.',
    '',
    `Address: ${address.toLowerCase()}`,
    `Nonce: ${nonce}`,
  ].join('\n');
}

/** Daily check-in: streak grows on consecutive UTC days, every 7th day pays a bonus. */
export function checkin(lastCheckin: string | null, streak: number, today: string): { streak: number; xp: number } | null {
  if (lastCheckin === today) return null;
  const y = new Date(today + 'T00:00:00Z');
  y.setUTCDate(y.getUTCDate() - 1);
  const next = lastCheckin === isoDate(y) ? streak + 1 : 1;
  return { streak: next, xp: next % 7 === 0 ? 50 : 10 };
}
