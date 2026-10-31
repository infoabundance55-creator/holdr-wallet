import { describe, expect, it } from 'vitest';
import { estimate, holdPoints, levelFor, tradePoints } from './points';

describe('points estimate', () => {
  it('trade points step down (plan §4)', () => {
    expect(tradePoints(4)).toBe(0);
    expect(tradePoints(100)).toBe(1000);
    expect(tradePoints(2000)).toBe(15_000);
    expect(tradePoints(20_000)).toBe(80_000);
  });
  it('hold points: $100 for 30 days = 100×6 + 150×23 + 200×1', () => expect(holdPoints(100, 30)).toBeCloseTo(4250));
  it('hold points cap at 2,000 a day', () => expect(holdPoints(10_000, 31)).toBeCloseTo(1000 * 6 + 1500 * 23 + 2000 * 2));
  it('level boost applies to all of it', () => {
    const e = estimate(100, 30, 0.04);
    expect(e.bonus).toBeCloseTo(210);
    expect(e.total).toBeCloseTo(5460);
    expect(e.level.house).toBe('Tent');
    expect(e.next?.house).toBe('Cabin');
  });
  it('levels by total points', () => {
    expect(levelFor(9_999).lvl).toBe(1);
    expect(levelFor(268_400).title).toBe('Bull Rider');
    expect(levelFor(5_000_000).lvl).toBe(6);
  });
});
