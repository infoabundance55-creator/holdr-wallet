import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/ui';
import { parseAmount } from '../lib/format';
import { defaultKV } from '../lib/kv';
import { useApp } from '../state';
import { ConnectWallet, useWallet } from '../wallet/ConnectWallet';
import type { LaunchIndexer } from './chain';
import type { LaunchToken } from './math';
import { ART, TokenAvatar } from './parts';
import {
  DEFAULT_SLIPPAGE, fmtRaw, localDayStart, SLIPPAGE_CHOICES, todayVolume, toInput, tradePoints, withSlippage,
} from './trade';
import { useBalances, useChainCtx, useLimits, useQuote, useTrader, type Side } from './useTrade';

const SLIP_KEY = 'holdr.slippageBps';
const BUY_QUICK = [10, 50, 100, 500];
const SELL_QUICK = [25, 50, 75, 100];

function loadSlip(): number {
  try {
    const n = Number(defaultKV().getItem(SLIP_KEY));
    return n > 0 && n <= 5000 ? n : DEFAULT_SLIPPAGE;
  } catch { return DEFAULT_SLIPPAGE; }
}

function useDebounced<T>(v: T, ms = 350): T {
  const [d, setD] = useState(v);
  useEffect(() => { const id = window.setTimeout(() => setD(v), ms); return () => window.clearTimeout(id); }, [v, ms]);
  return d;
}

