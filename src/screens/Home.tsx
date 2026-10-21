import { useEffect, useState } from 'react';
import { AUTO_LOCK_OPTIONS, NETWORKS, type NetworkId } from '../config';
import { Choice, copyText, Icon, Logo, Mark, Note, Sheet } from '../components/ui';
import { formatAmount, shortAddr } from '../lib/format';
import { useBalance } from '../lib/hooks';
import { clearLocalData, loadTxs, saveTxs, type SentTx } from '../lib/store';
import { clearVault } from '../lib/vault';
import { goal } from '../lib/analytics';
import { useNav, type Tab } from '../nav';
import { useApp } from '../state';

export function Home({ tab }: { tab: Tab }) {
  const { t } = useApp();
  const nav = useNav();
  const go = (next: Tab) => nav.replace({ name: 'home', tab: next });
  return (
    <div className="screen">
      {tab === 'assets' && <Assets onHistory={() => go('activity')} />}
      {tab === 'activity' && <Activity />}
      {tab === 'me' && <Me />}
      <div className="spacer-nav" />
      <nav className="bottom-nav" aria-label={t('mainNav')}>
        {([['assets', 'wallet', 'navAssets'], ['activity', 'activity', 'navActivity'], ['me', 'user', 'navMe']] as const).map(([id, icon, label]) => (
          <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}>
            <Icon name={icon} size={24} />{t(label)}
          </button>
        ))}
      </nav>
    </div>
  );
}

function NetworkSheet({ onClose }: { onClose: () => void }) {
  const { t, prefs, setPrefs } = useApp();
  const pick = (id: NetworkId) => {
    if (id === 'mainnet' && prefs.network !== 'mainnet') goal('switch-mainnet');
    setPrefs({ network: id });
    onClose();
  };
  return (
    <Sheet title={t('networkLabel')} onClose={onClose} closeLabel={t('close')}>
      <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Choice checked={prefs.network === 'testnet'} onPick={() => pick('testnet')} title={NETWORKS.testnet.name} sub={t('netTestnetSub')} />
        <Choice checked={prefs.network === 'mainnet'} onPick={() => pick('mainnet')} title={NETWORKS.mainnet.name} sub={t('netMainnetSub')} />
      </div>
      <Note kind="warn" icon="warn">{t('mainnetWarn')}</Note>
    </Sheet>
  );
}

