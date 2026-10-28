import { describe, expect, it } from 'vitest';
import { CURVE_SUPPLY } from './contracts';
import { elapsed, pct, price, tokens, usd } from './fmt';
import {
  almostGraduating, applyTransfer, candles, change, currentPrice, holderList, marketCap, priceAt, progress,
  search, sortTokens, top10Pct, volume, type LaunchToken, type PoolParams, type TradeEv,
} from './math';
import { parseMeta } from './parts';

// Same derivation as CurvePool.initialize with the deploy settings (G = 10,000 USDG).
const G = 10_000n * 10n ** 6n;
const LP = 200_000_000n * 10n ** 18n;
const V = (G * LP) / (CURVE_SUPPLY - LP) + 1n;
const PARAMS: PoolParams = {
  virtualUsdg: V,
  initialVirtualTokens: (CURVE_SUPPLY * (V + G)) / G,
  gradThreshold: G,
  feeBps: 100,
  creatorShareBps: 7000,
  firstBuyMaxTokens: 50_000_000n * 10n ** 18n,
  launchTime: 1_000,
};

let seq = 0;
function token(over: Partial<LaunchToken> = {}): LaunchToken {
  seq++;
  return {
    token: `0x${seq.toString(16).padStart(40, '0')}`, pool: `0x${(seq + 0x1000).toString(16).padStart(40, '0')}`,
    creator: '0x00000000000000000000000000000000000000aa', name: `Token ${seq}`, symbol: `T${seq}`, metadataURI: '',
    createdBlock: seq, createdAt: 1_000, params: PARAMS, trades: [], graduated: false, graduatedAt: null,
    balances: new Map(), burned: 0n, ...over,
  };
}

/** A buy that moves the curve to `real` USDG raised (state only; amounts are not exact). */
function trade(time: number, real: bigint, isBuy = true, usdg = 100n * 10n ** 6n): TradeEv {
  const x = PARAMS.virtualUsdg + real;
  const k = PARAMS.virtualUsdg * PARAMS.initialVirtualTokens;
  const sold = PARAMS.initialVirtualTokens - k / x;
  return { block: time, logIndex: 0, time, tx: '0x', trader: '0x00000000000000000000000000000000000000bb', isBuy, usdg, tokens: 0n, fee: 0n, surcharge: 0n, realAfter: real, soldAfter: sold };
}

describe('curve math', () => {
  it('opens near $3,125 market cap and graduates near $50K', () => {
    const t = token();
    expect(marketCap(t)).toBeGreaterThan(3_100);
    expect(marketCap(t)).toBeLessThan(3_150);
    const done = token({ trades: [trade(2_000, G)] });
    expect(marketCap(done)).toBeGreaterThan(49_500);
    expect(marketCap(done)).toBeLessThan(50_500);
    expect(progress(done)).toBe(1);
  });

  it('prices from reserves', () => {
    expect(priceAt(PARAMS, 0n, 0n)).toBeCloseTo(3_333.333334 / 1_066_666_666.6, 12);
  });

  it('tracks progress and 24h change', () => {
    const now = 200_000;
    const t = token({ trades: [trade(now - 90_000, 1_000n * 10n ** 6n), trade(now - 100, 5_000n * 10n ** 6n)] });
    expect(progress(t)).toBeCloseTo(0.5, 6);
    const ch = change(t, now)!;
    expect(ch).toBeCloseTo(((currentPrice(t) / priceAt(PARAMS, 1_000n * 10n ** 6n, t.trades[0].soldAfter)) - 1) * 100, 6);
    expect(volume(t, now)).toBe(100);
    expect(change(token(), now)).toBeNull();
  });

  it('builds candles that carry the close forward', () => {
    const t = token({ createdAt: 0, trades: [trade(3_610, 1_000n * 10n ** 6n), trade(7_300, 2_000n * 10n ** 6n)] });
    const cs = candles(t, 3600, 10_000, 5);
    expect(cs.length).toBe(3);
    expect(cs[0].o).toBe(cs[0].c);
    expect(cs[1].c).toBeGreaterThan(cs[1].o);
    expect(cs[2].o).toBe(cs[1].c);
  });
});

describe('holders', () => {
  it('applies transfers and skips the pool and protocol contracts', () => {
    const t = token();
    const zero = '0x0000000000000000000000000000000000000000';
    applyTransfer(t.balances, zero, t.pool, 1_000n);
    applyTransfer(t.balances, t.pool, '0xA1', 600n);
    applyTransfer(t.balances, t.pool, '0xb2', 300n);
    applyTransfer(t.balances, '0xa1', '0xC3', 100n);
    applyTransfer(t.balances, t.pool, '0xLOCK', 100n);
    const list = holderList(t, ['0xlock']);
    expect(list.map((h) => h.address)).toEqual(['0xa1', '0xb2', '0xc3']);
    expect(list[0].balance).toBe(500n);
    expect(top10Pct(t, ['0xlock'])).toBeGreaterThan(0);
  });
});

describe('lists', () => {
  it('filters and sorts', () => {
    const now = 100_000;
    const a = token({ name: 'Whale Watch', symbol: 'WHALE', trades: [trade(now - 10, 9_200n * 10n ** 6n)] });
    const b = token({ trades: [trade(now - 10, 1_000n * 10n ** 6n, true, 900n * 10n ** 6n)] });
    const c = token({ graduated: true, graduatedAt: now, trades: [trade(now - 5, G)] });
    const all = [a, b, c];
    expect(sortTokens(all, 'trending', now)[0]).toBe(b);
    expect(sortTokens(all, 'new', now)[0]).toBe(c);
    expect(sortTokens(all, 'almost', now)).toEqual([a, b]);
    expect(sortTokens(all, 'graduated', now)).toEqual([c]);
    expect(almostGraduating(all)).toEqual([a]);
    expect(search(all, '$whale')).toEqual([a]);
    expect(search(all, a.token.toUpperCase().replace('0X', '0x'))).toEqual([a]);
  });
});

describe('format', () => {
  it('formats money and amounts', () => {
    expect(usd(26_600)).toBe('$26.6K');
    expect(usd(128_400)).toBe('$128K');
    expect(usd(8.4)).toBe('$8.40');
    expect(price(0.0000266)).toBe('$0.0000266');
    expect(price(0.00312)).toBe('$0.00312');
    expect(pct(42.6)).toBe('+42.6%');
    expect(pct(-12.34)).toBe('−12.3%');
    expect(pct(null)).toBe('—');
    expect(tokens(930_000n * 10n ** 18n)).toBe('930.0K');
    expect(tokens(1_850_000n * 10n ** 18n)).toBe('1.85M');
    expect(elapsed(0, 7_300)).toEqual({ n: 2, unit: 'h' });
  });
});

describe('metadata', () => {
  it('reads inline JSON and drops unsafe links', () => {
    const json = JSON.stringify({ description: 'gm', website: 'https://holdr.app', x: 'javascript:alert(1)', image: 'https://evil.example/x.png' });
    const m = parseMeta('data:application/json,' + encodeURIComponent(json));
    expect(m.description).toBe('gm');
    expect(m.website).toBe('https://holdr.app/');
    expect(m.x).toBeUndefined();
    expect(m.image).toBeUndefined();
    expect(parseMeta('ipfs://holdr-smoke-test')).toEqual({});
  });
});
