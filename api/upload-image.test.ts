import { describe, expect, it } from 'vitest';
import { allowedOrigin, handleUpload, MAX_BYTES, sniffImage } from './upload-image';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

function req(body: Uint8Array, origin: string | null = 'https://holdrs.xyz', type = 'image/png') {
  const headers: Record<string, string> = { 'content-type': type };
  if (origin) headers.origin = origin;
  return new Request('https://holdrs.xyz/api/upload-image', { method: 'POST', body, headers });
}

describe('upload-image', () => {
  it('detects image types from bytes', () => {
    expect(sniffImage(PNG)?.ext).toBe('png');
    expect(sniffImage(WEBP)?.ext).toBe('webp');
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe('jpg');
    expect(sniffImage(new TextEncoder().encode('GIF89a...'))?.ext).toBe('gif');
    expect(sniffImage(SVG)).toBeNull();
  });

  it('only allows our own origins', () => {
    expect(allowedOrigin('https://holdrs.xyz')).toBe(true);
    expect(allowedOrigin('https://holdr-wallet.vercel.app')).toBe(true);
    expect(allowedOrigin('https://holdr-wallet-git-launchpad-web-infoabundance55-creator.vercel.app')).toBe(true);
    expect(allowedOrigin('http://localhost:5173')).toBe(true);
    expect(allowedOrigin('https://holdrs.xyz.evil.com')).toBe(false);
    expect(allowedOrigin('https://holdr-wallet-x-someone-else.vercel.app')).toBe(false);
    expect(allowedOrigin('http://holdrs.xyz')).toBe(false);
    expect(allowedOrigin(null)).toBe(false);
  });

  it('stores valid images under their content hash', async () => {
    const saved: [string, string][] = [];
    const store = async (path: string, _b: Uint8Array, mime: string) => {
      saved.push([path, mime]);
      return 'https://store.public.blob.vercel-storage.com/' + path;
    };
    const res = await handleUpload(req(PNG), store);
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    expect(saved[0][0]).toMatch(/^tokens\/[0-9a-f]{64}\.png$/);
    expect(saved[0][1]).toBe('image/png');
    expect(url).toContain(saved[0][0]);
    // Same bytes, same path.
    await handleUpload(req(PNG), store);
    expect(saved[1][0]).toBe(saved[0][0]);
  });

  it('rejects bad requests without storing anything', async () => {
    let calls = 0;
    const store = async () => { calls++; return 'x'; };
    expect((await handleUpload(req(PNG, 'https://evil.example'), store)).status).toBe(403);
    expect((await handleUpload(req(PNG, null), store)).status).toBe(403);
    expect((await handleUpload(req(SVG, undefined, 'image/png'), store)).status).toBe(415);
    expect((await handleUpload(req(new Uint8Array()), store)).status).toBe(400);
    const big = new Uint8Array(MAX_BYTES + 1);
    big.set(PNG);
    expect((await handleUpload(req(big), store)).status).toBe(413);
    expect(calls).toBe(0);
  });

  it('reports storage failures', async () => {
    const res = await handleUpload(req(PNG), async () => { throw new Error('down'); });
    expect(res.status).toBe(502);
  });
});
