import '@rainbow-me/rainbowkit/styles.css';
import { darkTheme, RainbowKitProvider, type Locale } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { useApp } from '../state';
import { CHAINS, wagmiConfig } from './wagmi';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

const theme = darkTheme({
  accentColor: '#FFC94D',
  accentColorForeground: '#1A1300',
  borderRadius: 'large',
  fontStack: 'system',
  overlayBlur: 'small',
});
// v2 palette: surface panels on the dark ground, gold actions.
Object.assign(theme.colors, {
  modalBackground: '#121827', modalBorder: '#262E45', modalText: '#EEF1F8', modalTextSecondary: '#A9B1C8', modalTextDim: '#5E6785',
  modalBackdrop: 'rgba(4,6,12,0.72)', actionButtonSecondaryBackground: '#1A2133', generalBorder: '#262E45', menuItemBackground: '#1A2133',
  closeButtonBackground: '#1A2133', closeButton: '#A9B1C8', profileForeground: '#121827', profileAction: '#1A2133', profileActionHover: '#262E45',
  connectButtonBackground: '#121827', connectButtonInnerBackground: '#1A2133', connectButtonText: '#EEF1F8',
});
theme.fonts.body = 'Outfit, "Noto Sans SC", system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

/** wagmi + RainbowKit. Lives inside AppProvider so it follows the site language and network. */
export function WalletProvider({ children }: { children: ReactNode }) {
  const { prefs } = useApp();
  const locale: Locale = prefs.lang === 'zh' ? 'zh-CN' : 'en-US';
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={theme}
          locale={locale}
          initialChain={CHAINS[prefs.network]}
          modalSize="compact"
          appInfo={{ appName: 'Holdr', learnMoreUrl: 'https://holdr-wallet.vercel.app/docs' }}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
