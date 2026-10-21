/**
 * Moon Jump API — one Vercel Function serving /api/game/<action>.
 *
 * Privacy: wallet addresses are only used to sign in. Responses about other
 * players contain usernames, characters, levels and scores — never addresses.
 */
import { createHash, randomBytes } from 'node:crypto';
import { verifyMessage } from 'ethers';
import { db, dbConfigured, DbError, enc } from '../_lib/db.js';
import {
  ADDRESS, CHARS, USERNAME, checkin, dailySeed, dayKey, dayNumber, isoDate, levelOf, plausible, signInMessage, xpFor,
  type CharId,
} from '../_lib/rules.js';

interface Player {
  id: string;
  address: string;
  username: string | null;
  char: CharId;
  xp: number;
  level: number;
  coins: number;
  streak: number;
  last_checkin: string | null;
  last_seen: string;
}

const SESSION_DAYS = 30;
const MAX_BODY = 4096;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
const fail = (error: string, status = 400) => json({ error }, status);

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'too_large');
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? v : {};
  } catch {
    throw new HttpError(400, 'bad_json');
  }
}

class HttpError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

function publicMe(p: Player) {
  const today = isoDate();
  return {
    username: p.username, char: p.char, xp: p.xp, level: p.level, coins: p.coins,
    streak: p.streak, checkedInToday: p.last_checkin === today,
  };
}

async function auth(req: Request): Promise<Player> {
  const h = req.headers.get('authorization') ?? '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!/^[0-9a-f]{64}$/.test(token)) throw new HttpError(401, 'no_session');
  const { data } = await db<{ expires_at: string; players: Player }[]>(
    `sessions?token_hash=eq.${sha256(token)}&select=expires_at,players(*)`,
  );
  const s = data[0];
  if (!s || !s.players || new Date(s.expires_at).getTime() < Date.now()) throw new HttpError(401, 'no_session');
  return s.players;
}

function today() {
  const now = new Date();
  const n = dayNumber(now);
  return { day: dayKey(now), n, mod: n % 4 };
}

// ---------- actions ----------

async function nonce(req: Request) {
  const body = await readBody(req);
  const address = String(body.address ?? '');
  if (!ADDRESS.test(address)) return fail('bad_address');
  const value = randomBytes(16).toString('hex');
  await db('nonces', {
    method: 'POST',
    body: { nonce: value, address: address.toLowerCase(), expires_at: new Date(Date.now() + 5 * 60_000).toISOString() },
    prefer: ['return=minimal'],
  });
  return json({ nonce: value, message: signInMessage(address, value) });
}

