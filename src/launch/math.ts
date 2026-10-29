import { TOTAL_SUPPLY } from './contracts';

/** Curve settings copied into a pool at launch (CurvePool public state). */
export interface PoolParams {
  virtualUsdg: bigint; // 6 decimals
  initialVirtualTokens: bigint; // 18 decimals
  gradThreshold: bigint; // 6 decimals
  feeBps: number;
  creatorShareBps: number;
  firstBuyMaxTokens: bigint;
  launchTime: number; // unix seconds
}

export interface TradeEv {
  block: number;
  logIndex: number;
  time: number; // unix seconds
  tx: string;
  trader: string;
  isBuy: boolean;
  usdg: bigint; // buy: paid; sell: received
  tokens: bigint;
  fee: bigint;
  surcharge: bigint;
  /** Curve state after the trade (for Uniswap trades: the final curve state). */
  realAfter: bigint;
  soldAfter: bigint;
  /** 'curve' = bonding curve, 'uni' = the Uniswap v4 pool after graduation. */
  venue: 'curve' | 'uni';
  /** Spot price in USDG per whole token right after the trade. */
  price: number;
}

/** A creator fee claim: on the curve (USDG) or from the liquidity locker (USDG or the token). */
export interface ClaimEv {
  block: number;
  logIndex: number;
  time: number;
  tx: string;
  account: string;
  /** Token the fees came from (lower-case). */
  token: string;
  /** 'usdg' or 'token'. */
  currency: 'usdg' | 'token';
  amount: bigint;
}

export interface LaunchToken {
  token: string;
  pool: string;
  creator: string;
  name: string;
  symbol: string;
  metadataURI: string;
  createdBlock: number;
  createdAt: number; // unix seconds
  params: PoolParams | null;
  trades: TradeEv[]; // oldest first
  graduated: boolean;
  graduatedAt: number | null;
  /** Transaction that graduated the token. */
  gradTx?: string;
  /** Lower-cased holder => balance, from Transfer events. */
  balances: Map<string, bigint>;
  /** Tokens burned at graduation (unsold curve tokens). */
  burned: bigint;
  /** Id of the official Uniswap v4 pool (lower-case), used once the token graduates. */
  poolId: string;
}

const USDG = 1e6;
const TOK = 1e18;

/** Spot price in USDG per whole token for given curve state. */
export function priceAt(p: PoolParams, realUsdg: bigint, tokensSold: bigint): number {
  const x = Number(p.virtualUsdg + realUsdg) / USDG;
  const y = Number(p.initialVirtualTokens - tokensSold) / TOK;
  return y > 0 ? x / y : 0;
}

/** Curve state after the last curve trade. */
export function lastState(t: LaunchToken): { real: bigint; sold: bigint } {
  for (let i = t.trades.length - 1; i >= 0; i--) {
    const tr = t.trades[i];
    if (tr.venue === 'curve') return { real: tr.realAfter, sold: tr.soldAfter };
  }
  return { real: 0n, sold: 0n };
}

export function launchPrice(t: LaunchToken): number {
  return t.params ? priceAt(t.params, 0n, 0n) : 0;
}

/** Price after the last trade (curve or Uniswap); the launch price before any trade. */
export function currentPrice(t: LaunchToken): number {
  if (!t.params) return 0;
  const last = t.trades[t.trades.length - 1];
  return last ? last.price : launchPrice(t);
}

/** Price right after the last trade at or before `time`; the launch price if none. */
export function priceAtTime(t: LaunchToken, time: number): number {
  if (!t.params) return 0;
  let p = launchPrice(t);
  for (const tr of t.trades) {
    if (tr.time > time) break;
    p = tr.price;
  }
  return p;
}

export function supplyOf(t: LaunchToken): bigint {
  return TOTAL_SUPPLY - t.burned;
}

export function marketCap(t: LaunchToken): number {
  return currentPrice(t) * (Number(supplyOf(t)) / TOK);
}

/** 0..1 share of the graduation threshold raised. */
export function progress(t: LaunchToken): number {
  if (t.graduated) return 1;
  if (!t.params || t.params.gradThreshold === 0n) return 0;
  const { real } = lastState(t);
  return Math.min(1, Number(real) / Number(t.params.gradThreshold));
}

export function raisedUsdg(t: LaunchToken): number {
  return Number(lastState(t).real) / USDG;
}

export function thresholdUsdg(t: LaunchToken): number {
  return t.params ? Number(t.params.gradThreshold) / USDG : 0;
}

/** Percent price change over the last `windowSec` (default 24h). Null before any trade. */
export function change(t: LaunchToken, now: number, windowSec = 86_400): number | null {
  if (!t.params || t.trades.length === 0) return null;
  const then = priceAtTime(t, now - windowSec);
  const cur = currentPrice(t);
  return then > 0 ? ((cur - then) / then) * 100 : null;
}

export function volume(t: LaunchToken, now: number, windowSec = 86_400): number {
  let v = 0n;
  for (let i = t.trades.length - 1; i >= 0; i--) {
    const tr = t.trades[i];
    if (tr.time < now - windowSec) break;
    v += tr.usdg;
  }
  return Number(v) / USDG;
}

export function totalVolume(t: LaunchToken): number {
  return Number(t.trades.reduce((s, tr) => s + tr.usdg, 0n)) / USDG;
}

