/**
 * Storage for Moon Jump runs (supabase/migrations/003_game.sql). `memoryGameStore` is the same in memory, for tests.
 */
import { db, DbError, enc } from './db.js';
import type { CharId } from './levels.js';

export interface Ticket { id: string; address: string; day: number; slot: number; seed: number; started_at: string; used: boolean }

export interface RunRow {
  ticket_id: string; address: string; day: number; height: number;
  coins_low: number; coins_high: number; points: number; duration_ms: number;
}

export interface BoardRow {
  rank: number; address: string; username: string | null; look: CharId | null; total_points: number; points: number;
}

export class SlotTaken extends Error {
  constructor() { super('slot_taken'); }
}

export interface GameStore {
  /** Slots already used by this account today (1–3). */
  usedSlots(address: string, day: number): Promise<number[]>;
  /** Throws SlotTaken if another start took the slot first. */
  addTicket(t: Omit<Ticket, 'id' | 'started_at' | 'used'>, startedAt: string): Promise<Ticket>;
  /** Marks the ticket used and returns it, only if it was this account's and unused. */
  takeTicket(id: string, address: string): Promise<Ticket | null>;
  addRun(r: RunRow): Promise<void>;
  /** This account's runs today (points), oldest first. */
  dayRuns(address: string, day: number): Promise<number[]>;
  boardDay(day: number, limit: number, me: string): Promise<BoardRow[]>;
  boardSeason(from: number, to: number, limit: number, me: string): Promise<BoardRow[]>;
}

const toBoard = (r: Record<string, unknown>): BoardRow => ({
  rank: Number(r.rank), address: String(r.address), username: (r.username as string | null) ?? null,
  look: (r.look as CharId | null) ?? null, total_points: Number(r.total_points ?? 0), points: Number(r.points ?? 0),
});

export const supabaseGameStore: GameStore = {
  async usedSlots(address, day) {
    const { data } = await db<{ slot: number }[]>(`game_tickets?address=eq.${enc(address)}&day=eq.${day}&select=slot`);
    return data.map((r) => Number(r.slot));
  },
  async addTicket(t, startedAt) {
    try {
      const { data } = await db<Ticket[]>('game_tickets', {
        method: 'POST', body: { ...t, started_at: startedAt }, prefer: ['return=representation'],
      });
      return { ...data[0], seed: Number(data[0].seed) };
    } catch (e) {
      if (e instanceof DbError && e.code === '23505') throw new SlotTaken();
      throw e;
    }
  },
  async takeTicket(id, address) {
    if (!/^[0-9a-f-]{36}$/.test(id)) return null;
    const { data } = await db<Ticket[]>(`game_tickets?id=eq.${id}&address=eq.${enc(address)}&used=eq.false`, {
      method: 'PATCH', body: { used: true }, prefer: ['return=representation'],
    });
    return data[0] ? { ...data[0], seed: Number(data[0].seed) } : null;
  },
  async addRun(r) {
    await db('game_runs', { method: 'POST', body: r, prefer: ['return=minimal'] });
  },
  async dayRuns(address, day) {
    const { data } = await db<{ points: number }[]>(`game_runs?address=eq.${enc(address)}&day=eq.${day}&select=points&order=created_at.asc`);
    return data.map((r) => Number(r.points));
  },
  async boardDay(day, limit, me) {
    const { data } = await db<Record<string, unknown>[]>('rpc/game_board_day', { method: 'POST', body: { p_day: day, p_limit: limit, p_me: me } });
    return data.map(toBoard);
  },
  async boardSeason(from, to, limit, me) {
    const { data } = await db<Record<string, unknown>[]>('rpc/game_board_season', { method: 'POST', body: { p_from: from, p_to: to, p_limit: limit, p_me: me } });
    return data.map(toBoard);
  },
};

/** In-memory store with the same behaviour (tests). `accounts` gives names and looks for the boards. */
export function memoryGameStore(accounts: Map<string, { username: string | null; look: CharId | null; total_points: number }>) {
  const tickets = new Map<string, Ticket>();
  const runs: (RunRow & { at: number })[] = [];
  let n = 0;
  const rankRows = (rows: { address: string; points: number }[], limit: number, me: string): BoardRow[] => {
    rows.sort((a, b) => b.points - a.points);
    return rows
      .map((r, i) => {
        const a = accounts.get(r.address);
        const rank = rows.findIndex((x) => x.points === r.points) + 1;
        return { i, row: { rank, address: r.address, username: a?.username ?? null, look: a?.look ?? null, total_points: a?.total_points ?? 0, points: r.points } };
      })
      .filter((x) => x.i < limit || x.row.address === me)
      .map((x) => x.row);
  };
  const store: GameStore & { tickets: typeof tickets; runs: typeof runs } = {
    tickets, runs,
    async usedSlots(address, day) {
      return [...tickets.values()].filter((t) => t.address === address && t.day === day).map((t) => t.slot);
    },
    async addTicket(t, startedAt) {
      if ([...tickets.values()].some((x) => x.address === t.address && x.day === t.day && x.slot === t.slot)) throw new SlotTaken();
      const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
      const row = { ...t, id, started_at: startedAt, used: false };
      tickets.set(id, row);
      return { ...row };
    },
    async takeTicket(id, address) {
      const t = tickets.get(id);
      if (!t || t.address !== address || t.used) return null;
      t.used = true;
      return { ...t };
    },
    async addRun(r) { runs.push({ ...r, at: runs.length }); },
    async dayRuns(address, day) { return runs.filter((r) => r.address === address && r.day === day).map((r) => r.points); },
    async boardDay(day, limit, me) {
      const best = new Map<string, number>();
      for (const r of runs) if (r.day === day) best.set(r.address, Math.max(best.get(r.address) ?? -1, r.points));
      return rankRows([...best].map(([address, points]) => ({ address, points })), limit, me);
    },
    async boardSeason(from, to, limit, me) {
      const sum = new Map<string, number>();
      for (const r of runs) if (r.day >= from && r.day <= to) sum.set(r.address, (sum.get(r.address) ?? 0) + r.points);
      return rankRows([...sum].map(([address, points]) => ({ address, points })), limit, me);
    },
  };
  return store;
}
