import { useState, type FormEvent } from 'react';
import { Mark, PasswordInput, Progress, Sheet } from '../components/ui';
import { shortAddr } from '../lib/format';
import { clearLocalData } from '../lib/store';
import { clearVault, unlockVault } from '../lib/vault';
import { useNav } from '../nav';
import { useApp } from '../state';

export function Unlock() {
  const { t, vault, setSigner, refreshVault } = useApp();
  const nav = useNav();
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [forgot, setForgot] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pw || progress != null) return;
    setWrong(false);
    setProgress(0);
    try {
      const s = await unlockVault(pw, (p) => setProgress(p));
      setPw('');
      setSigner(s);
      nav.reset({ name: 'home', tab: 'assets' });
    } catch {
      setWrong(true);
      setPw('');
    } finally {
      setProgress(null);
    }
  };

  const wipe = () => {
    clearVault();
    clearLocalData();
    refreshVault();
    setForgot(false);
    nav.reset({ name: 'import' });
  };

  return (
    <div className="screen indigo">
      <div style={{ flex: 1, minHeight: 260, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: '#fff' }}>
        <div style={{ width: 96, height: 96, borderRadius: 28, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Mark size={66} inverse />
        </div>
        <h1 className="h1" style={{ fontSize: 28 }}>{t('welcomeBack')}</h1>
        {vault && <span className="mono" style={{ fontSize: 14, color: 'var(--on-indigo-muted)' }}>{shortAddr(vault.address)}</span>}
      </div>
      <form onSubmit={submit} className="welcome-sheet" style={{ gap: 16, margin: 0 }}>
        <div className="field">
          <label htmlFor="unlock-pw">{t('password')}</label>
          <PasswordInput id="unlock-pw" value={pw} onChange={(v) => { setPw(v); setWrong(false); }} show={show} onToggle={() => setShow(!show)}
            autoComplete="current-password" invalid={wrong} describedBy="unlock-msg" labels={{ show: t('showPw'), hide: t('hidePw') }} autoFocus />
          <p id="unlock-msg" role="alert" className="msg bad">{wrong ? t('wrongPw') : ''}</p>
        </div>
        <Progress value={progress} />
        <button type="submit" className="btn primary" disabled={!pw || progress != null}>
          {progress != null ? <><span className="spin" />{t('unlocking')}</> : t('unlock')}
        </button>
        <button type="button" className="link-btn" style={{ alignSelf: 'center' }} onClick={() => setForgot(true)}>{t('forgotPw')}</button>
      </form>
      {forgot && (
        <Sheet title={t('forgotTitle')} onClose={() => setForgot(false)} closeLabel={t('cancel')}>
          <p className="lead" style={{ padding: '0 4px 8px' }}>{t('forgotBody')}</p>
          <button className="btn danger" onClick={wipe}>{t('forgotConfirm')}</button>
        </Sheet>
      )}
    </div>
  );
}
