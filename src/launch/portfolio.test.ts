import { describe, expect, it } from 'vitest';
import { costBasis, daysToNext, holdDay, holdMultiplier } from './portfolio';

const D = 86_400;
const E18 = 10n ** 18n;
const buy = (time: number, n: number) => ({ time, isBuy: true, tokens: BigInt(n) * E18 });
const sell = (time: number, n: number) => ({ time, isBuy: false, tokens: BigInt(n) * E18 });

describe('holdDay', () => {
  const t0 = 100 * D + 3600; // day 100, 01:00 UTC
  it('starts counting the first full day after buying', () => {
    expect(holdDay([buy(t0, 100)], t0 + 60)).toBe(0);
    expect(holdDay([buy(t0, 100)], 101 * D + 10)).toBe(1);
    expect(holdDay([buy(t0, 100)], 130 * D + 10)).toBe(30);
  });
  it('restarts at day 1 when the daily low drops by more than half', () => {
    const trades = [buy(t0, 100), sell(110 * D + 5, 60)];
    expect(holdDay(trades, 109 * D + 5)).toBe(9);
    expect(holdDay(trades, 110 * D + 10)).toBe(1);
    expect(holdDay(trades, 112 * D + 10)).toBe(3);
  });
  it('keeps counting when the low drops by half or less', () => {
    expect(holdDay([buy(t0, 100), sell(110 * D + 5, 50)], 110 * D + 10)).toBe(10);
  });
  it('drops to 0 after selling everything, and restarts the next full day', () => {
    const trades = [buy(t0, 100), sell(105 * D, 100), buy(105 * D + 60, 10)];
    expect(holdDay(trades, 105 * D + 100)).toBe(0);
    expect(holdDay(trades, 106 * D + 100)).toBe(1);
  });
});

describe('hold multiplier', () => {
  it('follows the points plan steps', () => {
    expect([1, 6, 7, 29, 30, 90].map(holdMultiplier)).toEqual([1, 1, 1.5, 1.5, 2, 2]);
    expect([0, 2, 7, 12, 30].map(daysToNext)).toEqual([7, 5, 23, 18, 0]);
  });
});

describe('costBasis', () => {
  it('removes cost in proportion to tokens sold', () => {
    const r = costBasis([
      { isBuy: true, tokens: 100n * E18, usdg: 10_000_000n },
      { isBuy: true, tokens: 100n * E18, usdg: 30_000_000n },
      { isBuy: false, tokens: 50n * E18, usdg: 15_000_000n },
    ]);
    expect(r.held).toBe(150n * E18);
    expect(r.cost).toBeCloseTo(30, 6);
  });
});