function Assets({ onHistory }: { onHistory: () => void }) {
  const { t, signer, provider, network, prefs, setPrefs, toast } = useApp();
  const nav = useNav();
  const address = signer!.address;
  const { balance, loading, error, refresh } = useBalance(provider, address);
  const [cat, setCat] = useState<'all' | 'stocks' | 'crypto'>('all');
  const [netSheet, setNetSheet] = useState(false);
  const hide = prefs.hideAmounts;
  const bal = balance == null ? '—' : formatAmount(balance, 18, 6);
  const isTest = network.id === 'testnet';

  useEffect(() => {
    if (balance != null && balance > 0n) goal('funded', { once: true });
  }, [balance]);

  return (
    <>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56, padding: '0 12px 0 16px' }}>
        <Logo />
        <button onClick={() => setNetSheet(true)} aria-label={`${t('networkLabel')}: ${network.name}`}
          style={{ display: 'flex', alignItems: 'center', gap: 6, height: 44, padding: '0 12px 0 14px', borderRadius: 999, border: '1px solid var(--line)', background: '#fff', color: 'var(--ink)', fontSize: 13, fontWeight: 500 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: isTest ? '#FFC94D' : 'var(--indigo)' }} />
          {isTest ? `Robinhood · ${t('testnetBadge')}` : 'Robinhood Chain'}
          <Icon name="down" size={16} />
        </button>
      </header>

      <section className="hero" aria-label={t('totalAssets')}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="label">{t('totalAssets')}</span>
          <button className="icon-btn" style={{ color: 'var(--on-indigo-muted)' }} onClick={() => setPrefs({ hideAmounts: !hide })}
            aria-label={hide ? t('showAmounts') : t('hideAmounts')} aria-pressed={hide}>
            <Icon name={hide ? 'eyeOff' : 'eye'} size={22} />
          </button>
        </div>
        <div className="total">{hide ? '••••••' : bal} <span style={{ fontSize: 20, fontWeight: 600 }}>ETH</span></div>
        <div className="sub">{loading && balance == null ? t('refreshing') : isTest ? t('testnetBadge') : ' '}</div>
        <button className="addr-chip" onClick={async () => { if (await copyText(address)) toast(t('copied')); }} aria-label={t('copyAddress')}>
          {shortAddr(address)}<Icon name="copy" size={16} />
        </button>
      </section>

      <nav className="actions" aria-label={t('quickActions')}>
        <button className="action" onClick={() => nav.push({ name: 'receive' })}><span className="dot"><Icon name="receive" /></span>{t('receive')}</button>
        <button className="action main" onClick={() => nav.push({ name: 'send' })}><span className="dot"><Icon name="send" /></span>{t('send')}</button>
        <button className="action" onClick={onHistory}><span className="dot"><Icon name="clock" /></span>{t('history')}</button>
      </nav>

      <div className="tabs" role="tablist" aria-label={t('assetTabs')}>
        {(['all', 'stocks', 'crypto'] as const).map((c) => (
          <button key={c} role="tab" aria-selected={cat === c} className="tab" onClick={() => setCat(c)}>{t(c)}</button>
        ))}
      </div>

      {error && (
        <div style={{ margin: '0 16px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Note kind="bad" icon="warn">{t('netError')}</Note>
          <button className="btn secondary sm" style={{ alignSelf: 'flex-start' }} onClick={refresh}><Icon name="refresh" size={18} />{t('retry')}</button>
        </div>
      )}

      <section className="list">
        {cat !== 'crypto' && (
          <>
            <div className="list-label">{t('stocks')}</div>
            <p className="small muted" style={{ margin: '8px 0 12px' }}>{t('stocksSoon')}</p>
          </>
        )}
        {cat !== 'stocks' && (
          <>
            <div className="list-label">{t('crypto')}</div>
            <div className="row">
              <span className="coin" aria-hidden="true">ETH</span>
              <span className="main"><span className="t">ETH</span><span className="s">Ethereum · {network.name}</span></span>
              <span className="end"><span className="t num">{hide ? '••••' : bal}</span></span>
            </div>
            {isTest && balance === 0n && network.faucet && (
              <div className="empty">
                <span className="small muted">{t('noFunds')}</span>
                <a className="btn secondary sm" href={network.faucet} target="_blank" rel="noopener noreferrer">{t('getTestEth')} <Icon name="external" size={16} /></a>
              </div>
            )}
          </>
        )}
      </section>
      {netSheet && <NetworkSheet onClose={() => setNetSheet(false)} />}
    </>
  );
}

