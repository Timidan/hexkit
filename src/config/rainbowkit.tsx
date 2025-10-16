import '@rainbow-me/rainbowkit/styles.css';
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

// Custom theme matching the Web3 Toolkit design system
const customTheme = darkTheme({
  accentColor: '#14b8a6',
  accentColorForeground: '#04131c',
  borderRadius: 'medium',
  fontStack: 'system',
  overlayBlur: 'small',
});

// Override specific colors to match your design
const web3ToolkitTheme: Theme = {
  ...customTheme,
  colors: {
    ...customTheme.colors,
    accentColor: '#14b8a6',
    accentColorForeground: '#04131c',
    actionButtonBorder: 'rgba(45, 212, 191, 0.55)',
    actionButtonSecondaryBackground: 'rgba(9, 15, 24, 0.92)',
    connectButtonBackground: 'rgba(8, 14, 24, 0.92)',
    connectButtonInnerBackground: 'rgba(28, 45, 64, 0.78)',
    connectButtonText: '#e2f5ff',
    connectButtonTextError: '#fecaca',
    connectButtonBackgroundError: 'rgba(248, 113, 113, 0.25)',
    modalBackdrop: 'rgba(2, 6, 14, 0.82)',
    modalBackground: 'linear-gradient(160deg, rgba(5, 11, 20, 0.96) 0%, rgba(8, 16, 28, 0.92) 100%)',
    modalBorder: 'rgba(94, 234, 212, 0.25)',
    modalText: '#f8fafc',
    modalTextDim: '#93c5fd',
    modalTextSecondary: '#67e8f9',
    generalBorder: 'rgba(59, 130, 246, 0.25)',
    generalBorderDim: 'rgba(15, 23, 42, 0.6)',
    profileAction: 'rgba(13, 148, 136, 0.15)',
    profileActionHover: 'rgba(34, 211, 238, 0.25)',
    profileForeground: 'rgba(5, 10, 20, 0.96)',
    menuItemBackground: 'rgba(10, 18, 30, 0.78)',
    selectedOptionBorder: 'rgba(94, 234, 212, 0.65)',
    downloadTopCardBackground: 'rgba(9, 15, 24, 0.92)',
    downloadBottomCardBackground: 'rgba(7, 12, 20, 0.88)',
    connectionIndicator: '#22c55e',
    standby: '#f59e0b',
    error: '#f87171',
  },
  shadows: {
    ...customTheme.shadows,
    connectButton: '0 14px 32px rgba(34, 211, 238, 0.24)',
    dialog: '0 32px 80px rgba(13, 148, 136, 0.25)',
    profileDetailsAction: '0 18px 36px rgba(34, 211, 238, 0.2)',
    selectedOption: '0 16px 40px rgba(125, 211, 252, 0.25)',
    selectedWallet: '0 18px 44px rgba(56, 189, 248, 0.28)',
    walletLogo: '0 10px 30px rgba(45, 212, 191, 0.32)',
  },
  radii: {
    ...customTheme.radii,
    actionButton: '10px',
    connectButton: '12px',
    menuButton: '10px',
    modal: '16px',
    modalMobile: '18px',
  },
};

export { config, queryClient, RainbowKitProvider, WagmiProvider, QueryClientProvider, web3ToolkitTheme };
