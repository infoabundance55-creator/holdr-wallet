import { useState } from 'react';
import type { Key } from '../i18n';
import { elapsed, pct } from './fmt';
import { isTokenImageUrl } from './tokenImage';

export interface TokenMeta {
  description?: string;
  image?: string;
  website?: string;
  x?: string;
  telegram?: string;
}

/**
 * Reads inline metadata (data:application/json). Images may be inline (data:image/...) or a URL from
 * our own Blob store (see tokenImage.ts); anything else falls back to the letter avatar.
 */
export function parseMeta(uri: string): TokenMeta {
  try {
    const m = /^data:application\/json(;base64)?,(.*)$/s.exec(uri);
    if (!m) return {};
    const json = m[1] ? new TextDecoder().decode(Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0))) : decodeURIComponent(m[2]);
    const o = JSON.parse(json) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v.length < 2000 ? v : undefined);
    const image = typeof o.image === 'string' && o.image.length < 200_000 ? o.image : undefined;
    return {
      description: str(o.description),
      // Inline images, or images uploaded through /api/upload-image (the CSP allows that host only).
      image: image && (/^data:image\/(png|jpeg|gif|webp);base64,/.test(image) || isTokenImageUrl(image)) ? image : undefined,
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
  ['#2B2BD9', '#FFFFFF'], ['#3A2A06', '#FFC94D'], ['#0F2A1C', '#2EDB82'], ['#2A1212', '#FF8A8A'],
  ['#1A2133', '#C9CBFF'], ['#26163A', '#D9B8FF'],
];

/** Round token image, or a letter avatar when the token has no usable image. */
export function TokenAvatar({ address, symbol, uri, size = 48 }: { address: string; symbol: string; uri: string; size?: number }) {
  const meta = parseMeta(uri);
  const [broken, setBroken] = useState<string>();
  if (meta.image && broken !== meta.image) {
    const src = meta.image;
    return <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setBroken(src)} style={{ flex: 'none', borderRadius: 999, objectFit: 'cover', background: '#1A2133' }} />;
  }
  const [bg, fg] = AVATAR_COLORS[parseInt(address.slice(-4), 16) % AVATAR_COLORS.length];
  const letters = [...symbol.replace(/[^\p{L}\p{N}]/gu, '')].slice(0, 2).join('').toUpperCase() || '?';
  return (
    <span aria-hidden="true" style={{ flex: 'none', width: size, height: size, borderRadius: 999, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: Math.round(size * (letters.length > 1 ? 0.34 : 0.46)), letterSpacing: '-0.02em' }}>
      {letters}
    </span>
  );
}

/** Progress bar. Tone follows the design: grey below 80%, gold from 80%, green when graduated. */
export function Bar({ value, height = 6, done, label, tone }: { value: number; height?: number; done?: boolean; label?: string; tone?: 'near' | 'done' | 'grey' }) {
  const pctValue = Math.max(0, Math.min(1, value)) * 100;
  const cls = tone ?? (done ? 'done' : pctValue >= 80 ? 'near' : 'grey');
  return (
    <div role="progressbar" aria-valuenow={Math.round(pctValue)} aria-valuemin={0} aria-valuemax={100} aria-label={label} className={'lp-bar ' + cls} style={{ height }}>
      <i style={{ width: `${pctValue}%` }} />
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
  return n == null || Math.abs(n) < 0.05 ? 'lp-flat' : n > 0 ? 'lp-up' : 'lp-down';
}

/** Percent change with an arrow, so up and down never rely on colour alone: ▲ +55.7% / ▼ −11.6%. */
export function Delta({ n, className = '' }: { n: number | null; className?: string }) {
  const cls = deltaClass(n);
  const arrow = cls === 'lp-up' ? '▲ ' : cls === 'lp-down' ? '▼ ' : '';
  return <span className={(className + ' ' + cls).trim()}>{arrow}{cls === 'lp-flat' && n != null ? '0.0%' : pct(n)}</span>;
}

/** Tiny 24h price line for trending cards. */
export function Spark({ values, up, w = 54, h = 22 }: { values: number[]; up: boolean | null; w?: number; h?: number }) {
  const lo = Math.min(...values), hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 2 - ((v - lo) / span) * (h - 4)).toFixed(1)}`).join(' ');
  const color = up == null ? '#8C95B0' : up ? '#2EDB82' : '#FF6464';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ flex: 'none' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** The four Holdr characters (pixel art, transparent). Moon Frog keeps its current look (owner, 2026-10-29). */
export const ART = {
  raccoon: '/art/raccoon.webp',
  frog: '/art/frog.webp',
  bull: '/art/bull.webp',
  anon: '/art/anon.webp',
  coin: '/art/coin.png',
} as const;

export function Cast({ height = 92 }: { height?: number }) {
  return (
    <div className="lp-cast">
      <img src={ART.raccoon} alt="Degen Raccoon" style={{ height: height * 0.94 }} />
      <img src={ART.frog} alt="Moon Frog" style={{ height }} />
      <img src={ART.bull} alt="Laser Bull" style={{ height: height * 0.97 }} />
      <img src={ART.anon} alt="The Anon" style={{ height: height * 1.06 }} />
    </div>
  );
}
