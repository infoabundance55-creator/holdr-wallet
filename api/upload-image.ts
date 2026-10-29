/**
 * POST /api/upload-image — stores a token image in Vercel Blob and returns its public URL.
 *
 * The browser already squares and shrinks the image (src/launch/tokenImage.ts), so this endpoint
 * only accepts small PNG / JPEG / WebP / GIF files, checks the real file bytes (not the header the
 * client claims), and names each file by its SHA-256 hash: the same image always gets the same URL,
 * and a URL can never point to different bytes later.
 *
 * Needs BLOB_READ_WRITE_TOKEN (added by Vercel when the Blob store is connected to the project).
 */
import { put } from '@vercel/blob';

export const MAX_BYTES = 1024 * 1024;

type ImageKind = { mime: string; ext: string };

/** Detects the image type from its first bytes. SVG and everything else is rejected. */
export function sniffImage(b: Uint8Array): ImageKind | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mime: 'image/png', ext: 'png' };
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length >= 6 && (at(0, 0x47, 0x49, 0x46, 0x38, 0x37, 0x61) || at(0, 0x47, 0x49, 0x46, 0x38, 0x39, 0x61))) return { mime: 'image/gif', ext: 'gif' };
  if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/** Only our own pages may upload: production, the holdrs.xyz domain, this project's previews, and local dev. */
export function allowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (u.protocol === 'http:') return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:') return false;
  const h = u.hostname;
  return (
    h === 'holdrs.xyz' || h === 'www.holdrs.xyz' || h === 'holdr-wallet.vercel.app' ||
    /^holdr-wallet-[a-z0-9-]+-infoabundance55-creator\.vercel\.app$/.test(h)
  );
}

async function sha256Hex(b: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', b));
  return Array.from(d, (x) => x.toString(16).padStart(2, '0')).join('');
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** Testable core: validates the request and stores the image with the given `store` function. */
export async function handleUpload(
  request: Request,
  store: (path: string, body: Uint8Array, mime: string) => Promise<string> = defaultStore,
): Promise<Response> {
  if (!allowedOrigin(request.headers.get('origin'))) return json(403, { error: 'origin' });
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BYTES) return json(413, { error: 'too_large' });

  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length === 0) return json(400, { error: 'empty' });
  if (body.length > MAX_BYTES) return json(413, { error: 'too_large' });
  const kind = sniffImage(body);
  if (!kind) return json(415, { error: 'type' });

  const path = `tokens/${await sha256Hex(body)}.${kind.ext}`;
  try {
    const url = await store(path, body, kind.mime);
    return json(200, { url });
  } catch (e) {
    console.error('blob put failed', e);
    return json(502, { error: 'storage' });
  }
}

async function defaultStore(path: string, body: Uint8Array, mime: string): Promise<string> {
  const blob = await put(path, Buffer.from(body), {
    access: 'public',
    contentType: mime,
    addRandomSuffix: false,
    // Same path means same bytes (content hash), so overwriting is harmless and makes retries idempotent.
    allowOverwrite: true,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return blob.url;
}

export function POST(request: Request): Promise<Response> {
  return handleUpload(request);
}
