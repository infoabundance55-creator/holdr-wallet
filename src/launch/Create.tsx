import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatEther, parseUnits, type Address } from 'viem';
import { useBalance, useReadContract } from 'wagmi';
import { copyText, Icon } from '../components/ui';
import { useIsDesktop } from '../lib/media';
import { useNav } from '../nav';
import { tokenUrl } from '../routes';
import { useApp } from '../state';
import { ConnectWallet, useWallet } from '../wallet/ConnectWallet';
import { capAfter, maxFirstBuy, pctSupply, quoteFirstBuy, shareOnX, checkDesc, checkName, checkSymbol, DESC_MAX, FIELD_KEY, normLink, normSymbol, type FieldErr, type LinkKind } from './create';
import { usd as fmtUsd } from './fmt';
import { ImageUpload } from './ImageUpload';
import { erc20Abi } from './abi';
import { ART, Bar, TokenAvatar } from './parts';
import { fmtRaw, withSlippage } from './trade';
import { buildMetaURI } from './tokenImage';
import { useCreator, useLaunchConfig, type Launched } from './useCreate';
import { useLaunch } from './useLaunch';
import { useChainCtx, useTrader } from './useTrade';

type ImgState = 'empty' | 'busy' | 'done' | 'error';

/** "Launch" tab (design v2: M5 / D3): form, live preview, rules, on-chain launch. */
export function Create() {
  const { t, network } = useApp();
  const desktop = useIsDesktop();
  const ix = useLaunch();
  const { chainId, c } = useChainCtx();
  const { address, isConnected, onSiteChain } = useWallet();
  const { fee, curve, paused, error: cfgError } = useLaunchConfig();
  const { st, create, busy, reset } = useCreator(ix);
  const { faucet, busy: fauceting } = useTrader(ix);
  const usdgBal = useReadContract({ chainId, address: c?.usdg as Address | undefined, abi: erc20Abi, functionName: 'balanceOf', args: address ? [address] : undefined, query: { enabled: !!address && !!c, refetchInterval: 15_000 } });
  const [firstRaw, setFirstRaw] = useState('');
  const eth = useBalance({ chainId, address, query: { enabled: !!address && !!c, refetchInterval: 15_000 } });

  const [name, setName] = useState('');
  const [sym, setSym] = useState('');
  const [desc, setDesc] = useState('');
  const [links, setLinks] = useState<Record<LinkKind, string>>({ x: '', telegram: '', website: '' });
  const [image, setImage] = useState<string>();
  const [imgState, setImgState] = useState<ImgState>('empty');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [tried, setTried] = useState(false);
  const onImgState = useCallback((s: ImgState) => setImgState(s), []);

  const urls = useMemo(() => ({
    x: normLink('x', links.x), telegram: normLink('telegram', links.telegram), website: normLink('website', links.website),
  }), [links]);
  const errs: Partial<Record<string, FieldErr>> = {
    name: checkName(name) ?? undefined,
    sym: checkSymbol(sym) ?? undefined,
    desc: checkDesc(desc) ?? undefined,
    x: urls.x === null ? 'linkBad' : undefined,
    telegram: urls.telegram === null ? 'linkBad' : undefined,
    website: urls.website === null ? 'linkBad' : undefined,
  };
  const valid = Object.values(errs).every((e) => !e);
  const show = (k: string) => (tried || touched[k]) && errs[k] ? errs[k] : undefined;
  const touch = (k: string) => () => setTouched((s) => ({ ...s, [k]: true }));

  const metaURI = useMemo(() => buildMetaURI({
    description: desc, image, x: urls.x ?? undefined, telegram: urls.telegram ?? undefined, website: urls.website ?? undefined,
  }), [desc, image, urls]);

  if (!c) return <div className="narrow"><div className="page-title"><h1>{t('createTitle')}</h1></div><p className="cr-pad">{t('ceNoNet')}</p></div>;
  if (st.phase === 'done' && st.result) return <LaunchedScreen r={st.result} onAgain={reset} />;

  const ethLow = fee != null && eth.data != null && eth.data.value < fee;
  const feeEth = fee != null ? formatEther(fee) : '…';
  const openCap = curve ? capAfter(curve, 0n, 0n) : null;
  const symShown = sym || 'TICKER';

  // Creator's first buy: same tx as the launch, no surcharge, capped at firstBuyMaxTokens (≈5%).
  let firstBuy = 0n;
  try { firstBuy = firstRaw ? parseUnits(firstRaw, 6) : 0n; } catch { firstBuy = -1n; }
  const maxBuy = curve ? maxFirstBuy(curve) : 0n;
  const fq = curve && firstBuy > 0n ? quoteFirstBuy(curve, firstBuy) : null;
  const firstOver = firstBuy > maxBuy && curve != null;
  const usdgLow = firstBuy > 0n && usdgBal.data != null && (usdgBal.data as bigint) < firstBuy;
  const firstErr = firstBuy < 0n ? t('ceFirstBad') : firstOver ? t('ceFirstOver', { n: fmtRaw(maxBuy, 6) }) : usdgLow ? t('ceErrUsdg') : null;
  const capNow = curve ? capAfter(curve, fq?.toCurve ?? 0n, fq?.tokensOut ?? 0n) : null;
  const progNow = curve && fq ? Number(fq.toCurve) / Number(curve.gradThreshold) : 0;
  const payUsdg = firstBuy > 0n ? ` + ${fmtRaw(firstBuy, 6)} USDG` : '';

  let blocker: string | null = null;
  if (paused) blocker = t('ceErrPaused');
  else if (imgState === 'busy') blocker = t('ceImgWait');
  else if (imgState === 'error') blocker = t('ceImgFix');
  else if (ethLow && onSiteChain) blocker = t('ceErrEth');
  else if (firstErr) blocker = firstErr;

  const onLaunch = () => {
    setTried(true);
    if (!valid || blocker || fee == null) return;
    void create({ name: name.trim(), symbol: sym, metadataURI: metaURI, fee, firstBuy: fq ? firstBuy : 0n, minTokensOut: fq ? withSlippage(fq.tokensOut, 50) : 0n, expectTokens: fq?.tokensOut ?? 0n });
  };

  const field = (k: string, label: string, input: React.ReactNode, extra?: React.ReactNode) => (
    <div className="cr-field">
      <div className="cr-lab">{label}{extra}</div>
      {input}
      {show(k) && <span className="cr-err" role="alert">{t(FIELD_KEY[show(k)!])}</span>}
    </div>
  );

  const form = (
    <form className={'cr-form' + (desktop ? ' lp-box' : '')} onSubmit={(e) => { e.preventDefault(); onLaunch(); }} noValidate>
      <div className="cr-top">
        <ImageUpload onChange={setImage} onState={onImgState} disabled={busy} />
      </div>
      <div className="cr-two">
        {field('name', t('ceName'), (
          <input id="cr-name" className={'cr-in' + (show('name') ? ' bad' : '')} value={name} maxLength={64} autoComplete="off"
            placeholder="Gem Season" onChange={(e) => setName(e.target.value)} onBlur={touch('name')} disabled={busy} aria-label={t('ceName')} />
        ))}
        {field('sym', t('ceSymbol'), (
          <div className={'cr-in cr-sym' + (show('sym') ? ' bad' : '')}>
            <span aria-hidden="true">$</span>
            <input value={sym} maxLength={12} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="GEMS"
              onChange={(e) => setSym(normSymbol(e.target.value))} onBlur={touch('sym')} disabled={busy} aria-label={t('ceSymbol')} />
          </div>
        ))}
      </div>
      {field('desc', t('ceDesc'), (
        <textarea className={'cr-in cr-ta' + (show('desc') ? ' bad' : '')} rows={3} value={desc} placeholder={t('ceDescPh')}
          onChange={(e) => setDesc(e.target.value)} onBlur={touch('desc')} disabled={busy} aria-label={t('ceDesc')} />
      ), <span className={'cr-count' + (errs.desc ? ' bad' : '')}>{[...desc.trim()].length} / {DESC_MAX}</span>)}
      <fieldset className="cr-links">
        <legend className="cr-lab">{t('ceLinks')} <span className="cr-opt">· {t('ceOptional')}</span></legend>
        {([['x', 'X', 'x.com/yourtoken', 'xlogo'], ['telegram', 'Telegram', 't.me/yourgroup', 'send'], ['website', t('ceWebsite'), 'yourtoken.xyz', 'globe']] as const).map(([k, label, ph]) => (
          <div key={k} className="cr-field">
            <label className="cr-sub" htmlFor={'cr-' + k}>{label}</label>
            <input id={'cr-' + k} className={'cr-in' + (show(k) ? ' bad' : '')} value={links[k]} placeholder={ph} autoComplete="off" spellCheck={false}
              inputMode="url" onChange={(e) => setLinks((s) => ({ ...s, [k]: e.target.value }))} onBlur={touch(k)} disabled={busy} />
            {show(k) && <span className="cr-err" role="alert">{t('ceLinkBad')}</span>}
          </div>
        ))}
      </fieldset>
      <section className="cr-first" aria-labelledby="cr-first-l">
        <div className="cr-lab"><label id="cr-first-l" htmlFor="cr-first">{t('ceFirst')}</label><span className="cr-opt">{t('ceFirstMax', { n: curve ? fmtRaw(maxBuy, 6) : '…' })}</span></div>
        <div className={'cr-in cr-amt' + (firstErr ? ' bad' : '')}>
          <input id="cr-first" inputMode="decimal" placeholder="0" value={firstRaw} disabled={busy} autoComplete="off"
            onChange={(e) => setFirstRaw(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))} />
          <span>USDG</span>
        </div>
        <div className="tp-quick" role="group" aria-label={t('ceFirst')}>
          {(['0', '50', '100', 'max'] as const).map((v) => {
            const val = v === 'max' ? (curve ? fmtRaw(maxBuy, 6).replace(/,/g, '') : '') : v === '0' ? '' : v;
            return <button type="button" key={v} aria-pressed={firstRaw === val} disabled={busy || (v === 'max' && !curve)} onClick={() => setFirstRaw(val)}>{v === 'max' ? t('ceMax') : v}</button>;
          })}
        </div>
        {fq && <div className="cr-pay"><span>{t('ceFirstGet')}</span><b className="num">{fmtRaw(fq.tokensOut, 18, true)} {symShown} · {pctSupply(fq.tokensOut).toFixed(2)}%</b></div>}
        {firstErr && <span className="cr-err" role="alert">{firstErr}</span>}
        {usdgLow && c.usdgFaucet && <button type="button" className="cr-link" onClick={() => faucet()} disabled={fauceting}>{fauceting ? '…' : t('getUsdg')}</button>}
        {address && usdgBal.data != null && <span className="cr-note">{t('ceUsdgBal', { n: fmtRaw(usdgBal.data as bigint, 6) })}</span>}
        <span className="cr-note">{t('ceFirstNote')}</span>
      </section>
    </form>
  );

  const preview = (
    <section className="cr-preview" aria-label={t('cePreview')}>
      <span className="kicker">{t('cePreview')}</span>
      <div className="cr-card">
        <div className="cr-card-top">
          <TokenAvatar address="0x0000000000000000000000000000000000000000" symbol={symShown} uri={metaURI} size={desktop ? 52 : 44} />
          <div className="cr-card-id">
            <div><b>{name.trim() || t('ceNamePh')}</b> <span className="dim">${symShown}</span> <span className="lp-pill new">NEW</span></div>
            <span className="dim">{t('ceJustNow')}</span>
          </div>
        </div>
        {desc.trim() && <p className="cr-card-desc">{desc.trim()}</p>}
        <div className="cr-kv"><span>MARKET CAP</span><b className="num">{capNow != null ? fmtUsd(capNow) : '—'}</b></div>
        <div className="cr-bar"><Bar value={progNow} tone="grey" /><span className="num">{(progNow * 100).toFixed(progNow > 0 && progNow < 0.1 ? 1 : 0)}%</span></div>
      </div>
    </section>
  );

  const rules = curve && (
    <section className="lp-box cr-rules" aria-label={t('rulesTitle')}>
      <span className="kicker">{t('ceRulesKicker')}</span>
      <dl>
        <div><dt>{t('ceRFee')}</dt><dd>{feeEth} ETH + gas</dd></div>
        <div><dt>{t('ceRSupply')}</dt><dd>{t('ceRSupplyV')}</dd></div>
        <div><dt>{t('ceROpen')}</dt><dd>≈ {openCap != null ? fmtUsd(openCap) : '—'}</dd></div>
        <div><dt>{t('ceRGrad')}</dt><dd>{t('ceRGradV', { n: (Number(curve.gradThreshold) / 1e6).toLocaleString('en-US') })}</dd></div>
        <div className="gold"><dt>{t('ceRTrade')}</dt><dd>{t('ceRTradeV', { f: curve.feeBps / 100, s: curve.creatorShareBps / 100 })}</dd></div>
        <div><dt>{t('ceRAtGrad')}</dt><dd>{t('ceRAtGradV')}</dd></div>
        <div><dt>{t('ceRTax')}</dt><dd>{t('ceRTaxV')}</dd></div>
        <div><dt>{t('ceRSnipe')}</dt><dd>{t('ceRSnipeV')}</dd></div>
      </dl>
    </section>
  );

  const label = !onSiteChain ? t('switchTo') : (sym ? t('ceLaunchBtn', { sym }) : t('createTitle'));
  const submit = (
    <section className="cr-go">
      <div className="cr-pay"><span>{t('cePayNow')}</span><b className="num">{feeEth} ETH{payUsdg} + gas</b></div>
      {ethLow && onSiteChain && (
        <div className="tp-warn"><Icon name="info" size={16} /><span>{t('ceEthLow', { n: feeEth })} {network.faucet && <a href={network.faucet} target="_blank" rel="noopener noreferrer">{t('getEth')} ↗</a>}</span></div>
      )}
      {paused && <div className="tp-warn bad"><Icon name="warn" size={16} /><span>{t('ceErrPaused')}</span></div>}
      {cfgError && <div className="tp-warn bad"><Icon name="warn" size={16} /><span>{t('ceCfgErr')}</span></div>}
      {!isConnected ? (
        <div className="tp-connect"><ConnectWallet /></div>
      ) : (
        <button className={'tp-go gold'} onClick={onLaunch} disabled={busy || fee == null || (!!blocker && onSiteChain) || paused}>
          {busy && <span className="spin" aria-hidden="true" />}{label}
        </button>
      )}
      {tried && !valid && <span className="cr-err center" role="alert">{t('ceFixFields')}</span>}
      {blocker && onSiteChain && isConnected && !paused && !ethLow && !firstErr && <span className="cr-note center">{blocker}</span>}
      {status()}
      <span className="cr-note center">{t('ceFinal')}</span>
    </section>
  );

  return (
    <div className={'cr' + (desktop ? ' desk lp-wrap' : '')}>
      <section className="cr-hero">
        <div>
          <span className="kicker gold">{t('ceKicker')}</span>
          <h1>{t('createTitle')}</h1>
          <p>{t('ceLede')}</p>
        </div>
        <img src={ART.frog} alt="" />
      </section>
      {desktop ? (
        <div className="cr-cols">
          {form}
          <aside className="cr-side">{preview}{rules}{submit}</aside>
        </div>
      ) : (
        <div className="cr-stack">{form}{preview}{rules}{submit}</div>
      )}
    </div>
  );

  function status() {
    const link = st.hash ? `${network.explorer}/tx/${st.hash}` : undefined;
    if (st.phase === 'idle' || st.phase === 'done') return null;
    if (st.phase === 'error') {
      return (
        <div className="tp-status bad" role="alert">
          <Icon name="warn" size={22} color="#FF6464" />
          <span className="t"><b>{t('ceFailed')}</b>{st.error && st.error.key !== 'txFailed' && <span>{t(st.error.key, st.error.vars)}</span>}</span>
          {link && <a href={link} target="_blank" rel="noopener noreferrer">{t('details')}</a>}
        </div>
      );
    }
    const title = st.phase === 'approve' ? t('stApprove', { sym: 'USDG' }) : st.phase === 'pending' ? t('ceStPending') : st.phase === 'switch' ? t('switchTo') : t('stConfirm');
    return (
      <div className="tp-status" role="status">
        <span className="ring" aria-hidden="true" />
        <span className="t"><b>{title}</b><span>{st.phase === 'approve' ? t('stApproveSub') : `$${sym} · ${feeEth} ETH`}</span></span>
        {link && st.phase === 'pending' && <a href={link} target="_blank" rel="noopener noreferrer">{t('details')}</a>}
      </div>
    );
  }
}

