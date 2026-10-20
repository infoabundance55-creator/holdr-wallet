import { HDNodeWallet, Mnemonic, Wallet } from 'ethers';

/** A wallet we can sign with: either from a recovery phrase or a raw private key. */
export type Signer = Wallet | HDNodeWallet;

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

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
const PHRASE_LENGTHS = [12, 15, 18, 21, 24];

const memory = new Map<string, string>();
const memoryKV: KV = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
};

/** localStorage when available, otherwise an in-memory fallback (private windows, tests). */
export function defaultKV(): KV {
  try {
    const ls = globalThis.localStorage;
    const probe = '__holdr_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return memoryKV;
  }
}

export function newWallet(): HDNodeWallet {
  return Wallet.createRandom();
}

/** Accepts a 12–24 word phrase or a 64-hex private key (with or without 0x). Returns null if unreadable. */
export function parseImport(input: string): Signer | null {
  const raw = input.trim().replace(/\s+/g, ' ');
  if (!raw) return null;
  const hex = raw.replace(/^0x/i, '');
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    try {
      return new Wallet('0x' + hex);
    } catch {
      return null;
    }
  }
  const phrase = raw.toLowerCase();
  if (!PHRASE_LENGTHS.includes(phrase.split(' ').length)) return null;
  if (!Mnemonic.isValidMnemonic(phrase)) return null;
  return Wallet.fromPhrase(phrase);
}

export function phraseOf(w: Signer): string | null {
  return 'mnemonic' in w && w.mnemonic ? w.mnemonic.phrase : null;
}

export async function saveVault(
  w: Signer,
  password: string,
  opts: { backedUp: boolean },
  onProgress?: (p: number) => void,
  store: KV = defaultKV(),
): Promise<VaultRecord> {
  const keystore = await w.encrypt(password, onProgress);
  const rec: VaultRecord = {
    v: 1,
    address: w.address,
    keystore,
    kind: phraseOf(w) ? 'mnemonic' : 'privateKey',
    backedUp: opts.backedUp,
    createdAt: Date.now(),
  };
  store.setItem(VAULT_KEY, JSON.stringify(rec));
  return rec;
}

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
export async function unlockVault(
  password: string,
  onProgress?: (p: number) => void,
  store: KV = defaultKV(),
): Promise<Signer> {
  const rec = loadVault(store);
  if (!rec) throw new Error('NO_VAULT');
  return Wallet.fromEncryptedJson(rec.keystore, password, onProgress);
}

export async function changePassword(
  current: string,
  next: string,
  onProgress?: (p: number) => void,
  store: KV = defaultKV(),
): Promise<VaultRecord> {
  const rec = loadVault(store);
  if (!rec) throw new Error('NO_VAULT');
  const w = await Wallet.fromEncryptedJson(rec.keystore, current);
  const updated = await saveVault(w, next, { backedUp: rec.backedUp }, onProgress, store);
  return { ...updated, createdAt: rec.createdAt };
}

export function markBackedUp(store: KV = defaultKV()): void {
  const rec = loadVault(store);
  if (rec && !rec.backedUp) store.setItem(VAULT_KEY, JSON.stringify({ ...rec, backedUp: true }));
}

export function clearVault(store: KV = defaultKV()): void {
  store.removeItem(VAULT_KEY);
}

/** Password rules shared by create and change-password screens. */
export function passwordChecks(pw: string) {
  const len = pw.length >= 8;
  const mix = /[A-Za-z]/.test(pw) && /\d/.test(pw);
  const score = pw ? (len ? 1 : 0) + (mix ? 1 : 0) + (pw.length >= 12 ? 1 : 0) : 0;
  return { len, mix, score, ok: len && mix };
}
