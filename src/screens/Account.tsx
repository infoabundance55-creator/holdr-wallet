import qrcode from 'qrcode-generator';
import { useMemo, useState, type FormEvent } from 'react';
import { copyText, Header, Icon, Note, PasswordInput, Progress } from '../components/ui';
import { changePassword, markBackedUp, passwordChecks, phraseOf, unlockVault, type Signer } from '../lib/vault';
import { useNav } from '../nav';
import { useApp } from '../state';

function QR({ text, size = 216 }: { text: string; size?: number }) {
  const { path, n } = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const count = q.getModuleCount();
    let d = '';
    for (let r = 0; r < count; r++) {
      let c = 0;
      while (c < count) {
        if (q.isDark(r, c)) {
          const s = c;
          while (c < count && q.isDark(r, c)) c++;
          d += `M${s} ${r}h${c - s}v1h-${c - s}z`;
        } else c++;
      }
    }
    return { path: d, n: count };
  }, [text]);
  return (
    <svg width={size} height={size} viewBox={`-2 -2 ${n + 4} ${n + 4}`} shapeRendering="crispEdges" role="img" aria-label="QR">
      <rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" />
      <path d={path} fill="#1A1A4B" />
    </svg>
  );
}

export function Receive() {
  const { t, signer, network, toast } = useApp();
  const nav = useNav();
  const a = signer!.address;
  const copy = async () => { if (await copyText(a)) toast(t('copied')); };
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ text: a }); return; } catch { /* cancelled */ }
    }
    copy();
  };
  return (
    <div className="screen indigo">
      <Header light onBack={nav.pop} backLabel={t('back')} title={t('receive')} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 16px calc(24px + env(safe-area-inset-bottom, 0px))' }}>
        <section style={{ background: '#fff', borderRadius: 28, padding: '28px 24px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 12px', borderRadius: 999, background: 'var(--lavender)', color: 'var(--indigo)', fontSize: 13, fontWeight: 600 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: network.id === 'testnet' ? '#FFC94D' : 'var(--indigo)' }} />{network.name}
          </div>
          <QR text={a} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%' }}>
            <span className="small muted">{t('myAddress')}</span>
            <p className="mono" style={{ margin: 0, textAlign: 'center', fontSize: 15, lineHeight: 1.6, color: 'var(--ink-2)', overflowWrap: 'anywhere' }}>
              <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{a.slice(0, 6)}</b>{a.slice(6, -4)}<b style={{ color: 'var(--ink)', fontWeight: 600 }}>{a.slice(-4)}</b>
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, width: '100%' }}>
            <button className="btn primary" style={{ height: 52, fontSize: 16 }} onClick={copy}><Icon name="copy" size={18} />{t('copyAddress')}</button>
            <button className="btn secondary" style={{ height: 52, fontSize: 16 }} onClick={share}><Icon name="share" size={18} />{t('share')}</button>
          </div>
        </section>
        <div role="note" style={{ display: 'flex', gap: 10, padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 14, lineHeight: 1.6 }}>
          <Icon name="info" color="#FFC94D" />
          <span>{t('receiveNote', { net: network.name })}</span>
        </div>
      </div>
    </div>
  );
}

