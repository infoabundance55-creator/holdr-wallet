/**
 * Storage for accounts, sign-in nonces and sessions.
 * `supabaseStore` talks to Supabase (tables from supabase/migrations/002_accounts.sql);
 * `memoryStore` is the same thing in memory, for tests.
 */
import { db, DbError, enc } from './db.js';
import type { CharId } from './levels.js';

export interface Account {
  address: string;
  username: string | null;
  look: CharId | null;
  total_points: number;
  level_seen: number;
}

export interface NonceRow { address: string; message: string; expires_at: string }

export type AccountPatch = Partial<Pick<Account, 'username' | 'look' | 'level_seen'>>;

export class UsernameTaken extends Error {
  constructor() { super('username_taken'); }
}

export interface AccountStore {
  putNonce(nonce: string, row: NonceRow): Promise<void>;
  /** Returns the nonce and deletes it (one-time use). */
  takeNonce(nonce: string): Promise<NonceRow | null>;
  /** Creates the account on first sign-in; always returns it. */
  touchAccount(address: string): Promise<Account>;
  putSession(tokenHash: string, address: string, expiresAt: string): Promise<void>;
  sessionAccount(tokenHash: string): Promise<{ account: Account; expires_at: string } | null>;
  dropSession(tokenHash: string): Promise<void>;
  /** Throws UsernameTaken on a duplicate username. */
  updateAccount(address: string, patch: AccountPatch): Promise<Account>;
  usernameFree(username: string): Promise<boolean>;
}

const COLS = 'address,username,look,total_points,level_seen';

function toAccount(r: Record<string, unknown>): Account {
  return {
    address: String(r.address),
    username: (r.username as string | null) ?? null,
    look: (r.look as CharId | null) ?? null,
    // bigint comes back as a number from PostgREST; points stay far below 2^53.
    total_points: Number(r.total_points ?? 0),
    level_seen: Number(r.level_seen ?? 1),
  };
}

export const supabaseStore: AccountStore = {
  async putNonce(nonce, row) {
    // Housekeeping: old unused nonces go away whenever a new one is made.
    await db(`auth_nonces?expires_at=lt.${enc(new Date().toISOString())}`, { method: 'DELETE', prefer: ['return=minimal'] });
    await db('auth_nonces', { method: 'POST', body: { nonce, ...row }, prefer: ['return=minimal'] });
  },
  async takeNonce(nonce) {
    const { data } = await db<NonceRow[]>(`auth_nonces?nonce=eq.${enc(nonce)}`, { method: 'DELETE', prefer: ['return=representation'] });
    return data[0] ?? null;
  },
  async touchAccount(address) {
    const { data } = await db<Record<string, unknown>[]>(`accounts?on_conflict=address&select=${COLS}`, {
      method: 'POST',
      body: { address, last_seen: new Date().toISOString() },
      prefer: ['resolution=merge-duplicates', 'return=representation'],
    });
    return toAccount(data[0]);
  },
  async putSession(token_hash, address, expires_at) {
    await db('auth_sessions', { method: 'POST', body: { token_hash, address, expires_at }, prefer: ['return=minimal'] });
  },
  async sessionAccount(hash) {
    const { data } = await db<{ expires_at: string; accounts: Record<string, unknown> | null }[]>(
      `auth_sessions?token_hash=eq.${enc(hash)}&select=expires_at,accounts(${COLS})`,
    );
    const s = data[0];
    return s?.accounts ? { account: toAccount(s.accounts), expires_at: s.expires_at } : null;
  },
  async dropSession(hash) {
    await db(`auth_sessions?token_hash=eq.${enc(hash)}`, { method: 'DELETE', prefer: ['return=minimal'] });
  },
  async updateAccount(address, patch) {
    try {
      const { data } = await db<Record<string, unknown>[]>(`accounts?address=eq.${enc(address)}&select=${COLS}`, {
        method: 'PATCH', body: patch, prefer: ['return=representation'],
      });
      return toAccount(data[0]);
    } catch (e) {
      if (e instanceof DbError && e.code === '23505') throw new UsernameTaken();
      throw e;
    }
  },
  async usernameFree(username) {
    // citext column: eq ignores case.
    const { data } = await db<unknown[]>(`accounts?username=eq.${enc(username)}&select=address`);
    return data.length === 0;
  },
};

/** In-memory store with the same behaviour (tests). */
export function memoryStore() {
  const nonces = new Map<string, NonceRow>();
  const accounts = new Map<string, Account>();
  const sessions = new Map<string, { address: string; expires_at: string }>();
  const store: AccountStore & { accounts: Map<string, Account>; sessions: typeof sessions } = {
    accounts, sessions,
    async putNonce(n, row) { nonces.set(n, row); },
    async takeNonce(n) { const r = nonces.get(n) ?? null; nonces.delete(n); return r; },
    async touchAccount(address) {
      let a = accounts.get(address);
      if (!a) { a = { address, username: null, look: null, total_points: 0, level_seen: 1 }; accounts.set(address, a); }
      return { ...a };
    },
    async putSession(h, address, expires_at) { sessions.set(h, { address, expires_at }); },
    async sessionAccount(h) {
      const s = sessions.get(h);
      const a = s && accounts.get(s.address);
      return s && a ? { account: { ...a }, expires_at: s.expires_at } : null;
    },
    async dropSession(h) { sessions.delete(h); },
    async updateAccount(address, patch) {
      const a = accounts.get(address);
      if (!a) throw new Error('no account');
      if (patch.username != null) {
        for (const o of accounts.values()) {
          if (o.address !== address && o.username?.toLowerCase() === patch.username.toLowerCase()) throw new UsernameTaken();
        }
      }
      Object.assign(a, patch);
      return { ...a };
    },
    async usernameFree(u) {
      for (const o of accounts.values()) if (o.username?.toLowerCase() === u.toLowerCase()) return false;
      return true;
    },
  };
  return store;
}
