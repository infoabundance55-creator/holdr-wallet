import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useSwitchChain } from 'wagmi';
import { Icon } from '../components/ui';
import { shortAddr } from '../lib/format';
import { useApp } from '../state';
import { CHAINS } from './wagmi';

/** The connected wallet (if any) and whether it is on the network the site is showing. */
export function useWallet() {
  const { network } = useApp();
  const { address, isConnected, chainId } = useAccount();
  return { address, isConnected: isConnected && !!address, onSiteChain: chainId === network.chainId, chainId };
}

/** Header button: "Connect wallet", or the connected address. */
export function ConnectWallet({ compact = false }: { compact?: boolean }) {
  const { t } = useApp();
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openConnectModal, openAccountModal, openChainModal, authenticationStatus }) => {
        const ready = mounted && authenticationStatus !== 'loading';
        if (!ready) return <span className="cw-btn cw-ghost" aria-hidden="true" />;
        if (!account) {
          return (
            <button className="cw-btn cw-connect" onClick={openConnectModal}>
              <Icon name="wallet" size={18} />{compact ? t('connectShort') : t('connectWallet')}
            </button>
          );
        }
        if (chain?.unsupported) {
          return <button className="cw-btn cw-wrong" onClick={openChainModal}><Icon name="warn" size={18} />{t('wrongNetwork')}</button>;
        }
        return (
          <button className="cw-btn cw-account" onClick={openAccountModal} aria-label={t('walletMenu', { addr: account.displayName })}>
            <span className="cw-dot" aria-hidden="true" />
            <span className="mono">{shortAddr(account.address, compact ? 4 : 6, 4)}</span>
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

/** Shown when the connected wallet is on another network than the one the site shows. */
export function NetworkBanner() {
  const { t, network, toast } = useApp();
  const { isConnected, onSiteChain } = useWallet();
  const { switchChain, isPending } = useSwitchChain();
  if (!isConnected || onSiteChain) return null;
  const onSwitch = () =>
    switchChain(
      { chainId: CHAINS[network.id].id },
      { onError: (e) => toast(/rejected|denied/i.test(e.message) ? t('switchRejected') : t('switchFailed')) },
    );
  return (
    <div className="cw-banner" role="status">
      <Icon name="warn" size={18} />
      <span>{t('otherNetwork', { net: network.name })}</span>
      <button onClick={onSwitch} disabled={isPending}>{isPending ? <span className="spin" /> : t('switchTo')}</button>
    </div>
  );
}
