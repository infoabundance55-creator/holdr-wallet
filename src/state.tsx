import { JsonRpcProvider } from 'ethers';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NETWORKS, type Network } from './config';
import { LangContext, translate, type Key, type Lang } from './i18n';
import { loadPrefs, savePrefs, type Prefs } from './lib/store';
import { loadVault, type Signer, type VaultRecord } from './lib/vault';
import { Icon } from './components/ui';

interface AppState {
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  vault: VaultRecord | null;
  refreshVault: () => void;
  signer: Signer | null;
  setSigner: (s: Signer | null) => void;
  lock: () => void;
  network: Network;
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
  const [vault, setVault] = useState<VaultRecord | null>(() => loadVault());
  const [signer, setSigner] = useState<Signer | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number>();

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

  const lock = useCallback(() => setSigner(null), []);
  const refreshVault = useCallback(() => setVault(loadVault()), []);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2200);
  }, []);

  // Auto-lock after inactivity, including while the tab was in the background.
  const lastActive = useRef(Date.now());
  useEffect(() => {
    if (!signer) return;
    const limit = prefs.autoLockMin * 60_000;
    const bump = () => { lastActive.current = Date.now(); };
    const check = () => { if (Date.now() - lastActive.current > limit) setSigner(null); };
    bump();
    const events = ['pointerdown', 'keydown', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    document.addEventListener('visibilitychange', check);
    const iv = window.setInterval(check, 15_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener('visibilitychange', check);
      window.clearInterval(iv);
    };
  }, [signer, prefs.autoLockMin]);

  const lang = prefs.lang;
  const t = useCallback((key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);
  const langCtx = useMemo(() => ({ lang, setLang: (l: Lang) => setPrefs({ lang: l }) }), [lang, setPrefs]);

  const value: AppState = { prefs, setPrefs, vault, refreshVault, signer, setSigner, lock, network, provider, toast, t };

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
