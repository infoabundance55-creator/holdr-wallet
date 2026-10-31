import { useEffect, useState } from 'react';
import { Icon } from '../components/ui';
import { useNav } from '../nav';
import { useApp } from '../state';
import { ART } from '../launch/parts';
import { CHARS, houseImg, LEVELS, type CharId } from '../launch/points';
import { useAccountCtx } from './context';
import './account.css';

/** Level-up popup (design v2 N11 / ND6). Shows once per new level, when the signed-in total passes a mark. */
export function LevelUpGate() {
  const { me } = useAccountCtx();
  if (!me || me.level <= me.levelSeen) return null;
  return <LevelUp key={me.level} from={me.levelSeen} to={me.level} prevLook={me.look ?? LEVELS[me.levelSeen - 1].char} />;
}

function LevelUp({ from, to, prevLook }: { from: number; to: number; prevLook: CharId }) {
  const { t, prefs } = useApp();
  const nav = useNav();
  const { ackLevel } = useAccountCtx();
  const zh = prefs.lang === 'zh';
  const a = LEVELS[from - 1], b = LEVELS[to - 1];
  const newChar = b.char;
  const canKeep = prevLook !== newChar;
  const [keep, setKeep] = useState(false);
  const name = (id: CharId) => { const c = CHARS.find((x) => x.id === id)!; return zh ? c.nameZh : c.name; };
  const house = (l: typeof a) => (zh ? l.houseZh : l.house);
  const look = keep ? prevLook : newChar;

  const close = (go?: 'characters' | 'play') => {
    void ackLevel(keep);
    if (go) nav.push({ name: go });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="scrim lu-scrim" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="lu" role="dialog" aria-modal="true" aria-labelledby="lu-t">
        <div className="lu-art">
          <button className="lu-x" aria-label={t('close')} onClick={() => close()} autoFocus><Icon name="close" size={18} width={2.4} /></button>
          <span className="kicker gold">{t('luKicker', { a: from, b: to })}</span>
          <img className="coin c1" src={ART.coin} alt="" aria-hidden="true" />
          <img className="coin c2" src={ART.coin} alt="" aria-hidden="true" />
          <img className="house" src={houseImg(to)} alt={t('luHouseAlt', { house: house(b) })} />
          <img className="char" src={ART[look]} alt={name(look)} />
        </div>
        <div className="lu-body">
          <h2 id="lu-t">{t('luTitle', { title: b.title })}</h2>
          <span className="sub">{newChar !== a.char ? t('luNewChar', { char: name(newChar), house: house(b) }) : t('luNewHouse', { house: house(b) })}</span>
          <dl>
            <div><dt>{t('luChar')}</dt><dd>{name(newChar)}</dd></div>
            <div><dt>{t('luHouse')}</dt><dd>{house(a)} → {house(b)}</dd></div>
            <div><dt>{t('luBoost')}</dt><dd><span className="muted">+{Math.round(a.boost * 100)}%</span> → <b>+{Math.round(b.boost * 100)}%</b></dd></div>
          </dl>
          <span className="note">{t('luNote')}</span>
          <button className="btn primary" onClick={() => close('characters')}>{t('luGo')}</button>
          {canKeep && (
            <div className="lu-keep">
              <span>{keep ? t('luLookKept', { name: name(prevLook) }) : t('luLookNew', { name: name(newChar) })}</span>
              <button className="link-btn" onClick={() => setKeep(!keep)}>{keep ? t('luUseNew', { name: name(newChar) }) : t('luKeep', { name: name(prevLook) })}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
