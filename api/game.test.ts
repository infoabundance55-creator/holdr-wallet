import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { handleAccount, type Ctx } from './_lib/account-api';
import { memoryStore } from './_lib/accounts';
import { handleGame, type GameCtx } from './_lib/game-api';
import { memoryGameStore } from './_lib/game-store';
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test responses are loose JSON
type Json = Record<string, any>;
import { dailySeed, dayKey, dayNumber, implausible, pointsFor, secondsToReset } from './_lib/game-rules';

const ORIGIN = 'https://holdrs.xyz';
const KEYS = [
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
] as const;

function world(start = '2026-11-09T10:00:00Z') {
  const store = memoryStore();
  const game = memoryGameStore(store.accounts);
  let t = new Date(start).getTime();
  const ctx: GameCtx = { store, game, now: () => new Date(t) };
  const player = async (i: number, name: string | null) => {
    const acct = privateKeyToAccount(KEYS[i]);
    let cookie = '';
    const send = async (handler: (r: Request, c: Ctx & GameCtx) => Promise<Response>, path: string, method: 'GET' | 'POST', body?: unknown) => {
      const headers: Record<string, string> = { origin: ORIGIN };
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (cookie) headers.cookie = cookie;
      const res = await handler(new Request(`${ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), ctx);
      const sc = res.headers.get('set-cookie');
      if (sc) cookie = /Max-Age=0/.test(sc) ? '' : sc.split(';')[0];
      return { status: res.status, body: await res.json() as Json };
    };
    const acc = (m: 'GET' | 'POST', a: string, b?: unknown) => send(handleAccount, `/api/account/${a}`, m, b);
    const g = (m: 'GET' | 'POST', a: string, b?: unknown) => send(handleGame, `/api/game/${a}`, m, b);
    const n = await acc('POST', 'nonce', { address: acct.address, chainId: 46630 });
    await acc('POST', 'login', { nonce: n.body.nonce, signature: await acct.signMessage({ message: n.body.message }) });
    if (name) await acc('POST', 'username', { username: name });
    const play = async (low: number, high: number, height: number, secs = 120) => {
      const s = await g('POST', 'start', {});
      if (s.status !== 200) return s;
      t += secs * 1000;
      return g('POST', 'finish', { ticket: s.body.ticket, height, coinsLow: low, coinsHigh: high });
    };
    return { g, play, address: acct.address.toLowerCase(), logout: () => acc('POST', 'logout', {}) };
  };
  return { ctx, game, store, player, advance: (ms: number) => { t += ms; } };
}

describe('game rules', () => {
  it('pays 5 per coin to 1,000 m and 10 above', () => {
    expect(pointsFor(40, 0)).toBe(200);
    expect(pointsFor(60, 50)).toBe(800);
  });
  it('uses the UTC day and the same seed for everyone', () => {
    const d = new Date('2026-11-09T23:59:59Z');
    expect(dayKey(d)).toBe(20261109);
    expect(dayNumber(new Date('2026-10-11T05:00:00Z'))).toBe(1);
    expect(dayNumber(d)).toBe(30);
    expect(dailySeed(20261109)).toBe(dailySeed(20261109));
    expect(secondsToReset(d)).toBe(1);
  });
  it('rejects impossible runs', () => {
    expect(implausible(800, 40, 0, 60_000)).toBeNull();
    expect(implausible(3000, 60, 120, 180_000)).toBeNull();
    expect(implausible(800, 0, 1, 60_000)).toBe('too_many_coins'); // ×10 coins below the line
    expect(implausible(800, 200, 0, 60_000)).toBe('too_many_coins');
    expect(implausible(20_000, 50, 50, 10_000)).toBe('too_fast');
    expect(implausible(1.5, 0, 0, 1000)).toBe('bad_height');
    expect(implausible(100, -1, 0, 1000)).toBe('bad_coins');
  });
});

describe('game api', () => {
  it('needs a session and a username', async () => {
    const w = world();
    const p = await w.player(0, null);
    expect((await p.g('POST', 'start', {})).body.error).toBe('need_username');
    await p.logout();
    expect((await p.g('GET', 'today')).status).toBe(401);
  });

  it('gives 3 scored runs a day, then resets at UTC midnight', async () => {
    const w = world('2026-11-09T22:00:00Z');
    const p = await w.player(0, 'alice');
    let t = await p.g('GET', 'today');
    expect(t.body.runs).toEqual({ used: 0, left: 3, max: 3 });
    expect(t.body.today.day).toBe(20261109);
    const r1 = await p.play(40, 0, 800);
    expect(r1.body).toMatchObject({ points: 200, best: 200, isBest: true, rank: 1, pointsToday: 200, runs: { used: 1, left: 2 } });
    // A started run that is never finished still uses a slot (restart / leaving counts).
    const abandoned = await p.g('POST', 'start', {});
    expect(abandoned.body.run).toBe(2);
    const r3 = await p.play(60, 30, 2000);
    expect(r3.body).toMatchObject({ points: 600, best: 600, isBest: true, pointsToday: 800, runs: { used: 3, left: 0 } });
    expect((await p.g('POST', 'start', {})).body.error).toBe('no_runs');
    t = await p.g('GET', 'today');
    expect(t.body).toMatchObject({ best: 600, pointsToday: 800, rank: 1 });
    w.advance(3 * 3_600_000); // next UTC day
    t = await p.g('GET', 'today');
    expect(t.body.runs.left).toBe(3);
    expect(t.body.best).toBeNull();
  });

  it('gives everyone the same daily map', async () => {
    const w = world();
    const a = await w.player(0, 'alice');
    const b = await w.player(1, 'bob');
    const sa = await a.g('POST', 'start', {});
    const sb = await b.g('POST', 'start', {});
    expect(sa.body.seed).toBe(sb.body.seed);
    expect(sa.body.today.mod).toBe(sa.body.today.n % 4);
  });

  it('tickets are single use, owned and expire', async () => {
    const w = world();
    const a = await w.player(0, 'alice');
    const b = await w.player(1, 'bob');
    const s = await a.g('POST', 'start', {});
    w.advance(60_000);
    expect((await b.g('POST', 'finish', { ticket: s.body.ticket, height: 100, coinsLow: 5, coinsHigh: 0 })).body.error).toBe('ticket_used');
    expect((await a.g('POST', 'finish', { ticket: s.body.ticket, height: 100, coinsLow: 5, coinsHigh: 0 })).status).toBe(200);
    expect((await a.g('POST', 'finish', { ticket: s.body.ticket, height: 100, coinsLow: 5, coinsHigh: 0 })).body.error).toBe('ticket_used');
    const late = await a.g('POST', 'start', {});
    w.advance(3 * 3_600_000);
    expect((await a.g('POST', 'finish', { ticket: late.body.ticket, height: 100, coinsLow: 5, coinsHigh: 0 })).body.error).toBe('ticket_expired');
  });

  it('refuses impossible results and stores nothing', async () => {
    const w = world();
    const a = await w.player(0, 'alice');
    const r = await a.play(500, 0, 900, 30);
    expect(r.status).toBe(422);
    expect(w.game.runs).toHaveLength(0);
  });

  it('ranks today by best single run and the season by total, without addresses', async () => {
    const w = world();
    const a = await w.player(0, 'alice');
    const b = await w.player(1, 'bob');
    const c = await w.player(2, 'carol');
    await a.play(40, 0, 800);   // 200
    await a.play(60, 10, 1300); // 400
    await b.play(60, 30, 2000); // 600
    await c.play(20, 0, 500);   // 100
    const day = await a.g('GET', 'board?kind=day');
    expect(day.body.rows.map((r: Json) => [r.rank, r.username, r.points])).toEqual([[1, 'bob', 600], [2, 'alice', 400], [3, 'carol', 100]]);
    expect(day.body.mine).toMatchObject({ rank: 2, username: 'alice', char: 'raccoon', level: 1, me: true });
    const season = await c.g('GET', 'board?kind=season');
    expect(season.body.rows.map((r: Json) => [r.username, r.points])).toEqual([['alice', 600], ['bob', 600], ['carol', 100]]);
    expect(JSON.stringify(day.body) + JSON.stringify(season.body)).not.toMatch(/0x[0-9a-f]{40}/i);
    const today = await c.g('GET', 'today');
    expect(today.body.top.map((r: Json) => r.username)).toEqual(['bob', 'alice', 'carol']);
    expect(today.body.rank).toBe(3);
  });

  it('shows each player with their chosen unlocked look', async () => {
    const w = world();
    const a = await w.player(0, 'alice');
    w.store.accounts.get(a.address)!.total_points = 268_400; // level 4: bull
    await a.play(40, 0, 800);
    let row = (await a.g('GET', 'board?kind=day')).body.mine;
    expect(row).toMatchObject({ char: 'bull', level: 4 });
    w.store.accounts.get(a.address)!.look = 'frog';
    row = (await a.g('GET', 'board?kind=day')).body.mine;
    expect(row.char).toBe('frog');
  });

  it('only accepts JSON posts from our pages', async () => {
    const w = world();
    const res = await handleGame(new Request(`${ORIGIN}/api/game/start`, { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' }), w.ctx);
    expect(res.status).toBe(403);
  });
});
