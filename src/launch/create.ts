import { BaseError, ContractFunctionRevertedError, InsufficientFundsError, UserRejectedRequestError } from 'viem';
import type { Key } from '../i18n';
import { CURVE_SUPPLY, TOTAL_SUPPLY } from './contracts';
import type { ErrMsg } from './trade';

/** Pure helpers for the launch form: field checks, links, curve math for the creator's first buy. */

export const NAME_MAX_BYTES = 32; // LaunchpadFactory: 1..32 bytes
export const SYMBOL_MAX = 10; // LaunchpadFactory: 1..10 bytes
export const DESC_MAX = 280;

const LP_SUPPLY = 200_000_000n * 10n ** 18n;
const BPS = 10_000n;

export const byteLen = (s: string) => new TextEncoder().encode(s).length;

export type FieldErr = 'nameEmpty' | 'nameLong' | 'symEmpty' | 'symLong' | 'symChars' | 'descLong' | 'linkBad';
export const FIELD_KEY: Record<FieldErr, Key> = {
  nameEmpty: 'ceNameEmpty', nameLong: 'ceNameLong', symEmpty: 'ceSymEmpty', symLong: 'ceSymLong',
  symChars: 'ceSymChars', descLong: 'ceDescLong', linkBad: 'ceLinkBad',
};

/** What the ticker box keeps as you type: no "$", no spaces, upper case. */
export function normSymbol(raw: string): string {
  return raw.replace(/[$\s]/g, '').toUpperCase();
}

export function checkName(name: string): FieldErr | null {
  const n = name.trim();
  if (!n) return 'nameEmpty';
  if (byteLen(n) > NAME_MAX_BYTES) return 'nameLong';
  return null;
}

/** Tickers are A–Z and 0–9 only (the contract takes any bytes; we keep them easy to type and search). */
export function checkSymbol(sym: string): FieldErr | null {
  if (!sym) return 'symEmpty';
  if (!/^[A-Z0-9]+$/.test(sym)) return 'symChars';
  if (sym.length > SYMBOL_MAX) return 'symLong';
  return null;
}

export function checkDesc(desc: string): FieldErr | null {
  return [...desc.trim()].length > DESC_MAX ? 'descLong' : null;
}

export type LinkKind = 'x' | 'telegram' | 'website';

const HANDLE = /^@?([A-Za-z0-9_]{1,32})$/;

/**
 * Turns what people type into an https link: "@gems", "x.com/gems", "t.me/gems", "gems.xyz".
 * Returns undefined for an empty box and null for something that is not a usable link.
 */
export function normLink(kind: LinkKind, raw: string): string | undefined | null {
  const s = raw.trim();
  if (!s) return undefined;
  if (kind !== 'website') {
    const h = HANDLE.exec(s);
    if (h) return kind === 'x' ? `https://x.com/${h[1]}` : `https://t.me/${h[1]}`;
  }
  if (/^http:\/\//i.test(s)) return null; // links must be https (parseMeta drops anything else)
  let url: URL;
  try {
    url = new URL(/^https:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname)) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (kind === 'x' && !['x.com', 'twitter.com', 'mobile.twitter.com'].includes(host)) return null;
  if (kind === 'telegram' && !['t.me', 'telegram.me'].includes(host)) return null;
  if (kind === 'x') url.hostname = 'x.com';
  return url.href;
}

/** Launch settings every new curve starts from (LaunchpadFactory.config().params). */
export interface CurveCfg {
  gradThreshold: bigint; // USDG, 6 decimals
  firstBuyMaxTokens: bigint;
  feeBps: number;
  creatorShareBps: number;
}

/** Same formulas as CurvePool.initialize. */
export function curveStart(cfg: CurveCfg): { virtualUsdg: bigint; initialVirtualTokens: bigint } {
  const v = (cfg.gradThreshold * LP_SUPPLY) / (CURVE_SUPPLY - LP_SUPPLY) + 1n;
  return { virtualUsdg: v, initialVirtualTokens: (CURVE_SUPPLY * (v + cfg.gradThreshold)) / cfg.gradThreshold };
}

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

export interface FirstBuyQuote {
  tokensOut: bigint;
  fee: bigint; // USDG
  toCurve: bigint; // USDG
}

/** CurvePool._quoteBuy on a fresh pool, without the surcharge (the creator's first buy skips it). */
export function quoteFirstBuy(cfg: CurveCfg, usdgIn: bigint): FirstBuyQuote {
  if (usdgIn <= 0n) return { tokensOut: 0n, fee: 0n, toCurve: 0n };
  const { virtualUsdg: x, initialVirtualTokens: y } = curveStart(cfg);
  const fee = ceilDiv(usdgIn * BigInt(cfg.feeBps), BPS);
  const toCurve = usdgIn - fee;
  const newY = ceilDiv(x * y, x + toCurve);
  return { tokensOut: y - newY, fee, toCurve };
}

/** Largest first buy (USDG, raw) whose tokens stay within firstBuyMaxTokens. */
export function maxFirstBuy(cfg: CurveCfg): bigint {
  if (cfg.firstBuyMaxTokens <= 0n) return 0n;
  let lo = 0n;
  let hi = cfg.gradThreshold; // first buy can never fill the curve under the 100M-token cap
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    if (quoteFirstBuy(cfg, mid).tokensOut <= cfg.firstBuyMaxTokens) lo = mid;
    else hi = mid - 1n;
  }
  return lo;
}

/** Market cap in USD with `toCurve` USDG already in the curve (0 = opening). */
export function capAfter(cfg: CurveCfg, toCurve: bigint, tokensOut: bigint): number {
  const { virtualUsdg, initialVirtualTokens } = curveStart(cfg);
  const x = Number(virtualUsdg + toCurve) / 1e6;
  const y = Number(initialVirtualTokens - tokensOut) / 1e18;
  return (x / y) * (Number(TOTAL_SUPPLY) / 1e18);
}

/** Share of the 1B supply, in percent. */
export const pctSupply = (tokens: bigint) => (Number(tokens) / Number(TOTAL_SUPPLY)) * 100;

/** Wallet / contract errors from createToken. */
export function explainCreate(e: unknown): ErrMsg {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return { key: 'errRejected' };
    if (e.walk((x) => x instanceof InsufficientFundsError)) return { key: 'ceErrEth' };
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    switch (rev?.data?.errorName) {
      case 'LaunchPaused': case 'MigratorNotLinked': return { key: 'ceErrPaused' };
      case 'WrongLaunchFee': return { key: 'ceErrFee' };
      case 'BadName': return { key: 'ceNameLong' };
      case 'BadSymbol': return { key: 'ceSymLong' };
      case 'FirstBuyTooLarge': return { key: 'ceErrFirstMax' };
      case 'SlippageExceeded': return { key: 'ceErrFirstSlip' };
      case 'ERC20InsufficientBalance': return { key: 'ceErrUsdg' };
      case 'ERC20InsufficientAllowance': case 'UsdgNotReceived': return { key: 'ceErrAllowance' };
    }
  }
  if (/user (rejected|denied)|rejected the request|request rejected|cancel/i.test(msg)) return { key: 'errRejected' };
  if (/insufficient funds/i.test(msg)) return { key: 'ceErrEth' };
  return { key: 'errGeneric' };
}

/** "Just launched $SYM" post for X (text only; the X intent opens with it filled in). */
export function shareOnX(symbol: string, token: string, siteUrl: string): string {
  const text = `I just launched $${symbol} on Holdrs 🌙\n\nCA: ${token}\n\n${siteUrl}`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
}
