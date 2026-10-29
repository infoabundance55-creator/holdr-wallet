import { useEffect, useRef, useState } from 'react';
import { useIsDesktop } from '../lib/media';
import { Icon, Note } from '../components/ui';
import { useNav } from '../nav';
import { useApp } from '../state';
import type { Key } from '../i18n';
import { shortAddr } from '../lib/format';
import { usd, usdgAmount } from './fmt';
import {
  almostGraduating, change, holderList, marketCap, platformStats, progress, raisedUsdg, search, sortTokens, spark,
  thresholdUsdg, trending, volume, type Filter, type LaunchToken,
} from './math';
import { ago, ART, Bar, Cast, Delta, Spark, TokenAvatar } from './parts';
import { useSearch } from './search';
import { useLaunch } from './useLaunch';
import type { LaunchIndexer } from './chain';
import './launch.css';

const FILTERS: [Filter, Key][] = [['trending', 'fTrending'], ['new', 'fNew'], ['almost', 'fAlmost'], ['graduated', 'fGraduated'], ['mcap', 'fMcap']];
type McRange = 'any' | 'lt10' | '10to50' | 'gt50';
const MC: [McRange, Key][] = [['any', 'mcAny'], ['lt10', 'mcLt10'], ['10to50', 'mc10to50'], ['gt50', 'mcGt50']];
const PAGE = 20;

function inRange(mc: number, r: McRange): boolean {
  return r === 'any' || (r === 'lt10' ? mc < 10_000 : r === '10to50' ? mc >= 10_000 && mc <= 50_000 : mc > 50_000);
}

