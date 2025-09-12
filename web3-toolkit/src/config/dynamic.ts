import { DynamicContextProvider, DynamicWidget } from '@dynamic-labs/sdk-react-core';
import { DynamicWagmiConnector } from '@dynamic-labs/wagmi-connector';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';

// Enhanced chain configuration with L2s and popular networks
export const DYNAMIC_CHAINS = [
  // Ethereum Mainnet
  {
    blockExplorerUrls: ['https://etherscan.io/'],
    chainId: 1,
    chainName: 'Ethereum Mainnet',
    iconUrls: ['https://app.dynamic.xyz/assets/networks/eth.svg'],
    name: 'Ethereum',
    nativeCurrency: {
      decimals: 18,
      name: 'Ether',
      symbol: 'ETH',
    },
    networkId: 1,
    rpcUrls: ['https://mainnet.infura.io/v3/'],
    vanityName: 'Ethereum',
  },
  
  // Polygon
  {
    blockExplorerUrls: ['https://polygonscan.com/'],
    chainId: 137,
    chainName: 'Polygon Mainnet',
    iconUrls: ['https://app.dynamic.xyz/assets/networks/polygon.svg'],
    name: 'Polygon',
    nativeCurrency: {
      decimals: 18,
      name: 'MATIC',
      symbol: 'MATIC',
    },
    networkId: 137,
    rpcUrls: ['https://polygon-rpc.com/'],
    vanityName: 'Polygon',
  },
  
  // Arbitrum
  {
    blockExplorerUrls: ['https://arbiscan.io/'],
    chainId: 42161,
    chainName: 'Arbitrum One',
    iconUrls: ['https://app.dynamic.xyz/assets/networks/arbitrum.svg'],
    name: 'Arbitrum One',
    nativeCurrency: {
      decimals: 18,
      name: 'Ether',
      symbol: 'ETH',
    },
    networkId: 42161,
    rpcUrls: ['https://arb1.arbitrum.io/rpc'],
    vanityName: 'Arbitrum',
  },
  
  // Optimism
  {
    blockExplorerUrls: ['https://optimistic.etherscan.io/'],
    chainId: 10,
    chainName: 'Optimism',
    iconUrls: ['https://app.dynamic.xyz/assets/networks/optimism.svg'],
    name: 'Optimism',
    nativeCurrency: {
      decimals: 18,
      name: 'Ether',
      symbol: 'ETH',
    },
    networkId: 10,
    rpcUrls: ['https://mainnet.optimism.io'],
    vanityName: 'Optimism',
  },
  
  // Base
  {
    blockExplorerUrls: ['https://basescan.org/'],
    chainId: 8453,
    chainName: 'Base',
    iconUrls: ['https://app.dynamic.xyz/assets/networks/base.svg'],
    name: 'Base',
    nativeCurrency: {
      decimals: 18,
      name: 'Ether',
      symbol: 'ETH',
    },
    networkId: 8453,
    rpcUrls: ['https://mainnet.base.org'],
    vanityName: 'Base',
  },
  
  // BSC
  {
    blockExplorerUrls: ['https://bscscan.com/'],
    chainId: 56,
    chainName: 'BNB Smart Chain',
    iconUrls: ['https://app.dynamic.xyz/assets/networks/bsc.svg'],
    name: 'BSC',
    nativeCurrency: {
      decimals: 18,
      name: 'BNB',
      symbol: 'BNB',
    },
    networkId: 56,
    rpcUrls: ['https://bsc-dataseed.binance.org/'],
    vanityName: 'BSC',
  },
  
  // Avalanche
  {
    blockExplorerUrls: ['https://snowtrace.io/'],
    chainId: 43114,
    chainName: 'Avalanche Network',
    iconUrls: ['https://app.dynamic.xyz/assets/networks/avax.svg'],
    name: 'Avalanche',
    nativeCurrency: {
      decimals: 18,
      name: 'AVAX',
      symbol: 'AVAX',
    },
    networkId: 43114,
    rpcUrls: ['https://api.avax.network/ext/bc/C/rpc'],
    vanityName: 'Avalanche',
  }
];

// Dynamic configuration
export const dynamicConfig = {
  // Get environment ID from .env or use demo
  environmentId: import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID || 'demo-environment-id',
  
  // Enhanced wallet connectors
  walletConnectors: [EthereumWalletConnectors],
  
  // Multi-chain configuration
  overrides: {
    evmNetworks: DYNAMIC_CHAINS,
  },
  
  // Enhanced user experience
  settings: {
    // Enable embedded wallets
    enableEmbeddedWallets: true,
    
    // Social login options
    socialProviders: ['google', 'twitter', 'discord', 'github'],
    
    // Advanced features
    enableSmartWallets: true,
    enableFiatOnramp: true,
    enableMultiWallet: true,
    
    // UI customization to match cyberpunk theme
    appearance: {
      mode: 'dark',
      borderRadius: 12,
      shadow: 'lg',
    },
    
    // Privacy and analytics
    privacyPolicy: 'https://dynamic.xyz/privacy',
    termsOfService: 'https://dynamic.xyz/terms',
    enableAnalytics: false,
  },
  
  // Event handlers for better integration
  events: {
    onAuthSuccess: (user: any) => {
      console.log('Dynamic: User authenticated successfully', user);
    },
    onWalletConnected: (wallet: any) => {
      console.log('Dynamic: Wallet connected', wallet);
    },
    onNetworkChanged: (network: any) => {
      console.log('Dynamic: Network changed', network);
    },
  },
};

// Environment validation
export const isDynamicConfigured = () => {
  const envId = import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID;
  if (!envId || envId === 'demo-environment-id') {
    console.warn(
      '🔥 Dynamic SDK: Using demo environment ID. Please set VITE_DYNAMIC_ENVIRONMENT_ID in your .env file for production use.'
    );
    return false;
  }
  return true;
};

// Chain helpers
export const getDynamicChainById = (chainId: number) => {
  return DYNAMIC_CHAINS.find(chain => chain.chainId === chainId);
};

export const getAllSupportedChains = () => {
  return DYNAMIC_CHAINS.map(chain => ({
    id: chain.chainId,
    name: chain.name,
    symbol: chain.nativeCurrency.symbol,
    explorerUrl: chain.blockExplorerUrls[0],
    rpcUrl: chain.rpcUrls[0],
  }));
};