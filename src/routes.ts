import type { Route, Tab } from './nav';

const TAB_PATH: Record<Tab, string> = { discover: '/', create: '/create', points: '/points', me: '/me' };
const ADDR = /^0x[0-9a-fA-F]{40}$/;

/** URL path for a screen. Token pages are shareable: /token/0x… */
export function routeToPath(r: Route): string {
  switch (r.name) {
    case 'home': return TAB_PATH[r.tab];
    case 'token': return `/token/${r.token}`;
    case 'legacy': return '/me/legacy';
  }
}

/** Screen for a URL path. Unknown paths open the home page. */
export function pathToRoute(path: string): Route {
  const p = path.replace(/\/+$/, '') || '/';
  const m = /^\/token\/([^/]+)$/.exec(p);
  if (m && ADDR.test(m[1])) return { name: 'token', token: m[1] };
  if (p === '/me/legacy') return { name: 'legacy' };
  for (const [tab, tp] of Object.entries(TAB_PATH) as [Tab, string][]) if (p === tp) return { name: 'home', tab };
  return { name: 'home', tab: 'discover' };
}

/** Full shareable link to a token page. */
export function tokenUrl(token: string, origin = typeof window !== 'undefined' ? window.location.origin : 'https://holdrs.xyz'): string {
  return `${origin}/token/${token}`;
}
