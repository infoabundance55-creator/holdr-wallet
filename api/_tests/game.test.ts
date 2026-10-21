import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Wallet } from 'ethers';
import { FakeDb } from '../_lib/fake-postgrest';
import { checkin, dailySeed, dayKey, dayNumber, levelOf, plausible, xpFor } from '../_lib/rules';
import { GET, POST } from '../game/[action]';

describe('rules', () => {
  it('levels follow the XP thresholds', () => {
    expect(levelOf(0)).toBe(0);
    expect(levelOf(299)).toBe(0);
    expect(levelOf(300)).toBe(1);
    expect(levelOf(12000)).toBe(5);
  });
  it('daily numbers start at #1 on 2026-10-11 UTC', () => {
    expect(dayNumber(new Date('2026-10-11T12:00:00Z'))).toBe(1);
    expect(dayNumber(new Date('2026-10-22T00:00:01Z'))).toBe(12);
    expect(dayKey(new Date('2026-10-22T23:59:59Z'))).toBe(20261022);
    expect(dailySeed(20261022)).toBe(dailySeed(20261022));
  });
  it('xp = height/100 + coins/10 + first-daily bonus', () => {
    expect(xpFor(6482, 118, true)).toBe(64 + 11 + 20);
    expect(xpFor(99, 9, false)).toBe(0);
  });
  it('rejects impossible results', () => {
    expect(plausible(1700, 21, 37_000)).toBeNull();
    expect(plausible(10_000, 0, 30_000)).toBe('too_fast');
    expect(plausible(500, 400, 60_000)).toBe('too_many_coins');
    expect(plausible(-1, 0, 1000)).toBe('bad_height');
    expect(plausible(1.5, 0, 1000)).toBe('bad_height');
  });
  it('check-in streaks continue on consecutive days and pay on day 7', () => {
    expect(checkin(null, 0, '2026-10-22')).toEqual({ streak: 1, xp: 10 });
    expect(checkin('2026-10-21', 6, '2026-10-22')).toEqual({ streak: 7, xp: 50 });
    expect(checkin('2026-10-20', 6, '2026-10-22')).toEqual({ streak: 1, xp: 10 });
    expect(checkin('2026-10-22', 3, '2026-10-22')).toBeNull();
  });
});

