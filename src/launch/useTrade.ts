import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useBalance, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from 'wagmi';
import type { Address, Hex } from 'viem';
import { useApp } from '../state';
import { useWallet } from '../wallet/ConnectWallet';
import { CHAINS } from '../wallet/wagmi';
import { curveAbi, erc20Abi, factoryAbi, faucetAbi, pmAbi, routerAbi } from './abi';
import type { LaunchIndexer } from './chain';
import { LAUNCH } from './contracts';
import type { LaunchToken } from './math';
import { DEADLINE_SEC, explain, FAUCET_AMOUNT, GRADUATION_GAS, impactPct, withSlippage, type ErrMsg } from './trade';
import { poolKeyFor, poolStateSlot, priceFromSqrt, reserves as v4Reserves, slotPlus, sqrtFromSlot0, tokenIs0, type PoolKey } from './v4';

export type Side = 'buy' | 'sell';

export interface Quote {
  /** Tokens out (buy) or USDG out after fee (sell), raw units. */
  out: bigint;
  /** Buy: USDG actually taken (less than asked only for the graduating buy). */
  usdgUsed: bigint;
  /** Fee in USDG for display. */
  feeUsdg: number;
  impact: number;
  surchargeBps: number;
  /** This buy fills the curve and graduates the token. */
  graduates: boolean;
  /** Trade size in USDG (for the points estimate). */
  usd: number;
}

const addr = (a: string) => a as Address;

/** The site's chain, the launchpad contracts, and a public client on that chain. */
export function useChainCtx() {
  const { network } = useApp();
  const chainId = CHAINS[network.id].id;
  const c = LAUNCH[network.id];
  const client = usePublicClient({ chainId });
  return { chainId, c, client, network };
}

export function poolKeyOf(tk: LaunchToken, usdg: string, hook: string): PoolKey {
  return poolKeyFor(tk.token, usdg, hook);
}

/** Live quote for a trade, from the contracts themselves (eth_call). */
export function useQuote(tk: LaunchToken, side: Side, amount: bigint | null) {
  const { client, c, chainId } = useChainCtx();
  const venue = tk.graduated ? 'uni' : 'curve';
  return useQuery({
    queryKey: ['quote', chainId, tk.token, venue, side, amount?.toString()],
    enabled: !!client && !!c && amount != null && amount > 0n && (venue === 'curve' || !!c.router),
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: 1,
    queryFn: async (): Promise<Quote> => {
      if (!client || !c || amount == null) throw new Error('no client');
      if (venue === 'curve') {
        const pool = addr(tk.pool);
        const [x, y] = await client.readContract({ address: pool, abi: curveAbi, functionName: 'reserves' });
        const spot = (Number(x) / 1e6) / (Number(y) / 1e18);
        if (side === 'buy') {
          const q = await client.readContract({ address: pool, abi: curveAbi, functionName: 'quoteBuy', args: [amount] });
          const real = x - (tk.params?.virtualUsdg ?? 0n);
          const grad = tk.params ? real + q.toCurve >= tk.params.gradThreshold : false;
          return {
            out: q.tokensOut, usdgUsed: q.usdgUsed, feeUsdg: Number(q.fee) / 1e6,
            impact: impactPct(spot, Number(q.usdgUsed - q.fee) / 1e6, Number(q.tokensOut) / 1e18, true),
            surchargeBps: q.usdgUsed > 0n ? Number((q.surcharge * 10_000n) / q.usdgUsed) : 0,
            graduates: grad, usd: Number(q.usdgUsed) / 1e6,
          };
        }
        const [usdgOut, fee] = await client.readContract({ address: pool, abi: curveAbi, functionName: 'quoteSell', args: [amount] });
        return {
          out: usdgOut, usdgUsed: 0n, feeUsdg: Number(fee) / 1e6,
          impact: impactPct(spot, Number(usdgOut + fee) / 1e6, Number(amount) / 1e18, false),
          surchargeBps: 0, graduates: false, usd: Number(usdgOut) / 1e6,
        };
      }
      // Graduated: Uniswap v4 pool through the router.
      const key = poolKeyFor(tk.token, c.usdg, c.hook);
      const t0 = tokenIs0(key, tk.token);
      const zeroForOne = side === 'buy' ? !t0 : t0; // pay USDG (buy) or the token (sell)
      const slot = poolStateSlot(tk.poolId);
      const [{ result: [amountOut] }, words] = await Promise.all([
        client.simulateContract({ address: addr(c.router!), abi: routerAbi, functionName: 'quoteExactIn', args: [key, zeroForOne, amount] }),
        client.readContract({ address: addr(c.poolManager), abi: pmAbi, functionName: 'extsload', args: [slot as Hex, 1n] }),
      ]);
      const spot = priceFromSqrt(sqrtFromSlot0(words[0]), t0);
      const fee = 0.01;
      if (side === 'buy') {
        const usd = Number(amount) / 1e6;
        return { out: amountOut, usdgUsed: amount, feeUsdg: usd * fee, impact: impactPct(spot, usd * (1 - fee), Number(amountOut) / 1e18, true), surchargeBps: 0, graduates: false, usd };
      }
      const usd = Number(amountOut) / 1e6;
      return { out: amountOut, usdgUsed: 0n, feeUsdg: (usd / (1 - fee)) * fee, impact: impactPct(spot, usd / (1 - fee), Number(amount) / 1e18, false), surchargeBps: 0, graduates: false, usd };
    },
  });
}

