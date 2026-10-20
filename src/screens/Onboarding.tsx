import { wordlists, type HDNodeWallet } from 'ethers';
import { useMemo, useState, type FormEvent } from 'react';
import { Header, Icon, Mark, Note, PasswordInput, Progress, Steps } from '../components/ui';
import { useNav } from '../nav';
import { useApp } from '../state';
import { newWallet, parseImport, passwordChecks, phraseOf, saveVault, type Signer } from '../lib/vault';

export function Welcome() {
  const { t, prefs, setPrefs } = useApp();
  const nav = useNav();
  const [l1, l2] = t('welcomeHeadline').split('\n');
  return (
    <div className="screen indigo">
      <div className="welcome-top">
        <button className="lang-btn" onClick={() => setPrefs({ lang: prefs.lang === 'zh' ? 'en' : 'zh' })} aria-label={t('switchLang')}>
          <Icon name="globe" size={18} />{t('langBtn')}
        </button>
        <div style={{ width: 132, height: 132, borderRadius: 36, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Mark size={92} inverse />
        </div>
        <div aria-hidden="true" className="float-chip" style={{ left: 34, top: 70, background: 'rgba(255,255,255,.14)', color: '#fff' }}>AAPL <span style={{ color: '#FFC94D' }}>▲</span></div>
        <div aria-hidden="true" className="float-chip" style={{ right: 30, top: 110, background: '#FFC94D', color: '#1A1A4B' }}>ETH</div>
        <div aria-hidden="true" className="float-chip" style={{ left: 48, bottom: 40, background: '#fff', color: '#2B2BD9' }}>USDC</div>
        <div aria-hidden="true" className="float-chip" style={{ right: 40, bottom: 70, background: 'rgba(255,255,255,.14)', color: '#fff' }}>NVDA <span style={{ color: '#FFC94D' }}>▲</span></div>
      </div>
      <section className="welcome-sheet">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h1 className="h1" style={{ fontSize: 30 }}>{l1}<br />{l2}</h1>
          <p className="lead" style={{ fontSize: 16 }}>{t('welcomeSub')}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button className="btn primary" onClick={() => nav.push({ name: 'backup', wallet: newWallet() })}>{t('createWallet')}</button>
          <button className="btn secondary" onClick={() => nav.push({ name: 'import' })}>{t('importWallet')}</button>
        </div>
      </section>
    </div>
  );
}

export function Backup({ wallet }: { wallet: HDNodeWallet }) {
  const { t } = useApp();
  const nav = useNav();
  const [shown, setShown] = useState(false);
  const [saved, setSaved] = useState(false);
  const words = phraseOf(wallet)!.split(' ');
  return (
    <div className="screen">
      <Header onBack={nav.pop} backLabel={t('back')} center={<Steps step={1} label={t('stepOf', { n: 1 })} />} />
      <div className="body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1 className="h1">{t('backupTitle')}</h1>
          <p className="lead">{t('backupSub')}</p>
        </div>
        <div style={{ position: 'relative' }}>
          <ol className={'words' + (shown ? '' : ' blur')} aria-hidden={!shown}>
            {words.map((w, i) => <li key={i}><i>{i + 1}</i>{w}</li>)}
          </ol>
          {!shown && (
            <div className="cover">
              <Icon name="eye" size={28} color="#2B2BD9" />
              <span style={{ fontSize: 14, fontWeight: 500 }}>{t('noOneLooking')}</span>
              <button className="btn primary sm" onClick={() => setShown(true)}>{t('revealPhrase')}</button>
            </div>
          )}
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>
          <li style={{ display: 'flex', gap: 10 }}><Icon name="pen" size={18} color="#2B2BD9" /><span>{t('tipWrite')}</span></li>
          <li style={{ display: 'flex', gap: 10 }}><Icon name="ban" size={18} color="#C2410C" /><span>{t('tipNoScreenshot')}</span></li>
          <li style={{ display: 'flex', gap: 10 }}><Icon name="shield" size={18} color="#C2410C" /><span>{t('tipNeverAsk')}</span></li>
        </ul>
      </div>
      <div className="footer">
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, fontSize: 15, cursor: 'pointer' }}>
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} disabled={!shown}
            style={{ width: 22, height: 22, accentColor: '#2B2BD9', margin: 0 }} />
          {t('savedCheck')}
        </label>
        <button className="btn primary" disabled={!shown || !saved} onClick={() => nav.push({ name: 'verify', wallet })}>{t('next')}</button>
      </div>
    </div>
  );
}

