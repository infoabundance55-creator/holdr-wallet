/**
 * Minimal Supabase REST (PostgREST) client for the server only.
 * Uses the secret key from Vercel env vars; it never reaches the browser.
 */

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length ? v : undefined;
}

export function dbConfigured(): boolean {
  return Boolean(env('STORAGE_SUPABASE_URL') && (env('STORAGE_SUPABASE_SECRET_KEY') || env('STORAGE_SUPABASE_SERVICE_ROLE_KEY')));
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const key = env('STORAGE_SUPABASE_SECRET_KEY') || env('STORAGE_SUPABASE_SERVICE_ROLE_KEY') || '';
  const h: Record<string, string> = { apikey: key, 'content-type': 'application/json', ...extra };
  // New-style secret keys (sb_secret_...) go only in `apikey`; legacy JWT keys also need Authorization.
  if (!key.startsWith('sb_')) h.authorization = `Bearer ${key}`;
  return h;
}

export class DbError extends Error {
  constructor(public status: number, public code: string | undefined, message: string) {
    super(message);
  }
}

export interface DbResult<T> { data: T; count: number | null }

export async function db<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; prefer?: string[]; count?: boolean } = {},
): Promise<DbResult<T>> {
  const base = env('STORAGE_SUPABASE_URL');
  if (!base) throw new DbError(500, 'no_db', 'Database not configured');
  const prefer = [...(init.prefer ?? [])];
  if (init.count) prefer.push('count=exact');
  const res = await fetch(`${base.replace(/\/$/, '')}/rest/v1/${path}`, {
    method: init.method ?? 'GET',
    headers: headers(prefer.length ? { prefer: prefer.join(',') } : {}),
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try { json = JSON.parse(text); } catch { json = null; }
  }
  if (!res.ok) {
    const j = (json ?? {}) as { code?: string; message?: string };
    throw new DbError(res.status, j.code, j.message ?? `db ${res.status}`);
  }
  let count: number | null = null;
  const range = res.headers.get('content-range');
  if (range && range.includes('/')) {
    const n = Number(range.split('/')[1]);
    count = Number.isFinite(n) ? n : null;
  }
  return { data: json as T, count };
}

export const enc = encodeURIComponent;
