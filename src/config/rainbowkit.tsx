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

// Get API key from environment
const API_KEY = import.meta.env.API_KEY || import.meta.env.VITE_API_KEY || '';

console.log('[RainbowKit] API Key status:', API_KEY ? `${API_KEY.slice(0, 8)}...` : 'No API key found');

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
    projectId: import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID || 'demo', // Minimal fallback
  }
);

// Configure transports with proper RPC URLs
const config = createConfig({
  connectors,
  chains,
  transports: {
    [mainnet.id]: http(API_KEY ? `https://eth-mainnet.g.alchemy.com/v2/${API_KEY}` : 'https://ethereum.publicnode.com'),
    [polygon.id]: http(API_KEY ? `https://polygon-mainnet.g.alchemy.com/v2/${API_KEY}` : 'https://polygon-rpc.com'),
    [arbitrum.id]: http(API_KEY ? `https://arb-mainnet.g.alchemy.com/v2/${API_KEY}` : 'https://arb1.arbitrum.io/rpc'),
    [optimism.id]: http(API_KEY ? `https://opt-mainnet.g.alchemy.com/v2/${API_KEY}` : 'https://mainnet.optimism.io'),
    [base.id]: http(API_KEY ? `https://base-mainnet.g.alchemy.com/v2/${API_KEY}` : 'https://mainnet.base.org'),
    [liskSepolia.id]: http('https://rpc.sepolia-api.lisk.com'),
  },
});

const queryClient = new QueryClient();

// Custom theme matching the Web3 Toolkit design system (claude-UI-rules.md)
const web3ToolkitTheme: Theme = darkTheme({
  accentColor: '#6366f1', // Neon purple
  accentColorForeground: '#f6f6fb', // Bright text
  borderRadius: 'medium',
  fontStack: 'system',
  overlayBlur: 'small',
});

export { config, queryClient, RainbowKitProvider, WagmiProvider, QueryClientProvider, web3ToolkitTheme };

// Export a hook to apply theme colors as CSS variables
export function useApplyRainbowKitTheme() {
  React.useEffect(() => {
    // Apply theme colors as CSS variables
    const root = document.documentElement;
    const themeColors = web3ToolkitTheme.colors;
    const themeShadows = web3ToolkitTheme.shadows;
    const themeRadii = web3ToolkitTheme.radii;
    
    // Apply colors
    Object.entries(themeColors).forEach(([key, value]) => {
      root.style.setProperty(`--rk-colors-${key}`, value);
    });
    
    // Apply shadows
    Object.entries(themeShadows).forEach(([key, value]) => {
      root.style.setProperty(`--rk-shadows-${key}`, value);
    });
    
    // Apply radii
    Object.entries(themeRadii).forEach(([key, value]) => {
      root.style.setProperty(`--rk-radii-${key}`, value);
    });
    
    console.log('[RainbowKit Theme Applied] CSS variables set from theme object');
  }, []);
}
