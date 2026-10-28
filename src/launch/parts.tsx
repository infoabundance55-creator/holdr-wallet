import type { Key } from '../i18n';
import { elapsed } from './fmt';

export interface TokenMeta {
  description?: string;
  image?: string;
  website?: string;
  x?: string;
  telegram?: string;
}

/**
 * Reads inline metadata (data:application/json). Remote URIs (ipfs://, https://) are resolved
 * once the upload service lands; until then they fall back to the letter avatar.
 */
export function parseMeta(uri: string): TokenMeta {
  try {
    const m = /^data:application\/json(;base64)?,(.*)$/s.exec(uri);
    if (!m) return {};
    const json = m[1] ? atob(m[2]) : decodeURIComponent(m[2]);
    const o = JSON.parse(json) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v.length < 2000 ? v : undefined);
    const image = typeof o.image === 'string' && o.image.length < 200_000 ? o.image : undefined;
    return {
      description: str(o.description),
      // Only inline images: the page CSP allows data: and same-origin images.
      image: image && /^data:image\/(png|jpeg|gif|webp);base64,/.test(image) ? image : undefined,
      website: safeUrl(str(o.website)),
      x: safeUrl(str(o.x) ?? str(o.twitter)),
      telegram: safeUrl(str(o.telegram)),
    };
  } catch {
    return {};
  }
}

function safeUrl(u?: string): string | undefined {
  if (!u) return undefined;
  try {
    const url = new URL(u);
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const AVATAR_COLORS: [string, string][] = [
  ['#ECEBFF', '#2B2BD9'], ['#FFF4D6', '#8A5A00'], ['#E2F6EA', '#167A46'], ['#FDE7DF', '#B4320A'],
  ['#E6F0FF', '#1D4ED8'], ['#F6E8FF', '#7E22CE'],
];

export function TokenAvatar({ address, symbol, uri, size = 48 }: { address: string; symbol: string; uri: string; size?: number }) {
  const meta = parseMeta(uri);
  const radius = Math.round(size * 0.27);
  if (meta.image) {
    return <img src={meta.image} alt="" width={size} height={size} style={{ flex: 'none', borderRadius: radius, objectFit: 'cover', background: '#ECEBFF' }} />;
  }
  const [bg, fg] = AVATAR_COLORS[parseInt(address.slice(-4), 16) % AVATAR_COLORS.length];
  const letters = [...symbol.replace(/[^\p{L}\p{N}]/gu, '')].slice(0, 2).join('').toUpperCase() || '?';
  return (
    <span aria-hidden="true" style={{ flex: 'none', width: size, height: size, borderRadius: radius, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: Math.round(size * 0.36), letterSpacing: '-0.02em' }}>
      {letters}
    </span>
  );
}

export function Bar({ value, height = 6, color = 'var(--indigo)', label }: { value: number; height?: number; color?: string; label?: string }) {
  const pctValue = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div role="progressbar" aria-valuenow={pctValue} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="lp-bar" style={{ height }}>
      <i style={{ width: `${pctValue}%`, background: color }} />
    </div>
  );
}

type T = (key: Key, vars?: Record<string, string | number>) => string;

export function ago(t: T, fromSec: number, nowSec: number, suffix = false): string {
  const e = elapsed(fromSec, nowSec);
  if (e.unit === 'now') return t('agoNow');
  const x = t(e.unit === 'm' ? 'agoM' : e.unit === 'h' ? 'agoH' : 'agoD', { n: e.n });
  return suffix ? t('agoSuffix', { x }) : x;
}

/** Green / red / neutral class for a percent change. */
export function deltaClass(n: number | null): string {
  return n == null || n === 0 ? 'lp-flat' : n > 0 ? 'lp-up' : 'lp-down';
}
