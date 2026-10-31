/**
 * Level rules (characters v2.0 §2) for the server. The site has the same table in src/launch/points.ts;
 * api/account.test.ts checks the two stay equal.
 */
export type CharId = 'raccoon' | 'frog' | 'bull' | 'anon';
export const CHAR_IDS: CharId[] = ['raccoon', 'frog', 'bull', 'anon'];

/** Total points needed for levels 1–6. */
export const LEVEL_MIN = [0, 10_000, 50_000, 200_000, 1_000_000, 5_000_000];
/** Character for levels 1–6. */
export const LEVEL_CHAR: CharId[] = ['raccoon', 'raccoon', 'frog', 'bull', 'anon', 'anon'];
/** Points needed to unlock each character. */
export const CHAR_MIN: Record<CharId, number> = { raccoon: 0, frog: 50_000, bull: 200_000, anon: 1_000_000 };

export function levelOf(total: number): number {
  let lv = 1;
  LEVEL_MIN.forEach((m, i) => { if (total >= m) lv = i + 1; });
  return lv;
}

export const charOfLevel = (lv: number): CharId => LEVEL_CHAR[Math.min(6, Math.max(1, lv)) - 1];
export const unlocked = (c: CharId, total: number) => total >= CHAR_MIN[c];
export const isChar = (v: unknown): v is CharId => typeof v === 'string' && (CHAR_IDS as string[]).includes(v);
