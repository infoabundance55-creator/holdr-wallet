import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavContext, useNav, type Nav, type Route, type Tab } from './nav';
import { AppProvider, useApp } from './state';
import { WalletProvider } from './wallet/WalletProvider';
import { ConnectWallet, NetworkBanner } from './wallet/ConnectWallet';
import { Icon, Logo } from './components/ui';
import { Discover } from './launch/Discover';
import { TokenDetail } from './launch/TokenDetail';
import { CreateSoon, Me, PointsSoon } from './screens/Tabs';
import { LegacyWallet } from './screens/LegacyWallet';
import { screen as trackScreen } from './lib/analytics';

const TABS: [Tab, string, 'navDiscover' | 'navCreate' | 'navPoints' | 'navMe'][] = [
  ['discover', 'compass', 'navDiscover'], ['create', 'rocket', 'navCreate'], ['points', 'star', 'navPoints'], ['me', 'user', 'navMe'],
];

function Router() {
  const [stack, setStack] = useState<Route[]>([{ name: 'home', tab: 'discover' }]);
  const current = stack[stack.length - 1];

  // Browser / Android back button pops one screen.
  useEffect(() => {
    const onPop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => { window.scrollTo(0, 0); }, [current]);

  // Anonymous screen views for the usage funnel (no addresses or amounts).
  const screenName = current.name === 'home' ? current.tab : current.name; // token screens report as 'token', never the address
  useEffect(() => { trackScreen(screenName); }, [screenName]);

  const push = useCallback((r: Route) => {
    window.history.pushState({ holdr: true }, '');
    setStack((s) => [...s, r]);
  }, []);
  const pop = useCallback(() => {
    if (stack.length > 1) window.history.back();
    else setStack([{ name: 'home', tab: 'discover' }]);
  }, [stack.length]);
  const reset = useCallback((r: Route) => setStack([r]), []);
  const replace = useCallback((r: Route) => setStack((s) => [...s.slice(0, -1), r]), []);
  const tab = useCallback((tb: Tab) => setStack([{ name: 'home', tab: tb }]), []);
  const nav: Nav = useMemo(() => ({ push, pop, reset, replace, tab, current }), [push, pop, reset, replace, tab, current]);

  let body: ReactNode;
  switch (current.name) {
    case 'home':
      body = current.tab === 'discover' ? <Discover /> : current.tab === 'create' ? <CreateSoon /> : current.tab === 'points' ? <PointsSoon /> : <Me />;
      break;
    case 'token': body = <TokenDetail token={current.token} />; break;
    case 'legacy': body = <LegacyWallet />; break;
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
  return (
    <div className="shell">
      <header className={'topbar' + (mobileTopbar ? '' : ' desk-only')}>
        <button className="topbar-logo" onClick={() => nav.tab('discover')} aria-label={t('navDiscover')}><Logo /></button>
        <nav className="topnav" aria-label={t('mainNav')}>
          {TABS.map(([id, , label]) => (
            <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => nav.tab(id)}>
              {t(label)}{id === 'points' && <span className="soon">{t('soon')}</span>}
            </button>
          ))}
        </nav>
        <span style={{ flex: 1 }} />
        <button className="lp-gold desk-only" onClick={() => nav.tab('create')}><Icon name="plus" size={18} />{t('create')}</button>
        <ConnectWallet compact />
      </header>
      <NetworkBanner />
      <main className="page">{children}</main>
      {tab && (
        <>
          <div className="spacer-nav mobile-only" />
          <nav className="bottom-nav mobile-only" aria-label={t('mainNav')}>
            {TABS.map(([id, icon, label]) => (
              <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => nav.tab(id)}>
                <Icon name={icon} size={24} />{t(label)}
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
        <Router />
      </WalletProvider>
    </AppProvider>
  );
}
