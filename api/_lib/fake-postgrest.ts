/**
 * Test-only in-memory stand-in for the Supabase REST API.
 * Supports just the query shapes api/game uses: eq/gt/lt/in/not.is.null filters,
 * select with one embedded `players(...)` relation, order, limit, on_conflict upserts,
 * Prefer return=representation / count=exact.
 */
import { randomUUID } from 'node:crypto';

type Row = Record<string, unknown>;

const DEFAULTS: Record<string, () => Row> = {
  players: () => ({ id: randomUUID(), username: null, char: 'boss', xp: 0, level: 0, coins: 0, streak: 0, last_checkin: null, created_at: new Date().toISOString(), last_seen: new Date().toISOString() }),
  run_tickets: () => ({ id: randomUUID(), started_at: new Date().toISOString(), used: false }),
  runs: () => ({ xp_gained: 0, verified: false, created_at: new Date().toISOString() }),
};
const UNIQUE: Record<string, string[][]> = {
  players: [['address'], ['username']],
  nonces: [['nonce']],
  sessions: [['token_hash']],
  daily_best: [['day', 'player_id']],
  greetings: [['day', 'from_id', 'to_id']],
};

export class FakeDb {
  tables: Record<string, Row[]> = { players: [], nonces: [], sessions: [], run_tickets: [], runs: [], daily_best: [], greetings: [] };
  private seq = 1;

  private parseVal(v: string): unknown {
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    return v;
  }

  private match(row: Row, params: URLSearchParams): boolean {
    for (const [k, raw] of params) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      const v = row[k];
      const [op, ...rest] = raw.split('.');
      const arg = rest.join('.');
      const cmp = (x: unknown) => (typeof v === 'string' && typeof x === 'string' && k === 'username' ? v.toLowerCase() === x.toLowerCase() : v === x);
      if (op === 'eq' && !cmp(this.parseVal(arg))) return false;
      if (op === 'gt' && !((v as never) > (this.parseVal(arg) as never))) return false;
      if (op === 'lt' && !((v as never) < (this.parseVal(arg) as never))) return false;
      if (op === 'in' && !arg.slice(1, -1).split(',').includes(String(v))) return false;
      if (op === 'not' && arg === 'is.null' && v == null) return false;
    }
    return true;
  }

  private project(table: string, row: Row, select: string | null): Row {
    if (!select || select === '*') return { ...row };
    const out: Row = {};
    const m = select.match(/players\(([^)]*)\)/);
    const plain = select.replace(/,?players\([^)]*\)/, '').split(',').filter(Boolean);
    for (const c of plain) out[c] = row[c];
    if (m) {
      const fk = table === 'sessions' || table === 'daily_best' ? row.player_id : null;
      const p = this.tables.players.find((x) => x.id === fk);
      out.players = p ? this.project('players', p, m[1] || '*') : null;
    }
    return out;
  }

  private conflict(table: string, row: Row, keys?: string[]): Row | undefined {
    const sets = keys ? [keys] : UNIQUE[table] ?? [];
    for (const ks of sets) {
      const found = this.tables[table].find((r) => ks.every((k) => r[k] != null && (k === 'username' ? String(r[k]).toLowerCase() === String(row[k] ?? '').toLowerCase() : r[k] === row[k])));
      if (found) return found;
    }
    return undefined;
  }

  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const table = url.pathname.split('/rest/v1/')[1];
    const params = url.searchParams;
    const method = (init?.method ?? 'GET').toUpperCase();
    const prefer = String((init?.headers as Record<string, string>)?.prefer ?? '');
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const rows = this.tables[table];
    if (!rows) return new Response(JSON.stringify({ message: 'no table' }), { status: 404 });
    const err = (code: string) => new Response(JSON.stringify({ code, message: code }), { status: 409 });
    let result: Row[] = [];

    if (method === 'GET') {
      result = rows.filter((r) => this.match(r, params));
      const order = params.get('order');
      if (order) {
        const [col, dir] = order.split('.');
        result.sort((a, b) => ((a[col] as number) - (b[col] as number)) * (dir === 'desc' ? -1 : 1));
      }
      const total = result.length;
      const limit = params.get('limit');
      if (limit) result = result.slice(0, Number(limit));
      const data = result.map((r) => this.project(table, r, params.get('select')));
      const headers: Record<string, string> = {};
      if (prefer.includes('count=exact')) headers['content-range'] = `0-${Math.max(0, data.length - 1)}/${total}`;
      return new Response(JSON.stringify(data), { status: 200, headers });
    }
    if (method === 'POST') {
      const onConflict = params.get('on_conflict')?.split(',');
      const items = Array.isArray(body) ? body : [body];
      for (const item of items) {
        const existing = this.conflict(table, item, onConflict);
        if (existing) {
          if (prefer.includes('merge-duplicates')) { Object.assign(existing, item); result.push(existing); continue; }
          if (prefer.includes('ignore-duplicates')) continue;
          return err('23505');
        }
        const row = { ...(DEFAULTS[table]?.() ?? {}), ...item };
        if (table === 'runs') row.id = this.seq++;
        rows.push(row);
        result.push(row);
      }
    } else if (method === 'PATCH') {
      const targets = rows.filter((r) => this.match(r, params));
      for (const t of targets) {
        if (body.username && this.tables.players.some((p) => p !== t && String(p.username ?? '').toLowerCase() === String(body.username).toLowerCase())) return err('23505');
        Object.assign(t, body);
      }
      result = targets;
    } else if (method === 'DELETE') {
      result = rows.filter((r) => this.match(r, params));
      this.tables[table] = rows.filter((r) => !result.includes(r));
    }
    const ret = prefer.includes('return=representation') ? JSON.stringify(result.map((r) => ({ ...r }))) : '';
    return new Response(ret || null, { status: ret ? 200 : 204 });
  };
}
