/**
 * Moon Jump API core (testable). Uses the Holdrs account session (HttpOnly cookie from /api/account).
 *
 * GET  today            → today's map, runs left (3 a day), my best and rank, top 3
 * GET  board?kind=day|season → top 50 (+ my row)
 * POST start            → takes the next of today's 3 run slots, returns the daily seed and a ticket
 * POST finish           → { ticket, height, coinsLow, coinsHigh } → points for the run (coins ×5 / ×10)
 *
 * Practice runs never call the server. Starting a scored run uses a slot even if it is restarted or abandoned.
 * Privacy: responses about other players carry usernames, characters, levels and points — never addresses.
 */
import { sessionAccount, staleCookieHeaders, type Ctx as AccountCtx } from './account-api.js';
import type { Account } from './accounts.js';
import { SlotTaken, type BoardRow, type GameStore } from './game-store.js';
import {
  SCORED_RUNS, SEASON, dailyMod, dailySeed, dayKey, dayNumber, implausible, pointsFor, secondsToReset,
} from './game-rules.js';
import { charOfLevel, levelOf, unlocked } from './levels.js';
import { allowedOrigin } from './origin.js';

export interface GameCtx extends AccountCtx { game: GameStore }

const MAX_BODY = 1024;
const TICKET_HOURS = 2;

class HttpError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}

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

async function need(req: Request, ctx: GameCtx): Promise<Account> {
  const a = await sessionAccount(req, ctx);
  if (!a) throw new HttpError(401, 'no_session');
  return a;
}

function todayInfo(now: Date) {
  const n = dayNumber(now);
  return { day: dayKey(now), n, mod: dailyMod(n), resetIn: secondsToReset(now) };
}

/** The character a player shows on the boards. */
function charOf(look: string | null, total: number) {
  return look && unlocked(look as never, total) ? look : charOfLevel(levelOf(total));
}

function publicRow(r: BoardRow, me: string) {
  return { rank: r.rank, username: r.username ?? 'anon', char: charOf(r.look, r.total_points), level: levelOf(r.total_points), points: r.points, me: r.address === me };
}

async function runsState(ctx: GameCtx, address: string, day: number) {
  const used = (await ctx.game.usedSlots(address, day)).length;
  return { used, left: Math.max(0, SCORED_RUNS - used), max: SCORED_RUNS };
}

// ---------- actions ----------

async function today(req: Request, ctx: GameCtx) {
  const a = await need(req, ctx);
  const t = todayInfo(ctx.now());
  const [runs, mine, board] = await Promise.all([
    runsState(ctx, a.address, t.day),
    ctx.game.dayRuns(a.address, t.day),
    ctx.game.boardDay(t.day, 3, a.address),
  ]);
  const me = board.find((r) => r.address === a.address);
  return json({
    today: t,
    runs,
    best: mine.length ? Math.max(...mine) : null,
    pointsToday: mine.reduce((s, p) => s + p, 0),
    rank: me?.rank ?? null,
    // Rows come in board order; my own row is appended only when I'm below the top 3.
    top: board.slice(0, 3).map((r) => publicRow(r, a.address)),
  });
}

async function board(req: Request, ctx: GameCtx) {
  const a = await need(req, ctx);
  const kind = new URL(req.url).searchParams.get('kind') === 'season' ? 'season' : 'day';
  const t = todayInfo(ctx.now());
  const rows = kind === 'day'
    ? await ctx.game.boardDay(t.day, 50, a.address)
    : await ctx.game.boardSeason(SEASON.from, SEASON.to, 50, a.address);
  const out = rows.map((r) => publicRow(r, a.address));
  return json({ kind, day: t.day, season: SEASON.id, rows: out.slice(0, 50), mine: out.find((r) => r.me) ?? null });
}

async function start(req: Request, ctx: GameCtx) {
  const a = await need(req, ctx);
  if (!a.username) return json({ error: 'need_username' }, 403);
  await readBody(req);
  const now = ctx.now();
  const t = todayInfo(now);
  for (let attempt = 0; attempt < 2; attempt++) {
    const used = await ctx.game.usedSlots(a.address, t.day);
    const slot = [1, 2, 3].slice(0, SCORED_RUNS).find((s) => !used.includes(s));
    if (!slot) return json({ error: 'no_runs', runs: { used: used.length, left: 0, max: SCORED_RUNS } }, 403);
    try {
      const tk = await ctx.game.addTicket({ address: a.address, day: t.day, slot, seed: dailySeed(t.day) }, now.toISOString());
      return json({ ticket: tk.id, seed: tk.seed, run: slot, today: t, runs: { used: used.length + 1, left: SCORED_RUNS - used.length - 1, max: SCORED_RUNS } });
    } catch (e) {
      if (!(e instanceof SlotTaken)) throw e; // two starts at once: look again
    }
  }
  return json({ error: 'busy' }, 409);
}

async function finish(req: Request, ctx: GameCtx) {
  const a = await need(req, ctx);
  const body = await readBody(req);
  const ticket = String(body.ticket ?? '');
  const height = Number(body.height);
  const coinsLow = Number(body.coinsLow);
  const coinsHigh = Number(body.coinsHigh);
  const tk = await ctx.game.takeTicket(ticket, a.address); // one-time use
  if (!tk) return json({ error: 'ticket_used' }, 409);
  const durationMs = ctx.now().getTime() - new Date(tk.started_at).getTime();
  if (durationMs > TICKET_HOURS * 3_600_000) return json({ error: 'ticket_expired' }, 409);
  const bad = implausible(height, coinsLow, coinsHigh, durationMs);
  if (bad) return json({ error: bad }, 422);

  const before = await ctx.game.dayRuns(a.address, tk.day);
  const points = pointsFor(coinsLow, coinsHigh);
  await ctx.game.addRun({
    ticket_id: tk.id, address: a.address, day: tk.day, height, coins_low: coinsLow, coins_high: coinsHigh, points, duration_ms: Math.round(durationMs),
  });
  const prevBest = before.length ? Math.max(...before) : -1;
  const best = Math.max(prevBest, points);
  const rows = await ctx.game.boardDay(tk.day, 1, a.address);
  const me = rows.find((r) => r.address === a.address);
  return json({
    points, best, isBest: points > prevBest, rank: me?.rank ?? null,
    pointsToday: before.reduce((s, p) => s + p, 0) + points,
    runs: await runsState(ctx, a.address, tk.day),
  });
}

const POSTS: Record<string, (r: Request, c: GameCtx) => Promise<Response>> = { start, finish };
const GETS: Record<string, (r: Request, c: GameCtx) => Promise<Response>> = { today, board };

function actionOf(req: Request): string {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

export async function handleGame(req: Request, ctx: GameCtx): Promise<Response> {
  const table = req.method === 'POST' ? POSTS : req.method === 'GET' ? GETS : null;
  if (!table) return json({ error: 'method' }, 405);
  const action = actionOf(req);
  const fn = table[action];
  if (!fn) return json({ error: 'not_found' }, 404);
  if (req.method === 'POST') {
    if (!allowedOrigin(req.headers.get('origin'))) return json({ error: 'origin' }, 403);
    if (!(req.headers.get('content-type') ?? '').includes('application/json')) return json({ error: 'bad_content_type' }, 415);
  }
  try {
    return await fn(req, ctx);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.code }, e.status, e.code === 'no_session' ? staleCookieHeaders(req) : {});
    console.error('game api error', action, e instanceof Error ? e.message : e);
    return json({ error: 'server_error' }, 500);
  }
}
