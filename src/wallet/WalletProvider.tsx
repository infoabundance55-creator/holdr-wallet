import '@rainbow-me/rainbowkit/styles.css';
import { lightTheme, RainbowKitProvider, type Locale } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { useApp } from '../state';
import { CHAINS, wagmiConfig } from './wagmi';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

const theme = lightTheme({
  accentColor: '#2B2BD9',
  accentColorForeground: '#FFFFFF',
  borderRadius: 'large',
  fontStack: 'system',
  overlayBlur: 'small',
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