export function ChangePw() {
  const { t, toast, refreshVault } = useApp();
  const nav = useNav();
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [nw2, setNw2] = useState('');
  const [wrong, setWrong] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const c = passwordChecks(nw);
  const diff = nw.length > 0 && nw !== cur;
  const mismatch = nw2.length > 0 && nw2 !== nw;
  const match = nw2.length > 0 && nw2 === nw;
  const ok = cur.length > 0 && c.ok && diff && match && progress == null;
  const labels = { show: t('showPw'), hide: t('hidePw') };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    setWrong(false);
    setProgress(0);
    try {
      await changePassword(cur, nw, (p) => setProgress(p));
      refreshVault();
      toast(t('pwUpdated'));
      nav.pop();
    } catch {
      setWrong(true);
      setProgress(null);
    }
  };

  return (
    <div className="screen">
      <Header onBack={progress == null ? nav.pop : undefined} backLabel={t('back')} title={t('changePw')} />
      <form onSubmit={submit} style={{ flex: 1, display: 'flex', flexDirection: 'column', margin: 0 }}>
        <div className="body" style={{ gap: 18 }}>
          <div className="field">
            <label htmlFor="cp-cur">{t('curPw')}</label>
            <PasswordInput id="cp-cur" value={cur} onChange={(v) => { setCur(v); setWrong(false); }} show={false} autoComplete="current-password" invalid={wrong} describedBy="cp-cur-msg" labels={labels} autoFocus />
            <p id="cp-cur-msg" className="msg bad" role="alert">{wrong ? t('wrongPw') : ''}</p>
          </div>
          <div className="field">
            <label htmlFor="cp-new">{t('newPw')}</label>
            <PasswordInput id="cp-new" value={nw} onChange={setNw} show={false} autoComplete="new-password" describedBy="cp-rules" labels={labels} />
            <ul id="cp-rules" className="rules">
              <li className={c.len ? 'pass' : ''}><b>{c.len ? '✓' : '○'}</b>{t('ruleLen')}</li>
              <li className={c.mix ? 'pass' : ''}><b>{c.mix ? '✓' : '○'}</b>{t('ruleMix')}</li>
              <li className={diff ? 'pass' : ''}><b>{diff ? '✓' : '○'}</b>{t('ruleDiff')}</li>
            </ul>
          </div>
          <div className="field">
            <label htmlFor="cp-new2">{t('newPwAgain')}</label>
            <PasswordInput id="cp-new2" value={nw2} onChange={setNw2} show={false} autoComplete="new-password" invalid={mismatch} describedBy="cp-new2-msg" labels={labels} />
            <p id="cp-new2-msg" className={'msg ' + (mismatch ? 'bad' : 'ok')}>{mismatch ? t('pwMismatch') : match ? t('pwMatch') : ''}</p>
          </div>
          <Note>{t('changePwNote')}</Note>
        </div>
        <div className="footer">
          <Progress value={progress} />
          <button type="submit" className="btn primary" disabled={!ok}>{progress != null ? <><span className="spin" />{t('encrypting')}</> : t('savePw')}</button>
        </div>
      </form>
    </div>
  );
}

export function Reveal() {
  const { t, vault, refreshVault } = useApp();
  const nav = useNav();
  const [pw, setPw] = useState('');
  const [wrong, setWrong] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [w, setW] = useState<Signer | null>(null);

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

  const phrase = w ? phraseOf(w) : null;
  return (
    <div className="screen">
      <Header onBack={() => { setW(null); nav.pop(); }} backLabel={t('back')} title={t('revealTitle')} />
      {!w ? (
        <form onSubmit={submit} style={{ flex: 1, display: 'flex', flexDirection: 'column', margin: 0 }}>
          <div className="body">
            <p className="lead">{t('revealSub')}</p>
            <div className="field">
              <label htmlFor="rv-pw">{t('password')}</label>
              <PasswordInput id="rv-pw" value={pw} onChange={(v) => { setPw(v); setWrong(false); }} show={false} autoComplete="current-password" invalid={wrong} describedBy="rv-msg" labels={{ show: t('showPw'), hide: t('hidePw') }} autoFocus />
              <p id="rv-msg" className="msg bad" role="alert">{wrong ? t('wrongPw') : ''}</p>
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
            <Note kind="warn" icon="ban">{t('tipNoScreenshot')}</Note>
          </div>
          <div className="footer">
            {vault && !vault.backedUp && (
              <button className="btn primary" onClick={() => { markBackedUp(); refreshVault(); setW(null); nav.pop(); }}>{t('markBacked')}</button>
            )}
            <button className="btn secondary" onClick={() => { setW(null); nav.pop(); }}>{t('done')}</button>
          </div>
        </>
      )}
    </div>
  );
}
