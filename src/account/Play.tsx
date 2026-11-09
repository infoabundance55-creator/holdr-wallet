import { lazy, Suspense } from 'react';
import { Icon } from '../components/ui';
import { useIsDesktop } from '../lib/media';
import { useNav } from '../nav';
import { useApp } from '../state';
import { ART } from '../launch/parts';
import { useAccountCtx } from './context';
import { SignInSteps } from './SignIn';
import './account.css';

// The game (engine + pixel styles) loads only when someone opens /play signed in.
const MoonJump = lazy(() => import('../game/MoonJump').then((m) => ({ default: m.MoonJump })));

/**
 * Moon Jump entry. Not signed in: sign-in steps (design v2 N9 / ND4).
 * Signed in with a username: the game, full screen (N10 / ND5 and the game screens).
 */
export function Play() {
  const nav = useNav();
  const { status, me, signOut } = useAccountCtx();
  if (status === 'in' && me?.username) {
    return (
      <Suspense fallback={<div className="pl-loading" aria-busy="true" />}>
        <MoonJump
          me={me}
          onExit={nav.pop}
          onChangeLook={() => nav.push({ name: 'characters' })}
          onSignedOut={() => { void signOut(); }}
        />
      </Suspense>
    );
  }
  return <PlayGate />;
}

function PlayGate() {
  const { t } = useApp();
  const nav = useNav();
  const desktop = useIsDesktop();
  return (
    <div className={'pl' + (desktop ? ' desk lp-wrap' : '')}>
      <div className={'pl-sky' + (desktop ? ' desk' : '')}>
        {!desktop && (
          <div className="pl-bar"><button className="td-iconbtn dark" aria-label={t('back')} onClick={nav.pop}><Icon name="back" size={22} /></button></div>
        )}
        <span className="pl-logo">MOON JUMP</span>
        <img src={ART.raccoon} alt={t('plStarterAlt')} />
      </div>
      <section className="pl-body">
        {desktop && <span className="kicker gold">MOON JUMP</span>}
        {desktop ? <h1>{t('plGateTitle')}</h1> : <h1 className="m">{t('plGateTitle')}</h1>}
        <p>{t('plGateSub')}</p>
        <SignInSteps />
        <span className="ac-fine center">{t('plGateNote')}</span>
      </section>
    </div>
  );
}
