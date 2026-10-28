import { useState } from 'react';
import { useIsDesktop } from '../lib/media';
import { Icon, Mark, Note } from '../components/ui';
import { useNav } from '../nav';
import { useApp } from '../state';
import { shortAddr } from '../lib/format';
import { pct, usd, usdgAmount } from './fmt';
import {
  almostGraduating, change, holderList, marketCap, progress, raisedUsdg, search, sortTokens, thresholdUsdg, volume,
  type Filter, type LaunchToken,
} from './math';
import { ago, Bar, deltaClass, TokenAvatar } from './parts';
import { useLaunch } from './useLaunch';
import type { LaunchIndexer } from './chain';
import './launch.css';

const FILTERS: [Filter, 'fTrending' | 'fNew' | 'fAlmost' | 'fGraduated', 'lTrending' | 'lNew' | 'lAlmost' | 'lGraduated'][] = [
  ['trending', 'fTrending', 'lTrending'], ['new', 'fNew', 'lNew'], ['almost', 'fAlmost', 'lAlmost'], ['graduated', 'fGraduated', 'lGraduated'],
];

export function Discover() {
  const { t, setPrefs } = useApp();
  const nav = useNav();
  const ix = useLaunch();
  const desktop = useIsDesktop();
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filter>('trending');
  const onCreate = () => nav.tab('create');

  if (!ix) {
    return (
      <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Note>{t('mainnetSoon')}</Note>
        <button className="btn secondary sm" style={{ alignSelf: 'flex-start' }} onClick={() => setPrefs({ network: 'testnet' })}>{t('switchTestnet')}</button>
      </div>
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const all = ix.list();
  const shown = search(sortTokens(all, f, now), q);
  const almost = q ? [] : almostGraduating(all);
  const listTitle = FILTERS.find((x) => x[0] === f)![2];

  const searchBox = (
    <div className="lp-search">
      <Icon name="search" color="#5A5A80" />
      <label htmlFor="lp-q" className="sr-only">{t('searchTokens')}</label>
      <input id="lp-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPh')} autoComplete="off" spellCheck={false} />
    </div>
  );
  const chips = (
    <div className="lp-chips" role="group" aria-label={t('filters')}>
      {FILTERS.map(([id, label]) => (
        <button key={id} className="lp-chip" aria-pressed={f === id} onClick={() => setF(id)}>{t(label)}</button>
      ))}
    </div>
  );
  const hero = (
    <section className="lp-hero">
      <span className="kicker">{t('heroKicker')}</span>
      <h2>{t('heroTitle')}</h2>
      <p>{t('heroSub')}</p>
      <div className="lp-hero-cta">
        <button className="lp-gold" onClick={onCreate}><Icon name="rocket" size={18} />{t('heroCta')}</button>
        {desktop && <a className="lp-ghost" href="/docs" target="_blank" rel="noopener noreferrer">{t('howItWorks')}</a>}
      </div>
      <span className="mark" aria-hidden="true"><Mark size={desktop ? 140 : 84} /></span>
    </section>
  );

  if (desktop) {
    return (
      <div className="lp-desk">
        {!q && hero}
        {almost.length > 0 && (
          <>
            <div className="lp-sec"><h2>{t('almostTitle')}</h2></div>
            <div className="lp-cards grid">{almost.slice(0, 3).map((tk) => <AlmostCard key={tk.token} tk={tk} />)}</div>
          </>
        )}
        <div className="lp-sec"><h2>{t('allTokensTitle')}</h2></div>
        <div className="lp-desk-tools">{chips}{searchBox}</div>
        <Body ix={ix} shown={shown} q={q} now={now} table />
      </div>
    );
  }

  return (
    <>
      {searchBox}
      {!q && hero}
      {chips}

      {almost.length > 0 && f !== 'almost' && (
        <>
          <div className="lp-sec"><h2>{t('almostTitle')}</h2></div>
          <div className="lp-cards">
            {almost.map((tk) => <AlmostCard key={tk.token} tk={tk} />)}
          </div>
        </>
      )}

      <div className="lp-sec"><h2>{t(listTitle)}</h2><span className="small muted">{t('mcap24h')}</span></div>
      <Body ix={ix} shown={shown} q={q} now={now} />

      <p className="lp-tip"><Icon name="sparkle" size={18} color="#8A5A00" /><span>{t('pointsTip')}</span></p>
    </>
  );
}

function Body({ ix, shown, q, now, table }: { ix: LaunchIndexer; shown: LaunchToken[]; q: string; now: number; table?: boolean }) {
  const { t } = useApp();
  if (ix.status === 'error' && ix.list().length === 0) {
    return (
      <div style={{ margin: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Note kind="bad" icon="warn">{t('launchError')}</Note>
        <button className="btn secondary sm" style={{ alignSelf: 'flex-start' }} onClick={() => ix.sync()}><Icon name="refresh" size={18} />{t('retry')}</button>
      </div>
    );
  }
  if (ix.status !== 'ready' && ix.list().length === 0) {
    return <div className="lp-list"><div className="empty"><span className="spin" style={{ color: 'var(--indigo)' }} /><span className="muted">{t('loadingTokens')}</span></div></div>;
  }
  if (shown.length === 0) {
    return <div className="lp-list"><div className="empty"><span className="muted">{q ? t('noMatch', { q }) : t('emptyTokens')}</span></div></div>;
  }
  if (table) return <TokenTable list={shown} now={now} exclude={ix.excluded} />;
  return (
    <section className="lp-list">
      {shown.map((tk) => <TokenRow key={tk.token} tk={tk} now={now} exclude={ix.excluded} />)}
    </section>
  );
}

/** Desktop list: one row per token, whole row opens the token. */
function TokenTable({ list, now, exclude }: { list: LaunchToken[]; now: number; exclude: string[] }) {
  const { t } = useApp();
  const nav = useNav();
  return (
    <div className="lp-list">
      <table className="lp-table">
        <thead>
          <tr>
            <th scope="col">{t('colToken')}</th><th scope="col" className="r">{t('sMcap')}</th><th scope="col" className="r">{t('sVol')}</th>
            <th scope="col" className="r">{t('sHolders')}</th><th scope="col">{t('colGrad')}</th><th scope="col" className="r">{t('colAge')}</th>
          </tr>
        </thead>
        <tbody>
          {list.map((tk) => {
            const ch = change(tk, now);
            const p = progress(tk);
            return (
              <tr key={tk.token}>
                <td>
                  <button className="lp-cell-btn" onClick={() => nav.push({ name: 'token', token: tk.token })}>
                    <TokenAvatar address={tk.token} symbol={tk.symbol} uri={tk.metadataURI} size={40} />
                    <span className="nm"><b>{tk.name}</b><span className="small muted">${tk.symbol} · <span className="mono">{shortAddr(tk.creator, 6, 4)}</span></span></span>
                  </button>
                </td>
                <td className="r"><b className="num">{usd(marketCap(tk))}</b><br /><span className={'small ' + deltaClass(ch)}>{pct(ch)}</span></td>
                <td className="r num">{usd(volume(tk, now))}</td>
                <td className="r num">{holderList(tk, exclude).length.toLocaleString('en-US')}</td>
                <td>
                  {tk.graduated
                    ? <span className="lp-pill ok"><Icon name="check" size={12} width={3} />{t('graduatedBadge')}</span>
                    : <span className="lp-gradcell"><Bar value={p} /><span className="small num">{Math.floor(p * 100)}%</span></span>}
                </td>
                <td className="r small muted">{(tk.createdAt ? ago(t, tk.createdAt, now) : '—')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TokenRow({ tk, now, exclude }: { tk: LaunchToken; now: number; exclude: string[] }) {
  const { t } = useApp();
  const nav = useNav();
  const ch = change(tk, now);
  const p = progress(tk);
  const holders = holderList(tk, exclude).length;
  return (
    <button className="lp-row" onClick={() => nav.push({ name: 'token', token: tk.token })}>
      <div className="top">
        <TokenAvatar address={tk.token} symbol={tk.symbol} uri={tk.metadataURI} size={48} />
        <div className="mid">
          <div className="name"><span className="n">{tk.name}</span><span className="s">${tk.symbol}</span></div>
          <div className="meta">
            <span className="mono">{shortAddr(tk.creator, 6, 4)}</span><span aria-hidden="true">·</span>
            <span>{(tk.createdAt ? ago(t, tk.createdAt, now) : '—')}</span><span aria-hidden="true">·</span>
            <span>{holders === 1 ? t('holder1') : t('holdersN', { n: holders.toLocaleString('en-US') })}</span>
          </div>
        </div>
        <div className="end">
          <span className="mc">{usd(marketCap(tk))}</span>
          <span className={'ch ' + deltaClass(ch)}>{pct(ch)}</span>
        </div>
      </div>
      <div className="prog">
        {tk.graduated ? (
          <><div style={{ flex: 1 }}><Bar value={1} color="#1FA463" /></div><span className="lbl lp-up"><Icon name="check" size={14} width={3} />{t('graduatedBadge')}</span></>
        ) : (
          <><div style={{ flex: 1 }}><Bar value={p} /></div><span className="lbl">{t('toGraduate', { n: Math.floor(p * 100) })}</span></>
        )}
      </div>
    </button>
  );
}

function AlmostCard({ tk }: { tk: LaunchToken }) {
  const { t } = useApp();
  const nav = useNav();
  const p = progress(tk);
  return (
    <button className="lp-card" onClick={() => nav.push({ name: 'token', token: tk.token })}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <TokenAvatar address={tk.token} symbol={tk.symbol} uri={tk.metadataURI} size={40} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, textAlign: 'left' }}>
          <span className="n">{tk.name}</span>
          <span className="small muted">${tk.symbol} · {usd(marketCap(tk))}</span>
        </div>
      </div>
      <Bar value={p} height={10} color="#FFC94D" />
      <div className="foot"><span>{t('pctDone', { n: Math.floor(p * 100) })}</span><span className="muted">{usdgAmount(raisedUsdg(tk))} / {usdgAmount(thresholdUsdg(tk))} USDG</span></div>
    </button>
  );
}
