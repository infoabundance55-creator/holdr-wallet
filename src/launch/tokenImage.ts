/**
 * Token images: shrink in the browser, upload to Vercel Blob via /api/upload-image,
 * then reference the returned URL from the token's inline metadata.
 */

/** Our Blob store. Only images on this host (under tokens/, named by hash) are shown. */
export const TOKEN_IMAGE_HOST = import.meta.env.VITE_TOKEN_IMAGE_HOST || '';

export const IMAGE_SIDE = 512;
export const MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 1024 * 1024;
export const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

const URL_RE = /^\/tokens\/[0-9a-f]{64}\.(png|jpg|webp|gif)$/;

/** True for URLs our upload endpoint produces. Anything else falls back to the letter avatar. */
export function isTokenImageUrl(u: string, host = TOKEN_IMAGE_HOST): boolean {
  try {
    const url = new URL(u);
    return !!host && url.protocol === 'https:' && url.hostname === host && !url.search && !url.hash && URL_RE.test(url.pathname);
  } catch {
    return false;
  }
}

export type ImageError = 'type' | 'too_large' | 'decode' | 'upload' | 'network';

export class TokenImageError extends Error {
  constructor(public code: ImageError) {
    super(code);
  }
}

/** Center square crop size and the output side for a source of w × h. Never upscales. */
export function squareCrop(w: number, h: number, max = IMAGE_SIDE): { sx: number; sy: number; s: number; out: number } {
  const s = Math.min(w, h);
  return { sx: Math.floor((w - s) / 2), sy: Math.floor((h - s) / 2), s, out: Math.max(1, Math.min(max, s)) };
}

function toBlob(c: HTMLCanvasElement, type: string, q?: number): Promise<Blob | null> {
  return new Promise((r) => c.toBlob(r, type, q));
}

/**
 * Crops to a centered square, scales to at most 512 × 512 and re-encodes (WebP, or PNG/JPEG where
 * the browser can't write WebP). Re-encoding also strips metadata such as GPS location.
 * GIFs become a still image (first frame).
 */
export async function prepareImage(file: File): Promise<Blob> {
  if (!ACCEPT.split(',').includes(file.type)) throw new TokenImageError('type');
  if (file.size > MAX_INPUT_BYTES) throw new TokenImageError('too_large');
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new TokenImageError('decode');
  }
  const { sx, sy, s, out } = squareCrop(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = out;
  const ctx = c.getContext('2d');
  if (!ctx) throw new TokenImageError('decode');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, s, s, 0, 0, out, out);
  bmp.close();

  // WebP keeps transparency and is small. Safari may hand back PNG instead; if that is too big, use JPEG.
  let blob = await toBlob(c, 'image/webp', 0.86);
  if (!blob || blob.size > MAX_UPLOAD_BYTES) blob = await toBlob(c, 'image/jpeg', 0.88);
  if (!blob) throw new TokenImageError('decode');
  if (blob.size > MAX_UPLOAD_BYTES) throw new TokenImageError('too_large');
  return blob;
}

/** Uploads a prepared image and returns its public URL. */
export async function uploadTokenImage(blob: Blob, endpoint = '/api/upload-image'): Promise<string> {
  let res: Response;
  try {
    res = await fetch(endpoint, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'application/octet-stream' } });
  } catch {
    throw new TokenImageError('network');
  }
  const body = (await res.json().catch(() => ({}))) as { url?: unknown; error?: unknown };
  if (!res.ok) throw new TokenImageError(body.error === 'too_large' || body.error === 'type' ? body.error : 'upload');
  if (typeof body.url !== 'string' || !isTokenImageUrl(body.url)) throw new TokenImageError('upload');
  return body.url;
}

export interface MetaInput {
  description?: string;
  image?: string;
  website?: string;
  x?: string;
  telegram?: string;
}

/** Inline metadata stored on-chain at launch (base64 JSON, read back by parseMeta). Empty fields are dropped. */
export function buildMetaURI(m: MetaInput): string {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries(m)) {
    const s = typeof v === 'string' ? v.trim() : '';
    if (s) o[k] = s;
  }
  const bytes = new TextEncoder().encode(JSON.stringify(o));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'data:application/json;base64,' + btoa(bin);
}
