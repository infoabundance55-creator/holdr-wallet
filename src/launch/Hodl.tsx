import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state';
import { ART } from './parts';
import { CHARS, estimate, houseImg, type CharId } from './points';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** Rolls a number to its new value (skipped when the user prefers less motion). */
function useRolling(target: number): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { from.current = target; setV(target); return; }
    const start = performance.now(), a = from.current, dur = 350;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / dur);
      const x = a + (target - a) * (1 - Math.pow(1 - k, 3));
      from.current = x; setV(x);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

/** Home page HODL calculator (design v2): buy amount, days held, today's level → estimated points and house. */
export function HodlCalc() {
  const { t, prefs } = useApp();
  const zh = prefs.lang === 'zh';
  const [amt, setAmt] = useState(100);
  const [days, setDays] = useState(30);
  const [ch, setCh] = useState<CharId>('bull');
  const c = CHARS.find((x) => x.id === ch)!;
  const e = estimate(amt, days, c.boost);
  const trade = useRolling(e.trade), hold = useRolling(e.hold), bonus = useRolling(e.bonus), total = useRolling(e.total);
  const house = zh ? e.level.houseZh : e.level.house;
  const nextHouse = e.next ? (zh ? e.next.houseZh : e.next.house) : '';
  const boostLabel = ch === 'raccoon' ? t('hcBoostNone') : t('hcBoost', { name: zh ? c.nameZh : c.name, lv: c.lvl, p: Math.round(c.boost * 100) });

  return (
    <section className="hc" aria-labelledby="hc-title">
      <div className="hc-in">
        <div className="hc-head"><span className="kicker gold">{t('hcKicker')}</span><h2 id="hc-title">{t('hcTitle')}</h2></div>
        <div className="hc-field">
          <div className="hc-row"><label htmlFor="hc-amt">{t('hcAmt')}</label><b className="num">${fmt(amt)}</b></div>
          <input id="hc-amt" type="range" min={10} max={2000} step={10} value={amt} onChange={(ev) => setAmt(Number(ev.target.value))} />
        </div>
        <div className="hc-field">
          <div className="hc-row"><label htmlFor="hc-days">{t('hcDays')}</label><b className="num">{t('hcDaysN', { n: days })}</b></div>
          <input id="hc-days" type="range" min={1} max={90} step={1} value={days} onChange={(ev) => setDays(Number(ev.target.value))} />
        </div>
        <div className="hc-field">
          <span className="hc-lab" id="hc-lv">{t('hcLevel')}</span>
          <div className="hc-chars" role="group" aria-labelledby="hc-lv">
            {CHARS.map((x) => (
              <button key={x.id} aria-pressed={x.id === ch} onClick={() => setCh(x.id)}
                aria-label={`${zh ? x.nameZh : x.name} · Lv${x.lvl}${x.id === 'raccoon' ? '–2' : x.id === 'anon' ? '+' : ''} · +${Math.round(x.boost * 100)}%`}>
                <img src={ART[x.id]} alt="" />
                <span>Lv{x.lvl}{x.id === 'anon' ? '+' : ''} +{Math.round(x.boost * 100)}%</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="hc-out">
        <div className="hc-sum" aria-live="polite">
          <div className="hc-row"><span>{t('hcTrade')}</span><b className="num">{fmt(trade)}</b></div>
          <div className="hc-row"><span>{t('hcHold', { n: days })}</span><b className="num">{fmt(hold)}</b></div>
          <div className="hc-row"><span>{boostLabel}</span><b className="num gold">+{fmt(bonus)}</b></div>
          <div className="hc-line" />
          <div className="hc-row total"><span>{t('hcTotal')}</span><b className="num gold">{fmt(total)}</b></div>
        </div>
        <div className="hc-house">
          <div className="pic"><img src={houseImg(e.level.lvl)} alt={house} /></div>
          <div className="info">
            <div className="hc-row"><b>{house}</b><span className="kicker">{t('hcLvlOf', { n: e.level.lvl })}</span></div>
            <div className="hc-bar"><i style={{ width: `${Math.max(3, Math.min(100, e.progress * 100)).toFixed(1)}%` }} /></div>
            <span className="s">{e.next ? t('hcToNext', { n: fmt(e.next.min - e.total), house: nextHouse }) : t('hcTop')}</span>
          </div>
        </div>
        <p className="hc-note">{t('hcNote')}</p>
      </div>
    </section>
  );
}
