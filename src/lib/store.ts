import { DEFAULT_NETWORK, NETWORKS, type NetworkId } from '../config';
import { detectLang, type Lang } from '../i18n';
import { defaultKV, type KV } from './kv';

export interface Prefs {
  lang: Lang;
  network: NetworkId;
}

const PREFS_KEY = 'holdr.prefs.v1';

export function loadPrefs(store: KV = defaultKV()): Prefs {
  const base: Prefs = { lang: detectLang(), network: DEFAULT_NETWORK };
  try {
    const p = JSON.parse(store.getItem(PREFS_KEY) || '{}') as Partial<Prefs>;
    return {
      lang: p.lang === 'zh' || p.lang === 'en' ? p.lang : base.lang,
      network: p.network && p.network in NETWORKS ? p.network : base.network,
    };
  } catch {
    return base;
  }
}

export function savePrefs(p: Prefs, store: KV = defaultKV()): void {
  try { store.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* storage full or blocked */ }
}
