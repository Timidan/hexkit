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
import {
  mainnet,
  polygon,
  arbitrum,
  optimism,
  base,
} from 'wagmi/chains';
import type { Chain } from 'wagmi/chains';
import {
  QueryClientProvider,
  QueryClient,
} from "@tanstack/react-query";
import React from 'react';
import { useNetworkConfig } from "../contexts/NetworkConfigContext";

// Get API key from environment (VITE_ prefix required for Vite exposure)
const API_KEY = import.meta.env.VITE_API_KEY || '';

// Only log in development mode to avoid leaking config status
if (!API_KEY && import.meta.env.DEV) console.warn('[RainbowKit] No API key found — using public RPC fallbacks');

// Wagmi v2 compatible configuration without WalletConnect dependency
const liskSepolia = {
  id: 4202,
  name: 'Lisk Sepolia',
  nativeCurrency: {
    name: 'Lisk Sepolia Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.sepolia-api.lisk.com'],
    },
    public: {
      http: ['https://rpc.sepolia-api.lisk.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Lisk Sepolia Explorer',
      url: 'https://sepolia-blockscout.lisk.com',
    },
  },
  testnet: true,
} as const satisfies Chain;

const chains = [mainnet, polygon, arbitrum, optimism, base, liskSepolia] as const;

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [
        injectedWallet,
        metaMaskWallet,
        coinbaseWallet,
      ],
    },
  ],
  {
    appName: 'Web3 Toolkit',
    projectId: import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID || import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '', // Requires real project ID from env
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

const fallbackRpcFor = (chain: Chain) => {
  // When no env API key, return '' so resolveRpcUrl falls through to our
  // curated PUBLIC_RPC_FALLBACKS (which are in the CSP whitelist).
  // Wagmi's built-in chain defaults (e.g. eth.merkle.io) are NOT in the CSP.
  if (!API_KEY) return '';
  switch (chain.id) {
    case mainnet.id:
      return `https://eth-mainnet.g.alchemy.com/v2/${API_KEY}`;
    case polygon.id:
      return `https://polygon-mainnet.g.alchemy.com/v2/${API_KEY}`;
    case arbitrum.id:
      return `https://arb-mainnet.g.alchemy.com/v2/${API_KEY}`;
    case optimism.id:
      return `https://opt-mainnet.g.alchemy.com/v2/${API_KEY}`;
    case base.id:
      return `https://base-mainnet.g.alchemy.com/v2/${API_KEY}`;
    default:
      return '';
  }
};

export const RpcAwareWagmiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { resolveRpcUrl, configVersion } = useNetworkConfig();

  const config = React.useMemo(() => {
    // Resolve RPC URLs — use explicit URL or undefined to let viem use chain defaults.
    // IMPORTANT: only pass undefined when we have no URL at all; never let empty strings
    // silently fall through to viem's built-in chain defaults (which may not be in our CSP).
    const rpc = (chainId: number) => {
      const resolved = resolveRpcUrl(chainId, fallbackRpcFor({ id: chainId } as Chain)).url;
      return resolved ? resolved : undefined;
    };
    const resolvedTransports: Record<number, ReturnType<typeof http>> = {
      [mainnet.id]: http(rpc(mainnet.id)),
      [polygon.id]: http(rpc(polygon.id)),
      [arbitrum.id]: http(rpc(arbitrum.id)),
      [optimism.id]: http(rpc(optimism.id)),
      [base.id]: http(rpc(base.id)),
      [liskSepolia.id]: http(rpc(liskSepolia.id)),
    };

    return createConfig({
      connectors,
      chains,
      transports: resolvedTransports,
    });
  }, [configVersion, resolveRpcUrl]);

  return <WagmiProvider config={config as any}>{children}</WagmiProvider>;
};

// Export a hook to apply theme colors as CSS variables
export function useApplyRainbowKitTheme() {
  React.useEffect(() => {
    // Apply theme colors as CSS variables
    const root = document.documentElement;
    // RainbowKit Theme structure varies by version - safely access properties
    const themeObj = web3ToolkitTheme as Record<string, unknown>;

    // Try to extract colors, shadows, radii from various possible structures
    const themeColors = (themeObj.colors ?? (themeObj as any).darkMode?.colors ?? {}) as Record<string, string>;
    const themeShadows = (themeObj.shadows ?? (themeObj as any).darkMode?.shadows ?? {}) as Record<string, string>;
    const themeRadii = (themeObj.radii ?? (themeObj as any).darkMode?.radii ?? {}) as Record<string, string>;

    // Apply colors
    if (themeColors && typeof themeColors === 'object') {
      Object.entries(themeColors).forEach(([key, value]) => {
        if (typeof value === 'string') {
          root.style.setProperty(`--rk-colors-${key}`, value);
        }
      });
    }

    // Apply shadows
    if (themeShadows && typeof themeShadows === 'object') {
      Object.entries(themeShadows).forEach(([key, value]) => {
        if (typeof value === 'string') {
          root.style.setProperty(`--rk-shadows-${key}`, value);
        }
      });
    }

    // Apply radii
    if (themeRadii && typeof themeRadii === 'object') {
      Object.entries(themeRadii).forEach(([key, value]) => {
        if (typeof value === 'string') {
          root.style.setProperty(`--rk-radii-${key}`, value);
        }
      });
    }

  }, []);
}
