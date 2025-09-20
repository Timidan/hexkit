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
import {
  QueryClientProvider,
  QueryClient,
} from "@tanstack/react-query";

// Wagmi v2 compatible configuration without WalletConnect dependency
const chains = [mainnet, polygon, arbitrum, optimism, base] as const;

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

const config = createConfig({
  connectors,
  chains,
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [base.id]: http(),
  },
});

const queryClient = new QueryClient();

// Custom theme matching the Web3 Toolkit design system
const customTheme = darkTheme({
  accentColor: '#667eea', // Purple accent matching your buttons
  accentColorForeground: 'white',
  borderRadius: 'medium',
  fontStack: 'system',
  overlayBlur: 'small',
});

// Override specific colors to match your design
const web3ToolkitTheme: Theme = {
  ...customTheme,
  colors: {
    ...customTheme.colors,
    modalBackground: '#1a1a1a', // Dark background matching your cards
    modalBorder: '#333', // Border matching your design
    generalBorder: '#333',
    modalBackdrop: 'rgba(0, 0, 0, 0.8)', // Dark backdrop
    profileAction: '#2a2a2a', // Button background
    profileActionHover: '#3a3a3a', // Button hover
    profileForeground: '#1a1a1a',
    selectedOptionBorder: '#667eea', // Accent color for selected items
    standby: '#666', // Secondary text color
  },
  radii: {
    ...customTheme.radii,
    actionButton: '8px', // Matching your border radius
    connectButton: '8px',
    menuButton: '8px',
    modal: '12px',
    modalMobile: '12px',
  },
};

export { config, queryClient, RainbowKitProvider, WagmiProvider, QueryClientProvider, web3ToolkitTheme };