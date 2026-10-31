import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { CHARS, LEVELS } from '../src/launch/points';
import { COOKIE, handleAccount, STATEMENT, usernameProblem, type Ctx, type PublicAccount } from './_lib/account-api';
import { memoryStore } from './_lib/accounts';
import { CHAR_MIN, LEVEL_CHAR, LEVEL_MIN, levelOf } from './_lib/levels';

const ORIGIN = 'https://holdrs.xyz';
const alice = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const bob = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');

function setup(start = new Date('2026-11-01T00:00:00Z')) {
  const store = memoryStore();
  let t = start.getTime();
  const ctx: Ctx = { store, now: () => new Date(t) };
  let cookie = '';
  const call = async (method: 'GET' | 'POST', action: string, body?: unknown, opts: { origin?: string | null; type?: string } = {}) => {
    const headers: Record<string, string> = {};
    const origin = opts.origin === undefined ? ORIGIN : opts.origin;
    if (origin) headers.origin = origin;
    if (body !== undefined) headers['content-type'] = opts.type ?? 'application/json';
    if (cookie) headers.cookie = cookie;
    const res = await handleAccount(new Request(`${ORIGIN}/api/account/${action}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), ctx);
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = /Max-Age=0/.test(sc) ? '' : sc.split(';')[0];
    return { status: res.status, body: await res.json() as Record<string, unknown> };
  };
  const signIn = async (acct = alice, chainId = 46630) => {
    const n = await call('POST', 'nonce', { address: acct.address, chainId });
    const signature = await acct.signMessage({ message: String(n.body.message) });
    return call('POST', 'login', { nonce: n.body.nonce, signature });
  };
  return { store, call, signIn, advance: (ms: number) => { t += ms; }, cookie: () => cookie, setCookie: (c: string) => { cookie = c; } };
}

describe('account api', () => {
  it('builds a SIWE message for our domain and chain', async () => {
    const { call } = setup();
    const r = await call('POST', 'nonce', { address: alice.address, chainId: 46630 });
    expect(r.status).toBe(200);
    const msg = String(r.body.message);
    expect(msg.startsWith('holdrs.xyz wants you to sign in with your Ethereum account:')).toBe(true);
    expect(msg).toContain(alice.address); // checksummed
    expect(msg).toContain(STATEMENT);
    expect(msg).toContain('Chain ID: 46630');
    expect(msg).toContain(`Nonce: ${r.body.nonce}`);
    expect((await call('POST', 'nonce', { address: alice.address, chainId: 1 })).status).toBe(400);
    expect((await call('POST', 'nonce', { address: 'nope', chainId: 46630 })).status).toBe(400);
  });

  it('signs in with a real signature, sets a session cookie and creates the account', async () => {
    const s = setup();
    const r = await s.signIn();
    expect(r.status).toBe(200);
    expect(s.cookie().startsWith(`${COOKIE}=`)).toBe(true);
    const me = r.body.me as PublicAccount;
    expect(me).toEqual({ address: alice.address.toLowerCase(), username: null, total: 0, level: 1, levelSeen: 1, look: null });
    expect((await s.call('GET', 'me')).body.me).toEqual(me);
    // Only the hash of the token is stored.
    const token = s.cookie().split('=')[1];
    expect([...s.store.sessions.keys()]).not.toContain(token);
  });

  it('rejects a wrong signer, a reused nonce and an expired nonce', async () => {
    const s = setup();
    const n = await s.call('POST', 'nonce', { address: alice.address, chainId: 46630 });
    const bad = await bob.signMessage({ message: String(n.body.message) });
    expect((await s.call('POST', 'login', { nonce: n.body.nonce, signature: bad })).body.error).toBe('bad_signature');
    // The nonce is gone after one try, even with the right signature now.
    const good = await alice.signMessage({ message: String(n.body.message) });
    expect((await s.call('POST', 'login', { nonce: n.body.nonce, signature: good })).body.error).toBe('nonce_expired');

    const n2 = await s.call('POST', 'nonce', { address: alice.address, chainId: 46630 });
    s.advance(11 * 60_000);
    const sig2 = await alice.signMessage({ message: String(n2.body.message) });
    expect((await s.call('POST', 'login', { nonce: n2.body.nonce, signature: sig2 })).status).toBe(401);
  });

  it('rejects a message made for another site', async () => {
    const s = setup();
    const n = await s.call('POST', 'nonce', { address: alice.address, chainId: 46630 }, { origin: 'http://localhost:5173' });
    const sig = await alice.signMessage({ message: String(n.body.message) });
    expect((await s.call('POST', 'login', { nonce: n.body.nonce, signature: sig })).body.error).toBe('bad_domain');
  });

  it('blocks other origins and non-JSON posts', async () => {
    const s = setup();
    expect((await s.call('POST', 'nonce', { address: alice.address, chainId: 46630 }, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await s.call('POST', 'nonce', { address: alice.address, chainId: 46630 }, { origin: null })).status).toBe(403);
    expect((await s.call('POST', 'nonce', { address: alice.address, chainId: 46630 }, { type: 'text/plain' })).status).toBe(415);
    expect((await s.call('GET', 'nope')).status).toBe(404);
  });

  it('needs a session for profile actions, and logout ends it', async () => {
    const s = setup();
    expect((await s.call('GET', 'me')).status).toBe(401);
    expect((await s.call('POST', 'username', { username: 'kai' })).status).toBe(401);
    await s.signIn();
    expect((await s.call('GET', 'me')).status).toBe(200);
    const saved = s.cookie();
    await s.call('POST', 'logout', {});
    expect(s.cookie()).toBe('');
    s.setCookie(saved);
    expect((await s.call('GET', 'me')).status).toBe(401); // the old token no longer works
  });

  it('sessions expire after 30 days', async () => {
    const s = setup();
    await s.signIn();
    s.advance(31 * 86400_000);
    expect((await s.call('GET', 'me')).status).toBe(401);
  });

  it('sets a unique username (case-insensitive) and checks names', async () => {
    const s = setup();
    await s.signIn();
    expect((await s.call('POST', 'username', { username: 'ab' })).body.error).toBe('username_format');
    expect((await s.call('POST', 'username', { username: 'kai.hodl' })).body.error).toBe('username_format');
    expect((await s.call('POST', 'username', { username: 'Holdrs_team' })).body.error).toBe('username_reserved');
    const ok = await s.call('POST', 'username', { username: 'Kai_hodl' });
    expect((ok.body.me as PublicAccount).username).toBe('Kai_hodl');
    expect((await s.call('GET', 'name-check?u=kai_HODL')).body).toEqual({ ok: false, reason: 'taken' });
    expect((await s.call('GET', 'name-check?u=moonboy')).body).toEqual({ ok: true });

    const b = setup();
    b.store.accounts.set(alice.address.toLowerCase(), { ...s.store.accounts.get(alice.address.toLowerCase())! });
    await b.signIn(bob);
    expect((await b.call('POST', 'username', { username: 'KAI_HODL' })).status).toBe(409);
  });

  it('only lets you pick unlocked characters', async () => {
    const s = setup();
    await s.signIn();
    expect((await s.call('POST', 'look', { look: 'bull' })).body.error).toBe('locked');
    expect((await s.call('POST', 'look', { look: 'dragon' })).status).toBe(400);
    s.store.accounts.get(alice.address.toLowerCase())!.total_points = 268_400;
    expect(((await s.call('POST', 'look', { look: 'frog' })).body.me as PublicAccount).look).toBe('frog');
    expect(((await s.call('POST', 'look', { look: 'anon' })).body.error)).toBe('locked');
    // Picking the level's own character means "follow my level".
    expect(((await s.call('POST', 'look', { look: 'bull' })).body.me as PublicAccount).look).toBe(null);
  });

  it('level-up: shows once, switches to the new character unless kept', async () => {
    const s = setup();
    await s.signIn();
    const acct = s.store.accounts.get(alice.address.toLowerCase())!;
    acct.total_points = 60_000; // level 3, Moon Frog
    let me = (await s.call('GET', 'me')).body.me as PublicAccount;
    expect([me.level, me.levelSeen]).toEqual([3, 1]);
    me = (await s.call('POST', 'level-seen', {})).body.me as PublicAccount;
    expect([me.levelSeen, me.look]).toEqual([3, null]);

    acct.total_points = 268_400; // level 4, Laser Bull
    me = (await s.call('POST', 'level-seen', { keep: true })).body.me as PublicAccount;
    expect([me.levelSeen, me.look]).toEqual([4, 'frog']); // kept the look from before
    me = (await s.call('POST', 'level-seen', { keep: false })).body.me as PublicAccount;
    expect(me.look).toBe('frog'); // already seen: nothing changes
  });

  it('server level table matches the site', () => {
    expect(LEVELS.map((l) => l.min)).toEqual(LEVEL_MIN);
    expect(LEVELS.map((l) => l.char)).toEqual(LEVEL_CHAR);
    for (const c of CHARS) expect(CHAR_MIN[c.id]).toBe(c.min);
    expect([0, 9_999, 10_000, 268_400, 5_000_000].map(levelOf)).toEqual([1, 1, 2, 4, 6]);
  });

  it('username rules', () => {
    expect(usernameProblem('moon_frog')).toBe(null);
    expect(usernameProblem('0xdeadbeef')).toBe('reserved');
    expect(usernameProblem('admin')).toBe('reserved');
    expect(usernameProblem('a b c')).toBe('format');
  });
});
