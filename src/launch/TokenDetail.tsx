import { useState } from 'react';
import { Header, Icon, Note } from '../components/ui';
import { shortAddr } from '../lib/format';
import { useNav } from '../nav';
import { useApp } from '../state';
import { useIsDesktop } from '../lib/media';
import { ConnectWallet, useWallet } from '../wallet/ConnectWallet';
import { TOTAL_SUPPLY } from './contracts';
import { pct, price, tokens as fmtTokens, usd, usdgAmount } from './fmt';
import {
  balanceOf, candles, change, currentPrice, holderList, marketCap, pctOfSupply, progress, raisedUsdg,
  thresholdUsdg, top10Pct, totalVolume, volume, type Candle, type LaunchToken,
} from './math';
import { ago, Bar, deltaClass, parseMeta, TokenAvatar } from './parts';
import { useLaunch } from './useLaunch';
import './launch.css';

const RANGES = [['5m', 300], ['1h', 3600], ['4h', 14_400], ['1D', 86_400]] as const;

export function TokenDetail({ token }: { token: string }) {
  const { t, toast } = useApp();
  const nav = useNav();
  const ix = useLaunch();
  const desktop = useIsDesktop();
  const tk = ix?.get(token);

  if (!ix || !tk || !tk.params) {
    const loading = ix && ix.status !== 'ready' && ix.status !== 'error';
    return (
      <div className="screen">
        <Header onBack={nav.pop} backLabel={t('back')} />
        <div style={{ padding: 16 }}>
          {loading ? <div className="empty"><span className="spin" style={{ color: 'var(--indigo)' }} /><span className="muted">{t('loadingTokens')}</span></div>
            : <Note kind="warn" icon="warn">{ix?.status === 'error' ? t('launchError') : t('tokenNotFound')}</Note>}
        </div>
      </div>
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const ch = change(tk, now);
  const soon = () => toast(t('tradeSoon'));

  const id = (
    <>
      <div className="lp-id">
        <TokenAvatar address={tk.token} symbol={tk.symbol} uri={tk.metadataURI} size={desktop ? 72 : 64} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><h1>{tk.name}</h1><span className="lp-pill">${tk.symbol}</span></div>
          <div className="small muted">
            {t('byCreator', { name: shortAddr(tk.creator) })} · {ago(t, tk.createdAt, now, true)}
          </div>
        </div>
      </div>
      <div className="lp-price" aria-label={t('priceLabel')}>
        <span className="p">{price(currentPrice(tk))}</span>
        <span className={'c ' + deltaClass(ch)}>{pct(ch)}</span>
        <span className="small muted">{t('past24h')}</span>
      </div>
    </>
  );

  if (desktop) {
    return (
      <div className="lp-desk-detail">
        <button className="lp-crumb" onClick={nav.pop}><Icon name="back" size={18} />{t('allTokens')}</button>
        <div className="lp-desk-grid">
          <div className="lp-detail" style={{ padding: 0 }}>
            {id}
            <ChartBox tk={tk} now={now} />
            <Stats tk={tk} now={now} exclude={ix.excluded} />
            <section className="lp-box"><Tabs tk={tk} now={now} exclude={ix.excluded} /></section>
          </div>
          <aside className="lp-detail" style={{ padding: 0 }}>
            <TradeBox onTrade={soon} />
            <RoadBox tk={tk} />
            <SafetyBox tk={tk} />
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="lp-dhead">
        <button className="lp-round" aria-label={t('back')} onClick={nav.pop}><Icon name="back" size={22} /></button>
        <span style={{ flex: 1 }} />
        <ConnectWallet compact />
      </header>
      <div className="lp-detail">
        {id}
        <ChartBox tk={tk} now={now} />
        <RoadBox tk={tk} />
        <SafetyBox tk={tk} />
        <Stats tk={tk} now={now} exclude={ix.excluded} />
        <Tabs tk={tk} now={now} exclude={ix.excluded} />
      </div>
      <div className="lp-spacer" />
      <div className="lp-trade">
        <div className="two">
          <button className="b" onClick={soon}>{t('buy')}</button>
          <button className="s" onClick={soon}>{t('sell')}</button>
        </div>
        <span className="hint">{t('tradeSoon')}</span>
      </div>
    </div>
  );
}

/** Desktop trade panel. Buying and selling arrive in stage 2b. */
function TradeBox({ onTrade }: { onTrade: () => void }) {
  const { t } = useApp();
  const { isConnected } = useWallet();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  return (
    <section className="lp-box">
      <div className="lp-seg" role="tablist" aria-label={t('tradeLabel')}>
        <button role="tab" aria-selected={side === 'buy'} className="b" onClick={() => setSide('buy')}>{t('buy')}</button>
        <button role="tab" aria-selected={side === 'sell'} className="s" onClick={() => setSide('sell')}>{t('sell')}</button>
      </div>
      <p className="small muted">{t('tradeSoon')}</p>
      {isConnected
        ? <button className={'lp-big ' + (side === 'buy' ? 'b' : 's')} onClick={onTrade}>{t(side === 'buy' ? 'buy' : 'sell')}</button>
        : <div className="lp-connect-wide"><ConnectWallet /></div>}
    </section>
  );
}

function ChartBox({ tk, now }: { tk: LaunchToken; now: number }) {
  const { t } = useApp();
  const [range, setRange] = useState(1);
  const [label, sec] = RANGES[range];
  const data = candles(tk, sec, now, 36);
  return (
    <section className="lp-box" style={{ gap: 10, paddingBottom: 12 }}>
      {tk.trades.length === 0 ? <div className="lp-chart-empty">{t('chartEmpty')}</div> : <Candles data={data} label={t('chartLabel', { range: label })} />}
      <div className="lp-ranges" role="group">
        {RANGES.map(([l], i) => <button key={l} className="lp-chip" aria-pressed={range === i} onClick={() => setRange(i)}>{l}</button>)}
      </div>
    </section>
  );
}

function Candles({ data, label }: { data: Candle[]; label: string }) {
  const W = 326, H = 180, PAD = 10;
  let lo = Math.min(...data.map((c) => c.l)), hi = Math.max(...data.map((c) => c.h));
  if (hi - lo < hi * 0.002) { hi *= 1.01; lo *= 0.99; }
  const span = hi - lo;
  const y = (v: number) => PAD + (1 - (v - lo) / span) * (H - PAD * 2);
  const slot = W / Math.max(data.length, 1);
  const bw = Math.max(2, Math.min(10, slot * 0.64));
  return (
    <svg className="lp-chart" role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      {[45, 90, 135].map((g) => <line key={g} x1={0} x2={W} y1={g} y2={g} stroke="#E4E2F5" strokeWidth={1} />)}
      {data.map((c, i) => {
        const up = c.c >= c.o;
        const color = up ? '#1FA463' : '#E2523C';
        const x = slot * i + slot / 2;
        const top = y(Math.max(c.o, c.c)), bot = y(Math.min(c.o, c.c));
        return (
          <g key={c.t}>
            <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth={1.5} />
            <rect x={x - bw / 2} y={top} width={bw} height={Math.max(1.5, bot - top)} rx={1} fill={color} />
          </g>
        );
      })}
    </svg>
  );
}

function RoadBox({ tk }: { tk: LaunchToken }) {
  const { t } = useApp();
  const p = progress(tk);
  const raised = raisedUsdg(tk), goal = thresholdUsdg(tk);
  const vol1k = totalVolume(tk) >= 1000;
  return (
    <section className="lp-box">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2>{t('roadTitle')}</h2>
        <span style={{ fontSize: 22, fontWeight: 800, color: tk.graduated ? '#167A46' : 'var(--indigo)' }}>{Math.floor(p * 100)}%</span>
      </div>
      <Bar value={p} height={12} color={tk.graduated ? '#1FA463' : 'var(--indigo)'} label={t('roadTitle')} />
      {tk.graduated ? <p>{t('graduatedBody')}</p> : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
            <span>{t('raised', { a: usdgAmount(raised), b: usdgAmount(goal) })}</span>
            <span>{t('toGo', { n: usdgAmount(Math.max(0, goal - raised)) })}</span>
          </div>
          <p>{t('roadBody', { t: usdgAmount(goal) })}</p>
        </>
      )}
      <div className="lp-miles">
        <Mile on label={t('mLaunched')} />
        <Mile on={vol1k} label={t('mVolume')} />
        <Mile on={tk.graduated} label={t('mGraduated')} />
      </div>
    </section>
  );
}

function Mile({ on, label }: { on?: boolean; label: string }) {
  return (
    <div className={on ? '' : 'off'}>
      <span className={'dot' + (on ? ' on' : '')}>{on && <Icon name="check" size={12} width={3} />}</span>{label}
    </div>
  );
}

function SafetyBox({ tk }: { tk: LaunchToken }) {
  const { t } = useApp();
  const p = tk.params!;
  const creatorPct = pctOfSupply(tk, balanceOf(tk, tk.creator));
  const capPct = (Number(p.firstBuyMaxTokens) / Number(TOTAL_SUPPLY)) * 100;
  const creatorOk = creatorPct <= capPct + 0.05;
  const checks: [boolean, string][] = [
    [true, t('sSupply')],
    [true, t('sTax', { fee: p.feeBps / 100 })],
    [creatorOk, creatorOk ? t('sCreatorOk', { p: creatorPct.toFixed(1), cap: round1(capPct) }) : t('sCreatorHigh', { p: creatorPct.toFixed(1), cap: round1(capPct) })],
    [true, t('sLock')],
    [true, t('sSnipe')],
  ];
  const passed = checks.filter((c) => c[0]).length;
  return (
    <section className="lp-box">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="shield" color="#167A46" />
        <h2>{t('safetyTitle')}</h2>
        <span className={'lp-pill ' + (passed === checks.length ? 'ok' : 'warn')}>{t('passedN', { a: passed, b: checks.length })}</span>
      </div>
      <ul className="lp-checks">
        {checks.map(([ok, text]) => (
          <li key={text}>
            <span className={'ic' + (ok ? '' : ' warn')}><Icon name={ok ? 'check' : 'warn'} size={14} width={3} /></span>
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <p className="small muted">{t('riskNote')}</p>
    </section>
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function Stats({ tk, now, exclude }: { tk: LaunchToken; now: number; exclude: string[] }) {
  const { t } = useApp();
  const { address } = useWallet();
  const mine = address ? balanceOf(tk, address) : 0n;
  const rows: [string, string][] = [
    [t('sMcap'), usd(marketCap(tk))],
    [t('sVol'), usd(volume(tk, now))],
    [t('sHolders'), holderList(tk, exclude).length.toLocaleString('en-US')],
    [t('sTop10'), pct(top10Pct(tk, exclude), false)],
    [t('sCreator'), pct(pctOfSupply(tk, balanceOf(tk, tk.creator)), false)],
    [t('sYou'), mine > 0n ? `${fmtTokens(mine)} ${tk.symbol}` : '0'],
  ];
  return (
    <div className="lp-stats">
      {rows.map(([k, v]) => <div key={k}><span>{k}</span><span>{v}</span></div>)}
    </div>
  );
}

function Tabs({ tk, now, exclude }: { tk: LaunchToken; now: number; exclude: string[] }) {
  const { t } = useApp();
  const [tab, setTab] = useState<'trades' | 'holders' | 'about'>('trades');
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div className="lp-tabs" role="tablist" aria-label={t('tokenTabs')}>
        {(['trades', 'holders', 'about'] as const).map((id) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {t(id === 'trades' ? 'tTrades' : id === 'holders' ? 'tHolders' : 'tAbout')}
          </button>
        ))}
      </div>
      <div className="lp-feed" role="tabpanel">
        {tab === 'trades' && <Trades tk={tk} now={now} />}
        {tab === 'holders' && <Holders tk={tk} exclude={exclude} />}
        {tab === 'about' && <About tk={tk} />}
      </div>
    </section>
  );
}

function Who({ address, tk }: { address: string; tk: LaunchToken }) {
  const { t } = useApp();
  const { address: mine } = useWallet();
  const me = mine && address.toLowerCase() === mine.toLowerCase();
  const creator = address.toLowerCase() === tk.creator.toLowerCase();
  return (
    <b>
      <span className="mono" style={{ fontSize: 13 }}>{shortAddr(address)}</span>
      {me && <span className="lp-tag">{t('youTag')}</span>}
      {creator && <span className="lp-tag">{t('creatorTag')}</span>}
    </b>
  );
}

function Dot({ address }: { address: string }) {
  const hue = parseInt(address.slice(2, 6), 16) % 360;
  return <span className="lp-dot-avatar" aria-hidden="true" style={{ background: `hsl(${hue} 70% 92%)`, color: `hsl(${hue} 60% 30%)` }}>{address.slice(2, 4).toUpperCase()}</span>;
}

function Trades({ tk, now }: { tk: LaunchToken; now: number }) {
  const { t, network } = useApp();
  const list = tk.trades.slice(-30).reverse();
  if (!list.length) return <p className="muted small" style={{ padding: '12px 0' }}>{t('noTrades')}</p>;
  return (
    <>
      {list.map((tr) => (
        <a key={tr.tx + tr.logIndex} className="it" href={`${network.explorer}/tx/${tr.tx}`} target="_blank" rel="noopener noreferrer">
          <Dot address={tr.trader} />
          <span className="who"><Who address={tr.trader} tk={tk} /><span className="sub">{tr.time ? ago(t, tr.time, now, true) : '—'}</span></span>
          <span className="amt">
            <b className={tr.isBuy ? 'lp-up' : 'lp-down'}>{t(tr.isBuy ? 'buyAmt' : 'sellAmt', { usd: '$' + usdgAmount(Number(tr.usdg) / 1e6) })}</b>
            <span className="sub">{fmtTokens(tr.tokens)} {tk.symbol}</span>
          </span>
        </a>
      ))}
    </>
  );
}

function Holders({ tk, exclude }: { tk: LaunchToken; exclude: string[] }) {
  const { t, network } = useApp();
  const list = holderList(tk, exclude).slice(0, 20);
  if (!list.length) return <p className="muted small" style={{ padding: '12px 0' }}>{t('noHolders')}</p>;
  return (
    <>
      {list.map((h, i) => (
        <a key={h.address} className="it" href={`${network.explorer}/address/${h.address}`} target="_blank" rel="noopener noreferrer">
          <span className="sub num" style={{ width: 22, textAlign: 'right' }}>{i + 1}</span>
          <Dot address={h.address} />
          <span className="who"><Who address={h.address} tk={tk} /></span>
          <span className="amt"><b>{pct(pctOfSupply(tk, h.balance), false)}</b><span className="sub">{fmtTokens(h.balance)}</span></span>
        </a>
      ))}
    </>
  );
}

function About({ tk }: { tk: LaunchToken }) {
  const { t, network } = useApp();
  const meta = parseMeta(tk.metadataURI);
  const link = (addr: string) => (
    <a href={`${network.explorer}/address/${addr}`} target="_blank" rel="noopener noreferrer">{shortAddr(addr)}<Icon name="external" size={14} /></a>
  );
  return (
    <>
      <p style={{ margin: '8px 0 12px', fontSize: 15, lineHeight: 1.5, color: meta.description ? 'var(--ink)' : 'var(--muted)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {meta.description || t('aboutNoDesc')}
      </p>
      {[meta.website, meta.x, meta.telegram].filter(Boolean).map((u) => (
        <div className="lp-kv" key={u}><a href={u} target="_blank" rel="noopener noreferrer nofollow" style={{ fontFamily: 'inherit' }}>{new URL(u!).host}<Icon name="external" size={14} /></a></div>
      ))}
      <div className="lp-kv"><span className="muted">{t('aboutToken')}</span>{link(tk.token)}</div>
      <div className="lp-kv"><span className="muted">{t('aboutPool')}</span>{link(tk.pool)}</div>
      <div className="lp-kv"><span className="muted">{t('aboutCreated')}</span><span className="num">{tk.createdAt ? new Date(tk.createdAt * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</span></div>
    </>
  );
}
