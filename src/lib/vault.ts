import { Wallet, type HDNodeWallet } from 'ethers';
import { defaultKV, type KV } from './kv';

/**
 * Holdr no longer makes its own wallets. People who created one in v0.1 still have an
 * encrypted keystore in this browser; this module only lets them unlock it once to move
 * the phrase (or key) into MetaMask, Rabby or another wallet, and then remove it.
 */
export type Signer = Wallet | HDNodeWallet;

export interface VaultRecord {
  v: 1;
  address: string;
  /** ethers v6 encrypted JSON keystore (scrypt + AES-128-CTR). Never the plain key. */
  keystore: string;
  kind: 'mnemonic' | 'privateKey';
  backedUp: boolean;
  createdAt: number;
}

export const VAULT_KEY = 'holdr.vault.v1';

export function loadVault(store: KV = defaultKV()): VaultRecord | null {
  const raw = store.getItem(VAULT_KEY);
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw) as VaultRecord;
    if (rec && rec.v === 1 && typeof rec.keystore === 'string' && typeof rec.address === 'string') return rec;
  } catch {
    /* corrupt record */
  }
  return null;
}

/** Throws if the password is wrong. */
export async function unlockVault(password: string, onProgress?: (p: number) => void, store: KV = defaultKV()): Promise<Signer> {
  const rec = loadVault(store);
  if (!rec) throw new Error('NO_VAULT');
  return Wallet.fromEncryptedJson(rec.keystore, password, onProgress);
}

export function phraseOf(w: Signer): string | null {
  return 'mnemonic' in w && w.mnemonic ? w.mnemonic.phrase : null;
}

export function clearVault(store: KV = defaultKV()): void {
  store.removeItem(VAULT_KEY);
  store.removeItem('holdr.txs.v1');
}
