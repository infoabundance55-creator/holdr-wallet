import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavContext, useNav, type Nav, type Route, type Tab } from './nav';
import { AppProvider, useApp } from './state';
import { WalletProvider } from './wallet/WalletProvider';
import { ConnectWallet, NetworkBanner } from './wallet/ConnectWallet';
import { Icon, Logo } from './components/ui';
import { Discover } from './launch/Discover';
import { TokenDetail } from './launch/TokenDetail';
import { PointsSoon } from './screens/Tabs';
import { Create } from './launch/Create';
import { Me } from './launch/Me';
import { LegacyWallet } from './screens/LegacyWallet';
import { screen as trackScreen } from './lib/analytics';
import { pathToRoute, routeToPath } from './routes';
import { SearchProvider, useSearch } from './launch/search';
import { useLaunch } from './launch/useLaunch';
import { AccountProvider } from './account/AccountProvider';
import { Characters } from './account/Characters';
import { Play } from './account/Play';
import { LevelUpGate } from './account/LevelUp';

const TABS: [Tab, string, 'navDiscover' | 'navCreate' | 'navPoints' | 'navMe'][] = [
  ['discover', 'compass', 'navDiscover'], ['create', 'plusCircle', 'navCreate'], ['points', 'star', 'navPoints'], ['me', 'user', 'navMe'],
];

/** How many in-app screens sit behind this one in the browser history (0 = opened directly). */
const depth = (): number => {
  const s = window.history.state as { holdr?: number } | null;
  return typeof s?.holdr === 'number' ? s.holdr : 0;
};

function Router() {
  // The URL is the source of truth: /, /create, /points, /me, /me/legacy, /characters, /play, /token/0x…
  const [current, setCurrent] = useState<Route>(() => pathToRoute(window.location.pathname));

  useEffect(() => {
    // Normalise the first URL (unknown path → /) and mark it as the first in-app entry.
    const first = routeToPath(pathToRoute(window.location.pathname));
    window.history.replaceState({ holdr: depth() }, '', first + window.location.search + window.location.hash);
    const onPop = () => setCurrent(pathToRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => { window.scrollTo(0, 0); }, [current]);

  // Tab title: token pages show the token, so shared links and browser history read well.
  const ix = useLaunch();
  const tkName = current.name === 'token' ? ix?.get(current.token)?.symbol : undefined;
  useEffect(() => { document.title = tkName ? `$${tkName} · Holdrs` : 'Holdrs · Launchpad on Robinhood Chain'; }, [tkName]);

  // Anonymous screen views for the usage funnel (no addresses or amounts).
  const screenName = current.name === 'home' ? current.tab : current.name; // token screens report as 'token', never the address
  useEffect(() => { trackScreen(screenName); }, [screenName]);

  const push = useCallback((r: Route) => {
    const path = routeToPath(r);
    if (path !== window.location.pathname) window.history.pushState({ holdr: depth() + 1 }, '', path);
    setCurrent(r);
  }, []);
  const replace = useCallback((r: Route) => {
    window.history.replaceState({ holdr: depth() }, '', routeToPath(r));
    setCurrent(r);
  }, []);
  // Back: use browser history when we came from another in-app screen, else go home (link opened directly).
  const pop = useCallback(() => {
    if (depth() > 0) window.history.back();
    else replace({ name: 'home', tab: 'discover' });
  }, [replace]);
  const reset = replace;
  const tab = useCallback((tb: Tab) => push({ name: 'home', tab: tb }), [push]);
  const nav: Nav = useMemo(() => ({ push, pop, reset, replace, tab, current }), [push, pop, reset, replace, tab, current]);

  let body: ReactNode;
  switch (current.name) {
    case 'home':
      body = current.tab === 'discover' ? <Discover /> : current.tab === 'create' ? <Create /> : current.tab === 'points' ? <PointsSoon /> : <Me />;
      break;
    case 'token': body = <TokenDetail token={current.token} />; break;
    case 'legacy': body = <LegacyWallet />; break;
    case 'characters': body = <Characters />; break;
    case 'play': body = <Play />; break;
  }

  return (
    <NavContext.Provider value={nav}>
      <Layout tab={current.name === 'home' ? current.tab : null} mobileTopbar={current.name === 'home'}>{body}</Layout>
    </NavContext.Provider>
  );
}

/** Top bar (all sizes), network banner, and the bottom tab bar on phones. */
function Layout({ tab, mobileTopbar, children }: { tab: Tab | null; mobileTopbar: boolean; children: ReactNode }) {
  const { t } = useApp();
  const nav = useNav();
  const { q, setQ, open, setOpen } = useSearch();
  const onSearch = (v: string) => {
    setQ(v);
    if (v && nav.current.name !== 'home') nav.tab('discover');
    else if (v && tab !== 'discover') nav.tab('discover');
  };
  return (
    <div className="shell">
      <header className={'topbar' + (mobileTopbar ? '' : ' desk-only')}>
        <button className="topbar-logo" onClick={() => { setQ(''); nav.tab('discover'); }} aria-label={t('navDiscover')}><Logo /></button>
        <nav className="topnav" aria-label={t('mainNav')}>
          {TABS.map(([id, , label]) => (
            <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => nav.tab(id)}>
              {t(label)}{id === 'points' && <span className="soon">{t('soon')}</span>}
            </button>
          ))}
        </nav>
        <div className="topsearch desk-only">
          <Icon name="search" size={18} />
          <label htmlFor="top-q" className="sr-only">{t('searchTokens')}</label>
          <input id="top-q" type="search" value={q} onChange={(e) => onSearch(e.target.value)} placeholder={t('searchPh')} autoComplete="off" spellCheck={false} />
        </div>
        <span className="mobile-only" style={{ flex: 1 }} />
        <button className="gold-btn desk-only" onClick={() => nav.tab('create')}><Icon name="plus" size={18} />{t('launchToken')}</button>
        {tab === 'discover' && (
          <button className="round-btn mobile-only" aria-label={t('searchTokens')} aria-pressed={open} onClick={() => { setOpen(!open); if (open) setQ(''); }}>
            <Icon name={open ? 'close' : 'search'} size={18} />
          </button>
        )}
        <ConnectWallet compact />
      </header>
      <NetworkBanner />
      <main className="page">{children}</main>
      <LevelUpGate />
      {tab && (
        <>
          <div className="spacer-nav mobile-only" />
          <nav className="bottom-nav mobile-only" aria-label={t('mainNav')}>
            {TABS.map(([id, icon, label]) => (
              <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => nav.tab(id)}>
                <Icon name={icon} size={22} />{t(label)}
                {id === 'points' && <span className="soon" aria-hidden="true">SOON</span>}
              </button>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <WalletProvider>
        <AccountProvider>
          <SearchProvider>
            <Router />
          </SearchProvider>
        </AccountProvider>
      </WalletProvider>
    </AppProvider>
  );
}