async function login(req: Request) {
  const body = await readBody(req);
  const address = String(body.address ?? '').toLowerCase();
  const n = String(body.nonce ?? '');
  const signature = String(body.signature ?? '');
  if (!ADDRESS.test(address) || !/^[0-9a-f]{32}$/.test(n) || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return fail('bad_request');

  // One-time use: delete the nonce and get it back in the same call.
  const { data: rows } = await db<{ address: string; expires_at: string }[]>(`nonces?nonce=eq.${n}`, {
    method: 'DELETE', prefer: ['return=representation'],
  });
  const row = rows[0];
  if (!row || row.address !== address || new Date(row.expires_at).getTime() < Date.now()) return fail('nonce_expired', 401);

  let signer: string;
  try { signer = verifyMessage(signInMessage(address, n), signature).toLowerCase(); } catch { return fail('bad_signature', 401); }
  if (signer !== address) return fail('bad_signature', 401);

  const { data: players } = await db<Player[]>('players?on_conflict=address', {
    method: 'POST',
    body: { address, last_seen: new Date().toISOString() },
    prefer: ['resolution=merge-duplicates', 'return=representation'],
  });
  const player = players[0];
  const token = randomBytes(32).toString('hex');
  await db('sessions', {
    method: 'POST',
    body: { token_hash: sha256(token), player_id: player.id, expires_at: new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString() },
    prefer: ['return=minimal'],
  });
  // Housekeeping: drop stale nonces and sessions.
  const nowIso = enc(new Date().toISOString());
  await Promise.allSettled([
    db(`nonces?expires_at=lt.${nowIso}`, { method: 'DELETE', prefer: ['return=minimal'] }),
    db(`sessions?expires_at=lt.${nowIso}`, { method: 'DELETE', prefer: ['return=minimal'] }),
  ]);
  return json({ token, me: publicMe(player) });
}

async function me(req: Request) {
  const p = await auth(req);
  await db(`players?id=eq.${p.id}`, { method: 'PATCH', body: { last_seen: new Date().toISOString() }, prefer: ['return=minimal'] });
  return json({ me: publicMe(p), today: today() });
}

async function nameCheck(req: Request) {
  await auth(req);
  const u = new URL(req.url).searchParams.get('u') ?? '';
  if (!USERNAME.test(u)) return json({ ok: false, reason: 'format' });
  const { data } = await db<{ id: string }[]>(`players?username=eq.${enc(u)}&select=id&limit=1`);
  return json({ ok: data.length === 0, reason: data.length ? 'taken' : null });
}

async function profile(req: Request) {
  const p = await auth(req);
  const body = await readBody(req);
  const patch: Record<string, unknown> = {};
  if (body.username !== undefined) {
    const u = String(body.username);
    if (!USERNAME.test(u)) return fail('bad_username');
    patch.username = u;
  }
  if (body.char !== undefined) {
    const c = String(body.char);
    if (!(CHARS as readonly string[]).includes(c)) return fail('bad_char');
    patch.char = c;
  }
  if (!Object.keys(patch).length) return json({ me: publicMe(p) });
  try {
    const { data } = await db<Player[]>(`players?id=eq.${p.id}`, { method: 'PATCH', body: patch, prefer: ['return=representation'] });
    return json({ me: publicMe(data[0]) });
  } catch (e) {
    if (e instanceof DbError && e.code === '23505') return fail('taken', 409);
    throw e;
  }
}

async function start(req: Request) {
  const p = await auth(req);
  if (!p.username) return fail('need_username', 403);
  const body = await readBody(req);
  const daily = body.daily === true;
  const t = today();
  const seed = daily ? dailySeed(t.day) : randomBytes(4).readUInt32BE(0) & 0x7fffffff;
  const { data } = await db<{ id: string }[]>('run_tickets', {
    method: 'POST',
    body: { player_id: p.id, day: daily ? t.day : null, seed },
    prefer: ['return=representation'],
  });
  return json({ ticket: data[0].id, seed, daily, today: t });
}

async function finish(req: Request) {
  const p = await auth(req);
  const body = await readBody(req);
  const ticket = String(body.ticket ?? '');
  const height = Number(body.height);
  const coins = Number(body.coins);
  if (!/^[0-9a-f-]{36}$/.test(ticket)) return fail('bad_ticket');

  // Single use: flip `used` only if it was false.
  const { data: tk } = await db<{ day: number | null; seed: number; started_at: string }[]>(
    `run_tickets?id=eq.${ticket}&player_id=eq.${p.id}&used=eq.false`,
    { method: 'PATCH', body: { used: true }, prefer: ['return=representation'] },
  );
  const t = tk[0];
  if (!t) return fail('ticket_used', 409);
  const durationMs = Date.now() - new Date(t.started_at).getTime();
  if (durationMs > 2 * 3_600_000) return fail('ticket_expired', 409);
  const bad = plausible(height, coins, durationMs);
  if (bad) return fail(bad, 422);

  let first = false;
  if (t.day != null) {
    const { data: prior } = await db<{ id: number }[]>(`runs?player_id=eq.${p.id}&day=eq.${t.day}&select=id&limit=1`);
    first = prior.length === 0;
  }
  const gained = xpFor(height, coins, first);
  const { data: runRows } = await db<{ id: number }[]>('runs', {
    method: 'POST',
    body: { player_id: p.id, day: t.day, seed: t.seed, height, coins, duration_ms: durationMs, xp_gained: gained },
    prefer: ['return=representation'],
  });
  const runId = runRows[0].id;

  let best = height;
  let isBest = false;
  let rank: number | null = null;
  let total: number | null = null;
  if (t.day != null) {
    const { data: cur } = await db<{ height: number }[]>(`daily_best?day=eq.${t.day}&player_id=eq.${p.id}&select=height`);
    const prev = cur[0]?.height ?? -1;
    isBest = height > prev;
    best = Math.max(height, prev);
    if (isBest) {
      await db('daily_best?on_conflict=day,player_id', {
        method: 'POST',
        body: { day: t.day, player_id: p.id, height, run_id: runId, updated_at: new Date().toISOString() },
        prefer: ['resolution=merge-duplicates', 'return=minimal'],
      });
    }
    const [above, all] = await Promise.all([
      db(`daily_best?day=eq.${t.day}&height=gt.${best}&select=day&limit=1`, { count: true }),
      db(`daily_best?day=eq.${t.day}&select=day&limit=1`, { count: true }),
    ]);
    rank = (above.count ?? 0) + 1;
    total = all.count;
  }

  const xp = p.xp + gained;
  const { data: upd } = await db<Player[]>(`players?id=eq.${p.id}`, {
    method: 'PATCH',
    body: { xp, level: levelOf(xp), coins: p.coins + coins, last_seen: new Date().toISOString() },
    prefer: ['return=representation'],
  });
  return json({ gained, first, isBest, best, rank, total, levelBefore: p.level, me: publicMe(upd[0]) });
}

async function leaderboard(req: Request) {
  const p = await auth(req);
  const day = today().day;
  const { data } = await db<{ height: number; player_id: string; players: { username: string | null; char: string; level: number } }[]>(
    `daily_best?day=eq.${day}&select=height,player_id,players(username,char,level)&order=height.desc&limit=50`,
  );
  const rows = data.map((r, i) => ({
    rank: i + 1, username: r.players?.username ?? 'anon', char: r.players?.char, level: r.players?.level ?? 0,
    height: r.height, me: r.player_id === p.id,
  }));
  let mine = rows.find((r) => r.me) ?? null;
  if (!mine) {
    const { data: m } = await db<{ height: number }[]>(`daily_best?day=eq.${day}&player_id=eq.${p.id}&select=height`);
    if (m[0]) {
      const above = await db(`daily_best?day=eq.${day}&height=gt.${m[0].height}&select=day&limit=1`, { count: true });
      mine = { rank: (above.count ?? 0) + 1, username: p.username ?? 'you', char: p.char, level: p.level, height: m[0].height, me: true };
    }
  }
  return json({ day, rows, mine });
}

async function town(req: Request) {
  const p = await auth(req);
  const url = new URL(req.url);
  const lvlParam = Number(url.searchParams.get('level'));
  const level = Number.isInteger(lvlParam) && lvlParam >= 0 && lvlParam <= 5 ? lvlParam : p.level;
  const day = today().day;
  const { data: people } = await db<Player[]>(
    `players?level=eq.${level}&username=not.is.null&select=id,username,char,level,streak,last_seen&order=last_seen.desc&limit=40`,
  );
  const [{ count }, bests, gms] = await Promise.all([
    db(`players?level=eq.${level}&username=not.is.null&select=id&limit=1`, { count: true }),
    people.length
      ? db<{ player_id: string; height: number }[]>(`daily_best?day=eq.${day}&player_id=in.(${people.map((x) => x.id).join(',')})&select=player_id,height`)
      : Promise.resolve({ data: [] as { player_id: string; height: number }[], count: null }),
    db<{ to_id: string }[]>(`greetings?day=eq.${day}&from_id=eq.${p.id}&select=to_id`),
  ]);
  const bestBy = new Map(bests.data.map((b) => [b.player_id, b.height]));
  const greeted = new Set(gms.data.map((g) => g.to_id));
  const todayIso = isoDate();
  const residents = people.map((x) => ({
    username: x.username, char: x.char, streak: x.streak,
    lit: x.last_seen.slice(0, 10) === todayIso,
    today: bestBy.get(x.id) ?? null,
    me: x.id === p.id,
    greeted: greeted.has(x.id),
  }));
  return json({ level, count, residents });
}

async function greet(req: Request) {
  const p = await auth(req);
  const body = await readBody(req);
  const u = String(body.username ?? '');
  if (!USERNAME.test(u)) return fail('bad_username');
  const { data } = await db<{ id: string }[]>(`players?username=eq.${enc(u)}&select=id&limit=1`);
  const to = data[0];
  if (!to || to.id === p.id) return fail('not_found', 404);
  await db('greetings?on_conflict=day,from_id,to_id', {
    method: 'POST', body: { day: today().day, from_id: p.id, to_id: to.id },
    prefer: ['resolution=ignore-duplicates', 'return=minimal'],
  });
  return json({ ok: true });
}

async function checkinAction(req: Request) {
  const p = await auth(req);
  const day = isoDate();
  const c = checkin(p.last_checkin, p.streak, day);
  if (!c) return json({ already: true, me: publicMe(p) });
  const xp = p.xp + c.xp;
  const { data } = await db<Player[]>(`players?id=eq.${p.id}`, {
    method: 'PATCH',
    body: { streak: c.streak, last_checkin: day, xp, level: levelOf(xp) },
    prefer: ['return=representation'],
  });
  return json({ already: false, gained: c.xp, me: publicMe(data[0]) });
}

async function logout(req: Request) {
  const h = req.headers.get('authorization') ?? '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (/^[0-9a-f]{64}$/.test(token)) await db(`sessions?token_hash=eq.${sha256(token)}`, { method: 'DELETE', prefer: ['return=minimal'] });
  return json({ ok: true });
}

const POSTS: Record<string, (r: Request) => Promise<Response>> = {
  nonce, login, profile, start, finish, greet, checkin: checkinAction, logout,
};
const GETS: Record<string, (r: Request) => Promise<Response>> = { me, 'name-check': nameCheck, leaderboard, town };

function actionOf(req: Request): string {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

async function handle(req: Request, table: Record<string, (r: Request) => Promise<Response>>): Promise<Response> {
  if (!dbConfigured()) return fail('not_configured', 503);
  const fn = table[actionOf(req)];
  if (!fn) return fail('not_found', 404);
  if (req.method === 'POST') {
    // Same-origin JSON only: blocks simple cross-site form posts.
    if (!(req.headers.get('content-type') ?? '').includes('application/json')) return fail('bad_content_type', 415);
  }
  try {
    return await fn(req);
  } catch (e) {
    if (e instanceof HttpError) return fail(e.code, e.status);
    console.error('game api error', actionOf(req), e instanceof Error ? e.message : e);
    return fail('server_error', 500);
  }
}

export function GET(req: Request) { return handle(req, GETS); }
export function POST(req: Request) { return handle(req, POSTS); }
