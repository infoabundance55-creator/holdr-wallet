import { Contract, Interface, getAddress, type JsonRpcProvider } from 'ethers';
import { defaultKV } from '../lib/vault';
import { ERC20_ABI, FACTORY_ABI, POOL_ABI, type LaunchContracts } from './contracts';
import { applyTransfer, type LaunchToken, type PoolParams, type TradeEv } from './math';

const factoryIface = new Interface(FACTORY_ABI);
const poolIface = new Interface(POOL_ABI);
const erc20Iface = new Interface(ERC20_ABI);

const T_CREATED = factoryIface.getEvent('TokenCreated')!.topicHash;
const T_TRADE = poolIface.getEvent('Trade')!.topicHash;
const T_GRAD = poolIface.getEvent('Graduated')!.topicHash;
const T_CREATOR = poolIface.getEvent('CreatorTransferred')!.topicHash;
const T_TRANSFER = erc20Iface.getEvent('Transfer')!.topicHash;

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
      };
      if (!this.tokens.has(t.token.toLowerCase())) fresh.push(t);
    }
    await pool(fresh, 4, async (t) => { t.params = await this.readParams(t.pool); });

    // Register only after params load, so a failed read retries on the next sync.
    for (const t of fresh) { this.tokens.set(t.token.toLowerCase(), t); this.byPool.set(t.pool.toLowerCase(), t); }

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
          };
          t.trades.push(tr);
        } else if (l.topics[0] === T_GRAD) {
          t.graduated = true;
          t.graduatedAt = time;
          t.burned = ev.args.tokensBurned;
        } else if (l.topics[0] === T_CREATOR) {
          t.creator = getAddress(ev.args.current);
        }
      }

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
