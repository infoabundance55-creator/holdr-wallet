import { createContext, useContext } from 'react';

export type Tab = 'discover' | 'create' | 'points' | 'me';

export type Route =
  | { name: 'home'; tab: Tab }
  | { name: 'token'; token: string }
  | { name: 'legacy' };

export interface Nav {
  push: (r: Route) => void;
  pop: () => void;
  reset: (r: Route) => void;
  replace: (r: Route) => void;
  /** Go to a main tab (desktop header and mobile bottom bar). */
  tab: (t: Tab) => void;
  current: Route;
}

export const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const n = useContext(NavContext);
  if (!n) throw new Error('useNav outside provider');
  return n;
}
