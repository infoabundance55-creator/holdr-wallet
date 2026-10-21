import type { HDNodeWallet } from 'ethers';
import { createContext, useContext } from 'react';
import type { Signer } from './lib/vault';

export type Tab = 'assets' | 'activity' | 'me';

export type Route =
  | { name: 'welcome' }
  | { name: 'backup'; wallet: HDNodeWallet }
  | { name: 'verify'; wallet: HDNodeWallet }
  | { name: 'password'; wallet: Signer; flow: 'create' | 'import' }
  | { name: 'import' }
  | { name: 'unlock' }
  | { name: 'home'; tab: Tab }
  | { name: 'send' }
  | { name: 'receive' }
  | { name: 'changePw' }
  | { name: 'reveal' }
  | { name: 'game' };

export interface Nav {
  push: (r: Route) => void;
  pop: () => void;
  reset: (r: Route) => void;
  replace: (r: Route) => void;
}

export const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const n = useContext(NavContext);
  if (!n) throw new Error('useNav outside provider');
  return n;
}
