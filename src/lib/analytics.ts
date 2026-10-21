/**
 * Anonymous usage analytics (Vercel Web Analytics).
 *
 * Privacy rules — keep these when adding events:
 *  - Never send keys, phrases, passwords, balances or wallet addresses.
 *  - Paths are fixed names only (e.g. /app/send, /goal/wallet-created).
 *
 * The Hobby plan records page views but not custom events, so screens and
 * milestones are sent as virtual page views. That makes the funnel visible
 * under "Pages" in the Vercel dashboard:
 *   /app/welcome → /goal/wallet-created → /goal/funded → /goal/first-send
 */
import { inject, pageview, track } from '@vercel/analytics';

const ADDRESS = /0x[0-9a-fA-F]{40}/;
const ONCE_PREFIX = 'holdr.goal.';
let started = false;

/** Keep only our virtual paths, strip query/hash, and drop anything that looks like an address. */
export function scrubUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.pathname.startsWith('/app/') && !u.pathname.startsWith('/goal/')) return null;
    if (ADDRESS.test(u.pathname)) return null;
    return u.origin + u.pathname;
  } catch {
    return null;
  }
}

export function startAnalytics(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  inject({
    framework: 'react',
    disableAutoTrack: true,
    beforeSend: (event) => {
      const url = scrubUrl(event.url);
      return url ? { ...event, url } : null;
    },
  });
}

/** A screen was shown, e.g. screen('send'). */
export function screen(name: string): void {
  const path = `/app/${name}`;
  pageview({ route: path, path });
}

export type Goal =
  | 'wallet-created'
  | 'wallet-imported'
  | 'unlocked'
  | 'funded'
  | 'first-send'
  | 'send'
  | 'switch-mainnet';

/** A milestone was reached. `once` goals are counted at most once per browser. */
export function goal(name: Goal, opts: { once?: boolean } = {}): void {
  if (opts.once) {
    try {
      const key = ONCE_PREFIX + name;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch {
      /* storage blocked: count it anyway */
    }
  }
  const path = `/goal/${name}`;
  pageview({ route: path, path });
  track(name); // shows up as a custom event if the project moves to Pro
}
