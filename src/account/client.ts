/** Calls to /api/account/* (same origin; the session is an HttpOnly cookie the page never sees). */
import type { CharId } from '../launch/points';

export interface Me {
  address: string;
  username: string | null;
  total: number;
  level: number;
  levelSeen: number;
  /** Chosen look; null = the level's character. */
  look: CharId | null;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

async function call<T>(method: 'GET' | 'POST', action: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/account/${action}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  // Local `vite` has no /api and answers with the HTML page: treat that as "unavailable".
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) throw new ApiError(res.status || 503, 'unavailable');
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, String(data.error ?? 'server_error'));
  return data as T;
}

export const api = {
  me: () => call<{ me: Me }>('GET', 'me').then((r) => r.me),
  nonce: (address: string, chainId: number) => call<{ nonce: string; message: string }>('POST', 'nonce', { address, chainId }),
  login: (nonce: string, signature: string) => call<{ me: Me }>('POST', 'login', { nonce, signature }).then((r) => r.me),
  username: (username: string) => call<{ me: Me }>('POST', 'username', { username }).then((r) => r.me),
  nameCheck: (u: string) => call<{ ok: boolean; reason?: 'format' | 'reserved' | 'taken' }>('GET', `name-check?u=${encodeURIComponent(u)}`),
  look: (look: CharId | null) => call<{ me: Me }>('POST', 'look', { look }).then((r) => r.me),
  levelSeen: (keep: boolean) => call<{ me: Me }>('POST', 'level-seen', { keep }).then((r) => r.me),
  logout: () => call<{ ok: boolean }>('POST', 'logout', {}),
};

/** Same rule as the server (api/_lib/account-api.ts): 3–15 letters, numbers or _. */
export const USERNAME_RE = /^[A-Za-z0-9_]{3,15}$/;