/** Pool liquidity (USDG side x2) and live price of a graduated token's Uniswap pool. */
export function usePoolState(tk: LaunchToken) {
  const { client, c, chainId } = useChainCtx();
  return useQuery({
    queryKey: ['v4pool', chainId, tk.poolId],
    enabled: !!client && !!c && tk.graduated,
    refetchInterval: 30_000,
    queryFn: async () => {
      const slot = poolStateSlot(tk.poolId);
      const words = await client!.readContract({ address: addr(c!.poolManager), abi: pmAbi, functionName: 'extsload', args: [slotPlus(slot, 0) as Hex, 4n] });
      const sqrt = sqrtFromSlot0(words[0]);
      const liquidity = BigInt(words[3]) & ((1n << 128n) - 1n);
      const t0 = tokenIs0(poolKeyFor(tk.token, c!.usdg, c!.hook), tk.token);
      const r = v4Reserves(liquidity, sqrt, t0);
      return { price: priceFromSqrt(sqrt, t0), usdg: r.usdg, tokens: r.tokens, tvl: r.usdg * 2 };
    },
  });
}

/** USDG, token and ETH balances of the connected wallet on the site's chain. */
export function useBalances(tk: LaunchToken) {
  const { chainId, c } = useChainCtx();
  const { address } = useWallet();
  const opts = { enabled: !!address && !!c, refetchInterval: 15_000 };
  const usdg = useReadContract({ chainId, address: c ? addr(c.usdg) : undefined, abi: erc20Abi, functionName: 'balanceOf', args: address ? [address] : undefined, query: opts });
  const token = useReadContract({ chainId, address: addr(tk.token), abi: erc20Abi, functionName: 'balanceOf', args: address ? [address] : undefined, query: opts });
  const eth = useBalance({ chainId, address, query: opts });
  const refetch = useCallback(() => { usdg.refetch(); token.refetch(); eth.refetch(); }, [usdg, token, eth]);
  return { usdg: usdg.data as bigint | undefined, token: token.data as bigint | undefined, eth: eth.data?.value, refetch };
}

/** Factory limits: paused and the per-buy cap (0 = none). */
export function useLimits() {
  const { chainId, c } = useChainCtx();
  const paused = useReadContract({ chainId, address: c ? addr(c.factory) : undefined, abi: factoryAbi, functionName: 'paused', query: { enabled: !!c, refetchInterval: 60_000 } });
  const maxBuy = useReadContract({ chainId, address: c ? addr(c.factory) : undefined, abi: factoryAbi, functionName: 'maxBuyUsdg', query: { enabled: !!c, staleTime: 300_000 } });
  return { paused: paused.data === true, maxBuy: (maxBuy.data as bigint | undefined) ?? 0n };
}

export type TxPhase = 'idle' | 'switch' | 'approve' | 'confirm' | 'pending' | 'done' | 'error';

export interface TxState {
  phase: TxPhase;
  kind?: 'buy' | 'sell' | 'faucet';
  hash?: string;
  /** Token being approved (phase 'approve'). */
  sym?: string;
  error?: ErrMsg;
  /** What happened, for the success card. */
  result?: { side: Side | 'faucet'; tokens: bigint; usdg: bigint; points: number };
}

export interface TradeArgs {
  tk: LaunchToken;
  side: Side;
  amount: bigint;
  quote: Quote;
  slipBps: number;
  points: number;
}

