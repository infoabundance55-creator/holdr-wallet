import { useEffect, useMemo, useState } from 'react';
import { useAccount, useBalance, useDisconnect, useReadContract } from 'wagmi';
import type { Address } from 'viem';
import { Choice, copyText, Icon, Sheet } from '../components/ui';
import { shortAddr } from '../lib/format';
import { useIsDesktop } from '../lib/media';
import { loadVault } from '../lib/vault';
import { useNav } from '../nav';
import { useApp } from '../state';
import { ConnectWallet, useWallet } from '../wallet/ConnectWallet';
import { HAS_WALLETCONNECT } from '../wallet/wagmi';
import { NetworkSheet } from '../screens/Tabs';
import { erc20Abi } from './abi';
import { tokens as fmtTokens, usd } from './fmt';
import { creatorEarned, marketCap, progress, type LaunchToken } from './math';
import { ago, ART, Bar, TokenAvatar } from './parts';
import { activity, daysToNext, holdings, holdMultiplier, launchedBy, type Activity, type Holding } from './portfolio';
import { fmtRaw } from './trade';
import { feesTokens, feesUsdg, hasFees, useClaimFees, useCreatorFees, type CreatorFees } from './useFees';
import { useLaunch } from './useLaunch';
import { useChainCtx, useTrader } from './useTrade';
import './launch.css';

type T = ReturnType<typeof useApp>['t'];
const ACT_PAGE = 10;