/** Buy / sell box: Trade bar on desktop (D2), bottom sheet on phones (M3). */
export function TradePanel({ tk, ix, side, setSide }: { tk: LaunchToken; ix: LaunchIndexer; side: Side; setSide: (s: Side) => void }) {
  const { t, network, toast } = useApp();
  const { c } = useChainCtx();
  const { address, isConnected, onSiteChain } = useWallet();
  const bal = useBalances(tk);
  const { paused, maxBuy } = useLimits();
  const { tx, setTx, trade, faucet, busy, ensureChain } = useTrader(ix);
  const [input, setInput] = useState<Record<Side, string>>({ buy: '', sell: '' });
  const [slip, setSlipState] = useState(loadSlip);
  const [editSlip, setEditSlip] = useState(false);
  const [customSlip, setCustomSlip] = useState('');

  const decimals = side === 'buy' ? 6 : 18;
  const raw = input[side];
  const amount = parseAmount(raw, decimals);
  const debounced = useDebounced(amount);
  const quote = useQuote(tk, side, debounced);
  const q = debounced === amount && amount != null ? quote.data : undefined;
  const quoting = amount != null && (debounced !== amount || quote.isFetching) && !q;

  const balance = side === 'buy' ? bal.usdg : bal.token;
  const sym = tk.symbol;
  const setAmt = (v: string) => { setInput((s) => ({ ...s, [side]: v })); if (tx.phase === 'done' || tx.phase === 'error') setTx({ phase: 'idle' }); };
  const setSlip = (n: number) => { setSlipState(n); try { defaultKV().setItem(SLIP_KEY, String(n)); } catch { /* ignore */ } };

  // Reset the box after a confirmed trade.
  useEffect(() => {
    if (tx.phase === 'done' && tx.kind !== 'faucet') setInput((s) => ({ ...s, [tx.kind as Side]: '' }));
    if (tx.phase === 'done' && tx.result?.side === 'faucet') toast(t('stFaucet', { n: '1,000' }));
  }, [tx.phase, tx.kind, tx.result, t, toast]);

  const now = Math.floor(Date.now() / 1000);
  const points = useMemo(() => {
    if (!q) return 0;
    const before = address ? todayVolume(ix.list(), address, localDayStart(now)) : 0;
    return tradePoints(q.usd, before);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, address, ix.version]);

  const onMax = () => { if (balance != null) setAmt(toInput(side === 'buy' && maxBuy > 0n && balance > maxBuy ? maxBuy : balance, decimals, side === 'buy' ? 2 : 6)); };
  const quick = (n: number) => {
    if (side === 'buy') setAmt(String(n));
    else if (balance != null) setAmt(toInput((balance * BigInt(n)) / 100n, 18, 6));
  };

  const graduated = tk.graduated;
  const noRouter = graduated && !c?.router;
  let label = side === 'buy' ? t('buyAmt2', { amt: q ? fmtRaw(q.out, 18, true) : '', sym }) : t('sellAmt2', { amt: amount ? fmtRaw(amount, 18, true) : '', sym });
  let disabled = false;
  if (noRouter) { label = t('routerMissing'); disabled = true; }
  else if (side === 'buy' && paused && !graduated) { label = t('buyPaused'); disabled = true; }
  else if (amount == null) { label = t('enterAmount'); disabled = true; }
  else if (balance != null && amount > balance) { label = t('notEnough', { sym: side === 'buy' ? 'USDG' : sym }); disabled = true; }
  else if (side === 'buy' && !graduated && maxBuy > 0n && amount > maxBuy) { label = t('overMax', { n: fmtRaw(maxBuy, 6) }); disabled = true; }
  else if (quoting) { label = t('quoting'); disabled = true; }
  else if (quote.isError || !q) { label = t('errQuote'); disabled = true; }
  if (!onSiteChain && isConnected) { label = t('switchToNet', { net: network.name }); disabled = false; }

  const onGo = () => {
    if (!onSiteChain) { ensureChain().then(() => setTx({ phase: 'idle' })).catch(() => setTx({ phase: 'error', error: { key: 'switchRejected' } })); return; }
    if (!q || amount == null) return;
    trade({ tk, side, amount, quote: q, slipBps: slip, points });
  };

  const fee = tk.params ? tk.params.feeBps / 100 : 1;
  const outSym = side === 'buy' ? sym : 'USDG';
  const outDecimals = side === 'buy' ? 18 : 6;
  const noEth = isConnected && bal.eth === 0n;

  return (
    <div className="tp">
      <div className="tp-side" role="group" aria-label={t('tradeLabel')}>
        <button className="b" aria-pressed={side === 'buy'} onClick={() => setSide('buy')}>{t('buy')}</button>
        <button className="s" aria-pressed={side === 'sell'} onClick={() => setSide('sell')}>{t('sell')}</button>
      </div>

      <div className="tp-in">
        <div className="lbl">
          <label htmlFor="tp-amt">{side === 'buy' ? t('youPay') : t('youSell')}</label>
          {isConnected && (
            <span>{t('balanceLbl')} <span className="bal">{balance != null ? fmtRaw(balance, decimals) : '—'}</span> · <button onClick={onMax}>{t('maxBtn')}</button></span>
          )}
        </div>
        <div className="row">
          <input id="tp-amt" inputMode="decimal" autoComplete="off" placeholder="0" value={raw}
            onChange={(e) => setAmt(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} />
          {side === 'buy'
            ? <span className="tp-cur"><span className="tp-usdg-ic" aria-hidden="true">$</span><span>USDG</span></span>
            : <span className="tp-cur"><TokenAvatar address={tk.token} symbol={sym} uri={tk.metadataURI} size={18} /><span>{sym}</span></span>}
        </div>
      </div>

      <div className="tp-quick" role="group">
        {(side === 'buy' ? BUY_QUICK : SELL_QUICK).map((n) => {
          const v = side === 'buy' ? String(n) : null;
          return (
            <button key={n} aria-pressed={v != null && raw === v} onClick={() => quick(n)} disabled={side === 'sell' && !balance}>
              {side === 'buy' ? n : `${n}%`}
            </button>
          );
        })}
      </div>

      <div className="tp-out">
        <div className="v">
          <span>{t('youGet')}</span>
          <b className={q ? '' : 'dim'}>{q ? fmtRaw(q.out, outDecimals) : quoting ? '…' : '0'}</b>
        </div>
        {side === 'buy'
          ? <span className="tp-cur"><TokenAvatar address={tk.token} symbol={sym} uri={tk.metadataURI} size={18} /><span>{sym}</span></span>
          : <span className="tp-cur"><span className="tp-usdg-ic" aria-hidden="true">$</span><span>USDG</span></span>}
      </div>

      {q && q.surchargeBps > 0 && (
        <div className="tp-warn"><Icon name="clock" size={16} /><span>{t('snipeNow', { p: (q.surchargeBps / 100).toFixed(q.surchargeBps < 100 ? 2 : 1) })}</span></div>
      )}
      {q?.graduates && (
        <div className="tp-warn"><Icon name="sparkle" size={16} /><span>{t('gradBuyNote', { n: fmtRaw(q.usdgUsed, 6) })}</span></div>
      )}
      {q && q.impact > 5 && (
        <div className="tp-warn bad"><Icon name="warn" size={16} /><span>{t('impactHigh', { p: q.impact.toFixed(2) })}</span></div>
      )}

      <dl className="tp-dl">
        <div><dt>{t('priceImpact')}</dt><dd className={q && q.impact > 5 ? 'bad' : q && q.impact > 2 ? 'warn' : ''}>{q ? `${q.impact < 0.01 ? '<0.01' : q.impact.toFixed(2)}%` : '—'}</dd></div>
        <div><dt>{t('feeLine', { fee })} <small>{t('feeSplit')}</small></dt><dd>{q ? `${q.feeUsdg.toFixed(2)} USDG` : '—'}</dd></div>
        <div>
          <dt id="tp-slip-l">{t('maxSlip')}</dt>
          <dd>
            {editSlip ? (
              <span className="tp-slipbox" role="group" aria-labelledby="tp-slip-l">
                {SLIPPAGE_CHOICES.map((b) => <button key={b} aria-pressed={slip === b} onClick={() => { setSlip(b); setEditSlip(false); }}>{b / 100}%</button>)}
                <label className="sr-only" htmlFor="tp-slip-c">{t('slipCustom')}</label>
                <input id="tp-slip-c" inputMode="decimal" placeholder={t('slipCustom')} value={customSlip}
                  onChange={(e) => setCustomSlip(e.target.value.replace(/[^\d.]/g, ''))}
                  onBlur={() => { const n = Math.round(Number(customSlip) * 100); if (n > 0 && n <= 5000) setSlip(n); setEditSlip(false); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
              </span>
            ) : (
              <button className="tp-slip" onClick={() => setEditSlip(true)} aria-label={`${t('maxSlip')} ${slip / 100}%`}>{slip / 100}% ✎</button>
            )}
          </dd>
        </div>
        <div><dt>{t('minRecv')}</dt><dd>{q ? `${fmtRaw(withSlippage(q.out, slip), outDecimals)} ${outSym}` : '—'}</dd></div>
        <div className="pts" title={t('ptsSoon')}>
          <dt><img src={ART.coin} alt="" />{t('ptsEst')}</dt>
          <dd>{q ? `+${points.toLocaleString('en-US')}` : '—'}</dd>
        </div>
      </dl>

      {noEth && (
        <div className="tp-warn"><Icon name="info" size={16} /><span>{t('noEthNote')} {network.faucet && <a href={network.faucet} target="_blank" rel="noopener noreferrer">{t('getEth')} ↗</a>}</span></div>
      )}

      {!isConnected ? (
        <div className="tp-connect"><ConnectWallet /></div>
      ) : (
        <button className={'tp-go ' + (!onSiteChain ? 'gold' : side === 'buy' ? 'b' : 's')} disabled={busy || disabled} onClick={onGo}>
          {busy && <span className="spin" aria-hidden="true" />}{label}
        </button>
      )}

      {txCard(tk)}

      <div className="tp-foot">
        <span>{network.name}</span>
        {c?.usdgFaucet && isConnected && (
          <button onClick={() => faucet()} disabled={busy}><img src={ART.coin} alt="" />{t('getUsdg')}</button>
        )}
      </div>
    </div>
  );

  function txCard(token: LaunchToken) {
    const link = tx.hash ? `${network.explorer}/tx/${tx.hash}` : undefined;
    if (tx.phase === 'idle') return null;
    if (tx.phase === 'switch' || tx.phase === 'approve' || tx.phase === 'confirm' || tx.phase === 'pending') {
      const title = tx.phase === 'approve' ? t('stApprove', { sym: tx.sym ?? '' }) : tx.phase === 'pending' ? t('stPending') : tx.phase === 'switch' ? t('switchTo') : t('stConfirm');
      const sub = tx.phase === 'approve' ? t('stApproveSub') : tx.kind === 'faucet' ? t('getUsdg') : q && amount != null
        ? (side === 'buy' ? t('buyAmt2', { amt: fmtRaw(q.out, 18), sym: token.symbol }) + ` · ${fmtRaw(q.usdgUsed || amount, 6)} USDG` : t('sellAmt2', { amt: fmtRaw(amount, 18), sym: token.symbol }))
        : '';
      return (
        <div className="tp-status" role="status">
          <span className="ring" aria-hidden="true" />
          <span className="t"><b>{title}</b>{sub && <span>{sub}</span>}</span>
          {link && tx.phase === 'pending' && <a href={link} target="_blank" rel="noopener noreferrer">{t('details')}</a>}
        </div>
      );
    }
    if (tx.phase === 'done' && tx.result) {
      const r = tx.result;
      const title = r.side === 'faucet' ? t('stFaucet', { n: fmtRaw(r.usdg, 6) })
        : r.side === 'buy' ? t('stBought', { amt: fmtRaw(r.tokens, 18), sym: token.symbol })
          : t('stSold', { amt: fmtRaw(r.tokens, 18), sym: token.symbol, usdg: fmtRaw(r.usdg, 6) });
      return (
        <div className="tp-status ok" role="status">
          <Icon name="check" size={22} color="#2EDB82" width={2.5} />
          <span className="t"><b>{title}</b>{r.points > 0 && <span>{t('ptsPending', { n: r.points.toLocaleString('en-US') })}</span>}</span>
          {link && <a href={link} target="_blank" rel="noopener noreferrer">{t('viewTx')}</a>}
        </div>
      );
    }
    return (
      <div className="tp-status bad" role="alert">
        <Icon name="warn" size={22} color="#FF6464" />
        <span className="t"><b>{t('txFailed')}</b>{tx.error && tx.error.key !== 'txFailed' && <span>{t(tx.error.key, tx.error.vars)}</span>}</span>
        {link && <a href={link} target="_blank" rel="noopener noreferrer">{t('details')}</a>}
      </div>
    );
  }
}
