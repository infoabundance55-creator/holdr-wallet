import { useState } from 'react';
import { useDisconnect } from 'wagmi';
import { NETWORKS, type NetworkId } from '../config';
import { Choice, copyText, Icon, Mark, Note, Sheet } from '../components/ui';
import { goal } from '../lib/analytics';
import { shortAddr } from '../lib/format';
import { loadVault } from '../lib/vault';
import { useNav } from '../nav';
import { useApp } from '../state';
import { ConnectWallet, useWallet } from '../wallet/ConnectWallet';
import { HAS_WALLETCONNECT } from '../wallet/wagmi';
import { CURVE_RULES } from '../launch/rules';

function PageTitle({ children }: { children: string }) {
  return <div className="page-title"><h1>{children}</h1></div>;
}

export function NetworkSheet({ onClose }: { onClose: () => void }) {
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
    </Sheet>
  );
}

export function Me() {
  const { t, prefs, setPrefs, network, toast } = useApp();
  const nav = useNav();
  const { address, isConnected } = useWallet();
  const { disconnect } = useDisconnect();
  const [sheet, setSheet] = useState<null | 'lang' | 'net'>(null);
  const close = () => setSheet(null);
  const legacy = loadVault();

  const Row = ({ label, value, onClick, badge }: { label: string; value?: string; onClick: () => void; badge?: string }) => (
    <button className="set-row" onClick={onClick}>
      <span style={{ flex: 1 }}>{label}</span>
      {badge && <span className="badge">{badge}</span>}
      {value && <span className="v">{value}</span>}
      <Icon name="right" size={18} color="#5A5A80" />
    </button>
  );

  return (
    <div className="narrow">
      <PageTitle>{t('meTitle')}</PageTitle>
      <div style={{ padding: '4px 16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {isConnected && address ? (
          <section className="me-card">
            <div className="me-mark"><Mark size={30} inverse /></div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{t('connectedWallet')}</span>
              <span className="mono" style={{ fontSize: 13, color: 'var(--on-indigo-muted)' }}>{shortAddr(address)}</span>
            </div>
            <button className="icon-btn" aria-label={t('copyAddress')} onClick={async () => { if (await copyText(address)) toast(t('copied')); }}><Icon name="copy" /></button>
            <a className="icon-btn" aria-label={t('viewExplorer')} href={`${network.explorer}/address/${address}`} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}><Icon name="external" /></a>
          </section>
        ) : (
          <section className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{t('meConnectTitle')}</span>
            <span className="small muted">{t('meConnectSub')}</span>
            <ConnectWallet />
            {!HAS_WALLETCONNECT && <span className="small muted">{t('wcMissing')}</span>}
          </section>
        )}

        {legacy && (
          <button className="set-row legacy" onClick={() => nav.push({ name: 'legacy' })}>
            <Icon name="warn" size={20} color="#6B4500" />
            <span style={{ flex: 1 }}>{t('legacyRow')}</span>
            <Icon name="right" size={18} color="#6B4500" />
          </button>
        )}

        <h2 className="group-label">{t('secPref')}</h2>
        <div className="group" style={{ marginTop: -10 }}>
          <Row label={t('language')} value={t('langName')} onClick={() => setSheet('lang')} />
          <Row label={t('networkLabel')} value={network.id === 'testnet' ? t('testnetBadge') : 'Mainnet'} onClick={() => setSheet('net')} />
        </div>

        <h2 className="group-label">{t('secAbout')}</h2>
        <div className="group" style={{ marginTop: -10 }}>
          <a className="set-row" href="/docs" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span style={{ flex: 1 }}>{t('helpDocs')}</span><span className="v" aria-hidden="true">↗</span>
          </a>
          <div className="set-row" style={{ cursor: 'default' }}><span style={{ flex: 1 }}>{t('version')}</span><span className="v">0.2.0</span></div>
          {isConnected && (
            <button className="set-row danger" onClick={() => { disconnect(); toast(t('disconnected')); }}>
              <span style={{ flex: 1 }}>{t('disconnect')}</span>
            </button>
          )}
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
    </div>
  );
}

/** "Create" tab until stage 3 ships the launch form. */
export function CreateSoon() {
  const { t } = useApp();
  return (
    <div className="narrow">
      <PageTitle>{t('createTitle')}</PageTitle>
      <div style={{ padding: '4px 16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <section className="lp-hero" style={{ margin: 0 }}>
          <span className="kicker">{t('heroKicker')}</span>
          <h2>{t('heroTitle')}</h2>
          <p>{t('createSoon')}</p>
          <span className="mark" aria-hidden="true"><Mark size={84} /></span>
        </section>
        <section className="lp-box">
          <h2>{t('rulesTitle')}</h2>
          <ul className="lp-checks">
            {CURVE_RULES.map((k) => <li key={k}><span className="ic"><Icon name="check" size={14} width={3} /></span><span>{t(k)}</span></li>)}
          </ul>
        </section>
      </div>
    </div>
  );
}

/** "Points" tab: season 1 starts with the launchpad. */
export function PointsSoon() {
  const { t } = useApp();
  return (
    <div className="narrow">
      <PageTitle>{t('pointsTitle')}</PageTitle>
      <div style={{ padding: '4px 16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <section className="lp-box">
          <span className="lp-pill warn" style={{ alignSelf: 'flex-start' }}>{t('soon')}</span>
          <h2>{t('pointsHead')}</h2>
          <ul className="lp-checks">
            {(['ptTrade', 'ptHold', 'ptLaunch', 'ptPlay'] as const).map((k) => <li key={k}><span className="ic"><Icon name="star" size={13} width={2.5} /></span><span>{t(k)}</span></li>)}
          </ul>
        </section>
        <Note>{t('pointsNote')}</Note>
      </div>
    </div>
  );
}
