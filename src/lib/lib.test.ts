import { describe, expect, it } from 'vitest';
import { Wallet } from 'ethers';
import { clearVault, loadVault, phraseOf, unlockVault, VAULT_KEY } from './vault';
import type { KV } from './kv';
import { checkAddress, formatAmount, parseAmount, shortAddr } from './format';
import { scrubUrl } from './analytics';

describe('analytics privacy', () => {
  it('keeps only fixed virtual paths and never addresses', () => {
    expect(scrubUrl('https://holdr.app/app/send')).toBe('https://holdr.app/app/send');
    expect(scrubUrl('https://holdr.app/goal/first-send?x=1#y')).toBe('https://holdr.app/goal/first-send');
    expect(scrubUrl('https://holdr.app/')).toBeNull();
    expect(scrubUrl('https://holdr.app/app/0x9858EfFD232B4033E47d90003D41EC34EcaEda94')).toBeNull();
    expect(scrubUrl('not a url')).toBeNull();
  });
});

function memKV(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

// Standard BIP-39 test vector ("abandon … about") → well-known address.
const TEST_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TEST_ADDR = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

describe('legacy wallet export', () => {
  it('unlocks a v0.1 keystore only with the right password, then removes it', async () => {
    const kv = memKV();
    const w = Wallet.fromPhrase(TEST_PHRASE);
    const keystore = await w.encrypt('correct horse 1');
    kv.setItem(VAULT_KEY, JSON.stringify({ v: 1, address: w.address, keystore, kind: 'mnemonic', backedUp: false, createdAt: 1 }));
    kv.setItem('holdr.txs.v1', '[]');
    expect(loadVault(kv)?.address).toBe(TEST_ADDR);

    const back = await unlockVault('correct horse 1', undefined, kv);
    expect(phraseOf(back)).toBe(TEST_PHRASE);
    await expect(unlockVault('wrong pass 1', undefined, kv)).rejects.toThrow();

    clearVault(kv);
    expect(loadVault(kv)).toBeNull();
    expect(kv.getItem('holdr.txs.v1')).toBeNull();
  }, 30000);

  it('ignores corrupt records', () => {
    const kv = memKV();
    kv.setItem(VAULT_KEY, '{oops');
    expect(loadVault(kv)).toBeNull();
  });
});

describe('format', () => {
  it('validates addresses', () => {
    expect(checkAddress('').ok).toBe(false);
    expect(checkAddress('0x123').ok).toBe(false);
    expect(checkAddress(TEST_ADDR.toLowerCase())).toEqual({ ok: true, address: TEST_ADDR });
    expect(checkAddress(TEST_ADDR).ok).toBe(true);
    const badChecksum = TEST_ADDR.replace('Ef', 'eF');
    expect(checkAddress(badChecksum).ok).toBe(false);
  });

  it('parses and formats amounts', () => {
    expect(parseAmount('0.5')).toBe(500000000000000000n);
    expect(parseAmount('1,000')).toBe(1000n * 10n ** 18n);
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('.')).toBeNull();
    expect(parseAmount('1.' + '1'.repeat(19))).toBeNull();
    expect(formatAmount(1234567890000000000000n, 18, 4)).toBe('1,234.5678');
    expect(formatAmount(0n)).toBe('0');
    expect(shortAddr(TEST_ADDR)).toBe('0x9858…da94');
  });
});
