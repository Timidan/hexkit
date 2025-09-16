import '@rainbow-me/rainbowkit/styles.css';
import {
  getDefaultConfig,
  RainbowKitProvider,
} from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
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

// Wagmi v2 compatible configuration
const config = getDefaultConfig({
  appName: 'Web3 Toolkit',
  projectId: import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID || 'demo-project-id',
  chains: [mainnet, polygon, arbitrum, optimism, base],
  ssr: false,
});

const queryClient = new QueryClient();

export { config, queryClient, RainbowKitProvider, WagmiProvider, QueryClientProvider };