/** "Me": wallet, holdings (P&L, hold-day boost), tokens I launched (claim fees), activity. Points and characters are "coming soon". */
export function Me() {
  const { t } = useApp();
  const nav = useNav();
  const desktop = useIsDesktop();
  const ix = useLaunch();
  const { address, isConnected } = useWallet();
  const legacy = loadVault();
  const now = Math.max(Math.floor(Date.now() / 1000), ix?.latestTime ?? 0);
  const ready = ix?.status === 'ready';

  const list = ix ? ix.list() : [];
  const ver = ix?.version ?? 0;
  const data = useMemo(() => {
    if (!address || !ix) return null;
    return { hold: holdings(list, address, now), mine: launchedBy(list, address), acts: activity(list, ix.claims, address) };
    // `ver` changes whenever the indexer has new events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, ix, ver, Math.floor(now / 60)]);

  const legacyRow = legacy && (
    <button className="set-row legacy" onClick={() => nav.push({ name: 'legacy' })}>
      <Icon name="warn" size={20} color="#FFE2A0" />
      <span style={{ flex: 1 }}>{t('legacyRow')}</span>
      <Icon name="right" size={18} color="#FFE2A0" />
    </button>
  );

  if (!isConnected || !address) {
    return (
      <div className={'me' + (desktop ? ' desk lp-wrap' : '')}>
        <div className="page-title"><h1>{t('meTitle')}</h1></div>
        <div className="me-col">
          {legacyRow}
          <section className="lp-box me-connect">
            <img src={ART.anon} alt="" />
            <h2>{t('meConnectTitle')}</h2>
            <p>{t('meConnectSub')}</p>
            <ConnectWallet />
            {!HAS_WALLETCONNECT && <span className="small muted">{t('wcMissing')}</span>}
          </section>
          <PointsSoon />
          <CharsSoon />
          <Settings />
        </div>
      </div>
    );
  }

  const loading = !ready && !data?.hold.length;
  const hold = data?.hold ?? [];
  const mine = data?.mine ?? [];
  const acts = data?.acts ?? [];
  const total = hold.reduce((s, h) => s + h.value, 0);

  const main = (
    <>
      <Holdings hold={hold} loading={loading} desktop={desktop} t={t} />
      <Launched mine={mine} ix={ix} now={now} desktop={desktop} />
      {!desktop && <><PointsSoon /><CharsSoon /></>}
      <ActivityList acts={acts} loading={loading} now={now} />
    </>
  );

  return (
    <div className={'me' + (desktop ? ' desk lp-wrap' : '')}>
      <div className="page-title"><h1>{t('meTitle')}</h1></div>
      {desktop ? (
        <>
          {legacyRow && <div style={{ marginBottom: 16 }}>{legacyRow}</div>}
          <WalletCard address={address} total={total} ix={ix} desktop />
          <div className="me-cols">
            <div className="me-main">{main}</div>
            <aside className="me-aside"><PointsSoon /><CharsSoon /><Settings /></aside>
          </div>
        </>
      ) : (
        <div className="me-col">
          {legacyRow}
          <WalletCard address={address} total={total} ix={ix} />
          {main}
          <Settings />
        </div>
      )}
    </div>
  );
}

function WalletCard({ address, total, ix, desktop }: { address: Address; total: number; ix: ReturnType<typeof useLaunch>; desktop?: boolean }) {
  const { t, network, toast } = useApp();
  const { chainId, c } = useChainCtx();
  const { connector } = useAccount();
  const { disconnect } = useDisconnect();
  const opts = { enabled: !!c, refetchInterval: 15_000 };
  const usdg = useReadContract({ chainId, address: c?.usdg as Address | undefined, abi: erc20Abi, functionName: 'balanceOf', args: [address], query: opts });
  const eth = useBalance({ chainId, address, query: opts });
  const { tx, faucet, busy } = useTrader(ix);

  useEffect(() => {
    if (tx.phase === 'done' && tx.kind === 'faucet') toast(t('stFaucet', { n: '1,000' }));
    if (tx.phase === 'error' && tx.error) toast(t(tx.error.key, tx.error.vars));
  }, [tx.phase, tx.kind, tx.error, toast, t]);

  const ethN = eth.data ? Number(eth.data.value) / 1e18 : null;
  return (
    <section className={'me-wallet' + (desktop ? ' desk' : '')} aria-label={t('connectedWallet')}>
      <div className="me-id">
        <span className="me-av" aria-hidden="true">{address.slice(0, 4)}</span>
        <div className="me-addr">
          <b className="mono">{shortAddr(address)}</b>
          <span><i className="dot" aria-hidden="true" />{network.name}{connector?.name ? ` · ${connector.name}` : ''}</span>
        </div>
        <button className="td-iconbtn" aria-label={t('copyAddress')} onClick={async () => { if (await copyText(address)) toast(t('copied')); }}><Icon name="copy" size={18} /></button>
        <a className="td-iconbtn" aria-label={t('viewExplorer')} href={`${network.explorer}/address/${address}`} target="_blank" rel="noopener noreferrer"><Icon name="external" size={18} /></a>
      </div>
      <dl className="me-stats">
        <div><dt>{t('meHoldVal')}</dt><dd>{usd(total)}</dd></div>
        <div><dt>{network.id === 'testnet' ? t('meUsdg') : 'USDG'}</dt><dd>{usdg.data != null ? fmtRaw(usdg.data as bigint, 6) : '—'}</dd></div>
        <div><dt>{t('meEth')}</dt><dd>{ethN != null ? ethN.toLocaleString('en-US', { maximumFractionDigits: ethN >= 100 ? 0 : 4 }) : '—'}</dd></div>
      </dl>
      <div className="me-wbtns">
        {c?.usdgFaucet && <button className="me-faucet" onClick={() => faucet()} disabled={busy}><img src={ART.coin} alt="" />{busy ? t('stConfirm') : t('getUsdg')}</button>}
        {desktop && <button className="me-ghost" onClick={() => { disconnect(); toast(t('disconnected')); }}>{t('disconnect')}</button>}
      </div>
    </section>
  );
}

function boostLine(t: T, day: number): string {
  if (day <= 0) return t('holdTomorrow');
  const n = daysToNext(day);
  return n === 0 ? t('holdMax') : day >= 7 ? t('holdNext2', { n }) : t('holdNext15', { n });
}

function Pnl({ h, compact }: { h: Holding; compact?: boolean }) {
  const { t } = useApp();
  if (h.pnl == null) return <span className="lp-flat small">{t('pnlNone')}</span>;
  const up = h.pnl >= 0.005, down = h.pnl <= -0.005;
  const cls = up ? 'lp-up' : down ? 'lp-down' : 'lp-flat';
  const arrow = up ? '▲ ' : down ? '▼ ' : '';
  const pctS = h.pnlPct == null ? '' : `${h.pnlPct >= 0 ? '+' : '−'}${Math.abs(h.pnlPct).toFixed(1)}%`;
  return <span className={cls}>{arrow}{compact ? pctS : `${h.pnl >= 0 ? '+' : '−'}${usd(Math.abs(h.pnl))} · ${pctS}`}</span>;
}

function Ticks({ day }: { day: number }) {
  return (
    <div className="me-ticks" aria-hidden="true">
      {Array.from({ length: 30 }, (_, i) => {
        const d = i + 1;
        return <i key={d} className={d > day ? '' : d >= 30 ? 'g2' : d >= 7 ? 'g1' : 'on'} />;
      })}
    </div>
  );
}

function Holdings({ hold, loading, desktop, t }: { hold: Holding[]; loading: boolean; desktop: boolean; t: T }) {
  const nav = useNav();
  const open = (tk: LaunchToken) => nav.push({ name: 'token', token: tk.token });
  return (
    <section className="me-sec" aria-label={t('meHoldings')}>
      <div className="me-head"><h2>{t('meHoldings')}</h2><span>{desktop ? t('meHoldReset') : t('meHoldingsSub')}</span></div>
      {loading ? <div className="lp-skel" aria-busy="true" aria-label={t('meLoading')}><i /><i /></div>
        : !hold.length ? (
          <div className="lp-state"><img src={ART.bull} alt="" /><div className="t"><span>{t('holdEmpty')}</span><button className="gold-btn" onClick={() => nav.tab('discover')}>{t('browseTokens')}</button></div></div>
        ) : desktop ? (
          <div className="lp-tablebox">
            <table className="lp-table me-table">
              <thead><tr><th>{t('thToken')}</th><th>{t('thAmount')}</th><th>{t('thValue')}</th><th>{t('thPnl')}</th><th>{t('thBoost')}</th></tr></thead>
              <tbody>
                {hold.map((h) => {
                  const m = holdMultiplier(h.day);
                  return (
                    <tr key={h.tk.token}>
                      <td><button className="lp-cell" onClick={() => open(h.tk)}><TokenAvatar address={h.tk.token} symbol={h.tk.symbol} uri={h.tk.metadataURI} size={36} /><span className="nm"><b>{h.tk.symbol}</b></span></button></td>
                      <td>{fmtTokens(h.amount)}</td>
                      <td><b>{usd(h.value)}</b></td>
                      <td><Pnl h={h} compact /></td>
                      <td>
                        <span className="me-boost">
                          <span className={'me-mult m' + String(m).replace('.', '')}>×{m}</span>
                          <span className="d">{h.day > 0 ? t('holdDayN', { n: h.day }) : '—'}</span>
                          <span className="n">{boostLine(t, h.day)}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="me-list">
            {hold.map((h) => {
              const m = holdMultiplier(h.day);
              return (
                <button key={h.tk.token} className="me-hold" onClick={() => open(h.tk)}>
                  <div className="r1">
                    <TokenAvatar address={h.tk.token} symbol={h.tk.symbol} uri={h.tk.metadataURI} size={40} />
                    <div className="nm"><b>{h.tk.symbol}</b><span>{fmtTokens(h.amount)}</span></div>
                    <div className="v"><b>{usd(h.value)}</b><Pnl h={h} /></div>
                  </div>
                  <div className="r2">
                    <span className={'me-mult m' + String(m).replace('.', '')}>{t('holdBoost', { m })}</span>
                    <span>{h.day > 0 ? `${t('holdDayN', { n: h.day })} · ` : ''}{boostLine(t, h.day)}</span>
                  </div>
                  <Ticks day={h.day} />
                </button>
              );
            })}
            <p className="me-note">{t('meHoldReset')}</p>
          </div>
        )}
    </section>
  );
}

function Launched({ mine, ix, now, desktop }: { mine: LaunchToken[]; ix: ReturnType<typeof useLaunch>; now: number; desktop: boolean }) {
  const { t, toast, network } = useApp();
  const nav = useNav();
  const fees = useCreatorFees(mine);
  const { st, claim, claimLocker, busy } = useClaimFees(ix);

  useEffect(() => {
    if (st.phase === 'done') toast(t('claimDone'));
    if (st.phase === 'error' && st.error) toast(t(st.error.key, st.error.vars));
  }, [st.phase, st.error, toast, t]);

  return (
    <section className="me-sec" aria-label={t('meLaunched')}>
      <div className="me-head"><h2>{t('meLaunched')}</h2></div>
      {!mine.length ? (
        <div className="lp-state"><img src={ART.frog} alt="" /><div className="t"><span>{t('launchedEmpty')}</span><button className="gold-btn" onClick={() => nav.tab('create')}>{t('launchToken')}</button></div></div>
      ) : (
        <div className="me-list">
          {fees.data && fees.data.lockerUsdg > 0n && (
            <div className="me-launch">
              <div className="me-fees">
                <div className="f"><span className="k">{t('lockerFees')}</span><b>{fmtRaw(fees.data.lockerUsdg, 6)} USDG</b><span className="s">{t('lockerFeesSub')}</span></div>
                <button className="gold-btn" disabled={busy} onClick={claimLocker}>{st.target === 'locker' && busy ? '…' : t('claim')}</button>
              </div>
            </div>
          )}
          {mine.map((tk) => <LaunchCard key={tk.token} tk={tk} now={now} fees={fees.data} feesLoading={fees.isLoading} desktop={desktop}
            claimState={st.target === tk.token.toLowerCase() ? st : undefined} busy={busy} onClaim={() => { const f = fees.data?.byToken.get(tk.token.toLowerCase()); if (f) claim(tk, f); }} explorer={network.explorer} />)}
        </div>
      )}
    </section>
  );
}

function LaunchCard({ tk, now, fees, feesLoading, desktop, claimState, busy, onClaim, explorer }: {
  tk: LaunchToken; now: number; fees?: CreatorFees; feesLoading: boolean; desktop: boolean;
  claimState?: ReturnType<typeof useClaimFees>['st']; busy: boolean; onClaim: () => void; explorer: string;
}) {
  const { t } = useApp();
  const nav = useNav();
  const f = fees?.byToken.get(tk.token.toLowerCase());
  const u = feesUsdg(f), tok = feesTokens(f);
  const p = progress(tk);
  const status = claimState && (claimState.phase === 'confirm' || claimState.phase === 'switch')
    ? t('claimStep', { i: claimState.step ?? 1, n: claimState.steps ?? 1 })
    : claimState?.phase === 'pending' ? t('claimPending', { i: claimState.step ?? 1, n: claimState.steps ?? 1 }) : null;
  return (
    <div className={'me-launch' + (desktop ? ' desk' : '')}>
      <button className="me-lhead" onClick={() => nav.push({ name: 'token', token: tk.token })}>
        <TokenAvatar address={tk.token} symbol={tk.symbol} uri={tk.metadataURI} size={40} />
        <div className="nm">
          <b>{tk.name} <span>${tk.symbol}</span></b>
          <span>{ago(t, tk.createdAt, now, true)} · {t('fMcap')} {usd(marketCap(tk))}</span>
        </div>
        {tk.graduated ? <span className="lp-pill grad">{t('stGraduated')}</span> : <span className="lp-pill curve">{t('onCurve')} · {(p * 100).toFixed(1)}%</span>}
      </button>
      {!tk.graduated && <Bar value={p} label={t('gradProgress')} />}
      <div className="me-fees">
        <div className="f">
          <span className="k">{t('feesToClaim')}</span>
          <b className={u > 0n || tok > 0n ? '' : 'none'}>{feesLoading && !f ? '…' : u > 0n || tok > 0n ? `${fmtRaw(u, 6)} USDG` : t('noFees')}</b>
          {tok > 0n && <span className="s">{t('feesPlusTok', { amt: fmtRaw(tok, 18, true), sym: tk.symbol })}</span>}
          <span className="s">{t('feesEarned', { n: creatorEarned(tk).toLocaleString('en-US', { maximumFractionDigits: 2 }) })}</span>
        </div>
        <button className="gold-btn" disabled={busy || !hasFees(f)} onClick={onClaim}>{claimState && busy ? '…' : t('claim')}</button>
      </div>
      {status && <p className="me-claimst" role="status">{status}</p>}
      {claimState?.phase === 'error' && claimState.hash && <a className="me-claimst" href={`${explorer}/tx/${claimState.hash}`} target="_blank" rel="noopener noreferrer">{t('txFailed')} · {t('details')}</a>}
    </div>
  );
}

function PointsSoon() {
  const { t } = useApp();
  return (
    <section className="me-soon" aria-label={t('mePoints')}>
      <img src={ART.coin} alt="" className="coin" />
      <div className="t">
        <span className="lp-pill warn">{t('comingSoon')}</span>
        <b>{t('mePoints')}</b>
        <span>{t('mePointsSub')}</span>
      </div>
    </section>
  );
}

function CharsSoon() {
  const { t } = useApp();
  const chars: [string, string, Parameters<T>[0]][] = [
    ['Degen Raccoon', ART.raccoon, 'boostTrade'], ['Moon Frog', ART.frog, 'boostLaunch'],
    ['Laser Bull', ART.bull, 'boostHold'], ['The Anon', ART.anon, 'boostAll'],
  ];
  return (
    <section className="me-chars" aria-label={t('meChars')}>
      <div className="h"><b>{t('meChars')}</b><span className="lp-pill warn">{t('comingSoon')}</span></div>
      <div className="g">
        {chars.map(([name, img, k]) => (
          <div key={name}><img src={img} alt={name} /><span>{t(k)}</span></div>
        ))}
      </div>
      <p>{t('meCharsSub')}</p>
    </section>
  );
}

function actText(t: T, a: Activity): string {
  switch (a.kind) {
    case 'buy': return t('actBuy', { amt: fmtTokens(a.tokens), sym: a.tk.symbol, usdg: fmtRaw(a.usdg, 6) });
    case 'sell': return t('actSell', { amt: fmtTokens(a.tokens), sym: a.tk.symbol, usdg: fmtRaw(a.usdg, 6) });
    case 'launch': return t('actLaunch', { name: a.tk.name, sym: a.tk.symbol });
    case 'claim': return t('actClaim', { amt: a.currency === 'usdg' ? fmtRaw(a.amount, 6) : fmtRaw(a.amount, 18, true), cur: a.currency === 'usdg' ? 'USDG' : a.tk?.symbol ?? '' });
  }
}

function ActivityList({ acts, loading, now }: { acts: Activity[]; loading: boolean; now: number }) {
  const { t, network } = useApp();
  const [n, setN] = useState(ACT_PAGE);
  const tag = { buy: ['b', 'tagBuy'], sell: ['s', 'tagSell'], launch: ['n', 'tagNew'], claim: ['f', 'tagFee'] } as const;
  return (
    <section className="me-sec" aria-label={t('meActivity')}>
      <div className="me-head"><h2>{t('meActivity')}</h2></div>
      <div className="me-acts">
        {loading ? <div className="lp-skel" aria-busy="true" style={{ padding: 0 }}><i style={{ height: 56 }} /></div>
          : !acts.length ? <p className="td-empty">{t('actEmpty')}</p>
            : acts.slice(0, n).map((a) => {
              const [cls, key] = tag[a.kind];
              const body = (
                <>
                  <span className={'me-tag ' + cls}>{t(key)}</span>
                  <span className="m"><b>{actText(t, a)}</b><span>{a.time ? ago(t, a.time, now, true) : ''}</span></span>
                  {a.tx && <span className="ext" aria-hidden="true">↗</span>}
                </>
              );
              const k = a.kind + a.block + ':' + a.logIndex + (a.kind !== 'claim' ? a.tk.token : '');
              return a.tx
                ? <a key={k} className="td-row" href={`${network.explorer}/tx/${a.tx}`} target="_blank" rel="noopener noreferrer" aria-label={`${actText(t, a)} · ${t('viewExplorer')}`}>{body}</a>
                : <div key={k} className="td-row">{body}</div>;
            })}
        {acts.length > n && <button className="lp-more" onClick={() => setN(n + ACT_PAGE)}>{t('loadMore')}</button>}
      </div>
    </section>
  );
}

function Settings() {
  const { t, prefs, setPrefs, network, toast } = useApp();
  const { isConnected } = useWallet();
  const { disconnect } = useDisconnect();
  const [sheet, setSheet] = useState<null | 'lang' | 'net'>(null);
  const close = () => setSheet(null);
  const Row = ({ label, value, onClick }: { label: string; value?: string; onClick: () => void }) => (
    <button className="set-row" onClick={onClick}>
      <span style={{ flex: 1 }}>{label}</span>
      {value && <span className="v">{value}</span>}
      <Icon name="right" size={18} color="#5E6785" />
    </button>
  );
  return (
    <section className="me-settings">
      <h2 className="group-label">{t('secPref')}</h2>
      <div className="group">
        <Row label={t('language')} value={t('langName')} onClick={() => setSheet('lang')} />
        <Row label={t('networkLabel')} value={network.id === 'testnet' ? t('testnetBadge') : 'Mainnet'} onClick={() => setSheet('net')} />
      </div>
      <h2 className="group-label">{t('secAbout')}</h2>
      <div className="group">
        <a className="set-row" href="/docs" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span style={{ flex: 1 }}>{t('helpDocs')}</span><span className="v" aria-hidden="true">↗</span>
        </a>
        <div className="set-row" style={{ cursor: 'default' }}><span style={{ flex: 1 }}>{t('version')}</span><span className="v">0.2.0</span></div>
        {isConnected && <button className="set-row danger" onClick={() => { disconnect(); toast(t('disconnected')); }}><span style={{ flex: 1 }}>{t('disconnect')}</span></button>}
      </div>
      {sheet === 'lang' && (
        <Sheet title={t('language')} onClose={close} closeLabel={t('close')}>
          <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Choice checked={prefs.lang === 'zh'} onPick={() => { setPrefs({ lang: 'zh' }); close(); }} title="简体中文" sub="Chinese (Simplified)" lang="zh-CN" />
            <Choice checked={prefs.lang === 'en'} onPick={() => { setPrefs({ lang: 'en' }); close(); }} title="English" sub="英语" lang="en" />
          </div>
        </Sheet>
      )}
      {sheet === 'net' && <NetworkSheet onClose={close} />}
    </section>
  );
}
