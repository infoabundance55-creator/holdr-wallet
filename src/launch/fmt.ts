/** Display helpers for launchpad numbers. USDG is treated as $1. */

const MINUS = '−';

export function usd(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? MINUS : '';
  if (a >= 1e9) return `${sign}$${trim(a / 1e9)}B`;
  if (a >= 1e6) return `${sign}$${trim(a / 1e6)}M`;
  if (a >= 1e3) return `${sign}$${trim(a / 1e3)}K`;
  return `${sign}$${a.toFixed(2)}`;
}

/** One decimal under 100, none above: 26.6, 128. */
function trim(v: number): string {
  return v >= 100 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toString();
}

/** Price with 3 significant digits: $0.0000266, $0.00312, $1.25. */
export function price(n: number): string {
  if (!(n > 0)) return '$0';
  if (n >= 1) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  const digits = Math.min(18, 2 - Math.floor(Math.log10(n)));
  return `$${n.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '')}`;
}

export function pct(n: number | null, signed = true): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  const s = a >= 100 ? Math.round(a).toLocaleString('en-US') : a.toFixed(1);
  if (!signed) return `${s}%`;
  return `${n > 0 ? '+' : n < 0 ? MINUS : ''}${s}%`;
}

/** Whole-token amount from 18-decimal units, compact: 930K, 0.93M, 12.5M. */
export function tokens(units: bigint): string {
  const n = Number(units) / 1e18;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function usdgAmount(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: n < 100 ? 2 : 0 });
}

/** Elapsed time as { n, unit } so the caller can translate it. */
export function elapsed(fromSec: number, nowSec: number): { n: number; unit: 'now' | 'm' | 'h' | 'd' } {
  const s = Math.max(0, nowSec - fromSec);
  if (s < 60) return { n: 0, unit: 'now' };
  if (s < 3600) return { n: Math.floor(s / 60), unit: 'm' };
  if (s < 86_400) return { n: Math.floor(s / 3600), unit: 'h' };
  return { n: Math.floor(s / 86_400), unit: 'd' };
}
