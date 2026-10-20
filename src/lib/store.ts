import { DEFAULT_NETWORK, NETWORKS, type NetworkId } from '../config';
import { detectLang, type Lang } from '../i18n';
import { defaultKV, type KV } from './vault';

export interface Prefs {
  lang: Lang;
  network: NetworkId;
  autoLockMin: number;
  hideAmounts: boolean;
}

const PREFS_KEY = 'holdr.prefs.v1';
const TX_KEY = 'holdr.txs.v1';

export function loadPrefs(store: KV = defaultKV()): Prefs {
  const base: Prefs = { lang: detectLang(), network: DEFAULT_NETWORK, autoLockMin: 5, hideAmounts: false };
  try {
    const p = JSON.parse(store.getItem(PREFS_KEY) || '{}') as Partial<Prefs>;
    return {
      lang: p.lang === 'zh' || p.lang === 'en' ? p.lang : base.lang,
      network: p.network && p.network in NETWORKS ? p.network : base.network,
      autoLockMin: typeof p.autoLockMin === 'number' && p.autoLockMin > 0 ? p.autoLockMin : base.autoLockMin,
      hideAmounts: !!p.hideAmounts,
    };
  } catch {
    return base;
  }
}

export function savePrefs(p: Prefs, store: KV = defaultKV()): void {
  try { store.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* storage full or blocked */ }
}

export interface SentTx {
  hash: string;
  from: string;
  to: string;
  value: string; // wei as decimal string
  chainId: number;
  time: number;
  status: 'pending' | 'ok' | 'fail';
}

export function loadTxs(store: KV = defaultKV()): SentTx[] {
  try {
    const l = JSON.parse(store.getItem(TX_KEY) || '[]');
    return Array.isArray(l) ? l : [];
  } catch {
    return [];
  }
}

export function saveTxs(list: SentTx[], store: KV = defaultKV()): void {
  try { store.setItem(TX_KEY, JSON.stringify(list.slice(0, 100))); } catch { /* ignore */ }
}

export function clearLocalData(store: KV = defaultKV()): void {
  store.removeItem(TX_KEY);
}
