import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { useApp } from '../state';
import type { CharId } from '../launch/points';
import { api, ApiError, type Me } from './client';
import { AccountContext, type AccountCtx, type AccountStatus } from './context';

/** Holds the sign-in session (checked once on load) and the actions that change the profile. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const { t, toast, network } = useApp();
  const { address, status: walletStatus } = useAccount();
  const { signMessageAsync } = useSignMessage();
  // undefined = still checking; null = no session.
  const [server, setServer] = useState<Me | null | undefined>(undefined);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api.me()
      .then((m) => { if (live) setServer(m); })
      .catch((e) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 401) setServer(null);
        else { setUnavailable(true); setServer(null); }
      });
    return () => { live = false; };
  }, []);

  const walletBusy = walletStatus === 'reconnecting' || walletStatus === 'connecting';
  const same = !!server && !!address && server.address === address.toLowerCase();
  const status: AccountStatus = unavailable ? 'unavailable' : server === undefined || walletBusy ? 'checking' : same ? 'in' : 'out';

  const fail = useCallback((e: unknown) => {
    const code = e instanceof ApiError ? e.code : '';
    if (code === 'no_session') { setServer(null); toast(t('acSessionEnded')); return; }
    if (code === 'unavailable' || code === 'network' || code === 'not_configured') { toast(t('acUnavailable')); return; }
    toast(t('acError'));
  }, [t, toast]);

  const signIn = useCallback(async () => {
    if (!address) return false;
    setBusy(true);
    try {
      const { nonce, message } = await api.nonce(address, network.chainId);
      let signature: string;
      try {
        signature = await signMessageAsync({ message, account: address });
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        toast(/reject|denied|cancel/i.test(msg) ? t('acSignRejected') : t('acSignFailed'));
        return false;
      }
      setServer(await api.login(nonce, signature));
      setUnavailable(false);
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      setBusy(false);
    }
  }, [address, network.chainId, signMessageAsync, toast, t, fail]);

  const signOut = useCallback(async () => {
    try { await api.logout(); } catch { /* the cookie is cleared server-side when reachable */ }
    setServer(null);
  }, []);

  const setUsername = useCallback(async (u: string) => {
    setBusy(true);
    try {
      setServer(await api.username(u));
      return 'ok' as const;
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      if (code === 'username_taken') return 'taken' as const;
      if (code === 'username_format') return 'format' as const;
      if (code === 'username_reserved') return 'reserved' as const;
      fail(e);
      return 'error' as const;
    } finally {
      setBusy(false);
    }
  }, [fail]);

  const setLook = useCallback(async (c: CharId | null) => {
    try {
      setServer(await api.look(c));
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  }, [fail]);

  const ackLevel = useCallback(async (keep: boolean) => {
    // Close right away; the server call only records it.
    setServer((m) => (m ? { ...m, levelSeen: m.level } : m));
    try { setServer(await api.levelSeen(keep)); } catch (e) { fail(e); }
  }, [fail]);

  const value: AccountCtx = useMemo(() => ({
    status,
    me: status === 'in' ? server ?? null : null,
    otherWallet: !!server && !!address && !same,
    busy, signIn, signOut, setUsername, setLook, ackLevel,
  }), [status, server, address, same, busy, signIn, signOut, setUsername, setLook, ackLevel]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
