import { Icon } from '../components/ui';
import { useIsDesktop } from '../lib/media';
import { useNav } from '../nav';
import { useApp } from '../state';
import { ART } from '../launch/parts';
import { CHARS, levelFor, lookFor } from '../launch/points';
import { useAccountCtx } from './context';
import { SignInSteps } from './SignIn';
import './account.css';

/**
 * Moon Jump entry. Not signed in: sign-in steps (design v2 N9 / ND4).
 * Signed in: who you play as + change look (N10 / ND5); the game itself arrives in work 4.
 */
export function Play() {
  const { t, prefs } = useApp();
  const nav = useNav();
  const desktop = useIsDesktop();
  const { status, me } = useAccountCtx();
  const ready = status === 'in' && !!me?.username;
  const total = me?.total ?? 0;
  const look = lookFor(total, me?.look ?? null);
  const c = CHARS.find((x) => x.id === look)!;
  const lookName = prefs.lang === 'zh' ? c.nameZh : c.name;

  const art = (
    <div className={'pl-sky' + (desktop ? ' desk' : '')}>
      {!desktop && (
        <div className="pl-bar"><button className="td-iconbtn dark" aria-label={t('back')} onClick={nav.pop}><Icon name="back" size={22} /></button></div>
      )}
      <span className="pl-logo">MOON JUMP</span>
      <img src={ART[ready ? look : 'raccoon']} alt={ready ? t('chLookAlt', { name: lookName }) : t('plStarterAlt')} />
    </div>
  );

  const body = ready ? (
    <section className="pl-body">
      {desktop && <span className="kicker gold">MOON JUMP</span>}
      <div className="pl-as">
        <span>{t('plAs', { name: lookName })} <span className="muted">· @{me!.username} · Lv {levelFor(total).lvl}</span></span>
        <button className="link-btn" onClick={() => nav.push({ name: 'characters' })}>{t('plChangeLook')}</button>
      </div>
      <div className="ac-box">
        <span className="lp-pill warn" style={{ alignSelf: 'flex-start' }}>{t('comingSoon')}</span>
        <b>{t('plSoon')}</b>
        <span className="s">{t('plSoonSub')}</span>
      </div>
      <span className="grow" />
      <button className="btn primary" disabled>{t('plBtnSoon')}</button>
    </section>
  ) : (
    <section className="pl-body">
      {desktop && <span className="kicker gold">MOON JUMP</span>}
      {desktop ? <h1>{t('plGateTitle')}</h1> : <h1 className="m">{t('plGateTitle')}</h1>}
      <p>{t('plGateSub')}</p>
      <SignInSteps />
      <span className="ac-fine center">{t('plGateNote')}</span>
    </section>
  );

  return (
    <div className={'pl' + (desktop ? ' desk lp-wrap' : '')}>
      {art}
      {body}
    </div>
  );
}
