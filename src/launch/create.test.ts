import { describe, expect, it } from 'vitest';
import { capAfter, checkName, checkSymbol, curveStart, maxFirstBuy, normLink, normSymbol, quoteFirstBuy, type CurveCfg } from './create';

// Testnet factory settings: 10,000 USDG threshold, 1% fee, 70% creator share, 50M-token first-buy cap.
const cfg: CurveCfg = { gradThreshold: 10_000n * 10n ** 6n, firstBuyMaxTokens: 50_000_000n * 10n ** 18n, feeBps: 100, creatorShareBps: 7000 };

describe('launch form checks', () => {
  it('names: 1..32 bytes', () => {
    expect(checkName('  ')).toBe('nameEmpty');
    expect(checkName('Gem Season')).toBeNull();
    expect(checkName('a'.repeat(32))).toBeNull();
    expect(checkName('a'.repeat(33))).toBe('nameLong');
    expect(checkName('宝石季节宝石季节宝石季')).toBe('nameLong'); // 11 × 3 bytes
  });
  it('tickers: A-Z 0-9, up to 10', () => {
    expect(normSymbol(' $gems ')).toBe('GEMS');
    expect(checkSymbol('')).toBe('symEmpty');
    expect(checkSymbol('GEMS2')).toBeNull();
    expect(checkSymbol('GEM-S')).toBe('symChars');
    expect(checkSymbol('ABCDEFGHIJK')).toBe('symLong');
  });
  it('links become https URLs', () => {
    expect(normLink('x', '@gemseason')).toBe('https://x.com/gemseason');
    expect(normLink('x', 'twitter.com/gems')).toBe('https://x.com/gems');
    expect(normLink('x', 'gems.xyz')).toBeNull();
    expect(normLink('telegram', 't.me/gems')).toBe('https://t.me/gems');
    expect(normLink('website', 'gems.xyz')).toBe('https://gems.xyz/');
    expect(normLink('website', 'http://gems.xyz')).toBeNull();
    expect(normLink('website', 'javascript:alert(1)')).toBeNull();
    expect(normLink('website', '')).toBeUndefined();
  });
});

describe('first buy math (matches CurvePool)', () => {
  it('starts like the contract', () => {
    const s = curveStart(cfg);
    expect(s.virtualUsdg).toBe(3_333_333_334n);
    expect(Math.round(capAfter(cfg, 0n, 0n))).toBe(3125);
  });
  it('quotes and caps', () => {
    const q = quoteFirstBuy(cfg, 50n * 10n ** 6n);
    expect(q.fee).toBe(500_000n);
    expect(q.tokensOut > 15_000_000n * 10n ** 18n && q.tokensOut < 16_000_000n * 10n ** 18n).toBe(true);
    const max = maxFirstBuy(cfg);
    expect(quoteFirstBuy(cfg, max).tokensOut <= cfg.firstBuyMaxTokens).toBe(true);
    expect(quoteFirstBuy(cfg, max + 1n).tokensOut > cfg.firstBuyMaxTokens).toBe(true);
    expect(Number(max) / 1e6).toBeGreaterThan(160);
    expect(Number(max) / 1e6).toBeLessThan(180);
  });
});
