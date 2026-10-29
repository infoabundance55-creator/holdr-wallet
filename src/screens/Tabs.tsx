import { NETWORKS, type NetworkId } from '../config';
import { Choice, Icon, Mark, Note, Sheet } from '../components/ui';
import { goal } from '../lib/analytics';
import { useApp } from '../state';
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
