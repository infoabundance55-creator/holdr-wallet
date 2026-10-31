import { describe, expect, it } from 'vitest';
import { parseMeta } from './parts';
import { buildMetaURI, isTokenImageUrl, squareCrop } from './tokenImage';

const HASH = 'a'.repeat(64);

describe('token images', () => {
  it('accepts only hashed images on our Blob host', () => {
    const h = 'store.public.blob.vercel-storage.com';
    expect(isTokenImageUrl(`https://${h}/tokens/${HASH}.webp`, h)).toBe(true);
    expect(isTokenImageUrl(`https://${h}/tokens/${HASH}.svg`, h)).toBe(false);
    expect(isTokenImageUrl(`https://${h}/other/${HASH}.png`, h)).toBe(false);
    expect(isTokenImageUrl(`https://${h}/tokens/${HASH}.png?x=1`, h)).toBe(false);
    expect(isTokenImageUrl(`http://${h}/tokens/${HASH}.png`, h)).toBe(false);
    expect(isTokenImageUrl(`https://${h}/tokens/${HASH}.png`, '')).toBe(false);
    expect(isTokenImageUrl(`https://evil.public.blob.vercel-storage.com/tokens/${HASH}.png`, h)).toBe(false);
  });

  it('crops to a centered square and never upscales', () => {
    expect(squareCrop(1200, 800)).toEqual({ sx: 200, sy: 0, s: 800, out: 512 });
    expect(squareCrop(300, 400)).toEqual({ sx: 0, sy: 50, s: 300, out: 300 });
  });

  it('builds metadata that parseMeta reads back, including non-ASCII text', () => {
    const image = 'data:image/webp;base64,UklGRg==';
    const uri = buildMetaURI({ description: ' 月球见 🌙 ', image, website: 'https://holdrs.xyz', x: '', telegram: undefined });
    expect(uri.startsWith('data:application/json;base64,')).toBe(true);
    const m = parseMeta(uri);
    expect(m.description).toBe('月球见 🌙');
    expect(m.image).toBe(image);
    expect(m.website).toBe('https://holdrs.xyz/');
    expect(m.x).toBeUndefined();
  });
});
