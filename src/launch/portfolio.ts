import { balanceOf, currentPrice, type ClaimEv, type LaunchToken, type TradeEv } from './math';

/** "Me" page data, built from the indexer's events. Pure functions so they can be tested. */

const DAY = 86_400;
const TOK = 1e18;
const USDG = 1e6;

/** Hold-points day bonus (points plan §5): days 1–6 ×1, 7–29 ×1.5, from day 30 ×2. */
export function holdMultiplier(day: number): number {
  return day >= 30 ? 2 : day >= 7 ? 1.5 : 1;
}

/** Days until the next bonus step, or 0 at the top. */
export function daysToNext(day: number): number {
  return day >= 30 ? 0 : day >= 7 ? 30 - day : 7 - Math.max(day, 0);
}

/** Day index used for "the day": UTC calendar days. */
const dayOf = (t: number) => Math.floor(t / DAY);

/**
 * Current hold day for one wallet and token (points plan §5), from the wallet's own buys and sells.
 * - A day counts when the wallet held the token the whole day (its lowest balance that day > 0),
 *   so a token bought today starts counting tomorrow (returns 0 today).
 * - If a day's lowest balance is under half of the previous day's, the count restarts at day 1.
 * - Today counts with its lowest balance so far.
 * Transfers in are ignored (they don't earn hold points); transfers out are not seen here.
 */
export function holdDay(trades: Pick<TradeEv, 'time' | 'isBuy' | 'tokens'>[], now: number): number {
  if (!trades.length) return 0;
  const evs = [...trades].sort((a, b) => a.time - b.time);
  let bal = 0n;
  let i = 0;
  let streak = 0;
  let prevMin = 0n;
  for (let d = dayOf(evs[0].time); d <= dayOf(now); d++) {
    let min = bal; // balance at the start of the day
    const end = (d + 1) * DAY;
    while (i < evs.length && evs[i].time < end) {
      const e = evs[i++];
      bal = e.isBuy ? bal + e.tokens : bal > e.tokens ? bal - e.tokens : 0n;
      if (bal < min) min = bal;
    }
    if (min === 0n) streak = 0;
    else if (prevMin > 0n && min * 2n < prevMin) streak = 1;
    else streak += 1;
    prevMin = min;
  }
  return streak;
}

export interface Holding {
  tk: LaunchToken;
  /** Wallet balance now (from Transfer events). */
  amount: bigint;
  price: number;
  value: number;
  /** Unrealised profit in USDG on the part the wallet bought itself; null when it bought none. */
  pnl: number | null;
  pnlPct: number | null;
  day: number;
}

/**
 * Average-cost basis from the wallet's own trades: buys add the USDG paid (fees included),
 * sells remove cost in proportion to the tokens sold.
 */
export function costBasis(trades: Pick<TradeEv, 'isBuy' | 'tokens' | 'usdg'>[]): { held: bigint; cost: number } {
  let held = 0n;
  let cost = 0;
  for (const tr of trades) {
    if (tr.isBuy) {
      held += tr.tokens;
      cost += Number(tr.usdg) / USDG;
    } else if (held > 0n) {
      const sold = tr.tokens > held ? held : tr.tokens;
      cost -= cost * (Number(sold) / Number(held));
      held -= sold;
    }
  }
  return { held, cost: Math.max(0, cost) };
}

export function myTrades(tk: LaunchToken, who: string): TradeEv[] {
  const w = who.toLowerCase();
  return tk.trades.filter((tr) => tr.trader.toLowerCase() === w);
}

export function holdings(list: LaunchToken[], who: string, now: number): Holding[] {
  const out: Holding[] = [];
  for (const tk of list) {
    if (!tk.params) continue;
    const amount = balanceOf(tk, who);
    if (amount <= 0n) continue;
    const mine = myTrades(tk, who);
    const price = currentPrice(tk);
    const value = (Number(amount) / TOK) * price;
    const { held, cost } = costBasis(mine);
    let pnl: number | null = null;
    let pnlPct: number | null = null;
    if (held > 0n && cost > 0) {
      // Only the bought part has a cost; tokens received by transfer are left out.
      const tracked = amount < held ? amount : held;
      const trackedCost = cost * (Number(tracked) / Number(held));
      pnl = (Number(tracked) / TOK) * price - trackedCost;
      pnlPct = trackedCost > 0 ? (pnl / trackedCost) * 100 : null;
    }
    out.push({ tk, amount, price, value, pnl, pnlPct, day: holdDay(mine, now) });
  }
  return out.sort((a, b) => b.value - a.value);
}

export function launchedBy(list: LaunchToken[], who: string): LaunchToken[] {
  const w = who.toLowerCase();
  return list.filter((t) => t.params && t.creator.toLowerCase() === w).sort((a, b) => b.createdBlock - a.createdBlock);
}

export type Activity =
  | { kind: 'buy' | 'sell'; time: number; block: number; logIndex: number; tx: string; tk: LaunchToken; tokens: bigint; usdg: bigint }
  | { kind: 'launch'; time: number; block: number; logIndex: number; tx: string | null; tk: LaunchToken }
  | { kind: 'claim'; time: number; block: number; logIndex: number; tx: string; tk: LaunchToken | null; currency: 'usdg' | 'token'; amount: bigint };

/** The wallet's trades, launches and fee claims, newest first. */
export function activity(list: LaunchToken[], claims: ClaimEv[], who: string): Activity[] {
  const w = who.toLowerCase();
  const out: Activity[] = [];
  const byToken = new Map(list.map((t) => [t.token.toLowerCase(), t]));
  for (const tk of list) {
    if (!tk.params) continue;
    for (const tr of tk.trades) {
      if (tr.trader.toLowerCase() !== w) continue;
      out.push({ kind: tr.isBuy ? 'buy' : 'sell', time: tr.time, block: tr.block, logIndex: tr.logIndex, tx: tr.tx, tk, tokens: tr.tokens, usdg: tr.usdg });
    }
    // The launch event's creator; a later creator handover doesn't rewrite history, but we only keep the current one.
    if (tk.creator.toLowerCase() === w) out.push({ kind: 'launch', time: tk.createdAt, block: tk.createdBlock, logIndex: -1, tx: null, tk });
  }
  for (const c of claims) {
    if (c.account.toLowerCase() !== w) continue;
    out.push({ kind: 'claim', time: c.time, block: c.block, logIndex: c.logIndex, tx: c.tx, tk: c.token ? byToken.get(c.token) ?? null : null, currency: c.currency, amount: c.amount });
  }
  return out.sort((a, b) => b.block - a.block || b.logIndex - a.logIndex);
}
