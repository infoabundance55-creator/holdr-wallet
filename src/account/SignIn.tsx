import { useEffect, useId, useState } from 'react';
import { Icon } from '../components/ui';
import { shortAddr } from '../lib/format';
import { useApp } from '../state';
import { ConnectWallet, useWallet } from '../wallet/ConnectWallet';
import { api, USERNAME_RE } from './client';
import { useAccountCtx } from './context';

type Check = 'idle' | 'checking' | 'free' | 'taken' | 'format' | 'reserved';

/** Username input with a live availability check. */
export function UsernameForm({ initial = '', onSaved, autoFocus }: { initial?: string; onSaved?: () => void; autoFocus?: boolean }) {
  const { t, toast } = useApp();
  const { setUsername, busy } = useAccountCtx();
  const [v, setV] = useState(initial);
  const [check, setCheck] = useState<Check>('idle');
  const id = useId();
  const trimmed = v.trim();

  useEffect(() => {
    if (!trimmed || trimmed === initial) { setCheck('idle'); return; }
    if (!USERNAME_RE.test(trimmed)) { setCheck('format'); return; }
    setCheck('checking');
    let live = true;
    const tm = window.setTimeout(() => {
      api.nameCheck(trimmed)
        .then((r) => { if (live) setCheck(r.ok ? 'free' : r.reason ?? 'taken'); })
        .catch(() => { if (live) setCheck('idle'); });
    }, 350);
    return () => { live = false; window.clearTimeout(tm); };
  }, [trimmed, initial]);

  const submit = async () => {
    const r = await setUsername(trimmed);
    if (r === 'ok') { toast(t('unSaved')); onSaved?.(); }
    else if (r !== 'error') setCheck(r);
  };

  const bad = check === 'taken' || check === 'format' || check === 'reserved';
  const msg = check === 'checking' ? t('unChecking') : check === 'free' ? t('unFree') : check === 'taken' ? t('unTaken')
    : check === 'format' ? t('unFormat') : check === 'reserved' ? t('unReserved') : t('unHint');
  const can = !busy && trimmed !== initial && (check === 'free' || check === 'idle') && USERNAME_RE.test(trimmed);

  return (
    <form className="ac-name" onSubmit={(e) => { e.preventDefault(); if (can) void submit(); }}>
      <label htmlFor={id}>{t('unLabel')}</label>
      <div className={'input-wrap' + (bad ? ' bad' : '')}>
        <span className="ac-at" aria-hidden="true">@</span>
        <input
          id={id} value={v} onChange={(e) => setV(e.target.value.replace(/\s/g, ''))} maxLength={15}
          placeholder="moon_frog" autoComplete="off" autoCapitalize="off" spellCheck={false} autoFocus={autoFocus}
          aria-invalid={bad} aria-describedby={id + '-m'}
        />
      </div>
      <span id={id + '-m'} className={'ac-hint' + (bad ? ' bad' : check === 'free' ? ' ok' : '')} aria-live="polite">{msg}</span>
      <button className="btn primary" type="submit" disabled={!can}>{busy ? <span className="spin" /> : t('unSave')}</button>
    </form>
  );
}

/** The three sign-in steps: connect wallet → sign a message → pick a username (N9 / ND4). */
export function SignInSteps({ onDone }: { onDone?: () => void }) {
  const { t } = useApp();
  const { address, isConnected } = useWallet();
  const { status, me, otherWallet, busy, signIn } = useAccountCtx();
  const step = !isConnected ? 1 : status !== 'in' ? 2 : !me?.username ? 3 : 4;

  useEffect(() => { if (step === 4) onDone?.(); }, [step, onDone]);

  if (status === 'unavailable') return <p className="ac-note warn"><Icon name="warn" size={18} />{t('acUnavailable')}</p>;

  const Dot = ({ n }: { n: number }) => (
    step > n ? <span className="ac-dot done"><Icon name="check" size={14} width={3.4} /></span>
      : <span className={'ac-dot' + (step === n ? ' now' : '')}>{n}</span>
  );

  return (
    <div className="ac-steps">
      <ol>
        <li className={step === 1 ? 'now' : ''}>
          <Dot n={1} /><span className="l">{step > 1 ? t('siStep1Done') : t('siStep1')}</span>
          {address && <span className="mono r">{shortAddr(address, 4, 4)}</span>}
        </li>
        <li className={step === 2 ? 'now' : ''}><Dot n={2} /><span className="l">{t('siStep2')}</span></li>
        <li className={step === 3 ? 'now' : ''}><Dot n={3} /><span className="l">{t('siStep3')}</span></li>
      </ol>
      {step === 1 && <ConnectWallet />}
      {step === 2 && (
        <>
          {otherWallet && <p className="ac-note">{t('siOtherWallet')}</p>}
          <button className="btn primary" onClick={() => void signIn()} disabled={busy || status === 'checking'}>
            {busy ? <><span className="spin" />{t('siSigning')}</> : t('siSignBtn')}
          </button>
          <span className="ac-fine">{t('siStep2Note')}</span>
        </>
      )}
      {step === 3 && <UsernameForm autoFocus />}
    </div>
  );
}
