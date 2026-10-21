import { describe, expect, it } from 'vitest';
import {
  changePassword, clearVault, loadVault, markBackedUp, newWallet, parseImport,
  passwordChecks, phraseOf, saveVault, unlockVault, VAULT_KEY, type KV,
} from './vault';
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

describe('vault', () => {
  it('creates a 12-word wallet', () => {
    const w = newWallet();
    expect(phraseOf(w)?.split(' ')).toHaveLength(12);
  });

  it('imports phrase and private key, rejects junk', () => {
    expect(parseImport(TEST_PHRASE)?.address).toBe(TEST_ADDR);
    expect(parseImport('  ' + TEST_PHRASE.toUpperCase().replace(/ /g, '   ') + ' ')?.address).toBe(TEST_ADDR);
    const pk = '0x' + '11'.repeat(32);
    expect(parseImport(pk)?.address).toBeTruthy();
    expect(parseImport(pk.slice(2))?.address).toBe(parseImport(pk)?.address);
    expect(parseImport('hello world')).toBeNull();
    expect(parseImport(TEST_PHRASE.replace('about', 'abandon'))).toBeNull(); // bad checksum
    expect(parseImport('')).toBeNull();
  });

  it('never stores the plain key, and unlocks only with the right password', async () => {
    const kv = memKV();
    const w = parseImport(TEST_PHRASE)!;
    const rec = await saveVault(w, 'correct horse 1', { backedUp: false }, undefined, kv);
    const raw = kv.data.get(VAULT_KEY)!;
    expect(raw).not.toContain(w.privateKey.slice(2));
    expect(raw).not.toContain('abandon');
    expect(rec.kind).toBe('mnemonic');
    expect(loadVault(kv)?.address).toBe(TEST_ADDR);

    const back = await unlockVault('correct horse 1', undefined, kv);
    expect(back.address).toBe(TEST_ADDR);
    expect(phraseOf(back)).toBe(TEST_PHRASE);
    await expect(unlockVault('wrong pass 1', undefined, kv)).rejects.toThrow();
  }, 30000);

  it('changes password and keeps backup flag', async () => {
    const kv = memKV();
    await saveVault(parseImport(TEST_PHRASE)!, 'oldpass11', { backedUp: false }, undefined, kv);
    markBackedUp(kv);
    await changePassword('oldpass11', 'newpass22', undefined, kv);
    await expect(unlockVault('oldpass11', undefined, kv)).rejects.toThrow();
    expect((await unlockVault('newpass22', undefined, kv)).address).toBe(TEST_ADDR);
    expect(loadVault(kv)?.backedUp).toBe(true);
    clearVault(kv);
    expect(loadVault(kv)).toBeNull();
  }, 30000);

  it('checks password rules', () => {
    expect(passwordChecks('abc').ok).toBe(false);
    expect(passwordChecks('abcdefgh').ok).toBe(false);
    expect(passwordChecks('abcdefg1').ok).toBe(true);
    expect(passwordChecks('abcdefg1abcd').score).toBe(3);
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