/** Sends trades: switches network, approves the exact amount if needed, simulates, sends, waits. */
export function useTrader(ix: LaunchIndexer | null) {
  const { chainId, c, client } = useChainCtx();
  const { address, onSiteChain } = useWallet();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const qc = useQueryClient();
  const [tx, setTx] = useState<TxState>({ phase: 'idle' });
  const { maxBuy } = useLimits();

  // Clear a finished state after a while so the panel goes back to normal.
  useEffect(() => {
    if (tx.phase !== 'done') return;
    const id = window.setTimeout(() => setTx((s) => (s.phase === 'done' ? { phase: 'idle' } : s)), 12_000);
    return () => window.clearTimeout(id);
  }, [tx.phase]);

  const ensureChain = useCallback(async () => {
    if (onSiteChain) return;
    setTx({ phase: 'switch' });
    await switchChainAsync({ chainId });
  }, [onSiteChain, switchChainAsync, chainId]);

  const send = useCallback(async (req: { address: Address; abi: unknown; functionName: string; args: readonly unknown[]; gas?: bigint }) => {
    if (!client || !address) throw new Error('not connected');
    // Simulate first: a revert shows up here with its reason, before the wallet asks.
    await client.simulateContract({ ...req, account: address } as never);
    const hash = await writeContractAsync({ ...req, chainId } as never);
    setTx((s) => ({ ...s, phase: 'pending', hash }));
    const rc = await client.waitForTransactionReceipt({ hash });
    if (rc.status !== 'success') throw Object.assign(new Error('reverted'), { hash });
    return { hash, rc };
  }, [client, address, writeContractAsync, chainId]);

  const approveIfNeeded = useCallback(async (token: string, spender: string, amount: bigint, symbol: string) => {
    if (!client || !address) return;
    const allowance = await client.readContract({ address: addr(token), abi: erc20Abi, functionName: 'allowance', args: [address, addr(spender)] });
    if (allowance >= amount) return;
    setTx({ phase: 'approve', sym: symbol });
    await send({ address: addr(token), abi: erc20Abi, functionName: 'approve', args: [addr(spender), amount] });
  }, [client, address, send]);

  const trade = useCallback(async ({ tk, side, amount, quote, slipBps, points }: TradeArgs) => {
    if (!c || !address) return;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SEC);
    const minOut = withSlippage(quote.out, slipBps);
    try {
      await ensureChain();
      if (!tk.graduated) {
        if (side === 'buy') {
          await approveIfNeeded(c.usdg, tk.pool, quote.usdgUsed > 0n ? quote.usdgUsed : amount, 'USDG');
          setTx({ phase: 'confirm', kind: 'buy' });
          await send({ address: addr(tk.pool), abi: curveAbi, functionName: 'buy', args: [amount, minOut, deadline], gas: quote.graduates ? GRADUATION_GAS : undefined });
        } else {
          setTx({ phase: 'confirm', kind: 'sell' });
          await send({ address: addr(tk.pool), abi: curveAbi, functionName: 'sell', args: [amount, minOut, deadline] });
        }
      } else {
        if (!c.router) throw new Error('no router');
        const key = poolKeyFor(tk.token, c.usdg, c.hook);
        const t0 = tokenIs0(key, tk.token);
        await approveIfNeeded(side === 'buy' ? c.usdg : tk.token, c.router, amount, side === 'buy' ? 'USDG' : tk.symbol);
        setTx({ phase: 'confirm', kind: side });
        await send({ address: addr(c.router), abi: routerAbi, functionName: 'swapExactIn', args: [key, side === 'buy' ? !t0 : t0, amount, minOut, deadline] });
      }
      setTx((s) => ({
        phase: 'done', kind: side, hash: s.hash,
        result: { side, tokens: side === 'buy' ? quote.out : amount, usdg: side === 'buy' ? quote.usdgUsed : quote.out, points },
      }));
      ix?.sync();
      qc.invalidateQueries();
    } catch (e) {
      const hash = (e as { hash?: string }).hash;
      setTx((s) => ({ phase: 'error', kind: side, hash: hash ?? s.hash, error: hash ? { key: 'txFailed' } : explain(e, slipBps, Number(maxBuy) / 1e6) }));
    }
  }, [c, address, ensureChain, approveIfNeeded, send, ix, qc, maxBuy]);

  const faucet = useCallback(async () => {
    if (!c || !address) return;
    try {
      await ensureChain();
      setTx({ phase: 'confirm', kind: 'faucet' });
      await send({ address: addr(c.usdg), abi: faucetAbi, functionName: 'faucet', args: [FAUCET_AMOUNT] });
      setTx((s) => ({ phase: 'done', kind: 'faucet', hash: s.hash, result: { side: 'faucet', tokens: 0n, usdg: FAUCET_AMOUNT, points: 0 } }));
      qc.invalidateQueries();
    } catch (e) {
      setTx({ phase: 'error', kind: 'faucet', error: explain(e, 0) });
    }
  }, [c, address, ensureChain, send, qc]);

  const busy = tx.phase === 'switch' || tx.phase === 'approve' || tx.phase === 'confirm' || tx.phase === 'pending';
  return { tx, setTx, trade, faucet, busy, ensureChain };
}
