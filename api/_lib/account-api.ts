/**
 * Account API core (testable): wallet sign-in with SIWE (EIP-4361), username, look, level-up acknowledgement.
 *
 * Sign-in: POST nonce → the server builds the exact message and stores it for 10 minutes →
 * the wallet signs it (no gas, moves nothing) → POST login checks the signature against the stored
 * message, deletes the nonce (one-time use) and sets an HttpOnly session cookie (30 days).
 * Only a SHA-256 hash of the session token is stored.
 *
 * Privacy: addresses are only used to sign in. Nothing here returns another user's address.
 */
import { createHash, randomBytes } from 'node:crypto';
import { getAddress, verifyMessage, type Hex } from 'viem';
import { robinhood, robinhoodTestnet } from 'viem/chains';
import { createSiweMessage, parseSiweMessage } from 'viem/siwe';
import { UsernameTaken, type Account, type AccountStore } from './accounts.js';
import { charOfLevel, isChar, levelOf, unlocked } from './levels.js';
import { allowedOrigin } from './origin.js';

export const COOKIE = '__Host-holdrs_session';
const SESSION_DAYS = 30;
const NONCE_MINUTES = 10;
const MAX_BODY = 2048;
const CHAIN_IDS = [robinhoodTestnet.id, robinhood.id];
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export const USERNAME = /^[A-Za-z0-9_]{3,15}$/;
const RESERVED = new Set([
  'admin', 'administrator', 'holdr', 'holdrs', 'holdrsxyz', 'holdr_app', 'official', 'support', 'help', 'team', 'staff',
  'mod', 'moderator', 'system', 'root', 'robinhood', 'robinhoodchain', 'uniswap', 'metamask', 'anon', 'theanon',
  'null', 'undefined', 'me', 'you',
]);

export const STATEMENT = 'Sign in to Holdrs. This only proves you own this wallet. It costs no gas and cannot move any funds.';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

class HttpError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}

/** What the browser gets about its own account. */
export function publicAccount(a: Account) {
  const level = levelOf(a.total_points);
  return {
    address: a.address,
    username: a.username,
    total: a.total_points,
    level,
    levelSeen: Math.min(a.level_seen, level),
    /** null = follows the level's character. */
    look: a.look && unlocked(a.look, a.total_points) ? a.look : null,
  };
}
export type PublicAccount = ReturnType<typeof publicAccount>;

/** Why a username is not allowed, or null if it is fine (format only; uniqueness is checked separately). */
export function usernameProblem(u: string): 'format' | 'reserved' | null {
  if (!USERNAME.test(u)) return 'format';
  if (RESERVED.has(u.toLowerCase()) || /^0x/i.test(u) || /holdr/i.test(u)) return 'reserved';
  return null;
}

function cookieToken(req: Request): string | null {
  const raw = req.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === COOKIE && v && /^[0-9a-f]{64}$/.test(v)) return v;
  }
  return null;
}

const sessionCookie = (token: string) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'too_large');
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    throw new HttpError(400, 'bad_json');
  }
}

export interface Ctx { store: AccountStore; now: () => Date }

async function auth(req: Request, ctx: Ctx): Promise<{ account: Account; hash: string }> {
  const token = cookieToken(req);
  if (!token) throw new HttpError(401, 'no_session');
  const hash = sha256(token);
  const s = await ctx.store.sessionAccount(hash);
  if (!s || new Date(s.expires_at).getTime() < ctx.now().getTime()) throw new HttpError(401, 'no_session');
  return { account: s.account, hash };
}

// ---------- actions ----------

async function nonce(req: Request, ctx: Ctx) {
  const body = await readBody(req);
  const address = String(body.address ?? '');
  const chainId = Number(body.chainId);
  if (!ADDRESS.test(address)) return json({ error: 'bad_address' }, 400);
  if (!CHAIN_IDS.includes(chainId as never)) return json({ error: 'bad_chain' }, 400);
  const origin = new URL(req.headers.get('origin')!);
  const n = randomBytes(16).toString('hex');
  const now = ctx.now();
  const message = createSiweMessage({
    address: getAddress(address),
    chainId,
    domain: origin.host,
    uri: origin.origin,
    nonce: n,
    version: '1',
    statement: STATEMENT,
    issuedAt: now,
    expirationTime: new Date(now.getTime() + NONCE_MINUTES * 60_000),
  });
  await ctx.store.putNonce(n, { address: address.toLowerCase(), message, expires_at: new Date(now.getTime() + NONCE_MINUTES * 60_000).toISOString() });
  return json({ nonce: n, message });
}

