import { useState, type FormEvent } from 'react';
import { Header, Note, PasswordInput, Progress, Sheet } from '../components/ui';
import { shortAddr } from '../lib/format';
import { clearVault, loadVault, phraseOf, unlockVault, type Signer } from '../lib/vault';
import { useNav } from '../nav';
import { useApp } from '../state';

/**
 * For people who made a Holdr wallet in v0.1: unlock it once, copy the recovery phrase into
 * MetaMask / Rabby / OKX, then remove it from this browser.
 */
export function LegacyWallet() {
  const { t, toast } = useApp();
  const nav = useNav();
  const [vault, setVault] = useState(() => loadVault());
  const [pw, setPw] = useState('');
  const [wrong, setWrong] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [w, setW] = useState<Signer | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const leave = () => { setW(null); nav.pop(); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pw) return;
    setWrong(false);
    setProgress(0);
    try {
      setW(await unlockVault(pw, (p) => setProgress(p)));
      setPw('');
    } catch {
      setWrong(true);
    } finally {
      setProgress(null);
    }
  };

  const remove = () => {
    clearVault();
    setVault(null);
    setW(null);
    setConfirmRemove(false);
    toast(t('legacyRemoved'));
    nav.tab('me');
  };

  if (!vault) {
    return (
      <div className="screen">
        <Header onBack={leave} backLabel={t('back')} title={t('legacyTitle')} />
        <div className="body"><Note>{t('legacyNone')}</Note></div>
      </div>
    );
  }

  const phrase = w ? phraseOf(w) : null;
  return (
    <div className="screen narrow">
      <Header onBack={leave} backLabel={t('back')} title={t('legacyTitle')} />
      {!w ? (
        <form onSubmit={submit} style={{ flex: 1, display: 'flex', flexDirection: 'column', margin: 0 }}>
          <div className="body">
            <p className="lead">{t('legacySub', { addr: shortAddr(vault.address) })}</p>
            <div className="field">
              <label htmlFor="lg-pw">{t('password')}</label>
              <PasswordInput id="lg-pw" value={pw} onChange={(v) => { setPw(v); setWrong(false); }} show={false} autoComplete="current-password" invalid={wrong} describedBy="lg-msg" labels={{ show: t('showPw'), hide: t('hidePw') }} autoFocus />
              <p id="lg-msg" className="msg bad" role="alert">{wrong ? t('wrongPw') : ''}</p>
            </div>
            <Note kind="warn" icon="shield">{t('tipNeverAsk')}</Note>
          </div>
          <div className="footer">
            <Progress value={progress} />
            <button type="submit" className="btn primary" disabled={!pw || progress != null}>{progress != null ? <><span className="spin" />{t('unlocking')}</> : t('revealBtn')}</button>
          </div>
        </form>
      ) : (
        <>
          <div className="body">
            {phrase ? (
              <ol className="words">{phrase.split(' ').map((x, i) => <li key={i}><i>{i + 1}</i>{x}</li>)}</ol>
            ) : (
              <>
                <p className="lead">{t('privateKeyOnly')}</p>
                <p className="mono card" style={{ margin: 0, padding: 16, fontSize: 14, lineHeight: 1.6, overflowWrap: 'anywhere' }}>{w.privateKey}</p>
              </>
            )}
            <Note>{phrase ? t('legacyHowPhrase') : t('legacyHowKey')}</Note>
            <Note kind="warn" icon="ban">{t('tipNoScreenshot')}</Note>
          </div>
          <div className="footer">
            <button className="btn secondary" onClick={leave}>{t('done')}</button>
            <button className="btn ghost" style={{ color: 'var(--error)' }} onClick={() => setConfirmRemove(true)}>{t('legacyRemove')}</button>
          </div>
        </>
      )}
      {confirmRemove && (
        <Sheet title={t('legacyRemove')} onClose={() => setConfirmRemove(false)} closeLabel={t('cancel')}>
          <p className="lead" style={{ padding: '0 4px 8px' }}>{t('legacyRemoveBody')}</p>
          <button className="btn danger" onClick={remove}>{t('legacyRemoveConfirm')}</button>
        </Sheet>
      )}
    </div>
  );
}