export function Discover() {
  const { t, setPrefs } = useApp();
  const nav = useNav();
  const ix = useLaunch();
  const desktop = useIsDesktop();
  const { q, setQ, open } = useSearch();
  const [f, setF] = useState<Filter>('trending');
  const [mc, setMc] = useState<McRange>('any');
  const [shown, setShown] = useState(PAGE);
  const [page, setPage] = useState(0);
  const listRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const onCreate = () => nav.tab('create');

  useEffect(() => { setShown(PAGE); setPage(0); }, [f, mc, q]);
  useEffect(() => { if (open && !desktop) searchRef.current?.focus(); }, [open, desktop]);

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
  const ready = all.some((x) => x.params);
  const list = search(sortTokens(all, f, now), q).filter((x) => inRange(marketCap(x), mc));
  const hot = trending(all, now);
  const almost = almostGraduating(all, 0.5, 3);
  const stats = platformStats(all, now);
  const goList = () => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const seeAllGrad = () => { setF('almost'); goList(); };

  const mobileSearch = !desktop && (open || q) ? (
    <div className="lp-search">
      <Icon name="search" size={18} />
      <label htmlFor="lp-q" className="sr-only">{t('searchTokens')}</label>
      <input id="lp-q" ref={searchRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPh')} autoComplete="off" spellCheck={false} />
    </div>
  ) : null;

  const listBlock = (
    <section className="lp-all" aria-label={t('allTokensTitle')} ref={listRef}>
      {desktop ? (
        <div className="lp-alltools">
          <h2>{t('allTokensTitle')}</h2>
          <Chips f={f} setF={setF} />
          <span style={{ flex: 1 }} />
          <McSelect mc={mc} setMc={setMc} />
        </div>
      ) : (
        <>
          <div className="lp-sec"><h2>{t('allTokensTitle')}</h2></div>
          <Chips f={f} setF={setF} />
          <div className="lp-listmeta"><span>{t('tokensLive', { n: list.length.toLocaleString('en-US') })}</span><McSelect mc={mc} setMc={setMc} /></div>
        </>
      )}
      <Body ix={ix} ready={ready} list={list} q={q} now={now} desktop={desktop} shown={shown} page={page} onCreate={onCreate} />
      {!desktop && list.length > shown && <button className="lp-more" onClick={() => setShown((n) => n + PAGE)} style={{ width: 'calc(100% - 32px)' }}>{t('loadMore')}</button>}
      {desktop && list.length > PAGE && <Pager page={page} pages={Math.ceil(list.length / PAGE)} setPage={setPage} />}
    </section>
  );

  // Searching: only the results.
  if (q) {
    return <div className={desktop ? 'lp-desk lp-wrap' : ''}>{mobileSearch}{listBlock}</div>;
  }

  const trend = hot.length > 0 && (
    <section className={'lp-trend' + (desktop ? ' desk' : '')} aria-label={t('trendKicker')}>
      <div className="lp-trend-head"><span className="kicker">{t('trendKicker')}</span>{!desktop && <span className="kicker">{t('top10')}</span>}</div>
      <div className="lp-scroll">
        {hot.map((tk, i) => <HotCard key={tk.token} tk={tk} rank={i + 1} now={now} />)}
      </div>
    </section>
  );

  const banner = (
    <div className="lp-banner">
      <div className="copy" style={desktop ? undefined : { display: 'contents' }}>
        <span className="kicker gold">{t('bannerKicker')}</span>
        <div className="slogan">{t('slogan')}</div>
        <p>{t('bannerSub')}</p>
        <div className="cta">
          <button className="gold-btn" onClick={goList}>{t('browseTokens')}</button>
          <button className="ghost" onClick={onCreate}>{t('launchToken')}</button>
        </div>
      </div>
      <Cast height={desktop ? 108 : 92} />
    </div>
  );

  const statGrid = (
    <section className="lp-statgrid" aria-label="Platform stats">
      <div><span className="kicker">{t('stLaunched')}</span><b>{stats.launched.toLocaleString('en-US')}</b></div>
      <div><span className="kicker">{t('stGraduated')}</span><b>{stats.graduated.toLocaleString('en-US')}</b></div>
      <div><span className="kicker">{t('stVol')}</span><b>{usd(stats.vol24h)}</b></div>
      <div className="gold"><span className="kicker gold">{t(desktop ? 'stPaidDesk' : 'stPaid')}</span><b>{'$' + usdgAmount(stats.creatorFees)}</b></div>
    </section>
  );

  const grads = almost.length > 0 && (
    <section className="lp-grads" aria-label={t('almostTitle')}>
      <div className="lp-sec"><h2>{t('almostTitle')}</h2><button className="link" onClick={seeAllGrad}>{t('seeAll')}</button></div>
      <div className="lp-scroll">{almost.map((tk) => <GradCard key={tk.token} tk={tk} now={now} exclude={ix.excluded} desktop={desktop} />)}</div>
    </section>
  );

  if (desktop) {
    return (
      <div className="lp-desk lp-wrap">
        {trend}
        <section className="lp-highlights" aria-label="Highlights">
          {banner}
          <div className="lp-side">
            <Mini title={t('miniPointsT')} text={t('miniPointsS')} img={ART.coin} h={48} pixel />
            <Mini title={t('miniNftT')} text={t('miniNftS')} img={ART.anon} h={72} />
            <Mini title={t('miniGameT')} text={t('miniGameS')} img={ART.frog} h={72} />
          </div>
        </section>
        {statGrid}
        {grads}
        {listBlock}
        <How />
        <Footer />
      </div>
    );
  }

  return (
    <>
      {mobileSearch}
      {trend}
      {banner}
      {grads}
      {statGrid}
      <p className="lp-statnote">{t('stNote')}</p>
      {listBlock}
      <How />
      <Footer />
    </>
  );
}

function Chips({ f, setF }: { f: Filter; setF: (f: Filter) => void }) {
  const { t } = useApp();
  return (
    <div className="lp-chips" role="group" aria-label={t('filters')}>
      {FILTERS.map(([id, label]) => <button key={id} className="lp-chip" aria-pressed={f === id} onClick={() => setF(id)}>{t(label)}</button>)}
    </div>
  );
}

function McSelect({ mc, setMc }: { mc: McRange; setMc: (m: McRange) => void }) {
  const { t } = useApp();
  return (
    <>
      <label htmlFor="lp-mc" className="sr-only">{t('mcFilter')}</label>
      <select id="lp-mc" className="lp-select" value={mc} onChange={(e) => setMc(e.target.value as McRange)}>
        {MC.map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
      </select>
    </>
  );
}

function Pager({ page, pages, setPage }: { page: number; pages: number; setPage: (p: number) => void }) {
  const { t } = useApp();
  const nums = [...new Set([0, page - 1, page, page + 1, pages - 1])].filter((n) => n >= 0 && n < pages).sort((a, b) => a - b);
  return (
    <nav className="lp-pager" aria-label="Pages">
      <button aria-label={t('pagePrev')} disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
      {nums.map((n, i) => (
        <span key={n} style={{ display: 'contents' }}>
          {i > 0 && n - nums[i - 1] > 1 && <span className="muted">…</span>}
          <button aria-current={n === page ? 'page' : undefined} onClick={() => setPage(n)}>{n + 1}</button>
        </span>
      ))}
      <button aria-label={t('pageNext')} disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>›</button>
    </nav>
  );
}

function Mini({ title, text, img, h, pixel }: { title: string; text: string; img: string; h: number; pixel?: boolean }) {
  const { t } = useApp();
  return (
    <div className="lp-mini">
      <div className="t">
        <span className="lp-pill" style={{ alignSelf: 'flex-start', height: 20, fontSize: 10 }}>{t('comingSoon')}</span>
        <b>{title}</b>
        <span className="s">{text}</span>
      </div>
      <img src={img} alt="" style={{ height: h, imageRendering: pixel ? 'pixelated' : undefined }} />
    </div>
  );
}

function Body({ ix, ready, list, q, now, desktop, shown, page, onCreate }: {
  ix: LaunchIndexer; ready: boolean; list: LaunchToken[]; q: string; now: number; desktop: boolean; shown: number; page: number; onCreate: () => void;
}) {
  const { t } = useApp();
  if (ix.status === 'error' && !ready) {
    return (
      <div style={{ margin: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Note kind="bad" icon="warn">{t('launchError')}</Note>
        <button className="btn secondary sm" style={{ alignSelf: 'flex-start' }} onClick={() => ix.sync()}><Icon name="refresh" size={18} />{t('retry')}</button>
      </div>
    );
  }
  if (!ready && ix.status !== 'ready') {
    return <div className="lp-skel" aria-busy="true" aria-label={t('loadingTokens')}><i /><i /><i /></div>;
  }
  if (list.length === 0) {
    return (
      <div className="lp-state">
        <img src={ART.anon} alt="" />
        <div className="t">
          <b>{q ? t('noMatch', { q }) : t('emptyTitle')}</b>
          {!q && <button className="gold-btn" style={{ height: 40, fontSize: 14 }} onClick={onCreate}>{t('emptyCta')}</button>}
        </div>
      </div>
    );
  }
  if (desktop) return <TokenTable list={list.slice(page * PAGE, page * PAGE + PAGE)} now={now} exclude={ix.excluded} />;
  return (
    <div className="lp-cards">
      {list.slice(0, shown).map((tk) => <TokenCard key={tk.token} tk={tk} now={now} exclude={ix.excluded} />)}
    </div>
  );
}

function HotCard({ tk, rank, now }: { tk: LaunchToken; rank: number; now: number }) {
  const nav = useNav();
  const ch = change(tk, now);
  return (
    <button className="lp-hot" onClick={() => nav.push({ name: 'token', token: tk.token })}>
      <span className="r1">
        <span className="rank">#{rank}</span>
        <TokenAvatar address={tk.token} symbol={tk.symbol} uri={tk.metadataURI} size={24} />
        <span className="sym">{tk.symbol}</span>
      </span>
      <span className="r2">
        <Delta n={ch} />
        <Spark values={spark(tk, now)} up={ch == null || Math.abs(ch) < 0.05 ? null : ch > 0} />
      </span>
      <Bar value={progress(tk)} height={4} done={tk.graduated} />
    </button>
  );
}

function GradCard({ tk, now, exclude, desktop }: { tk: LaunchToken; now: number; exclude: string[]; desktop: boolean }) {
  const { t } = useApp();
  const nav = useNav();
  const p = progress(tk);
  const left = Math.max(0, thresholdUsdg(tk) - raisedUsdg(tk));
  const holders = holderList(tk, exclude).length;
  const age = tk.createdAt ? ago(t, tk.createdAt, now) : '—';
  return (
    <button className="lp-gcard" onClick={() => nav.push({ name: 'token', token: tk.token })}>
      <span className="top">
        <TokenAvatar address={tk.token} symbol={tk.symbol} uri={tk.metadataURI} size={desktop ? 52 : 44} />
        <span className="nm"><b>{tk.name}</b><span>${tk.symbol} · {age}{desktop ? ` · ${holders} ${t('holdersShort').toLowerCase()}` : ''}</span></span>
        {!desktop && <span className="end"><b>{usd(marketCap(tk))}</b><Delta n={change(tk, now)} /></span>}
      </span>
      {desktop && (
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="kicker">{t('kMcap')}</span>
          <span className="num" style={{ fontWeight: 700 }}><span style={{ fontSize: 20 }}>{usd(marketCap(tk))}</span> <Delta n={change(tk, now)} className="small" /></span>
        </span>
      )}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Bar value={p} height={desktop ? 12 : 10} tone="near" />
        <span className="foot"><span style={{ color: 'var(--gold)' }}>{t('usdgToGo', { n: left.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}</span><span>{(p * 100).toFixed(1)}%</span></span>
      </span>
    </button>
  );
}

function TokenCard({ tk, now, exclude }: { tk: LaunchToken; now: number; exclude: string[] }) {
  const { t } = useApp();
  const nav = useNav();
  const p = progress(tk);
  return (
    <button className="lp-tcard" onClick={() => nav.push({ name: 'token', token: tk.token })}>
      <span className="top">
        <TokenAvatar address={tk.token} symbol={tk.symbol} uri={tk.metadataURI} size={44} />
        <span className="mid">
          <span className="name"><b>{tk.name}</b><span>${tk.symbol}</span></span>
          <span className="meta">{tk.createdAt ? ago(t, tk.createdAt, now) : '—'} · {t('byCreator', { name: '' }).trim()} <span className="mono">{shortAddr(tk.creator, 5, 3)}</span></span>
        </span>
        <span className="end"><b>{usd(marketCap(tk))}</b><Delta n={change(tk, now)} /></span>
      </span>
      {tk.graduated
        ? <span className="lp-pill grad" style={{ alignSelf: 'flex-start' }}>{t('gradUni')}</span>
        : <span className={'prog' + (p >= 0.8 ? ' near' : '')}><span style={{ flex: 1 }}><Bar value={p} /></span>{(p * 100).toFixed(1)}%</span>}
      <span className="row3">
        <span>{t('volShort')} <span>{usd(volume(tk, now))}</span></span>
        <span>{t('holdersShort')} <span>{holderList(tk, exclude).length.toLocaleString('en-US')}</span></span>
      </span>
    </button>
  );
}

function TokenTable({ list, now, exclude }: { list: LaunchToken[]; now: number; exclude: string[] }) {
  const { t } = useApp();
  const nav = useNav();
  return (
    <div className="lp-tablebox">
      <table className="lp-table">
        <thead>
          <tr>
            <th scope="col">{t('colToken')}</th><th scope="col" className="l">{t('colCreator')}</th><th scope="col">{t('kMcap')}</th>
            <th scope="col">{t('colVol')}</th><th scope="col">{t('col24h')}</th><th scope="col">{t('colHolders')}</th><th scope="col" className="l" style={{ width: 200 }}>{t('colCurve')}</th>
          </tr>
        </thead>
        <tbody>
          {list.map((tk) => {
            const p = progress(tk);
            return (
              <tr key={tk.token}>
                <td>
                  <button className="lp-cell" onClick={() => nav.push({ name: 'token', token: tk.token })}>
                    <TokenAvatar address={tk.token} symbol={tk.symbol} uri={tk.metadataURI} size={36} />
                    <span className="nm"><b>{tk.name} <span>${tk.symbol}</span></b><span>{tk.createdAt ? t('agoShort', { x: ago(t, tk.createdAt, now) }) : '—'}</span></span>
                  </button>
                </td>
                <td className="l" style={{ color: 'var(--text-3)', fontSize: 13 }}>{shortAddr(tk.creator, 5, 3)}</td>
                <td><b>{usd(marketCap(tk))}</b></td>
                <td>{usd(volume(tk, now))}</td>
                <td style={{ fontWeight: 700 }}><Delta n={change(tk, now)} /></td>
                <td>{holderList(tk, exclude).length.toLocaleString('en-US')}</td>
                <td className="l">
                  {tk.graduated
                    ? <span className="lp-pill grad">{t('graduatedBadge')}</span>
                    : <span className={'lp-gradcell' + (p >= 0.8 ? ' near' : '')}><span style={{ flex: 1, width: 'auto' }}><Bar value={p} /></span><span>{(p * 100).toFixed(1)}%</span></span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function How() {
  const { t } = useApp();
  const steps: [Key, Key][] = [['how1T', 'how1S'], ['how2T', 'how2S'], ['how3T', 'how3S'], ['how4T', 'how4S']];
  return (
    <section className="lp-how" aria-label={t('howTitle')}>
      <h2>{t('howTitle')}</h2>
      <ol>
        {steps.map(([a, b], i) => (
          <li key={a}><span className="n">{i + 1}</span><span className="t"><b>{t(a)}</b><span className="s">{t(b)}</span></span></li>
        ))}
      </ol>
    </section>
  );
}

export function Footer() {
  const { t } = useApp();
  return (
    <footer className="lp-footer">
      <span className="brand">holdr</span>
      <div className="links">
        <a href="/docs" target="_blank" rel="noopener noreferrer">{t('footDocs')}</a>
        <a href="https://x.com/holdr_app" target="_blank" rel="noopener noreferrer">X</a>
        <a href="/docs" target="_blank" rel="noopener noreferrer">{t('footRisk')}</a>
      </div>
      <p>{t('footDisclaimer')}</p>
    </footer>
  );
}
