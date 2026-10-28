/**
 * Anonymous page views for the docs (Vercel Web Analytics). Only /docs/<page> paths are sent,
 * never query strings, hashes or anything that looks like an address.
 */
import { inject, pageview } from '@vercel/analytics';

const ADDRESS = /0x[0-9a-fA-F]{40}/;

export function scrubDocsUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/^\/docs(\/[a-z0-9-]*)?$/.test(u.pathname) || ADDRESS.test(u.pathname)) return null;
    return u.origin + u.pathname;
  } catch {
    return null;
  }
}

let started = false;

export function startDocsAnalytics(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  inject({
    framework: 'react',
    disableAutoTrack: true,
    beforeSend: (event) => {
      const url = scrubDocsUrl(event.url);
      return url ? { ...event, url } : null;
    },
  });
}

/** A docs page was shown, e.g. /docs/fees. */
export function docsPageView(path: string): void {
  if (!started) return;
  pageview({ route: path, path });
}
