import { Contract, Interface, getAddress, type JsonRpcProvider } from 'ethers';
import { defaultKV } from '../lib/kv';
import { ERC20_ABI, FACTORY_ABI, PM_ABI, POOL_ABI, ROUTER_EVENTS_ABI, type LaunchContracts } from './contracts';
import { applyTransfer, priceAt, type LaunchToken, type PoolParams, type TradeEv } from './math';
import { poolId, poolKeyFor, priceFromSqrt, tokenIs0 } from './v4';

const factoryIface = new Interface(FACTORY_ABI);
const poolIface = new Interface(POOL_ABI);
const erc20Iface = new Interface(ERC20_ABI);
const pmIface = new Interface(PM_ABI);
const routerIface = new Interface(ROUTER_EVENTS_ABI);

const T_CREATED = factoryIface.getEvent('TokenCreated')!.topicHash;
const T_TRADE = poolIface.getEvent('Trade')!.topicHash;
const T_GRAD = poolIface.getEvent('Graduated')!.topicHash;
const T_CREATOR = poolIface.getEvent('CreatorTransferred')!.topicHash;
const T_TRANSFER = erc20Iface.getEvent('Transfer')!.topicHash;
const T_SWAP = pmIface.getEvent('Swap')!.topicHash;
const T_SWAPPED = routerIface.getEvent('Swapped')!.topicHash;

/** The testnet RPC allows at most 10M blocks per eth_getLogs; stay well under it. */
const MAX_SPAN = 5_000_000;
const ADDR_BATCH = 50;

interface RawLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  logIndex: string;
  transactionHash: string;
}

const hex = (n: number) => '0x' + n.toString(16);
const num = (h: string) => parseInt(h, 16);
const byOrder = (a: RawLog, b: RawLog) => num(a.blockNumber) - num(b.blockNumber) || num(a.logIndex) - num(b.logIndex);

/** Runs `fn` over `items` with at most `limit` in flight. */
async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Builds launchpad state straight from chain events. Good enough for testnet volumes;
 * mainnet will need an indexer service.
 */
export class LaunchIndexer {
  readonly tokens = new Map<string, LaunchToken>(); // token (lower) => state
  private readonly byPool = new Map<string, LaunchToken>(); // pool (lower) => state
  private readonly byPoolId = new Map<string, LaunchToken>(); // Uniswap v4 pool id (lower) => state
  private scannedTo = -1;
  private running: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private blockTimes: Map<number, number>;
  private readonly timeKey: string;
  version = 0;
  status: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  latestBlock = 0;
  latestTime = 0;