async function login(req: Request, ctx: Ctx) {
  const body = await readBody(req);
  const n = String(body.nonce ?? '');
  const signature = String(body.signature ?? '');
  if (!/^[0-9a-f]{32}$/.test(n) || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return json({ error: 'bad_request' }, 400);

  const row = await ctx.store.takeNonce(n); // one-time use, even if the rest fails
  if (!row || new Date(row.expires_at).getTime() < ctx.now().getTime()) return json({ error: 'nonce_expired' }, 401);

  // The message must have been made for the site that is now logging in.
  const parsed = parseSiweMessage(row.message);
  if (parsed.domain !== new URL(req.headers.get('origin')!).host) return json({ error: 'bad_domain' }, 401);

  let ok = false;
  try {
    ok = await verifyMessage({ address: getAddress(row.address), message: row.message, signature: signature as Hex });
  } catch {
    ok = false;
  }
  if (!ok) return json({ error: 'bad_signature' }, 401);

  const account = await ctx.store.touchAccount(row.address);
  const token = randomBytes(32).toString('hex');
  await ctx.store.putSession(sha256(token), row.address, new Date(ctx.now().getTime() + SESSION_DAYS * 86400_000).toISOString());
  return json({ me: publicAccount(account) }, 200, { 'set-cookie': sessionCookie(token) });
}

async function me(req: Request, ctx: Ctx) {
  const { account } = await auth(req, ctx);
  return json({ me: publicAccount(account) });
}

async function nameCheck(req: Request, ctx: Ctx) {
  const u = new URL(req.url).searchParams.get('u') ?? '';
  const problem = usernameProblem(u);
  if (problem) return json({ ok: false, reason: problem });
  return json(await ctx.store.usernameFree(u) ? { ok: true } : { ok: false, reason: 'taken' });
}

async function username(req: Request, ctx: Ctx) {
  const { account } = await auth(req, ctx);
  const body = await readBody(req);
  const u = String(body.username ?? '').trim();
  const problem = usernameProblem(u);
  if (problem) return json({ error: `username_${problem}` }, 400);
  if (account.username === u) return json({ me: publicAccount(account) });
  try {
    return json({ me: publicAccount(await ctx.store.updateAccount(account.address, { username: u })) });
  } catch (e) {
    if (e instanceof UsernameTaken) return json({ error: 'username_taken' }, 409);
    throw e;
  }
}

async function look(req: Request, ctx: Ctx) {
  const { account } = await auth(req, ctx);
  const body = await readBody(req);
  const v = body.look;
  if (v !== null && !isChar(v)) return json({ error: 'bad_look' }, 400);
  if (v && !unlocked(v, account.total_points)) return json({ error: 'locked' }, 403);
  // Picking the level's own character goes back to "follow my level".
  const next = v === charOfLevel(levelOf(account.total_points)) ? null : v;
  return json({ me: publicAccount(await ctx.store.updateAccount(account.address, { look: next })) });
}

/** Level-up popup closed. keep=true keeps the look from before the level-up; otherwise the new character is used. */
async function levelSeen(req: Request, ctx: Ctx) {
  const { account } = await auth(req, ctx);
  const body = await readBody(req);
  const p = publicAccount(account);
  if (p.level <= p.levelSeen) return json({ me: p });
  const before = p.look ?? charOfLevel(p.levelSeen);
  const keep = body.keep === true && before !== charOfLevel(p.level);
  const patch = { level_seen: p.level, look: keep ? before : null };
  return json({ me: publicAccount(await ctx.store.updateAccount(account.address, patch)) });
}

async function logout(req: Request, ctx: Ctx) {
  const token = cookieToken(req);
  if (token) await ctx.store.dropSession(sha256(token));
  return json({ ok: true }, 200, { 'set-cookie': clearCookie });
}

const POSTS: Record<string, (r: Request, c: Ctx) => Promise<Response>> = {
  nonce, login, username, look, 'level-seen': levelSeen, logout,
};
const GETS: Record<string, (r: Request, c: Ctx) => Promise<Response>> = { me, 'name-check': nameCheck };

function actionOf(req: Request): string {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

export async function handleAccount(req: Request, ctx: Ctx): Promise<Response> {
  const table = req.method === 'POST' ? POSTS : req.method === 'GET' ? GETS : null;
  if (!table) return json({ error: 'method' }, 405);
  const action = actionOf(req);
  const fn = table[action];
  if (!fn) return json({ error: 'not_found' }, 404);
  if (req.method === 'POST') {
    // Our own pages only, JSON only: blocks cross-site form posts (the cookie is also SameSite=Lax).
    if (!allowedOrigin(req.headers.get('origin'))) return json({ error: 'origin' }, 403);
    if (!(req.headers.get('content-type') ?? '').includes('application/json')) return json({ error: 'bad_content_type' }, 415);
  }
  try {
    return await fn(req, ctx);
  } catch (e) {
    if (e instanceof HttpError) {
      return json({ error: e.code }, e.status, e.code === 'no_session' && cookieToken(req) ? { 'set-cookie': clearCookie } : {});
    }
    console.error('account api error', action, e instanceof Error ? e.message : e);
    return json({ error: 'server_error' }, 500);
  }
}
