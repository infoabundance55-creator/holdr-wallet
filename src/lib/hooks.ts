import { useCallback, useEffect, useRef, useState } from 'react';
import type { JsonRpcProvider } from 'ethers';

export interface BalanceState {
  balance: bigint | null;
  loading: boolean;
  error: boolean;
  refresh: () => void;
}

/** Native balance with periodic refresh. Keeps the last good value while refreshing. */
export function useBalance(provider: JsonRpcProvider, address: string | undefined, intervalMs = 20_000): BalanceState {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const seq = useRef(0);

  const refresh = useCallback(() => {
    if (!address) return;
    const id = ++seq.current;
    setLoading(true);
    provider.getBalance(address)
      .then((b) => { if (id === seq.current) { setBalance(b); setError(false); } })
      .catch(() => { if (id === seq.current) setError(true); })
      .finally(() => { if (id === seq.current) setLoading(false); });
  }, [provider, address]);

  useEffect(() => {
    setBalance(null);
    refresh();
    const iv = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, intervalMs);
    return () => window.clearInterval(iv);
  }, [refresh, intervalMs]);

  return { balance, loading, error, refresh };
}