  constructor(private provider: JsonRpcProvider, readonly c: LaunchContracts, chainId: number) {
    this.timeKey = `holdr.blockTimes.${chainId}`;
    this.blockTimes = this.loadTimes();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  private emit() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  /** Contracts that hold tokens but are not holders. */
  get excluded(): string[] {
    return [this.c.locker, this.c.poolManager, this.c.hook, this.c.factory];
  }

  list(): LaunchToken[] {
    return [...this.tokens.values()];
  }

  get(token: string): LaunchToken | undefined {
    return this.tokens.get(token.toLowerCase());
  }

  /** Scans new blocks. Concurrent calls share one run. */
  sync(): Promise<void> {
    if (!this.running) {
      if (this.status !== 'ready') { this.status = 'loading'; this.emit(); }
      this.running = this.run()
        .then(() => { this.status = 'ready'; })
        .catch((e) => { console.warn('launch sync failed', e); if (this.status !== 'ready') this.status = 'error'; })
        .finally(() => { this.running = null; this.emit(); });
    }
    return this.running;
  }

  private async run() {
    const latest = await this.provider.getBlockNumber();
    const from = this.scannedTo < 0 ? this.c.fromBlock : this.scannedTo + 1;
    if (latest < from) return;

    // 1. New launches.
    const created = await this.logs([this.c.factory], [T_CREATED], from, latest);
    const fresh: LaunchToken[] = [];
    for (const l of created) {
      const ev = factoryIface.parseLog(l)!;
      const t: LaunchToken = {
        token: getAddress(ev.args.token), pool: getAddress(ev.args.pool), creator: getAddress(ev.args.creator),
        name: ev.args.name, symbol: ev.args.symbol, metadataURI: ev.args.metadataURI,
        createdBlock: num(l.blockNumber), createdAt: 0, params: null, trades: [], graduated: false,
        graduatedAt: null, balances: new Map(), burned: 0n,
        poolId: '',
      };
      t.poolId = poolId(poolKeyFor(t.token, this.c.usdg, this.c.hook)).toLowerCase();
      if (!this.tokens.has(t.token.toLowerCase())) fresh.push(t);
    }
    await pool(fresh, 4, async (t) => { t.params = await this.readParams(t.pool); });

    // Register only after params load, so a failed read retries on the next sync.
    for (const t of fresh) {
      this.tokens.set(t.token.toLowerCase(), t);
      this.byPool.set(t.pool.toLowerCase(), t);
      this.byPoolId.set(t.poolId, t);
    }

    const all = this.list();
    if (all.length) {
      // 2. Curve events and 3. token transfers, both over the same range.
      const [poolLogs, transfers] = await Promise.all([
        this.logs(all.map((t) => t.pool), [[T_TRADE, T_GRAD, T_CREATOR]], from, latest),
        this.logs(all.map((t) => t.token), [T_TRANSFER], from, latest),
      ]);

      const needTimes = new Set<number>([...fresh.map((t) => t.createdBlock), ...poolLogs.map((l) => num(l.blockNumber))]);
      await this.loadBlockTimes([...needTimes]);
      for (const t of fresh) t.createdAt = t.params?.launchTime || this.blockTimes.get(t.createdBlock) || 0;

      for (const l of poolLogs) {
        const t = this.byPool.get(l.address.toLowerCase());
        if (!t) continue;
        const ev = poolIface.parseLog(l)!;
        const time = this.blockTimes.get(num(l.blockNumber)) ?? 0;
        if (l.topics[0] === T_TRADE) {
          const a = ev.args;
          const tr: TradeEv = {
            block: num(l.blockNumber), logIndex: num(l.logIndex), time, tx: l.transactionHash, trader: getAddress(a.trader),
            isBuy: a.isBuy, usdg: a.usdgAmount, tokens: a.tokenAmount, fee: a.fee, surcharge: a.surcharge,
            realAfter: a.realUsdgAfter, soldAfter: a.tokensSoldAfter,
            venue: 'curve', price: t.params ? priceAt(t.params, a.realUsdgAfter, a.tokensSoldAfter) : 0,
          };
          t.trades.push(tr);
        } else if (l.topics[0] === T_GRAD) {
          t.graduated = true;
          t.graduatedAt = time;
          t.gradTx = l.transactionHash;
          t.burned = ev.args.tokensBurned;
        } else if (l.topics[0] === T_CREATOR) {
          t.creator = getAddress(ev.args.current);
        }
      }

      // 4. Uniswap v4 swaps for graduated tokens (and who traded, from the router's own event).
      const grads = all.filter((t) => t.graduated);
      if (grads.length) await this.scanSwaps(grads, from, latest);

      for (const l of transfers) {
        const t = this.tokens.get(l.address.toLowerCase());
        if (!t) continue;
        const ev = erc20Iface.parseLog(l)!;
        applyTransfer(t.balances, ev.args.from, ev.args.to, ev.args.value);
      }
    }

    this.scannedTo = latest;
    this.latestBlock = latest;
    await this.loadBlockTimes([latest]);
    this.latestTime = this.blockTimes.get(latest) ?? Math.floor(Date.now() / 1000);
  }

  private async scanSwaps(grads: LaunchToken[], from: number, to: number) {
    const ids = grads.map((t) => t.poolId);
    const swapLogs: RawLog[] = [];
    for (let i = 0; i < ids.length; i += ADDR_BATCH) {
      swapLogs.push(...await this.logs([this.c.poolManager], [T_SWAP, ids.slice(i, i + ADDR_BATCH)], from, to));
    }
    if (!swapLogs.length) return;
    const traders = new Map<string, string>(); // tx hash => trader
    if (this.c.router) {
      for (const l of await this.logs([this.c.router], [T_SWAPPED], from, to)) traders.set(l.transactionHash.toLowerCase(), getAddress('0x' + l.topics[1].slice(26)));
    }
    await this.loadBlockTimes(swapLogs.map((l) => num(l.blockNumber)));
    const touched = new Set<LaunchToken>();
    for (const l of swapLogs) {
      const t = this.byPoolId.get(l.topics[1].toLowerCase());
      if (!t) continue;
      const a = pmIface.parseLog(l)!.args;
      const t0 = tokenIs0(poolKeyFor(t.token, this.c.usdg, this.c.hook), t.token);
      const d0 = BigInt(a.amount0), d1 = BigInt(a.amount1);
      const [dTok, dUsdg] = t0 ? [d0, d1] : [d1, d0];
      const abs = (x: bigint) => (x < 0n ? -x : x);
      const isBuy = dUsdg < 0n; // the trader paid USDG into the pool
      const usdg = abs(dUsdg);
      const fee = isBuy ? (usdg * BigInt(a.fee)) / 1_000_000n : (usdg * BigInt(a.fee)) / (1_000_000n - BigInt(a.fee));
      const last = t.trades[t.trades.length - 1];
      t.trades.push({
        block: num(l.blockNumber), logIndex: num(l.logIndex), time: this.blockTimes.get(num(l.blockNumber)) ?? 0, tx: l.transactionHash,
        trader: traders.get(l.transactionHash.toLowerCase()) ?? getAddress('0x' + l.topics[2].slice(26)),
        isBuy, usdg, tokens: abs(dTok), fee, surcharge: 0n,
        realAfter: last?.realAfter ?? 0n, soldAfter: last?.soldAfter ?? 0n,
        venue: 'uni', price: priceFromSqrt(BigInt(a.sqrtPriceX96), t0),
      });
      touched.add(t);
    }
    for (const t of touched) t.trades.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
  }

  private async readParams(poolAddr: string): Promise<PoolParams> {
    const p = new Contract(poolAddr, POOL_ABI, this.provider);
    const [virtualUsdg, initialVirtualTokens, gradThreshold, feeBps, creatorShareBps, firstBuyMaxTokens, launchTime] = await Promise.all([
      p.virtualUsdg(), p.initialVirtualTokens(), p.gradThreshold(), p.feeBps(), p.creatorShareBps(), p.firstBuyMaxTokens(), p.launchTime(),
    ]);
    return {
      virtualUsdg, initialVirtualTokens, gradThreshold, feeBps: Number(feeBps), creatorShareBps: Number(creatorShareBps),
      firstBuyMaxTokens, launchTime: Number(launchTime),
    };
  }

  /** eth_getLogs over any range: splits by block span and address batches, halving the span if the RPC refuses. */
  private async logs(addresses: string[], topics: (string | string[])[], from: number, to: number): Promise<RawLog[]> {
    const out: RawLog[] = [];
    for (let i = 0; i < addresses.length; i += ADDR_BATCH) {
      const address = addresses.slice(i, i + ADDR_BATCH);
      let start = from;
      let span = MAX_SPAN;
      while (start <= to) {
        const end = Math.min(to, start + span - 1);
        try {
          const res = await this.provider.send('eth_getLogs', [{ address, topics, fromBlock: hex(start), toBlock: hex(end) }]) as RawLog[];
          out.push(...res);
          start = end + 1;
        } catch (e) {
          if (span <= 1000) throw e;
          span = Math.floor(span / 2);
        }
      }
    }
    return out.sort(byOrder);
  }

  private async loadBlockTimes(blocks: number[]) {
    const missing = [...new Set(blocks)].filter((b) => !this.blockTimes.has(b));
    if (!missing.length) return;
    await pool(missing, 6, async (b) => {
      const blk = await this.provider.getBlock(b);
      if (blk) this.blockTimes.set(b, blk.timestamp);
    });
    this.saveTimes();
  }

  private loadTimes(): Map<number, number> {
    try {
      const raw = defaultKV().getItem(this.timeKey);
      if (raw) return new Map(JSON.parse(raw) as [number, number][]);
    } catch { /* ignore */ }
    return new Map();
  }

  private saveTimes() {
    try {
      const entries = [...this.blockTimes.entries()].sort((a, b) => a[0] - b[0]).slice(-4000);
      defaultKV().setItem(this.timeKey, JSON.stringify(entries));
    } catch { /* storage full or blocked */ }
  }
}

const indexers = new Map<string, LaunchIndexer>();

/** One indexer per RPC + factory, shared by every screen. */
export function getIndexer(provider: JsonRpcProvider, c: LaunchContracts, chainId: number, rpc: string): LaunchIndexer {
  const key = `${rpc}|${c.factory}`;
  let ix = indexers.get(key);
  if (!ix) { ix = new LaunchIndexer(provider, c, chainId); indexers.set(key, ix); }
  return ix;
}
