import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { copyText, Icon, Note } from '../components/ui';
import { shortAddr } from '../lib/format';
import { useNav } from '../nav';
import { useApp } from '../state';
import { useIsDesktop } from '../lib/media';
import { ConnectWallet, useWallet } from '../wallet/ConnectWallet';
import { LAUNCH, TOTAL_SUPPLY } from './contracts';
import { price, tokens as fmtTokens, usd, usdgAmount } from './fmt';
import {
  balanceOf, candles, change, creatorEarned, currentPrice, holderList, marketCap, pctOfSupply, progress, raisedUsdg,
  thresholdUsdg, top10Pct, volume, type Candle, type LaunchToken,
} from './math';
import { ago, ART, Bar, Delta, parseMeta, TokenAvatar } from './parts';
import { TradePanel } from './TradePanel';
import { usePoolState, type Side } from './useTrade';
import { useLaunch } from './useLaunch';
import type { LaunchIndexer } from './chain';
import { Footer } from './Discover';
import './launch.css';

const RANGES = [['5m', 300], ['1h', 3600], ['4h', 14_400], ['1d', 86_400]] as const;
const ZERO = '0x0000000000000000000000000000000000000000';

export function TokenDetail({ token }: { token: string }) {
  const { t } = useApp();
  const nav = useNav();
  const ix = useLaunch();
  const desktop = useIsDesktop();
  const tk = ix?.get(token);
  const [side, setSide] = useState<Side>('buy');
  const [sheet, setSheet] = useState(false);

  if (!ix || !tk || !tk.params) {
    const loading = ix && ix.status !== 'ready' && ix.status !== 'error';
    return (
      <div className="td">
        <div className="td-top"><button className="td-iconbtn" aria-label={t('back')} onClick={nav.pop}><Icon name="back" size={22} /></button></div>
        <div style={{ padding: 16 }}>
          {loading ? <div className="lp-skel" aria-busy="true"><i /><i /></div>
            : <Note kind="warn" icon="warn">{ix?.status === 'error' ? t('launchError') : t('tokenNotFound')}</Note>}
        </div>
      </div>
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const open = (s: Side) => { setSide(s); setSheet(true); };

  if (desktop) {
    return (
      <div className="td desk lp-wrap">
        <nav className="td-crumb" aria-label="Breadcrumb"><button onClick={nav.pop}>{t('navDiscover')}</button> <span aria-hidden="true">/</span> <span>{tk.name}</span></nav>
        <div className="td-cols">
          <div className="td-main">
            <section className="td-headcard"><Head tk={tk} now={now} desktop /></section>
            <Stats tk={tk} now={now} ix={ix} />
            <ChartBox tk={tk} now={now} desktop />
            <section className="td-act"><Tabs tk={tk} now={now} ix={ix} desktop /></section>
          </div>
          <aside className="td-aside">
            <section className="tp-box" aria-label={t('tradeLabel')}><TradePanel tk={tk} ix={ix} side={side} setSide={setSide} /></section>
            <GradBox tk={tk} />
            <Safety tk={tk} ix={ix} now={now} />
            <Earned tk={tk} />
          </aside>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="td">
      <header className="td-top">
        <button className="td-iconbtn" aria-label={t('back')} onClick={nav.pop}><Icon name="back" size={22} /></button>
        <span className="ttl">{tk.name}</span>
        <ConnectWallet compact />
      </header>
      <div className="td-head"><Head tk={tk} now={now} /></div>
      <ChartBox tk={tk} now={now} />
      <Stats tk={tk} now={now} ix={ix} />
      <GradBox tk={tk} />
      <Safety tk={tk} ix={ix} now={now} />
      <Earned tk={tk} />
      <section className="td-act"><Tabs tk={tk} now={now} ix={ix} /></section>
      <div className="td-spacer" />
      <div className="td-bar">
        <div className="two">
          <button className="tp-go b" style={{ height: 52, borderRadius: 14, fontSize: 17 }} onClick={() => open('buy')}>{t('buy')}</button>
          <button className="tp-go s" style={{ height: 52, borderRadius: 14, fontSize: 17 }} onClick={() => open('sell')}>{t('sell')}</button>
        </div>
        <span className="hint">{t(tk.graduated ? 'barHintUni' : 'barHintCurve')}</span>
      </div>
      {sheet && (
        <TradeSheet tk={tk} onClose={() => setSheet(false)}>
          <TradePanel tk={tk} ix={ix} side={side} setSide={setSide} />
        </TradeSheet>
      )}
    </div>
  );
}

function TradeSheet({ tk, onClose, children }: { tk: LaunchToken; onClose: () => void; children: ReactNode }) {
  const { t } = useApp();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="scrim" style={{ zIndex: 40 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet tp-sheet" role="dialog" aria-modal="true" aria-labelledby="tp-title">
        <div className="grab" aria-hidden="true" />
        <div className="tp-sheet-head">
          <TokenAvatar address={tk.token} symbol={tk.symbol} uri={tk.metadataURI} size={32} />
          <h2 id="tp-title">{t('tradeTitle', { sym: tk.symbol })}</h2>
          <button className="td-iconbtn" aria-label={t('close')} onClick={onClose}><Icon name="close" size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Head({ tk, now, desktop }: { tk: LaunchToken; now: number; desktop?: boolean }) {
  const { t, toast } = useApp();
  const meta = parseMeta(tk.metadataURI);
  const ch = change(tk, now);
  const socials: [string | undefined, string, ReactNode][] = [
    [meta.x, 'X', <Icon key="x" name="close" size={14} width={2.4} />],
    [meta.telegram, 'Telegram', <Icon key="tg" name="send" size={15} />],
    [meta.website, 'Website', <Icon key="web" name="globe" size={15} />],
  ];
  const chips = (
    <div className="td-links">
      <button className="td-chip" aria-label={`${t('copyContract')} ${shortAddr(tk.token)}`} onClick={async () => { if (await copyText(tk.token)) toast(t('copied')); }}>
        {shortAddr(tk.token, 6, 4)}<Icon name="copy" size={14} color="#8C95B0" />
      </button>
      {socials.filter(([u]) => u).map(([u, label, icon]) => (
        <a key={label} className="td-chip round" href={u} target="_blank" rel="noopener noreferrer nofollow" aria-label={label}>{icon}</a>
      ))}
      {desktop && <By tk={tk} now={now} />}
    </div>
  );
  const id = (
    <div className="td-id">
      <TokenAvatar address={tk.token} symbol={tk.symbol} uri={tk.metadataURI} size={desktop ? 72 : 60} />
      <div className="t">
        <div><h1>{tk.name}</h1><span className="sym">${tk.symbol}</span>{desktop && <Status tk={tk} />}</div>
        {desktop ? chips : <Status tk={tk} />}
      </div>
    </div>
  );
  const priceRow = (
    <div className="td-price" aria-label={t('priceLabel')}>
      <span className="p">{price(currentPrice(tk))}</span>
      <span className="c"><Delta n={ch} /> {desktop && <span className="w">24H</span>}</span>
      {!desktop && <span className="w">24H</span>}
    </div>
  );
  if (desktop) return <>{id}{priceRow}</>;
  return <>{id}{chips}<By tk={tk} now={now} />{priceRow}</>;
}

function Status({ tk }: { tk: LaunchToken }) {
  const { t } = useApp();
  return tk.graduated
    ? <span className="lp-pill grad" style={{ alignSelf: 'flex-start' }}><Icon name="check" size={12} width={3} />{t('gradUni')}</span>
    : <span className="lp-pill curve" style={{ alignSelf: 'flex-start' }}>{t('onCurve')}</span>;
}

function By({ tk, now }: { tk: LaunchToken; now: number }) {
  const { t } = useApp();
  return (
    <span className="td-by">
      {t('launchedAgo', { ago: tk.createdAt ? ago(t, tk.createdAt, now, true) : '—' })} <span className="mono">{shortAddr(tk.creator, 5, 3)}</span>
      {tk.graduated && tk.graduatedAt ? ` · ${t('graduatedAgo', { ago: ago(t, tk.graduatedAt, now, true) })}` : ''}
    </span>
  );
}

function Stats({ tk, now, ix }: { tk: LaunchToken; now: number; ix: LaunchIndexer }) {
  const { t } = useApp();
  const pool = usePoolState(tk);
  const holders = holderList(tk, ix.excluded).length.toLocaleString('en-US');
  const fee = `${(tk.params?.feeBps ?? 100) / 100}%`;
  const rows: [string, string][] = tk.graduated
    ? [
      [t('kMcap'), usd(marketCap(tk))], [t('kVol'), usd(volume(tk, now))], [t('kHolders'), holders],
      [t('kPoolLiq'), pool.data ? usd(pool.data.tvl) : '—'], [t('kVenue'), 'Uniswap v4'], [t('kFee'), fee],
    ]
    : [
      [t('kMcap'), usd(marketCap(tk))], [t('kVol'), usd(volume(tk, now))], [t('kHolders'), holders],
      [t('kLiq'), `${usdgAmount(raisedUsdg(tk))} USDG`], [t('kRaised'), `${usdgAmount(raisedUsdg(tk))} / ${thresholdUsdg(tk) / 1000}K`], [t('kFee'), fee],
    ];
  return (
    <section className="td-stats" aria-label="Key numbers">
      {rows.map(([k, v]) => <div key={k}><span className="kicker">{k}</span><b>{v}</b></div>)}
    </section>
  );
}

function GradBox({ tk }: { tk: LaunchToken }) {
  const { t, network } = useApp();
  const now = Math.floor(Date.now() / 1000);
  const c = LAUNCH[network.id];
  if (tk.graduated) {
    return (
      <section className="td-box td-grad done" aria-label={t('stGraduated')}>
        <div className="h">
          <span className="kicker up">{t('gradDone', { ago: tk.graduatedAt ? ago(t, tk.graduatedAt, now, true) : '' })}</span>
          {tk.gradTx && <a href={`${network.explorer}/tx/${tk.gradTx}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>{t('gradTx')}</a>}
        </div>
        <Bar value={1} height={10} done />
        <dl className="td-dl">
          <div><dt>{t('movedTo')}</dt><dd>{usdgAmount(thresholdUsdg(tk))} USDG + 200M</dd></div>
          {c && <div><dt>{t('lockedIn')}</dt><dd><a href={`${network.explorer}/address/${c.locker}`} target="_blank" rel="noopener noreferrer">{shortAddr(c.locker, 6, 4)}</a></dd></div>}
          <div><dt>{t('burnedFrom')}</dt><dd>{fmtTokens(tk.burned)}</dd></div>
        </dl>
        <span className="foot">{t('gradFoot')}</span>
      </section>
    );
  }
  const p = progress(tk);
  const raised = raisedUsdg(tk), goal = thresholdUsdg(tk);
  const two = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <section className="td-box td-grad" aria-label={t('gradProgress')}>
      <div className="h"><span className="kicker gold">{t('gradProgress')}</span><b>{(p * 100).toFixed(1)}%</b></div>
      <Bar value={p} height={16} tone="near" label={t('gradProgress')} />
      <div className="amt"><span>{two(raised)} / {usdgAmount(goal)} USDG</span><span>{t('toGoShort', { n: two(Math.max(0, goal - raised)) })}</span></div>
      <div className="notes">
        <span style={{ paddingTop: 0 }}>{t('gradWhen')}</span>
        <span><Icon name="lock" size={16} color="#FFC94D" />{t('gradLock')}</span>
        <span><Icon name="sparkle" size={16} color="#FFC94D" />{t('gradBurn')}</span>
      </div>
    </section>
  );
}

function Safety({ tk, ix, now }: { tk: LaunchToken; ix: LaunchIndexer; now: number }) {
  const { t } = useApp();
  const p = tk.params!;
  const creatorPct = pctOfSupply(tk, balanceOf(tk, tk.creator));
  const capPct = (Number(p.firstBuyMaxTokens) / Number(TOTAL_SUPPLY)) * 100;
  const top10 = top10Pct(tk, [...ix.excluded, ZERO]);
  const snipeLive = p.launchTime > 0 && now - p.launchTime < 5;
  type Row = { ok: boolean; t: string; v?: string; vc?: 'ok' | 'warn' };
  const rows: Row[] = tk.graduated
    ? [
      { ok: true, t: t('cMint') },
      { ok: true, t: t('cLocked'), v: '200M + 10K' },
      { ok: true, t: t('cBurned'), v: fmtTokens(tk.burned) },
      { ok: true, t: t('cTax', { fee: p.feeBps / 100 }) },
      { ok: creatorPct <= capPct + 0.05, t: t('cCreator'), v: `${creatorPct.toFixed(1)}%`, vc: creatorPct <= capPct + 0.05 ? 'ok' : 'warn' },
      { ok: top10 <= 30, t: t('cTop10'), v: `${top10.toFixed(1)}%`, vc: top10 <= 30 ? undefined : 'warn' },
    ]
    : [
      { ok: true, t: t('cSupply') },
      { ok: true, t: t('cLock') },
      { ok: true, t: t('cMint') },
      { ok: true, t: t('cTax', { fee: p.feeBps / 100 }) },
      { ok: creatorPct <= capPct + 0.05, t: t('cCreator'), v: `${creatorPct.toFixed(1)}%`, vc: creatorPct <= capPct + 0.05 ? 'ok' : 'warn' },
      { ok: top10 <= 30, t: t('cTop10'), v: `${top10.toFixed(1)}%`, vc: top10 <= 30 ? undefined : 'warn' },
      { ok: !snipeLive, t: t(snipeLive ? 'cSnipeLive' : 'cSnipe') },
    ];
  return (
    <section className="td-box" aria-label={t('safety')}>
      <span className="kicker">{t('safety')}</span>
      <ul className="td-checks">
        {rows.map((r) => (
          <li key={r.t}>
            {r.ok
              ? <span className="ic"><Icon name="check" size={12} width={3.2} /></span>
              : <span className="ic warn" role="img" aria-label="Note">!</span>}
            <span className="tx">{r.t}</span>
            {r.v && <span className={'v ' + (r.vc ?? '')}>{r.v}</span>}
          </li>
        ))}
      </ul>
      <p className="td-risk">{t('riskNote')}</p>
    </section>
  );
}

function Earned({ tk }: { tk: LaunchToken }) {
  const { t } = useApp();
  return (
    <section className="td-box td-earn" aria-label={t('creatorEarned')}>
      <div className="t">
        <span className="kicker">{t('creatorEarned')}</span>
        <b>${creatorEarned(tk).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
        <span className="s">{t(tk.graduated ? 'earnUni' : 'earnCurve')}</span>
      </div>
      <img src={ART.frog} alt="" />
    </section>
  );
}

/* ------------------------------------------------------------------ chart */

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function axisNum(v: number, ref: number): string {
  if (!(ref > 0)) return '0';
  const d = Math.min(12, Math.max(2, 3 - Math.floor(Math.log10(ref))));
  return v.toFixed(d);
}

function timeLabel(sec: number, interval: number): string {
  const d = new Date(sec * 1000);
  if (interval >= 86_400) return `${d.getMonth() + 1}/${d.getDate()}`;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function ChartBox({ tk, now, desktop }: { tk: LaunchToken; now: number; desktop?: boolean }) {
  const { t } = useApp();
  const [range, setRange] = useState(desktop ? 1 : 0);
  const [mode, setMode] = useState<'candles' | 'line'>(tk.graduated ? 'line' : 'candles');
  const [ref, width] = useWidth<HTMLDivElement>();
  const [label, sec] = RANGES[range];
  const data = candles(tk, sec, now, desktop ? 48 : 30);
  const last = data[data.length - 1];
  return (
    <section className="td-box td-chart" aria-label={t('chartLabel', { range: label })}>
      <div className="bar">
        {desktop && last && (
          <div className="td-ohlc">
            <span>O <span>{axisNum(last.o, last.c)}</span></span><span>H <span>{axisNum(last.h, last.c)}</span></span>
            <span>L <span>{axisNum(last.l, last.c)}</span></span><span>C <span className={last.c >= last.o ? 'lp-up' : 'lp-down'}>{axisNum(last.c, last.c)}</span></span>
          </div>
        )}
        <div className="td-seg">
          <button aria-pressed={mode === 'candles'} onClick={() => setMode('candles')}>{t('candles')}</button>
          <button aria-pressed={mode === 'line'} onClick={() => setMode('line')}>{t('line')}</button>
        </div>
        <div className="td-seg mono">
          {RANGES.map(([l], i) => <button key={l} aria-pressed={range === i} onClick={() => setRange(i)}>{l}</button>)}
        </div>
      </div>
      <div ref={ref}>
        {tk.trades.length === 0
          ? <div className="td-chart-empty">{t('chartEmpty')}</div>
          : width > 0 && <Chart data={data} width={width} height={desktop ? 320 : 200} volume={!!desktop} mode={mode} interval={sec} tk={tk} />}
      </div>
    </section>
  );
}

function Chart({ data, width, height, volume: showVol, mode, interval, tk }: {
  data: Candle[]; width: number; height: number; volume: boolean; mode: 'candles' | 'line'; interval: number; tk: LaunchToken;
}) {
  const AXIS = width < 500 ? 62 : 80;
  const VOL = showVol ? 56 : 0;
  const XL = 18;
  const H = height + (VOL ? VOL + 6 : 0) + XL;
  const plotW = width - AXIS;
  let lo = Math.min(...data.map((c) => c.l)), hi = Math.max(...data.map((c) => c.h));
  if (hi - lo < hi * 0.004) { hi *= 1.01; lo *= 0.99; }
  const pad = (hi - lo) * 0.08;
  lo = Math.max(0, lo - pad); hi += pad;
  const y = (v: number) => 8 + (1 - (v - lo) / (hi - lo)) * (height - 16);
  const slot = plotW / data.length;
  const bw = Math.max(2, Math.min(12, slot * 0.64));
  const ticks = [0, 1, 2, 3].map((i) => hi - ((hi - lo) * (i + 0.5)) / 4);
  const maxV = Math.max(...data.map((c) => c.v), 1e-9);
  const last = data[data.length - 1];
  const up = last.c >= data[0].o;
  const lineColor = up ? '#2EDB82' : '#FF6464';
  const gradIdx = tk.graduated && tk.graduatedAt ? data.findIndex((c) => c.t + interval > tk.graduatedAt!) : -1;
  const xLabels = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.min(data.length - 1, Math.round(f * (data.length - 1))));
  const desc = `${data.length} ${mode}, ${axisNum(data[0].o, last.c)} → ${axisNum(last.c, last.c)} USDG`;
  return (
    <svg className="td-svg" width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={desc}>
      {ticks.map((v) => <line key={v} x1={0} x2={plotW} y1={y(v)} y2={y(v)} stroke="#1A2133" />)}
      <line x1={0} x2={plotW} y1={height} y2={height} stroke="#262E45" />
      {ticks.filter((v) => Math.abs(y(v) - y(last.c)) > 14).map((v) => <text key={'l' + v} x={width - 2} y={y(v) + 4} textAnchor="end" fill="#8C95B0" fontFamily="JetBrains Mono, monospace" fontSize={10}>{axisNum(v, hi)}</text>)}
      {gradIdx >= 0 && (
        <g>
          <line x1={slot * gradIdx + slot / 2} x2={slot * gradIdx + slot / 2} y1={4} y2={height} stroke="#2EDB82" strokeDasharray="3 4" opacity={0.7} />
          <text x={slot * gradIdx + slot / 2 + 4} y={16} fill="#2EDB82" fontFamily="JetBrains Mono, monospace" fontSize={10} fontWeight={700}>GRADUATED</text>
        </g>
      )}
      {mode === 'candles' ? data.map((c, i) => {
        const color = c.c >= c.o ? '#2EDB82' : '#FF6464';
        const x = slot * i + slot / 2;
        const top = y(Math.max(c.o, c.c)), bot = y(Math.min(c.o, c.c));
        return (
          <g key={c.t}>
            <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth={1} />
            <rect x={x - bw / 2} y={top} width={bw} height={Math.max(2, bot - top)} rx={1} fill={color} />
          </g>
        );
      }) : (
        <polyline fill="none" stroke={lineColor} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round"
          points={data.map((c, i) => `${(slot * i + slot / 2).toFixed(1)},${y(c.c).toFixed(1)}`).join(' ')} />
      )}
      <line x1={0} x2={plotW} y1={y(last.c)} y2={y(last.c)} stroke="#FFC94D" strokeDasharray="4 4" opacity={0.6} />
      <rect x={plotW + 2} y={y(last.c) - 10} width={AXIS - 4} height={20} rx={4} fill={lineColor} />
      <text x={plotW + AXIS / 2} y={y(last.c) + 4} textAnchor="middle" fill="#04140B" fontFamily="JetBrains Mono, monospace" fontSize={10} fontWeight={700}>{axisNum(last.c, hi)}</text>
      {showVol && data.map((c, i) => {
        const h = (c.v / maxV) * VOL;
        return <rect key={'v' + c.t} x={slot * i + slot / 2 - bw / 2} y={height + 6 + VOL - h} width={bw} height={Math.max(0, h)} rx={1} fill={c.c >= c.o ? '#2EDB82' : '#FF6464'} opacity={0.35} />;
      })}
      {xLabels.map((i, k) => (
        <text key={'x' + k} x={Math.min(plotW - 16, Math.max(16, slot * i + slot / 2))} y={H - 4} textAnchor="middle" fill="#8C95B0" fontFamily="JetBrains Mono, monospace" fontSize={10}>{timeLabel(data[i].t, interval)}</text>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ tabs */

function Tabs({ tk, now, ix, desktop }: { tk: LaunchToken; now: number; ix: LaunchIndexer; desktop?: boolean }) {
  const { t } = useApp();
  const [tab, setTab] = useState<'trades' | 'holders' | 'about'>('trades');
  const n = holderList(tk, ix.excluded).length;
  return (
    <>
      <div className="td-tabs" role="tablist" aria-label={t('tokenTabs')}>
        <button role="tab" aria-selected={tab === 'trades'} onClick={() => setTab('trades')}>{t('tTrades')}</button>
        <button role="tab" aria-selected={tab === 'holders'} onClick={() => setTab('holders')}>{t('tHoldersN', { n: n.toLocaleString('en-US') })}</button>
        <button role="tab" aria-selected={tab === 'about'} onClick={() => setTab('about')}>{t('tAbout')}</button>
      </div>
      <div role="tabpanel">
        {tab === 'trades' && <Trades tk={tk} now={now} />}
        {tab === 'holders' && <Holders tk={tk} ix={ix} desktop={desktop} />}
        {tab === 'about' && <About tk={tk} />}
      </div>
    </>
  );
}

function Trades({ tk, now }: { tk: LaunchToken; now: number }) {
  const { t, network } = useApp();
  const { address } = useWallet();
  const list = tk.trades.slice(-40).reverse();
  if (!list.length) return <p className="td-empty">{t('noTrades')}</p>;
  return (
    <div>
      {list.map((tr) => {
        const me = address && tr.trader.toLowerCase() === address.toLowerCase();
        return (
          <a key={tr.tx + tr.logIndex} className="td-row" href={`${network.explorer}/tx/${tr.tx}`} target="_blank" rel="noopener noreferrer">
            <span className={'td-side ' + (tr.isBuy ? 'b' : 's')}>{tr.isBuy ? 'BUY' : 'SELL'}</span>
            <span className="m"><b>{usdgAmount(Number(tr.usdg) / 1e6)} USDG</b><span>{fmtTokens(tr.tokens)} {tk.symbol}</span></span>
            <span className="e">
              <span className={'who' + (me ? ' me' : '')}>{me ? t('youTag') : shortAddr(tr.trader, 5, 3)}</span>
              <span>{tr.time ? ago(t, tr.time, now) : '—'}</span>
            </span>
          </a>
        );
      })}
    </div>
  );
}

function Holders({ tk, ix, desktop }: { tk: LaunchToken; ix: LaunchIndexer; desktop?: boolean }) {
  const { t, network } = useApp();
  const { address } = useWallet();
  const c = LAUNCH[network.id];
  const pm = c?.poolManager.toLowerCase();
  // Real holders plus the special addresses, each with its own label.
  const special: { address: string; balance: bigint; tag: 'curve' | 'lock' | 'burn' }[] = [];
  const curveBal = tk.balances.get(tk.pool.toLowerCase()) ?? 0n;
  if (curveBal > 0n) special.push({ address: tk.pool.toLowerCase(), balance: curveBal, tag: 'curve' });
  const pmBal = pm ? tk.balances.get(pm) ?? 0n : 0n;
  if (pmBal > 0n && pm) special.push({ address: pm, balance: pmBal, tag: 'lock' });
  const burned = tk.balances.get(ZERO) ?? 0n;
  if (burned > 0n) special.push({ address: ZERO, balance: burned, tag: 'burn' });
  const list = [...special, ...holderList(tk, ix.excluded).map((h) => ({ ...h, tag: undefined }))]
    .sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0)).slice(0, 25);
  if (!list.length) return <p className="td-empty">{t('noHolders')}</p>;
  const tagText = { curve: t('tagCurve'), lock: t('tagLock'), burn: t('tagBurn') } as const;
  return (
    <div>
      {list.map((h, i) => {
        const me = address && h.address === address.toLowerCase();
        const creator = h.address === tk.creator.toLowerCase();
        const share = (Number(h.balance) / Number(TOTAL_SUPPLY)) * 100;
        return (
          <a key={h.address} className="td-row" href={`${network.explorer}/address/${h.address}`} target="_blank" rel="noopener noreferrer">
            <span className="rk">{i + 1}</span>
            <span className="m" style={{ gap: 4 }}>
              <span className="addr" style={{ color: me ? 'var(--gold)' : 'var(--text)' }}>{shortAddr(h.address, 6, 4)}</span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {h.tag && <span className={'lp-tag ' + h.tag}>{tagText[h.tag]}</span>}
                {creator && <span className="lp-tag creator">{t('tagCreator')}</span>}
                {me && <span className="lp-tag you">{t('tagYou')}</span>}
              </span>
            </span>
            {desktop && <span className="num" style={{ color: 'var(--text-2)', fontSize: 14 }}>{fmtTokens(h.balance)}</span>}
            <span className="pct" style={{ minWidth: 64, textAlign: 'right' }}>{share < 0.01 ? '<0.01%' : `${share.toFixed(2)}%`}</span>
          </a>
        );
      })}
      <p className="td-holdnote">{t(tk.graduated ? 'holdNoteUni' : 'holdNoteCurve')}</p>
    </div>
  );
}

function About({ tk }: { tk: LaunchToken }) {
  const { t, network } = useApp();
  const meta = parseMeta(tk.metadataURI);
  const link = (a: string) => <a href={`${network.explorer}/address/${a}`} target="_blank" rel="noopener noreferrer">{shortAddr(a)}<Icon name="external" size={14} /></a>;
  return (
    <div className="td-about">
      <p className={meta.description ? '' : 'none'}>{meta.description || t('aboutNoDesc')}</p>
      {[meta.website, meta.x, meta.telegram].filter(Boolean).map((u) => (
        <div className="td-kv" key={u}><span>{new URL(u!).host}</span><a href={u} target="_blank" rel="noopener noreferrer nofollow" style={{ fontFamily: 'inherit' }}>{u!.replace(/^https:\/\//, '').slice(0, 32)}<Icon name="external" size={14} /></a></div>
      ))}
      <div className="td-kv"><span>{t('aboutToken')}</span>{link(tk.token)}</div>
      <div className="td-kv"><span>{t('aboutPool')}</span>{link(tk.pool)}</div>
      <div className="td-kv"><span>{t('aboutCreated')}</span><span className="num">{tk.createdAt ? new Date(tk.createdAt * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</span></div>
    </div>
  );
}