describe('game API (fake database)', () => {
  let fake: FakeDb;
  const realFetch = globalThis.fetch;
  const base = 'https://holdr.test/api/game/';

  beforeEach(() => {
    fake = new FakeDb();
    process.env.STORAGE_SUPABASE_URL = 'https://db.test';
    process.env.STORAGE_SUPABASE_SECRET_KEY = 'sb_secret_test';
    globalThis.fetch = fake.fetch as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
  });

  const post = (action: string, body: unknown, token?: string) =>
    POST(new Request(base + action, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }));
  const get = (path: string, token?: string) =>
    GET(new Request(base + path, { headers: token ? { authorization: `Bearer ${token}` } : {} }));

  async function signIn(w: Wallet) {
    const nr = await post('nonce', { address: w.address }); const n = await nr.json(); if (!n.message) throw new Error(JSON.stringify(n) + nr.status);
    expect(n.message).toContain(w.address.toLowerCase());
    const sig = await w.signMessage(n.message);
    const res = await post('login', { address: w.address, nonce: n.nonce, signature: sig });
    expect(res.status).toBe(200);
    return (await res.json()) as { token: string; me: { username: string | null } };
  }

  it('signs in with a wallet signature and rejects a wrong signer', async () => {
    const w = Wallet.createRandom();
    const s = await signIn(w);
    expect(s.token).toMatch(/^[0-9a-f]{64}$/);
    expect(s.me.username).toBeNull();
    expect(fake.tables.sessions[0].token_hash).not.toBe(s.token); // only the hash is stored

    const other = Wallet.createRandom();
    const nr = await post('nonce', { address: w.address }); const n = await nr.json(); if (!n.message) throw new Error(JSON.stringify(n) + nr.status);
    const bad = await post('login', { address: w.address, nonce: n.nonce, signature: await other.signMessage(n.message) });
    expect(bad.status).toBe(401);
    // nonce is single use
    const again = await post('login', { address: w.address, nonce: n.nonce, signature: await w.signMessage(n.message) });
    expect(again.status).toBe(401);
  });

  it('needs a username before playing; names are unique ignoring case', async () => {
    const a = await signIn(Wallet.createRandom());
    expect((await post('start', { daily: true }, a.token)).status).toBe(403);
    expect((await post('profile', { username: 'ab' }, a.token)).status).toBe(400);
    expect((await post('profile', { username: 'holdr_kai' }, a.token)).status).toBe(200);
    const b = await signIn(Wallet.createRandom());
    expect((await (await get('name-check?u=HOLDR_KAI', b.token)).json()).ok).toBe(false);
    expect((await post('profile', { username: 'HOLDR_KAI' }, b.token)).status).toBe(409);
    expect((await get('me')).status).toBe(401);
  });

  it('plays a daily run, ranks it, and refuses reused or impossible tickets', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-22T03:00:00Z'));
    const a = await signIn(Wallet.createRandom());
    await post('profile', { username: 'alice' }, a.token);
    const st = await (await post('start', { daily: true }, a.token)).json();
    expect(st.seed).toBe(dailySeed(20261022));
    expect(st.today.n).toBe(12);

    vi.setSystemTime(new Date('2026-10-22T03:01:00Z')); // 60 s later
    const fin = await post('finish', { ticket: st.ticket, height: 2400, coins: 40 }, a.token);
    expect(fin.status).toBe(200);
    const r = await fin.json();
    expect(r.first).toBe(true);
    expect(r.gained).toBe(24 + 4 + 20);
    expect(r.isBest).toBe(true);
    expect(r.rank).toBe(1);
    expect(r.me.xp).toBe(48);

    expect((await post('finish', { ticket: st.ticket, height: 2400, coins: 40 }, a.token)).status).toBe(409);

    const st2 = await (await post('start', { daily: true }, a.token)).json();
    vi.setSystemTime(new Date('2026-10-22T03:01:10Z')); // 10 s
    expect((await post('finish', { ticket: st2.ticket, height: 9000, coins: 0 }, a.token)).status).toBe(422);

    const b = await signIn(Wallet.createRandom());
    await post('profile', { username: 'bob', char: 'frog' }, b.token);
    const sb = await (await post('start', { daily: true }, b.token)).json();
    vi.setSystemTime(new Date('2026-10-22T03:03:10Z'));
    const rb = await (await post('finish', { ticket: sb.ticket, height: 3000, coins: 10 }, b.token)).json();
    expect(rb.rank).toBe(1);
    expect(rb.total).toBe(2);

    const lb = await (await get('leaderboard', a.token)).json();
    expect(lb.rows.map((x: { username: string }) => x.username)).toEqual(['bob', 'alice']);
    expect(lb.rows[1].me).toBe(true);
    expect(JSON.stringify(lb)).not.toMatch(/0x[0-9a-f]{40}/); // no addresses leak
  });

  it('town lists same-level neighbors without addresses, and GM works once a day', async () => {
    const a = await signIn(Wallet.createRandom());
    await post('profile', { username: 'alice' }, a.token);
    const b = await signIn(Wallet.createRandom());
    await post('profile', { username: 'bob' }, b.token);
    const t = await (await get('town', a.token)).json();
    expect(t.residents.map((x: { username: string }) => x.username).sort()).toEqual(['alice', 'bob']);
    expect(JSON.stringify(t)).not.toMatch(/0x[0-9a-f]{40}/);
    expect((await post('greet', { username: 'bob' }, a.token)).status).toBe(200);
    expect((await post('greet', { username: 'bob' }, a.token)).status).toBe(200);
    expect(fake.tables.greetings.length).toBe(1);
    expect((await post('greet', { username: 'alice' }, a.token)).status).toBe(404);
    const t2 = await (await get('town', a.token)).json();
    expect(t2.residents.find((x: { username: string }) => x.username === 'bob').greeted).toBe(true);
  });

  it('daily check-in gives XP once per day', async () => {
    const a = await signIn(Wallet.createRandom());
    const c1 = await (await post('checkin', {}, a.token)).json();
    expect(c1.gained).toBe(10);
    expect(c1.me.streak).toBe(1);
    const c2 = await (await post('checkin', {}, a.token)).json();
    expect(c2.already).toBe(true);
  });

  it('rejects non-JSON posts and unknown actions', async () => {
    const r = await POST(new Request(base + 'nonce', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }));
    expect(r.status).toBe(415);
    expect((await get('nope')).status).toBe(404);
  });
});
