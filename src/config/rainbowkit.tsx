import '@rainbow-me/rainbowkit/styles.css';
import '../styles/RainbowKitOverrides.css';
import {
  RainbowKitProvider,
  connectorsForWallets,
  darkTheme,
  type Theme,
} from '@rainbow-me/rainbowkit';
import {
  injectedWallet,
  metaMaskWallet,
  coinbaseWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { WagmiProvider, createConfig, http } from 'wagmi';
import type { Chain as WagmiChain } from 'wagmi/chains';
import { CHAIN_REGISTRY, isTestnet } from '../chains/registry';
import {
  QueryClientProvider,
  QueryClient,
} from "@tanstack/react-query";
import React from 'react';
import { useNetworkConfig } from "../contexts/NetworkConfigContext";

// Convert our registry Chain type to wagmi's Chain type
function toWagmiChain(chain: { id: number; name: string; rpcUrl: string; nativeCurrency: { name: string; symbol: string; decimals: number }; explorerUrl?: string }): WagmiChain {
  return {
    id: chain.id,
    name: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: {
      default: { http: [chain.rpcUrl] },
    },
    ...(chain.explorerUrl ? {
      blockExplorers: {
        default: { name: 'Explorer', url: chain.explorerUrl },
      },
    } : {}),
    ...(isTestnet(chain.id) ? { testnet: true } : {}),
  } as WagmiChain;
}

const wagmiChains = CHAIN_REGISTRY.map(toWagmiChain);
const chains = wagmiChains as unknown as readonly [WagmiChain, ...WagmiChain[]];

const walletConnectProjectId = (
  import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID ||
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
  ''
).trim();

// When no WalletConnect projectId is configured, omit metaMaskWallet
// (it initialises WalletConnect v2 internally, which throws without a valid ID).
// injectedWallet still covers MetaMask & Brave via the browser extension provider.
const wallets = walletConnectProjectId
  ? [injectedWallet, metaMaskWallet, coinbaseWallet]
  : [injectedWallet, coinbaseWallet];

const connectors = connectorsForWallets(
  [{ groupName: 'Recommended', wallets }],
  {
    appName: 'Web3 Toolkit',
    projectId: walletConnectProjectId || 'PLACEHOLDER',
  }
);

const queryClient = new QueryClient();

// Custom theme matching the Web3 Toolkit design system (black & white)
const web3ToolkitTheme: Theme = darkTheme({
  accentColor: '#ffffff', // White accent
  accentColorForeground: '#0a0a0a', // Dark text on white
  borderRadius: 'medium',
  fontStack: 'system',
  overlayBlur: 'small',
});

export { queryClient, RainbowKitProvider, WagmiProvider, QueryClientProvider, web3ToolkitTheme };

export const RpcAwareWagmiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { resolveRpcUrl, configVersion } = useNetworkConfig();

  const config = React.useMemo(() => {
    const transports: Record<number, ReturnType<typeof http>> = {};
    for (const chain of CHAIN_REGISTRY) {
      const resolution = resolveRpcUrl(chain.id, chain.rpcUrl);
      // Use resolved URL when available, otherwise fall back to the chain's
      // registry RPC. Wallet connectivity always needs an RPC; the
      // allowPublicRpcFallback setting governs explorer/debugger features only.
      transports[chain.id] = http(resolution.url || chain.rpcUrl || undefined);
    }

    return createConfig({
      connectors,
      chains,
      transports,
    });
  }, [configVersion, resolveRpcUrl]);

  return <WagmiProvider config={config as any}>{children}</WagmiProvider>;
};

// Export a hook to apply theme colors as CSS variables
export function useApplyRainbowKitTheme() {
  React.useEffect(() => {
    const root = document.documentElement;
    const themeObj = web3ToolkitTheme as Record<string, unknown>;

    const themeColors = (themeObj.colors ?? (themeObj as any).darkMode?.colors ?? {}) as Record<string, string>;
    const themeShadows = (themeObj.shadows ?? (themeObj as any).darkMode?.shadows ?? {}) as Record<string, string>;
    const themeRadii = (themeObj.radii ?? (themeObj as any).darkMode?.radii ?? {}) as Record<string, string>;

    Object.entries(themeColors).forEach(([key, value]) => {
      if (typeof value === 'string') root.style.setProperty(`--rk-colors-${key}`, value);
    });
    Object.entries(themeShadows).forEach(([key, value]) => {
      if (typeof value === 'string') root.style.setProperty(`--rk-shadows-${key}`, value);
    });
    Object.entries(themeRadii).forEach(([key, value]) => {
      if (typeof value === 'string') root.style.setProperty(`--rk-radii-${key}`, value);
    });
  }, []);
}
