import { useEffect, useSyncExternalStore } from 'react';
import { useApp } from '../state';
import { getIndexer, type LaunchIndexer } from './chain';
import { LAUNCH } from './contracts';

const POLL_MS = 15_000;

/** The launchpad indexer for the current network (null on networks without contracts). Polls while visible. */
export function useLaunch(): LaunchIndexer | null {
  const { network, provider } = useApp();
  const c = LAUNCH[network.id];
  const ix = c ? getIndexer(provider, c, network.chainId, network.rpc) : null;

  useSyncExternalStore(ix ? ix.subscribe : noopSub, () => ix?.version ?? 0);

  useEffect(() => {
    if (!ix) return;
    ix.sync();
    const iv = window.setInterval(() => { if (document.visibilityState === 'visible') ix.sync(); }, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') ix.sync(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { window.clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [ix]);

  return ix;
}

const noopSub = () => () => {};
