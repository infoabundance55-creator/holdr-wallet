import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useSwitchChain, useWriteContract } from 'wagmi';
import type { Address } from 'viem';
import { useWallet } from '../wallet/ConnectWallet';
import { curveFeesAbi, lockerAbi } from './abi';
import type { LaunchIndexer } from './chain';
import type { LaunchToken } from './math';
import { explain, type ErrMsg } from './trade';
import { useChainCtx } from './useTrade';

const addr = (a: string) => a as Address;

/** Fees a creator can claim for one token. Raw units: USDG 6 decimals, the token 18. */
export interface TokenFees {
  /** Curve fees (USDG), including those earned before graduation. */
  curve: bigint;
  /** Uniswap pool fees not yet collected into the locker: the creator's share. */
  poolUsdg: bigint;
  poolTokens: bigint;
  /** Already collected into the locker for this token (paid in the token itself). */
  owedTokens: bigint;
}

export interface CreatorFees {
  byToken: Map<string, TokenFees>;
  /** USDG already collected into the locker. The locker keeps one USDG balance per wallet, across all its tokens. */
  lockerUsdg: bigint;
}

export const feesUsdg = (f?: TokenFees) => (f ? f.curve + f.poolUsdg : 0n);
export const feesTokens = (f?: TokenFees) => (f ? f.poolTokens + f.owedTokens : 0n);
export const hasFees = (f?: TokenFees) => feesUsdg(f) > 0n || feesTokens(f) > 0n;

/** Claimable creator fees for the wallet's launches (reads plus a simulated collectFees for graduated tokens). */
export function useCreatorFees(mine: LaunchToken[]) {
  const { client, c, chainId } = useChainCtx();
  const { address } = useWallet();
  const key = mine.map((t) => `${t.token}:${t.graduated ? 1 : 0}`).join(',');
  return useQuery({
    queryKey: ['creatorFees', chainId, address, key],
    enabled: !!client && !!c && !!address && mine.length > 0,
    refetchInterval: 30_000,
    staleTime: 10_000,
    queryFn: async (): Promise<CreatorFees> => {
      const me = address!;
      const byToken = new Map<string, TokenFees>();
      await Promise.all(mine.map(async (tk) => {
        const f: TokenFees = { curve: 0n, poolUsdg: 0n, poolTokens: 0n, owedTokens: 0n };
        f.curve = await client!.readContract({ address: addr(tk.pool), abi: curveFeesAbi, functionName: 'creatorFeesOf', args: [me] });
        if (tk.graduated) {
          const share = BigInt(tk.params?.creatorShareBps ?? 7000);
          const [sim, owedTok] = await Promise.all([
            client!.simulateContract({ address: addr(c!.locker), abi: lockerAbi, functionName: 'collectFees', args: [addr(tk.token)], account: me })
              .then((r) => r.result).catch(() => [0n, 0n] as const),
            client!.readContract({ address: addr(c!.locker), abi: lockerAbi, functionName: 'owed', args: [me, addr(tk.token)] }),
          ]);
          f.poolTokens = (sim[0] * share) / 10_000n;
          f.poolUsdg = (sim[1] * share) / 10_000n;
          f.owedTokens = owedTok;
        }
        byToken.set(tk.token.toLowerCase(), f);
      }));
      const lockerUsdg = mine.some((t) => t.graduated)
        ? await client!.readContract({ address: addr(c!.locker), abi: lockerAbi, functionName: 'owed', args: [me, addr(c!.usdg)] })
        : 0n;
      return { byToken, lockerUsdg };
    },
  });
}

export interface ClaimState {
  phase: 'idle' | 'switch' | 'confirm' | 'pending' | 'done' | 'error';
  /** Token being claimed (lower-case), or 'locker' for the locker's USDG balance. */
  target?: string;
  step?: number;
  steps?: number;
  hash?: string;
  error?: ErrMsg;
}

/**
 * Claims a creator's fees, one wallet confirmation per step:
 * curve fees → (graduated) collect pool fees → claim USDG → claim the token.
 */
export function useClaimFees(ix: LaunchIndexer | null) {
  const { chainId, c, client } = useChainCtx();
  const { address, onSiteChain } = useWallet();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const qc = useQueryClient();
  const [st, setSt] = useState<ClaimState>({ phase: 'idle' });

  const run = useCallback(async (target: string, plan: { address: Address; abi: unknown; functionName: string; args: readonly unknown[]; skip?: () => Promise<boolean> }[]) => {
    if (!client || !address || !c) return;
    try {
      if (!onSiteChain) { setSt({ phase: 'switch', target }); await switchChainAsync({ chainId }); }
      let n = 0;
      for (const req of plan) {
        n++;
        if (req.skip && await req.skip()) continue;
        setSt({ phase: 'confirm', target, step: n, steps: plan.length });
        await client.simulateContract({ ...req, account: address } as never);
        const hash = await writeContractAsync({ ...req, chainId } as never);
        setSt({ phase: 'pending', target, step: n, steps: plan.length, hash });
        const rc = await client.waitForTransactionReceipt({ hash });
        if (rc.status !== 'success') throw Object.assign(new Error('reverted'), { hash });
      }
      setSt((s) => ({ phase: 'done', target, hash: s.hash }));
      ix?.sync();
      qc.invalidateQueries();
    } catch (e) {
      const hash = (e as { hash?: string }).hash;
      setSt({ phase: 'error', target, hash, error: hash ? { key: 'txFailed' } : explain(e, 0) });
      qc.invalidateQueries({ queryKey: ['creatorFees'] });
    }
  }, [client, address, c, onSiteChain, switchChainAsync, chainId, writeContractAsync, ix, qc]);

  const claim = useCallback((tk: LaunchToken, f: TokenFees) => {
    if (!c || !address) return;
    const locker = addr(c.locker);
    const owed = (cur: string) => () => client!.readContract({ address: locker, abi: lockerAbi, functionName: 'owed', args: [address, addr(cur)] }).then((v) => v === 0n);
    const plan: Parameters<typeof run>[1] = [];
    if (f.curve > 0n) plan.push({ address: addr(tk.pool), abi: curveFeesAbi, functionName: 'claimCreatorFees', args: [address] });
    if (tk.graduated) {
      if (f.poolUsdg > 0n || f.poolTokens > 0n) plan.push({ address: locker, abi: lockerAbi, functionName: 'collectFees', args: [addr(tk.token)] });
      if (f.poolUsdg > 0n) plan.push({ address: locker, abi: lockerAbi, functionName: 'claim', args: [addr(c.usdg), address], skip: owed(c.usdg) });
      if (f.poolTokens > 0n || f.owedTokens > 0n) plan.push({ address: locker, abi: lockerAbi, functionName: 'claim', args: [addr(tk.token), address], skip: owed(tk.token) });
    }
    if (plan.length) run(tk.token.toLowerCase(), plan);
  }, [c, address, client, run]);

  /** The locker's collected USDG for this wallet (all graduated tokens together). */
  const claimLocker = useCallback(() => {
    if (!c || !address) return;
    run('locker', [{ address: addr(c.locker), abi: lockerAbi, functionName: 'claim', args: [addr(c.usdg), address] }]);
  }, [c, address, run]);

  const busy = st.phase === 'switch' || st.phase === 'confirm' || st.phase === 'pending';
  return { st, setSt, claim, claimLocker, busy };
}