/** Holder balances excluding the curve pool, the zero address and protocol contracts. */
export function holderList(t: LaunchToken, exclude: string[]): { address: string; balance: bigint }[] {
  const skip = new Set([t.pool.toLowerCase(), '0x0000000000000000000000000000000000000000', ...exclude.map((a) => a.toLowerCase())]);
  const out: { address: string; balance: bigint }[] = [];
  for (const [a, b] of t.balances) if (b > 0n && !skip.has(a)) out.push({ address: a, balance: b });
  out.sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0));
  return out;
}

/** Share of total supply, 0..100. */
export function pctOfSupply(t: LaunchToken, amount: bigint): number {
  const s = supplyOf(t);
  return s > 0n ? (Number(amount) / Number(s)) * 100 : 0;
}

export function top10Pct(t: LaunchToken, exclude: string[]): number {
  return pctOfSupply(t, holderList(t, exclude).slice(0, 10).reduce((s, h) => s + h.balance, 0n));
}

export function balanceOf(t: LaunchToken, who: string): bigint {
  return t.balances.get(who.toLowerCase()) ?? 0n;
}

/** Applies one ERC-20 Transfer to the balance map. */
export function applyTransfer(balances: Map<string, bigint>, from: string, to: string, value: bigint): void {
  const f = from.toLowerCase(), t = to.toLowerCase();
  if (f !== '0x0000000000000000000000000000000000000000') balances.set(f, (balances.get(f) ?? 0n) - value);
  balances.set(t, (balances.get(t) ?? 0n) + value);
}

export interface Candle { t: number; o: number; h: number; l: number; c: number; v: number }

/** Candles of `interval` seconds, last `count` buckets ending at `now`. Empty buckets carry the close forward. */
export function candles(t: LaunchToken, interval: number, now: number, count = 36): Candle[] {
  if (!t.params) return [];
  const end = Math.floor(now / interval) * interval;
  const start = Math.max(end - (count - 1) * interval, Math.floor(t.createdAt / interval) * interval);
  let price = priceAtTime(t, start - 1);
  let i = t.trades.findIndex((tr) => tr.time >= start);
  if (i < 0) i = t.trades.length;
  const out: Candle[] = [];
  for (let b = start; b <= end; b += interval) {
    const c: Candle = { t: b, o: price, h: price, l: price, c: price, v: 0 };
    while (i < t.trades.length && t.trades[i].time < b + interval) {
      const tr = t.trades[i++];
      const p = tr.price;
      c.v += Number(tr.usdg) / USDG;
      c.h = Math.max(c.h, p); c.l = Math.min(c.l, p); c.c = p;
    }
    price = c.c;
    out.push(c);
  }
  return out;
}

export type Filter = 'trending' | 'new' | 'almost' | 'graduated' | 'mcap';

export function sortTokens(list: LaunchToken[], f: Filter, now: number): LaunchToken[] {
  const live = list.filter((t) => t.params);
  switch (f) {
    case 'new':
      return [...live].sort((a, b) => b.createdBlock - a.createdBlock);
    case 'almost':
      return live.filter((t) => !t.graduated).sort((a, b) => progress(b) - progress(a));
    case 'graduated':
      return live.filter((t) => t.graduated).sort((a, b) => (b.graduatedAt ?? 0) - (a.graduatedAt ?? 0));
    case 'mcap':
      return [...live].sort((a, b) => marketCap(b) - marketCap(a));
    default:
      return [...live].sort((a, b) => volume(b, now) - volume(a, now) || marketCap(b) - marketCap(a) || b.createdBlock - a.createdBlock);
  }
}

export function search(list: LaunchToken[], q: string): LaunchToken[] {
  const s = q.trim().toLowerCase().replace(/^\$/, '');
  if (!s) return list;
  return list.filter((t) => t.name.toLowerCase().includes(s) || t.symbol.toLowerCase().includes(s) || t.token.toLowerCase() === s || t.pool.toLowerCase() === s);
}

/** Tokens still on the curve that are at least `min` of the way to graduating. */
export function almostGraduating(list: LaunchToken[], min = 0.5, max = 5): LaunchToken[] {
  return list.filter((t) => t.params && !t.graduated && progress(t) >= min).sort((a, b) => progress(b) - progress(a)).slice(0, max);
}


/** Creator's 70% share of all fees so far, in USDG (Uniswap fees paid in tokens valued at the trade price). */
export function creatorEarned(t: LaunchToken): number {
  if (!t.params) return 0;
  let fees = 0;
  for (const tr of t.trades) fees += Number(tr.fee) / USDG;
  return fees * (t.params.creatorShareBps / 10_000);
}

/** Top `n` tokens by 24h volume, then market cap. */
export function trending(list: LaunchToken[], now: number, n = 10): LaunchToken[] {
  return sortTokens(list, 'trending', now).slice(0, n);
}

/** Sparkline of the last 24h: `points` evenly spaced prices. */
export function spark(t: LaunchToken, now: number, points = 12): number[] {
  const out: number[] = [];
  for (let i = 0; i < points; i++) out.push(priceAtTime(t, now - 86_400 + (86_400 * i) / (points - 1)));
  return out;
}

export interface PlatformStats { launched: number; graduated: number; vol24h: number; creatorFees: number }

export function platformStats(list: LaunchToken[], now: number): PlatformStats {
  const live = list.filter((t) => t.params);
  return {
    launched: live.length,
    graduated: live.filter((t) => t.graduated).length,
    vol24h: live.reduce((s, t) => s + volume(t, now), 0),
    creatorFees: live.reduce((s, t) => s + creatorEarned(t), 0),
  };
}
