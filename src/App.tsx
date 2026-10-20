import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavContext, type Nav, type Route } from './nav';
import { AppProvider, useApp } from './state';
import { Home } from './screens/Home';
import { Backup, Import, SetPassword, Verify, Welcome } from './screens/Onboarding';
import { Send } from './screens/Send';
import { ChangePw, Receive, Reveal } from './screens/Account';
import { Unlock } from './screens/Unlock';

const ONBOARDING = new Set<Route['name']>(['welcome', 'backup', 'verify', 'password', 'import']);

function Router() {
  const { vault, signer } = useApp();
  const initial: Route = !vault ? { name: 'welcome' } : signer ? { name: 'home', tab: 'assets' } : { name: 'unlock' };
  const [stack, setStack] = useState<Route[]>([initial]);
  const current = stack[stack.length - 1];

  // Keep the visible route consistent with the wallet state (locked, removed, unlocked).
  useEffect(() => {
    if (!vault && !ONBOARDING.has(current.name)) setStack([{ name: 'welcome' }]);
    else if (vault && !signer && current.name !== 'unlock' && !ONBOARDING.has(current.name)) setStack([{ name: 'unlock' }]);
  }, [vault, signer, current.name]);

  // Browser / Android back button pops one screen.
  useEffect(() => {
    const onPop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => { window.scrollTo(0, 0); }, [current]);

  const push = useCallback((r: Route) => {
    window.history.pushState({ holdr: true }, '');
    setStack((s) => [...s, r]);
  }, []);
  const pop = useCallback(() => {
    if (stack.length > 1) window.history.back();
  }, [stack.length]);
  const reset = useCallback((r: Route) => setStack([r]), []);
  const replace = useCallback((r: Route) => setStack((s) => [...s.slice(0, -1), r]), []);
  const nav: Nav = useMemo(() => ({ push, pop, reset, replace }), [push, pop, reset, replace]);

  let screen;
  switch (current.name) {
    case 'welcome': screen = <Welcome />; break;
    case 'backup': screen = <Backup wallet={current.wallet} />; break;
    case 'verify': screen = <Verify wallet={current.wallet} />; break;
    case 'password': screen = <SetPassword wallet={current.wallet} flow={current.flow} />; break;
    case 'import': screen = <Import />; break;
    case 'unlock': screen = <Unlock />; break;
    case 'home': screen = signer ? <Home tab={current.tab} /> : null; break;
    case 'send': screen = signer ? <Send /> : null; break;
    case 'receive': screen = signer ? <Receive /> : null; break;
    case 'changePw': screen = <ChangePw />; break;
    case 'reveal': screen = <Reveal />; break;
  }

  return (
    <NavContext.Provider value={nav}>
      <main className="shell">{screen}</main>
    </NavContext.Provider>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Router />
    </AppProvider>
  );
}
