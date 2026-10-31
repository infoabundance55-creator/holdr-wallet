/**
 * Points rules (points plan v1.3, S1) used for estimates on the site.
 * The real points are settled by the points backend; nothing here is stored or promised.
 */

export type CharId = 'raccoon' | 'frog' | 'bull' | 'anon';

export interface Level {
  lvl: number;
  /** Total points needed. */
  min: number;
  house: string;
  houseZh: string;
  title: string;
  char: CharId;
  /** Boost on all points except invites, e.g. 0.04 = +4%. */
  boost: number;
}

/** Characters and house levels (characters v2.0 §2). */
export const LEVELS: Level[] = [
  { lvl: 1, min: 0, house: 'Tent', houseZh: '帐篷', title: 'Fresh Wallet', char: 'raccoon', boost: 0 },
  { lvl: 2, min: 10_000, house: 'Cabin', houseZh: '木屋', title: 'Dip Buyer', char: 'raccoon', boost: 0 },
  { lvl: 3, min: 50_000, house: 'Stone House', houseZh: '石屋', title: 'HODLer', char: 'frog', boost: 0.02 },
  { lvl: 4, min: 200_000, house: 'Villa', houseZh: '别墅', title: 'Bull Rider', char: 'bull', boost: 0.04 },
  { lvl: 5, min: 1_000_000, house: 'Tower', houseZh: '高塔', title: 'Whale', char: 'anon', boost: 0.08 },
  { lvl: 6, min: 5_000_000, house: 'Moon Base', houseZh: '月球基地', title: 'Moon Lord', char: 'anon', boost: 0.08 },
];

export const CHARS: { id: CharId; name: string; nameZh: string; lvl: number; min: number; boost: number }[] = [
  { id: 'raccoon', name: 'Degen Raccoon', nameZh: '浣熊', lvl: 1, min: 0, boost: 0 },
  { id: 'frog', name: 'Moon Frog', nameZh: '太空蛙', lvl: 3, min: 50_000, boost: 0.02 },
  { id: 'bull', name: 'Laser Bull', nameZh: '镭射牛', lvl: 4, min: 200_000, boost: 0.04 },
  { id: 'anon', name: 'The Anon', nameZh: 'The Anon', lvl: 5, min: 1_000_000, boost: 0.08 },
];

export const houseImg = (lvl: number) => `/art/house/${lvl}.png`;

/** Level for a points total. */
export function levelFor(total: number): Level {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (total >= l.min) cur = l;
  return cur;
}

/** Trade points for one day's volume in USD (§4: 10 / 5 / 2.5 per $1). Trades under $5 earn nothing. */
export function tradePoints(usd: number): number {
  if (!(usd >= 5)) return 0;
  return Math.min(usd, 1000) * 10 + Math.max(0, Math.min(usd, 10_000) - 1000) * 5 + Math.max(0, usd - 10_000) * 2.5;
}

/** Hold-day multiplier (§5): ×1 days 1–6, ×1.5 days 7–29, ×2 from day 30. */
export const holdMult = (day: number) => (day >= 30 ? 2 : day >= 7 ? 1.5 : 1);

/** Hold points for one token held `days` full days at a steady value (§5: √value × 10 × boost, max 2,000 a day). */
export function holdPoints(valueUsd: number, days: number): number {
  if (!(valueUsd > 0) || days < 1) return 0;
  const base = Math.sqrt(valueUsd) * 10;
  let sum = 0;
  for (let d = 1; d <= days; d++) sum += Math.min(2000, base * holdMult(d));
  return sum;
}

export interface Estimate { trade: number; hold: number; bonus: number; total: number; level: Level; next: Level | null; progress: number }

/** HODL calculator: buy once, hold, level boost on all of it. */
export function estimate(buyUsd: number, days: number, boost: number): Estimate {
  const trade = tradePoints(buyUsd);
  const hold = holdPoints(buyUsd, days);
  const bonus = (trade + hold) * boost;
  const total = trade + hold + bonus;
  const level = levelFor(total);
  const next = LEVELS[level.lvl] ?? null;
  const progress = next ? (total - level.min) / (next.min - level.min) : 1;
  return { trade, hold, bonus, total, level, next, progress };
}

/** The character shown for a user: their chosen look, or their level's character. */
export function lookFor(total: number, look: CharId | null): CharId {
  return look ?? levelFor(total).char;
}

/** Progress (0–1) from this level to the next. */
export function levelProgress(total: number): number {
  const lv = levelFor(total);
  const next = LEVELS[lv.lvl];
  return next ? Math.min(1, (total - lv.min) / (next.min - lv.min)) : 1;
}
