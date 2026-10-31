import { useState } from 'react';
import { Icon, Sheet } from '../components/ui';
import { useIsDesktop } from '../lib/media';
import { useNav } from '../nav';
import { useApp } from '../state';
import { ART } from '../launch/parts';
import { CHARS, houseImg, LEVELS, levelFor, levelProgress, lookFor, type CharId } from '../launch/points';
import { useAccountCtx } from './context';
import { SignInSteps } from './SignIn';
import './account.css';

const fmtN = (n: number) => n.toLocaleString('en-US');

/** Character page (design v2 N7 / ND3): level, choose a look, the 6 levels, the rules. */
export function Characters() {
  const { t, prefs, toast } = useApp();
  const nav = useNav();
  const desktop = useIsDesktop();
  const { status, me, setLook } = useAccountCtx();
  const [signIn, setSignIn] = useState(false);
  const [pending, setPending] = useState<CharId | null>(null);
  const zh = prefs.lang === 'zh';

  const total = me?.total ?? 0;
  const lv = levelFor(total);
  const next = LEVELS[lv.lvl];
  const look = lookFor(total, me?.look ?? null);
  const name = (id: CharId) => { const c = CHARS.find((x) => x.id === id)!; return zh ? c.nameZh : c.name; };
  const house = (l: typeof lv) => (zh ? l.houseZh : l.house);

  const pick = async (id: CharId) => {
    if (status !== 'in') { setSignIn(true); return; }
    if (id === look) return;
    setPending(id);
    if (await setLook(id)) toast(t('chSaved', { name: name(id) }));
    setPending(null);
  };

  const top = (
    <section className={'ch-hero' + (desktop ? ' desk' : '')} aria-label={t('chYourLevel')}>
      <div className="art">
        <span className="kicker gold">{t('lvKicker', { n: lv.lvl, house: zh ? lv.houseZh : lv.house.toUpperCase() })}</span>
        <img className="house" src={houseImg(lv.lvl)} alt="" />
        <img className="char" src={ART[look]} alt={t('chLookAlt', { name: name(look) })} />
      </div>
      <div className="info">
        <div className="row">
          <div className="id">{desktop ? <h1>{lv.title}</h1> : <b>{lv.title}</b>}<span>{t('chLook', { name: name(look) })}</span></div>
          <span className="pill">{t('lvBoost', { p: Math.round(lv.boost * 100) })}</span>
        </div>
        <div className="prog">
          <div className="hc-row"><b className="num">{fmtN(total)} pts</b>{next && <span>{t('lvNext', { n: next.lvl, pts: fmtN(next.min) })}</span>}</div>
          <div className="hc-bar"><i style={{ width: `${Math.max(2, levelProgress(total) * 100).toFixed(1)}%` }} /></div>
          <span className="s">{next ? t('chToNext', { n: fmtN(next.min - total), lv: next.lvl, house: house(next) }) : t('chMax')}</span>
        </div>
        {status !== 'in' && (
          <div className="ac-cta">
            <span>{status === 'unavailable' ? t('acUnavailable') : t('chSignIn')}</span>
            {status !== 'unavailable' && <button className="btn primary sm" onClick={() => setSignIn(true)}>{t('meSignIn')}</button>}
          </div>
        )}
        {desktop && <button className="btn primary" onClick={() => nav.push({ name: 'play' })}>{t('chPlay')}</button>}
      </div>
    </section>
  );

  const choose = (
    <section className="ch-sec" aria-label={t('chChoose')}>
      <div className="ch-head"><h2>{t('chChoose')}</h2><span>{t('chChooseSub')}</span></div>
      <div className="ch-grid">
        {CHARS.map((c) => {
          const open = total >= c.min;
          const on = open && c.id === look;
          if (!open) {
            return (
              <div key={c.id} className="ch-card lock" role="group" aria-label={t('chLockedAria', { name: name(c.id), lv: c.lvl })}>
                <span className="pic"><img src={ART[c.id]} alt="" /><span className="lockic"><Icon name="lock" size={16} color="#FFC94D" width={2.4} /></span></span>
                <span className="n">{name(c.id)}</span>
                <span className="m gold">{t('chLvBoost', { lv: c.lvl, p: Math.round(c.boost * 100) })}</span>
                <span className="bar"><i style={{ width: `${Math.min(100, (total / c.min) * 100).toFixed(1)}%` }} /></span>
                <span className="s">{t('chToGo', { n: fmtN(c.min - total) })}</span>
              </div>
            );
          }
          return (
            <button key={c.id} className={'ch-card' + (on ? ' on' : '')} aria-pressed={on} disabled={pending !== null}
              aria-label={on ? t('chInUseAria', { name: name(c.id) }) : t('chUseAria', { name: name(c.id) })} onClick={() => void pick(c.id)}>
              <span className="pic"><img src={ART[c.id]} alt="" /></span>
              <span className="n">{name(c.id)}</span>
              <span className="m">{c.lvl === 1 ? t('chLv12', { p: 0 }) : t('chLvBoost', { lv: c.lvl, p: Math.round(c.boost * 100) })}</span>
              {on && <span className="tag">{t('chInUse')}</span>}
              {pending === c.id && <span className="spin" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <span className="ch-fine">{t('chShows')}</span>
    </section>
  );

  const levels = (
    <section className={'ch-sec' + (desktop ? ' ch-box' : '')} aria-label={t('chLevels')}>
      <h2>{t('chLevels')}</h2>
      <ol className="ch-levels">
        {LEVELS.map((l) => {
          const reached = l.lvl <= lv.lvl, cur = l.lvl === lv.lvl;
          return (
            <li key={l.lvl} className={(cur ? 'cur ' : '') + (reached ? 'got' : '')} aria-current={cur ? 'step' : undefined}>
              <span className="dot">{l.lvl}</span>
              <img src={ART[l.char]} alt="" />
              <span className="t"><b>{l.title} <span>· {house(l)}</span></b><span className="mono">{fmtN(l.min)} pts</span></span>
              <span className="b">+{Math.round(l.boost * 100)}%</span>
            </li>
          );
        })}
      </ol>
    </section>
  );

  const rules = (
    <section className="ch-box ch-rules" aria-label={t('chHow')}>
      <span className="kicker">{t('chHow')}</span>
      <ul>{(['chRule1', 'chRule2', 'chRule3', 'chRule4'] as const).map((k) => <li key={k}>{t(k)}</li>)}</ul>
      <p>{t('lvS1')}</p>
    </section>
  );

  return (
    <div className={'ch' + (desktop ? ' desk lp-wrap' : '')}>
      {desktop ? (
        <nav className="td-crumb ch-crumb" aria-label="Breadcrumb"><button onClick={() => nav.tab('me')}>{t('navMe')}</button> <span aria-hidden="true">/</span> <span>{t('chTitle')}</span></nav>
      ) : (
        <header className="td-top"><button className="td-iconbtn" aria-label={t('back')} onClick={nav.pop}><Icon name="back" size={22} /></button><span className="ttl">{t('chTitle')}</span><span style={{ width: 44 }} /></header>
      )}
      {desktop ? (
        <div className="ch-cols">
          <div className="ch-main">{top}{choose}</div>
          <aside className="ch-aside">{levels}{rules}</aside>
        </div>
      ) : (
        <div className="ch-col">{top}{choose}{levels}{rules}</div>
      )}
      {signIn && (
        <Sheet title={t('siTitle')} onClose={() => setSignIn(false)} closeLabel={t('close')}>
          <SignInSteps onDone={() => setSignIn(false)} />
        </Sheet>
      )}
    </div>
  );
}