function Activity() {
  const { t, signer, network, provider } = useApp();
  const [txs, setTxs] = useState<SentTx[]>(() => loadTxs());
  const mine = txs.filter((x) => x.chainId === network.chainId && x.from === signer!.address);

  // Resolve pending transfers.
  useEffect(() => {
    let alive = true;
    const pending = mine.filter((x) => x.status === 'pending');
    if (!pending.length) return;
    Promise.all(pending.map((x) => provider.getTransactionReceipt(x.hash).catch(() => null))).then((rs) => {
      if (!alive) return;
      let changed = false;
      const all = loadTxs();
      rs.forEach((r, i) => {
        if (!r) return;
        const tx = all.find((a) => a.hash === pending[i].hash);
        if (tx) { tx.status = r.status === 1 ? 'ok' : 'fail'; changed = true; }
      });
      if (changed) { saveTxs(all); setTxs(all); }
    });
    return () => { alive = false; };
  }, [provider, txs]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmtTime = (ms: number) => new Date(ms).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <>
      <header style={{ display: 'flex', alignItems: 'center', height: 56, padding: '0 20px' }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{t('activityTitle')}</h1>
      </header>
      <div style={{ padding: '4px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Note>{t('activityNote')}</Note>
        <div className="card" style={{ padding: '0 14px' }}>
          {mine.length === 0 && <div className="empty"><Icon name="clock" size={28} color="#5A5A80" /><span className="muted">{t('activityEmpty')}</span></div>}
          {mine.map((x) => (
            <a key={x.hash} className="row" href={`${network.explorer}/tx/${x.hash}`} target="_blank" rel="noopener noreferrer">
              <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--indigo)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon name="send" /></span>
              <span className="main">
                <span className="t">{t('sentFrom', { sym: network.symbol })}</span>
                <span className="s">{fmtTime(x.time)} · {t('toShort', { to: shortAddr(x.to) })}</span>
              </span>
              <span className="end">
                <span className="t num">−{formatAmount(BigInt(x.value), 18, 6)}</span>
                <span className={'status ' + x.status}>{x.status === 'pending' ? t('pending') : x.status === 'ok' ? t('success') : t('failed')}</span>
              </span>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}

function Me() {
  const { t, signer, vault, prefs, setPrefs, lock, network, refreshVault, toast } = useApp();
  const nav = useNav();
  const [sheet, setSheet] = useState<null | 'lang' | 'net' | 'lock' | 'remove'>(null);
  const close = () => setSheet(null);
  const address = signer!.address;

  const Row = ({ label, value, onClick, badge, danger }: { label: string; value?: string; onClick: () => void; badge?: string; danger?: boolean }) => (
    <button className={'set-row' + (danger ? ' danger' : '')} onClick={onClick}>
      <span style={{ flex: 1 }}>{label}</span>
      {badge && <span className="badge">{badge}</span>}
      {value && <span className="v">{value}</span>}
      {!danger && <Icon name="right" size={18} color="#5A5A80" />}
    </button>
  );

  const remove = () => {
    clearVault();
    clearLocalData();
    refreshVault();
    lock();
    nav.reset({ name: 'welcome' });
  };

  return (
    <>
      <header style={{ display: 'flex', alignItems: 'center', height: 56, padding: '0 20px' }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{t('meTitle')}</h1>
      </header>
      <div style={{ padding: '4px 16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <section style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 8px 14px 16px', borderRadius: 18, background: 'var(--indigo)', color: '#fff' }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Mark size={30} inverse /></div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{t('myWallet')}</span>
            <span className="mono" style={{ fontSize: 13, color: 'var(--on-indigo-muted)' }}>{shortAddr(address)}</span>
          </div>
          <button className="icon-btn" aria-label={t('copyAddress')} onClick={async () => { if (await copyText(address)) toast(t('copied')); }}><Icon name="copy" /></button>
        </section>

        <h2 className="group-label">{t('secWallet')}</h2>
        <div className="group" style={{ marginTop: -10 }}>
          <Row label={t('backupPhrase')} badge={vault && !vault.backedUp ? t('notBacked') : undefined} onClick={() => nav.push({ name: 'reveal' })} />
          <Row label={t('changePw')} onClick={() => nav.push({ name: 'changePw' })} />
        </div>

        <h2 className="group-label">{t('secPref')}</h2>
        <div className="group" style={{ marginTop: -10 }}>
          <Row label={t('language')} value={t('langName')} onClick={() => setSheet('lang')} />
          <Row label={t('networkLabel')} value={network.id === 'testnet' ? t('testnetBadge') : 'Mainnet'} onClick={() => setSheet('net')} />
        </div>

        <h2 className="group-label">{t('secSafety')}</h2>
        <div className="group" style={{ marginTop: -10 }}>
          <Row label={t('autoLock')} value={t('minutes', { n: prefs.autoLockMin })} onClick={() => setSheet('lock')} />
          <button className="set-row" onClick={lock}><span style={{ flex: 1 }}>{t('lockNow')}</span><Icon name="lock" size={18} color="#5A5A80" /></button>
        </div>

        <h2 className="group-label">{t('secAbout')}</h2>
        <div className="group" style={{ marginTop: -10 }}>
          <div className="set-row" style={{ cursor: 'default' }}><span style={{ flex: 1 }}>{t('version')}</span><span className="v">0.1.0</span></div>
          <Row label={t('removeWallet')} danger onClick={() => setSheet('remove')} />
        </div>
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
      {sheet === 'lock' && (
        <Sheet title={t('autoLock')} onClose={close} closeLabel={t('close')}>
          <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {AUTO_LOCK_OPTIONS.map((m) => (
              <Choice key={m} checked={prefs.autoLockMin === m} onPick={() => { setPrefs({ autoLockMin: m }); close(); }} title={t('minutes', { n: m })} />
            ))}
          </div>
        </Sheet>
      )}
      {sheet === 'remove' && (
        <Sheet title={t('removeWallet')} onClose={close} closeLabel={t('cancel')}>
          <p className="lead" style={{ padding: '0 4px 8px' }}>{t('removeBody')}</p>
          <button className="btn danger" onClick={remove}>{t('removeConfirm')}</button>
        </Sheet>
      )}
    </>
  );
}
