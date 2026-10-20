import { formatUnits, getAddress, isAddress, parseUnits } from 'ethers';

export function shortAddr(a: string, head = 6, tail = 4): string {
  return a.length > head + tail + 1 ? `${a.slice(0, head)}…${a.slice(-tail)}` : a;
}

/** Format a wei amount with at most `max` decimals, trimming trailing zeros, with thousands separators. */
export function formatAmount(wei: bigint, decimals = 18, max = 6): string {
  const s = formatUnits(wei, decimals);
  const [i, d = ''] = s.split('.');
  const frac = d.slice(0, max).replace(/0+$/, '');
  const int = BigInt(i).toLocaleString('en-US');
  return frac ? `${int}.${frac}` : int;
}

export type AddrCheck = { ok: true; address: string } | { ok: false; empty: boolean };

export function checkAddress(input: string): AddrCheck {
  const v = input.trim();
  if (!v) return { ok: false, empty: true };
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) return { ok: false, empty: false };
  // Mixed-case input must carry a valid EIP-55 checksum; all-lower/upper is accepted.
  const mixed = v.slice(2) !== v.slice(2).toLowerCase() && v.slice(2) !== v.slice(2).toUpperCase();
  if (mixed && !isAddress(v)) return { ok: false, empty: false };
  return { ok: true, address: getAddress(v.toLowerCase()) };
}

/** Parse a user-typed decimal amount into base units. Returns null when not a positive number. */
export function parseAmount(input: string, decimals = 18): bigint | null {
  const v = input.trim().replace(/,/g, '');
  if (!/^\d*\.?\d*$/.test(v) || v === '' || v === '.') return null;
  const [, frac = ''] = v.split('.');
  if (frac.length > decimals) return null;
  try {
    const n = parseUnits(v, decimals);
    return n > 0n ? n : null;
  } catch {
    return null;
  }
}
