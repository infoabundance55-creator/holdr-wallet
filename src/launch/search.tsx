import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/** Token search shared by the desktop header box and the Discover page. */
interface SearchState {
  q: string;
  setQ: (q: string) => void;
  /** Phone: the search field under the top bar is open. */
  open: boolean;
  setOpen: (o: boolean) => void;
}

const Ctx = createContext<SearchState>({ q: '', setQ: () => {}, open: false, setOpen: () => {} });

export function SearchProvider({ children }: { children: ReactNode }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ q, setQ, open, setOpen }), [q, open]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSearch(): SearchState {
  return useContext(Ctx);
}
