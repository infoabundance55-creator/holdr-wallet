import { BaseError, ContractFunctionRevertedError, InsufficientFundsError, UserRejectedRequestError } from 'viem';
import type { Key } from '../i18n';
import type { LaunchToken } from './math';

/** Pure helpers for the trade panel: slippage, points estimate, price impact, error messages. */

export const SLIPPAGE_CHOICES = [50, 100, 200, 500]; // bps
export const DEFAULT_SLIPPAGE = 200;
/** The buy that graduates a token runs the Uniswap migration too (~515K gas); give it room. */
export const GRADUATION_GAS = 800_000n;
export const DEADLINE_SEC = 20 * 60;
export const FAUCET_AMOUNT = 1_000n * 10n ** 6n;
/** Points plan §2: trades under $5 earn nothing. */
export const MIN_POINTS_TRADE = 5;

export function withSlippage(amount: bigint, slipBps: number): bigint {
  return (amount * BigInt(10_000 - slipBps)) / 10_000n;
}

/** Points for a whole day's trading volume (points plan §4: 10 / 5 / 2.5 per $1 in tiers). */
export function dayPoints(usd: number): number {
  return Math.min(usd, 1_000) * 10 + Math.max(0, Math.min(usd, 10_000) - 1_000) * 5 + Math.max(0, usd - 10_000) * 2.5;
}

/** Points this trade adds on top of what the wallet already traded today. */
export function tradePoints(tradeUsd: number, todayBefore: number): number {
  if (!(tradeUsd >= MIN_POINTS_TRADE)) return 0;
  return Math.round(dayPoints(todayBefore + tradeUsd) - dayPoints(todayBefore));
}

/** USDG traded by `who` across all tokens since `dayStart` (unix seconds), trades of $5+ only. */
export function todayVolume(tokens: LaunchToken[], who: string, dayStart: number): number {
  const me = who.toLowerCase();
  let v = 0;
  for (const t of tokens) {
    for (let i = t.trades.length - 1; i >= 0; i--) {
      const tr = t.trades[i];
      if (tr.time && tr.time < dayStart) break;
      const usd = Number(tr.usdg) / 1e6;
      if (tr.trader.toLowerCase() === me && usd >= MIN_POINTS_TRADE) v += usd;
    }
  }
  return v;
}

export function localDayStart(nowSec: number): number {
  const d = new Date(nowSec * 1000);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

/**
 * Price impact in percent, from the spot price before the trade (USDG per token) and the trade's
 * average price before fees. Positive = worse than spot.
 */
export function impactPct(spot: number, usdgNet: number, tokens: number, isBuy: boolean): number {
  if (!(spot > 0) || !(tokens > 0)) return 0;
  const avg = usdgNet / tokens;
  return Math.max(0, (isBuy ? avg / spot - 1 : 1 - avg / spot) * 100);
}

/** Whole-number-ish display of a raw token amount: 2,150,070 / 2.15M. */
export function fmtRaw(units: bigint, decimals: number, compact = false): string {
  const n = Number(units) / 10 ** decimals;
  if (compact && n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (compact && n >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  if (n >= 1000) return Math.floor(n).toLocaleString('en-US');
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return n.toLocaleString('en-US', { maximumSignificantDigits: 4 });
}

/** Plain decimal string for an input box (no grouping): 1234.5 */
export function toInput(units: bigint, decimals: number, maxFrac = 6): string {
  const s = units.toString().padStart(decimals + 1, '0');
  const int = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals, s.length - decimals + maxFrac).replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
}

export interface ErrMsg { key: Key; vars?: Record<string, string | number> }

/** Turns a wallet / contract error into a short message. */
export function explain(e: unknown, slipBps: number, maxBuy?: number): ErrMsg {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return { key: 'errRejected' };
    if (e.walk((x) => x instanceof InsufficientFundsError)) return { key: 'errGas' };
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = rev?.data?.errorName;
    if (name === 'SlippageExceeded' || name === 'TooLittleReceived') return { key: 'errSlip', vars: { s: slipBps / 100 } };
    if (name === 'Expired') return { key: 'errExpired' };
    if (name === 'BuyPaused') return { key: 'errPaused' };
    if (name === 'BuyTooLarge') return { key: 'errTooLarge', vars: { n: maxBuy ?? '' } };
    if (name === 'IsGraduated') return { key: 'errGraduated' };
  }
  if (/user (rejected|denied)|rejected the request|request rejected|cancel/i.test(msg)) return { key: 'errRejected' };
  if (/insufficient funds/i.test(msg)) return { key: 'errGas' };
  return { key: 'errGeneric' };
}
