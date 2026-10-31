import { createContext, useContext } from 'react';
import type { CharId } from '../launch/points';
import type { Me } from './client';

/**
 * Sign-in state.
 * - checking: asking the server / wallet still reconnecting
 * - out: not signed in (or signed in with another wallet than the connected one)
 * - in: signed in with the connected wallet
 * - unavailable: the account service can't be reached (e.g. local dev without /api)
 */
export type AccountStatus = 'checking' | 'out' | 'in' | 'unavailable';

export interface AccountCtx {
  status: AccountStatus;
  /** Set only when status is 'in'. */
  me: Me | null;
  /** A session exists, but for a different wallet than the one connected now. */
  otherWallet: boolean;
  busy: boolean;
  /** Asks the wallet to sign the sign-in message. Resolves false if it didn't work (a toast explains). */
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
  setUsername: (u: string) => Promise<'ok' | 'taken' | 'format' | 'reserved' | 'error'>;
  setLook: (c: CharId | null) => Promise<boolean>;
  /** Closes the level-up popup. keep = keep the look from before the level-up. */
  ackLevel: (keep: boolean) => Promise<void>;
}

export const AccountContext = createContext<AccountCtx | null>(null);

export function useAccountCtx(): AccountCtx {
  const v = useContext(AccountContext);
  if (!v) throw new Error('useAccountCtx outside provider');
  return v;
}
