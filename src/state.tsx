import { JsonRpcProvider } from 'ethers';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NETWORKS, type Network } from './config';
import { LangContext, translate, type Key, type Lang } from './i18n';
import { loadPrefs, savePrefs, type Prefs } from './lib/store';
import { Icon } from './components/ui';

interface AppState {
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  network: Network;
  /** Read-only RPC for chain data. Signing goes through the connected wallet (wagmi). */
  provider: JsonRpcProvider;
  toast: (msg: string) => void;
  t: (key: Key, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefsState] = useState<Prefs>(() => loadPrefs());
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const setPrefs = useCallback((p: Partial<Prefs>) => {
    setPrefsState((cur) => {
      const next = { ...cur, ...p };
      savePrefs(next);
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.lang = prefs.lang === 'zh' ? 'zh-CN' : 'en';
  }, [prefs.lang]);

  const network = NETWORKS[prefs.network];
  // staticNetwork: skip the chain-id probe; the provider holds no timers, so no cleanup is needed.
  const provider = useMemo(
    () => new JsonRpcProvider(network.rpc, network.chainId, { staticNetwork: true, batchMaxCount: 1 }),
    [network],
  );

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const lang = prefs.lang;
  const t = useCallback((key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);
  const langCtx = useMemo(() => ({ lang, setLang: (l: Lang) => setPrefs({ lang: l }) }), [lang, setPrefs]);

  const value: AppState = { prefs, setPrefs, network, provider, toast, t };

  return (
    <LangContext.Provider value={langCtx}>
      <Ctx.Provider value={value}>
        {children}
        {toastMsg && (
          <div className="toast" role="status"><Icon name="check" color="#FFC94D" width={2.5} />{toastMsg}</div>
        )}
      </Ctx.Provider>
    </LangContext.Provider>
  );
}
