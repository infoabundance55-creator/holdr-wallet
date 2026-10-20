import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Header, Icon, Note } from '../components/ui';
import { checkAddress, formatAmount, parseAmount, shortAddr } from '../lib/format';
import { useBalance } from '../lib/hooks';
import { loadTxs, saveTxs } from '../lib/store';
import { useNav } from '../nav';
import { useApp } from '../state';

interface Fee { gas: bigint; maxFee: bigint }

export function Send() {
  const { t, signer, provider, network } = useApp();
  const nav = useNav();
  const me = signer!.address;
  const { balance } = useBalance(provider, me);
  const [to, setTo] = useState('');
  const [amt, setAmt] = useState('');
  const [step, setStep] = useState<'form' | 'review' | 'done'>('form');
  const [fee, setFee] = useState<Fee | null>(null);
  const [feeErr, setFeeErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [hash, setHash] = useState('');

  const addr = checkAddress(to);
  const value = parseAmount(amt);
  const sym = network.symbol;
  const self = addr.ok && addr.address === me;
  const tooMuch = value != null && balance != null && fee != null && value + fee.gas * fee.maxFee > balance;
  const amtBad = amt.trim() !== '' && value == null;
  const canReview = addr.ok && value != null && !tooMuch && fee != null && !busy;

  // Estimate the network fee whenever the inputs become valid (debounced).
  useEffect(() => {
    setFee(null);
    setFeeErr('');
    if (!addr.ok) return;
    const v = value ?? 0n;
    const timer = window.setTimeout(async () => {
      try {
        const [gas, fd] = await Promise.all([
          provider.estimateGas({ from: me, to: addr.address, value: v }),
          provider.getFeeData(),
        ]);
        const per = fd.maxFeePerGas ?? fd.gasPrice ?? 0n;
        setFee({ gas: (gas * 12n) / 10n, maxFee: per }); // 20% headroom; unused gas is not charged
      } catch (e) {
        setFeeErr((e as { shortMessage?: string }).shortMessage || t('netError'));
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [to, amt, provider]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxFeeWei = fee ? fee.gas * fee.maxFee : null;
  const fillMax = () => {
    if (balance == null || maxFeeWei == null) return;
    const m = balance - maxFeeWei;
    setAmt(m > 0n ? formatAmount(m, 18, 18).replace(/,/g, '') : '0');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (canReview) setStep('review');
  };

  const confirm = async () => {
    if (!addr.ok || value == null || !fee) return;
    setBusy(true);
    setErr('');
    try {
      const tx = await signer!.connect(provider).sendTransaction({ to: addr.address, value, gasLimit: fee.gas });
      const list = loadTxs();
      list.unshift({ hash: tx.hash, from: me, to: addr.address, value: value.toString(), chainId: network.chainId, time: Date.now(), status: 'pending' });
      saveTxs(list);
      setHash(tx.hash);
      setStep('done');
      tx.wait().then((r) => {
        const all = loadTxs();
        const item = all.find((x) => x.hash === tx.hash);
        if (item) { item.status = r && r.status === 1 ? 'ok' : 'fail'; saveTxs(all); }
      }).catch(() => { /* resolved later from the Activity tab */ });
    } catch (e2) {
      setErr(t('sendFailed', { msg: (e2 as { shortMessage?: string }).shortMessage || String((e2 as Error).message) }));
    } finally {
      setBusy(false);
    }
  };

  const addrMsg = useMemo(() => {
    if (!to.trim()) return { cls: 'hint', text: t('addrHint', { net: network.name }) };
    if (!addr.ok) return { cls: 'bad', text: t('addrBad') };
    if (self) return { cls: 'hint', text: t('addrSelf') };
    return { cls: 'ok', text: t('addrOk') };
  }, [to, addr.ok, self, network.name, t]);

  const balText = balance == null ? '—' : formatAmount(balance, 18, 6);
  const amtMsg = amtBad ? { cls: 'bad', text: t('amtBad') }
    : tooMuch ? { cls: 'bad', text: t('amtTooMuch', { amt: maxFeeWei != null && balance != null && balance > maxFeeWei ? formatAmount(balance - maxFeeWei, 18, 6) : '0', sym }) }
    : { cls: 'hint', text: t('available', { amt: balText, sym }) };

  if (step === 'done') {
    return (
      <div className="screen">
        <div role="status" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '0 32px', textAlign: 'center' }}>
          <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'var(--indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={44} color="#FFC94D" width={2.5} />
          </div>
          <h1 className="h1">{t('sent')}</h1>
          <p className="lead" style={{ fontSize: 16 }}>{t('sentBody', { amt, sym, to: shortAddr(addr.ok ? addr.address : to) })}</p>
          <a href={`${network.explorer}/tx/${hash}`} target="_blank" rel="noopener noreferrer" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', fontSize: 15, fontWeight: 600, textDecoration: 'none' }}>{t('viewExplorer')}</a>
        </div>
        <div className="footer"><button className="btn primary" onClick={() => nav.reset({ name: 'home', tab: 'assets' })}>{t('done')}</button></div>
      </div>
    );
  }

  if (step === 'review') {
    return (
      <div className="screen">
        <Header onBack={busy ? undefined : () => setStep('form')} backLabel={t('back')} title={t('confirmSend')} />
        <div className="body">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '16px 0 4px' }}>
            <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>{t('youSend')}</span>
            <span className="num" style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em', textAlign: 'center', overflowWrap: 'anywhere' }}>{formatAmount(value!, 18, 18)} {sym}</span>
          </div>
          <dl className="card" style={{ margin: 0, padding: '4px 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <dt className="small muted">{t('toAddress')}</dt>
              <dd className="mono" style={{ margin: 0, fontSize: 14, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{addr.ok && addr.address}</dd>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 14 }}>
              <dt className="muted">{t('network')}</dt><dd style={{ margin: 0, fontWeight: 500, textAlign: 'right' }}>{network.name}</dd>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 14 }}>
              <dt className="muted">{t('fee')}</dt><dd className="num" style={{ margin: 0, fontWeight: 500 }}>≤ {formatAmount(maxFeeWei!, 18, 8)} {sym}</dd>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0', fontSize: 15 }}>
              <dt style={{ fontWeight: 600 }}>{t('total')}</dt><dd className="num" style={{ margin: 0, fontWeight: 700 }}>≤ {formatAmount(value! + maxFeeWei!, 18, 8)} {sym}</dd>
            </div>
          </dl>
          <Note kind="warn" icon="warn">{t('irreversible')}</Note>
          {err && <Note kind="bad" icon="warn">{err}</Note>}
        </div>
        <div className="footer">
          <button className="btn primary" onClick={confirm} disabled={busy}>{busy ? <><span className="spin" />{t('sending')}</> : t('confirmSend')}</button>
          <button className="btn ghost" onClick={() => setStep('form')} disabled={busy}>{t('edit')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <Header onBack={nav.pop} backLabel={t('back')} title={t('sendTitle')} />
      <form onSubmit={submit} style={{ flex: 1, display: 'flex', flexDirection: 'column', margin: 0 }}>
        <div className="body" style={{ gap: 16 }}>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 68, padding: '0 16px' }}>
            <span className="coin" aria-hidden="true">ETH</span>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>ETH</span>
              <span className="small muted">{t('available', { amt: balText, sym })}</span>
            </span>
          </div>

          <div className="field">
            <label htmlFor="send-to">{t('toAddress')}</label>
            <div className={'input-wrap' + (addrMsg.cls === 'bad' ? ' bad' : '')}>
              <input id="send-to" className="mono" value={to} onChange={(e) => setTo(e.target.value)} placeholder={t('toPlaceholder')}
                autoComplete="off" autoCapitalize="off" spellCheck={false} aria-invalid={addrMsg.cls === 'bad' || undefined} aria-describedby="send-to-msg" />
              <button type="button" className="mini-btn" aria-label={t('paste')} onClick={async () => {
                try { setTo((await navigator.clipboard.readText()).trim()); } catch { /* clipboard read not allowed */ }
              }}><Icon name="clipboard" /></button>
            </div>
            <p id="send-to-msg" className={'msg ' + addrMsg.cls}>{addrMsg.text}</p>
          </div>

          <div className="field">
            <label htmlFor="send-amt">{t('amount')}</label>
            <div className={'input-wrap' + (amtMsg.cls === 'bad' ? ' bad' : '')} style={{ paddingRight: 8 }}>
              <input id="send-amt" className="big num" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0"
                autoComplete="off" aria-invalid={amtMsg.cls === 'bad' || undefined} aria-describedby="send-amt-msg" />
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)' }}>{sym}</span>
              <button type="button" className="pill-btn" onClick={fillMax} disabled={balance == null || maxFeeWei == null}>{t('max')}</button>
            </div>
            <p id="send-amt-msg" className={'msg ' + amtMsg.cls}>{amtMsg.text}</p>
          </div>

          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 16px', fontSize: 14 }}>
            <span style={{ color: 'var(--ink-2)' }}>{t('fee')}</span>
            <span className="num" style={{ fontWeight: 500, textAlign: 'right' }}>
              {feeErr ? <span style={{ color: 'var(--error)' }}>{feeErr}</span>
                : maxFeeWei != null ? <>≤ {formatAmount(maxFeeWei, 18, 8)} {sym} <span className="muted">· {t('payWithEth')}</span></>
                : addr.ok ? t('feeEstimating') : '—'}
            </span>
          </div>
        </div>
        <div className="footer">
          <button type="submit" className="btn primary" disabled={!canReview}>{t('review')}</button>
        </div>
      </form>
    </div>
  );
}

