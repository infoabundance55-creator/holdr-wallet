import { useEffect, type ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  back: <path d="M15 18l-6-6 6-6" />,
  down: <path d="M6 9l6 6 6-6" />,
  right: <path d="M9 6l6 6-6 6" />,
  receive: <><path d="M12 4v13M6 11l6 6 6-6" /><path d="M5 20h14" /></>,
  send: <><path d="M12 20V7M6 13l6-6 6 6" /><path d="M5 4h14" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>,
  share: <><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></>,
  eye: <><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 6.1A10 10 0 0 1 12 6c5.5 0 9 6 9 6a16 16 0 0 1-3 3.7M6.6 6.6C4.3 8.2 3 12 3 12s3.5 6 9 6a9 9 0 0 0 4.4-1.1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M16 13h2M3 10h18" /></>,
  activity: <path d="M4 12h4l2-5 4 10 2-5h4" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>,
  warn: <><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>,
  pen: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  ban: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
  shield: <><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /><path d="M12 9v4M12 16h.01" /></>,
  clipboard: <><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
  external: <><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></>,
};

export function Icon({ name, size = 20, color = 'currentColor', width = 2 }: { name: keyof typeof PATHS | string; size?: number; color?: string; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

/** Holdr mark: h with a smile. `inverse` draws indigo strokes for light backgrounds. */
export function Mark({ size = 24, inverse = false }: { size?: number; inverse?: boolean }) {
  const c = inverse ? '#2B2BD9' : '#FFFFFF';
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <rect x="24" y="8" width="20" height="100" rx="10" fill={c} />
      <path d="M34 74 C34 58 46 52 62 52 C80 52 90 60 90 76 V98" fill="none" stroke={c} strokeWidth="20" strokeLinecap="round" />
      <path d="M53 88 Q62 99 71 88" fill="none" stroke="#FFC94D" strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Mark size={22} />
      </div>
      <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }}>holdr</span>
    </div>
  );
}

export function Header({ title, onBack, backLabel, light, center }: { title?: string; onBack?: () => void; backLabel: string; light?: boolean; center?: ReactNode }) {
  return (
    <header className={'header' + (light ? ' light' : '')}>
      {onBack ? (
        <button className="icon-btn" aria-label={backLabel} onClick={onBack}><Icon name="back" size={24} /></button>
      ) : <span />}
      {center ?? <h1>{title}</h1>}
      <span />
    </header>
  );
}

export function Steps({ step, label }: { step: 1 | 2 | 3; label: string }) {
  return (
    <div className="steps" role="progressbar" aria-label={label} aria-valuemin={1} aria-valuemax={3} aria-valuenow={step}>
      {[1, 2, 3].map((i) => <span key={i} className={i <= step ? 'on' : ''} />)}
    </div>
  );
}

export function Note({ kind, icon = 'info', children }: { kind?: 'warn' | 'bad'; icon?: string; children: ReactNode }) {
  const color = kind === 'warn' ? '#6B4500' : kind === 'bad' ? '#B4320A' : '#2B2BD9';
  return (
    <div role="note" className={'note' + (kind ? ' ' + kind : '')}>
      <Icon name={icon} color={color} />
      <span>{children}</span>
    </div>
  );
}

export function Sheet({ title, onClose, closeLabel, children }: { title: string; onClose: () => void; closeLabel: string; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="grab" aria-hidden="true" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2>{title}</h2>
          <button className="link-btn" onClick={onClose}>{closeLabel}</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Choice({ checked, onPick, title, sub, lang }: { checked: boolean; onPick: () => void; title: string; sub?: string; lang?: string }) {
  return (
    <button role="radio" aria-checked={checked} className="choice" onClick={onPick}>
      <span className="grow">
        <span lang={lang}>{title}</span>
        {sub && <span className="small muted">{sub}</span>}
      </span>
      {checked && <Icon name="check" size={22} color="#2B2BD9" width={2.5} />}
    </button>
  );
}

export function Progress({ value }: { value: number | null }) {
  if (value == null) return null;
  return <div className="progress" aria-hidden="true"><i style={{ width: `${Math.round(value * 100)}%` }} /></div>;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function PasswordInput({ id, value, onChange, show, onToggle, autoComplete, invalid, describedBy, labels, autoFocus }: {
  id: string; value: string; onChange: (v: string) => void; show: boolean; onToggle?: () => void;
  autoComplete: string; invalid?: boolean; describedBy?: string; labels: { show: string; hide: string }; autoFocus?: boolean;
}) {
  return (
    <div className={'input-wrap' + (invalid ? ' bad' : '')}>
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete} aria-invalid={invalid || undefined} aria-describedby={describedBy} autoFocus={autoFocus} />
      {onToggle && (
        <button type="button" className="icon-btn" style={{ marginLeft: 0, color: 'var(--ink-2)' }} onClick={onToggle}
          aria-label={show ? labels.hide : labels.show} aria-pressed={show}>
          <Icon name={show ? 'eyeOff' : 'eye'} size={22} />
        </button>
      )}
    </div>
  );
}