function pickQuiz(words: string[]) {
  const idx = new Set<number>();
  while (idx.size < 3) idx.add(Math.floor(Math.random() * words.length));
  const list = wordlists.en;
  return [...idx].sort((a, b) => a - b).map((i) => {
    const opts = new Set<string>([words[i]]);
    while (opts.size < 4) {
      const w = list.getWord(Math.floor(Math.random() * 2048));
      if (!words.includes(w)) opts.add(w);
    }
    return { pos: i + 1, answer: words[i], opts: [...opts].sort(() => Math.random() - 0.5) };
  });
}

export function Verify({ wallet }: { wallet: HDNodeWallet }) {
  const { t } = useApp();
  const nav = useNav();
  const quiz = useMemo(() => pickQuiz(phraseOf(wallet)!.split(' ')), [wallet]);
  const [picks, setPicks] = useState<Record<number, string>>({});
  const allOk = quiz.every((q) => picks[q.pos] === q.answer);
  return (
    <div className="screen">
      <Header onBack={nav.pop} backLabel={t('back')} center={<Steps step={2} label={t('stepOf', { n: 2 })} />} />
      <div className="body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1 className="h1">{t('verifyTitle')}</h1>
          <p className="lead">{t('verifySub')}</p>
        </div>
        {quiz.map((q) => {
          const p = picks[q.pos];
          const ok = p === q.answer;
          return (
            <fieldset key={q.pos} className="card" style={{ margin: 0, padding: 16, border: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <legend className="sr-only">{t('wordN', { n: q.pos })}</legend>
              <div aria-hidden="true" style={{ fontSize: 15, fontWeight: 600 }}>{t('wordN', { n: q.pos })}</div>
              <div className="opts">
                {q.opts.map((o) => (
                  <button key={o} aria-pressed={p === o} className={'opt' + (p === o ? (ok ? ' good' : ' bad') : '')}
                    onClick={() => setPicks({ ...picks, [q.pos]: o })}>{o}</button>
                ))}
              </div>
              <p aria-live="polite" className={'msg ' + (ok ? 'ok' : 'bad')}>{p == null ? '' : ok ? t('correct') : t('wrongWord', { n: q.pos })}</p>
            </fieldset>
          );
        })}
      </div>
      <div className="footer">
        <button className="btn primary" disabled={!allOk} onClick={() => nav.push({ name: 'password', wallet, flow: 'create' })}>{t('next')}</button>
      </div>
    </div>
  );
}

export function SetPassword({ wallet, flow }: { wallet: Signer; flow: 'create' | 'import' }) {
  const { t, refreshVault, setSigner } = useApp();
  const nav = useNav();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const c = passwordChecks(pw);
  const mismatch = pw2.length > 0 && pw2 !== pw;
  const match = pw2.length > 0 && pw2 === pw;
  const ok = c.ok && match && progress == null;
  const meterColor = c.score <= 1 ? '#C2410C' : c.score === 2 ? '#FFC94D' : '#2B2BD9';
  const strength = !pw ? '—' : c.score <= 1 ? t('weak') : c.score === 2 ? t('medium') : t('strong');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    setError('');
    setProgress(0);
    try {
      await saveVault(wallet, pw, { backedUp: true }, (p) => setProgress(p));
      refreshVault();
      setSigner(wallet);
      nav.reset({ name: 'home', tab: 'assets' });
    } catch (err) {
      setError(String((err as Error).message || err));
      setProgress(null);
    }
  };

  const labels = { show: t('showPw'), hide: t('hidePw') };
  return (
    <div className="screen">
      <Header onBack={progress == null ? nav.pop : undefined} backLabel={t('back')}
        center={flow === 'create' ? <Steps step={3} label={t('stepOf', { n: 3 })} /> : undefined} title={flow === 'import' ? t('importTitle') : undefined} />
      <form onSubmit={submit} style={{ flex: 1, display: 'flex', flexDirection: 'column', margin: 0 }}>
        <div className="body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h1 className="h1">{t('setPwTitle')}</h1>
            <p className="lead">{t('setPwSub')}</p>
          </div>
          <div className="field">
            <label htmlFor="pw1">{t('password')}</label>
            <PasswordInput id="pw1" value={pw} onChange={setPw} show={show} onToggle={() => setShow(!show)} autoComplete="new-password" describedBy="pw-rules" labels={labels} autoFocus />
            <div className="meter" aria-hidden="true">
              {[1, 2, 3].map((i) => <span key={i} style={{ background: pw && c.score >= i ? meterColor : undefined }} />)}
            </div>
            <ul id="pw-rules" className="rules">
              <li className={c.len ? 'pass' : ''}><b>{c.len ? '✓' : '○'}</b>{t('ruleLen')}</li>
              <li className={c.mix ? 'pass' : ''}><b>{c.mix ? '✓' : '○'}</b>{t('ruleMix')}</li>
              <li><b /> {t('strength')} · <strong style={{ fontWeight: 600 }}>{strength}</strong></li>
            </ul>
          </div>
          <div className="field">
            <label htmlFor="pw2">{t('pwAgain')}</label>
            <PasswordInput id="pw2" value={pw2} onChange={setPw2} show={show} autoComplete="new-password" invalid={mismatch} describedBy="pw2-msg" labels={labels} />
            <p id="pw2-msg" className={'msg ' + (mismatch ? 'bad' : 'ok')}>{mismatch ? t('pwMismatch') : match ? t('pwMatch') : ''}</p>
          </div>
          <Note>{t('pwNote')}</Note>
          {error && <Note kind="bad" icon="warn">{error}</Note>}
        </div>
        <div className="footer">
          <Progress value={progress} />
          <button type="submit" className="btn primary" disabled={!ok}>
            {progress != null ? <><span className="spin" />{t('encrypting')}</> : t('finishCreate')}
          </button>
        </div>
      </form>
    </div>
  );
}

export function Import() {
  const { t } = useApp();
  const nav = useNav();
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const w = parseImport(text);
    if (!w) { setBad(true); return; }
    setText('');
    nav.push({ name: 'password', wallet: w, flow: 'import' });
  };
  return (
    <div className="screen">
      <Header onBack={nav.pop} backLabel={t('back')} title={t('importTitle')} />
      <form onSubmit={submit} style={{ flex: 1, display: 'flex', flexDirection: 'column', margin: 0 }}>
        <div className="body">
          <p className="lead">{t('importSub')}</p>
          <div className="field">
            <label htmlFor="imp">{t('importLabel')}</label>
            <textarea id="imp" className="textarea mono" value={text} placeholder={t('importPlaceholder')}
              onChange={(e) => { setText(e.target.value); setBad(false); }}
              autoComplete="off" autoCapitalize="off" spellCheck={false} aria-invalid={bad || undefined} aria-describedby="imp-msg"
              style={bad ? { borderColor: 'var(--error)' } : undefined} />
            <p id="imp-msg" className={'msg ' + (bad ? 'bad' : 'hint')}>{bad ? t('importBad') : t('importPrivacy')}</p>
          </div>
        </div>
        <div className="footer">
          <button type="submit" className="btn primary" disabled={!text.trim()}>{t('next')}</button>
        </div>
      </form>
    </div>
  );
}
