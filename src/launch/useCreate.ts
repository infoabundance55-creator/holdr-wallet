import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { parseEventLogs, type Address, type Hex } from 'viem';
import { useReadContract, useSwitchChain, useWriteContract } from 'wagmi';
import { useWallet } from '../wallet/ConnectWallet';
import { erc20Abi, launchAbi } from './abi';
import type { LaunchIndexer } from './chain';
import { explainCreate, type CurveCfg } from './create';
import type { ErrMsg } from './trade';
import { useChainCtx } from './useTrade';

/** Launch settings from the factory: fee in ETH, curve settings, paused. */
export function useLaunchConfig() {
  const { chainId, c } = useChainCtx();
  const q = { enabled: !!c, staleTime: 300_000 };
  const cfg = useReadContract({ chainId, address: c?.factory as Address | undefined, abi: launchAbi, functionName: 'config', query: q });
  const paused = useReadContract({ chainId, address: c?.factory as Address | undefined, abi: launchAbi, functionName: 'paused', query: { enabled: !!c, refetchInterval: 60_000 } });
  const d = cfg.data;
  const curve: CurveCfg | undefined = d && {
    gradThreshold: d.params.gradThreshold, firstBuyMaxTokens: d.params.firstBuyMaxTokens,
    feeBps: d.params.feeBps, creatorShareBps: d.params.creatorShareBps,
  };
  return { fee: d?.launchFee, curve, paused: paused.data === true, loading: cfg.isLoading, error: cfg.isError };
}

export type CreatePhase = 'idle' | 'switch' | 'approve' | 'confirm' | 'pending' | 'done' | 'error';

export interface Launched {
  token: string;
  pool: string;
  hash: string;
  name: string;
  symbol: string;
  metadataURI: string;
  firstTokens: bigint;
}

export interface CreateState {
  phase: CreatePhase;
  hash?: string;
  error?: ErrMsg;
  result?: Launched;
}

export interface CreateArgs {
  name: string;
  symbol: string;
  metadataURI: string;
  fee: bigint;
  /** USDG for the creator's first buy (0 = none). */
  firstBuy: bigint;
  minTokensOut: bigint;
  expectTokens: bigint;
}

/** Launches a token: switch network → approve the exact first-buy USDG → simulate → send → wait. */
export function useCreator(ix: LaunchIndexer | null) {
  const { chainId, c, client } = useChainCtx();
  const { address, onSiteChain } = useWallet();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const qc = useQueryClient();
  const [st, setSt] = useState<CreateState>({ phase: 'idle' });

  const send = useCallback(async (req: { address: Address; abi: unknown; functionName: string; args: readonly unknown[]; value?: bigint }) => {
    if (!client || !address) throw new Error('not connected');
    // Simulate first: a revert shows up here with its reason, before the wallet asks.
    await client.simulateContract({ ...req, account: address } as never);
    const hash: Hex = await writeContractAsync({ ...req, chainId } as never);
    setSt((s) => ({ ...s, phase: 'pending', hash }));
    const rc = await client.waitForTransactionReceipt({ hash });
    if (rc.status !== 'success') throw Object.assign(new Error('reverted'), { hash });
    return { hash, rc };
  }, [client, address, writeContractAsync, chainId]);

  const create = useCallback(async (a: CreateArgs) => {
    if (!c || !client || !address) return;
    try {
      if (!onSiteChain) {
        setSt({ phase: 'switch' });
        await switchChainAsync({ chainId });
      }
      if (a.firstBuy > 0n) {
        const allowance = await client.readContract({ address: c.usdg as Address, abi: erc20Abi, functionName: 'allowance', args: [address, c.factory as Address] });
        if (allowance < a.firstBuy) {
          setSt({ phase: 'approve' });
          await send({ address: c.usdg as Address, abi: erc20Abi, functionName: 'approve', args: [c.factory as Address, a.firstBuy] });
        }
      }
      setSt({ phase: 'confirm' });
      const { hash, rc } = await send({
        address: c.factory as Address, abi: launchAbi, functionName: 'createToken',
        args: [a.name, a.symbol, a.metadataURI, a.firstBuy, a.minTokensOut], value: a.fee,
      });
      const ev = parseEventLogs({ abi: launchAbi, logs: rc.logs, eventName: 'TokenCreated' })
        .find((l) => l.address.toLowerCase() === c.factory.toLowerCase());
      if (!ev) throw Object.assign(new Error('no TokenCreated'), { hash });
      // Load the new token before showing success, so "Go to token page" opens straight away.
      await ix?.sync().catch(() => {});
      qc.invalidateQueries();
      setSt({
        phase: 'done', hash,
        result: { token: ev.args.token, pool: ev.args.pool, hash, name: a.name, symbol: a.symbol, metadataURI: a.metadataURI, firstTokens: a.expectTokens },
      });
    } catch (e) {
      const hash = (e as { hash?: string }).hash;
      setSt((s) => ({ phase: 'error', hash: hash ?? s.hash, error: hash ? { key: 'txFailed' } : explainCreate(e) }));
    }
  }, [c, client, address, onSiteChain, switchChainAsync, chainId, send, ix, qc]);

  const busy = st.phase === 'switch' || st.phase === 'approve' || st.phase === 'confirm' || st.phase === 'pending';
  const reset = useCallback(() => setSt({ phase: 'idle' }), []);
  return { st, create, busy, reset };
}
