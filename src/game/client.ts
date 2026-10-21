/**
 * Browser side of the Moon Jump API. The session token is a random value from
 * the server (no keys); it is kept per wallet address in localStorage.
 */
import type { GameApi, GameMe, GameToday } from './engine';

const KEY = 'holdr.game.v1';

export interface Signs {
  address: string;
  signMessage(message: string): Promise<string>;
}

interface Saved { address: string; token: string }

function loadSaved(address: string): string | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null;
    return s && s.address.toLowerCase() === address.toLowerCase() ? s.token : null;
  } catch {
    return null;
  }
}
function saveToken(address: string, token: string | null) {
  try {
    if (token) localStorage.setItem(KEY, JSON.stringify({ address: address.toLowerCase(), token }));
    else localStorage.removeItem(KEY);
  } catch { /* storage unavailable: session lasts this page only */ }
}

export class GameError extends Error {
  constructor(public code: string, public status = 0) { super(code); }
}

export function createGameApi(signer: Signs, fetchImpl: typeof fetch = (...a) => fetch(...a)): GameApi {
  let token = loadSaved(signer.address);

  async function call<T>(action: string, opts: { body?: unknown; query?: string } = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`/api/game/${action}${opts.query ? `?${opts.query}` : ''}`, {
        method: opts.body === undefined ? 'GET' : 'POST',
        headers: {
          ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
    } catch {
      throw new GameError('network');
    }
    let data: Record<string, unknown> = {};
    try { data = await res.json(); } catch { /* empty or non-JSON body */ }
    if (!res.ok) {
      const code = typeof data.error === 'string' ? data.error : 'network';
      if (res.status === 401) { token = null; saveToken(signer.address, null); }
      throw new GameError(code, res.status);
    }
    return data as T;
  }

  return {
    async session() {
      if (!token) return null;
      try {
        return await call<{ me: GameMe; today: GameToday }>('me');
      } catch (e) {
        if (e instanceof GameError && e.code === 'no_session') return null;
        throw e;
      }
    },
    async login() {
      const n = await call<{ nonce: string; message: string }>('nonce', { body: { address: signer.address } });
      let signature: string;
      try {
        signature = await signer.signMessage(n.message);
      } catch {
        throw new GameError('cancelled');
      }
      const r = await call<{ token: string; me: GameMe }>('login', { body: { address: signer.address, nonce: n.nonce, signature } });
      token = r.token;
      saveToken(signer.address, token);
      return call<{ me: GameMe; today: GameToday }>('me');
    },
    nameCheck: (u) => call('name-check', { query: `u=${encodeURIComponent(u)}` }),
    setProfile: (patch) => call('profile', { body: patch }),
    start: (daily) => call('start', { body: { daily } }),
    finish: (ticket, height, coins) => call('finish', { body: { ticket, height, coins } }),
    leaderboard: () => call('leaderboard'),
    town: (level) => call('town', { query: `level=${level}` }),
    greet: (username) => call('greet', { body: { username } }),
    checkin: () => call('checkin', { body: {} }),
  };
}