/** Shown after a successful launch (design v2 M6). */
function LaunchedScreen({ r, onAgain }: { r: Launched; onAgain: () => void }) {
  const { t, network, toast } = useApp();
  const nav = useNav();
  const [copied, setCopied] = useState(false);
  const link = tokenUrl(r.token);
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const short = `${r.token.slice(0, 6)}…${r.token.slice(-4)}`;
  const copy = async () => {
    if (await copyText(r.token)) { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
  };
  return (
    <div className="narrow cr-done">
      <div className="cr-done-art" aria-hidden="true">
        <span className="disc" />
        <img className="coin c1" src={ART.coin} alt="" />
        <img className="coin c2" src={ART.coin} alt="" />
        <img className="coin c3" src={ART.coin} alt="" />
        <img className="hero" src={ART.frog} alt="" />
        <span className="tok"><TokenAvatar address={r.token} symbol={r.symbol} uri={r.metadataURI} size={72} /></span>
      </div>
      <span className="kicker up">{t('ceLiveKicker')}</span>
      <h1>{t('ceLive', { sym: r.symbol })}</h1>
      <p>{t('ceLiveSub')}</p>
      {r.firstTokens > 0n && <p className="cr-note">{t('ceLiveFirst', { amt: fmtRaw(r.firstTokens, 18, true), sym: r.symbol })}</p>}
      <button className="cr-ca" onClick={copy} aria-label={`${t('copyAddress')} ${r.token}`}><span className="num">{short}</span><Icon name={copied ? 'check' : 'copy'} size={14} /></button>
      <button className="cr-ca cr-link" onClick={async () => { if (await copyText(link)) toast(t('linkCopied')); }} aria-label={t('copyLink')}>
        <Icon name="share" size={14} /><span className="num">{link.replace(/^https?:\/\//, '').replace(r.token, short)}</span>
      </button>
      <div className="cr-pts"><img src={ART.coin} alt="" /><span>{t('ceLivePts')}</span></div>
      <div className="cr-done-acts">
        <a className="tp-go gold" href={shareOnX(r.symbol, r.token, window.location.origin)} target="_blank" rel="noopener noreferrer">{t('ceShareX')}</a>
        <button className="tp-go cr-ghost" onClick={() => nav.push({ name: 'token', token: r.token })}>{t('ceGoToken')}</button>
        <a className="cr-note" href={`${network.explorer}/tx/${r.hash}`} target="_blank" rel="noopener noreferrer">{t('viewTx')}</a>
        <button className="cr-again" onClick={onAgain}>{t('ceAgain')}</button>
      </div>
    </div>
  );
}
