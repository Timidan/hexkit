import React from "react";
import {
  DynamicContextProvider,
  DynamicWidget,
} from "@dynamic-labs/sdk-react-core";
import { DynamicWagmiConnector } from "@dynamic-labs/wagmi-connector";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";

// Helper for env-backed Alchemy RPCs
const API_KEY =
  (import.meta.env as unknown as { API_KEY?: string; VITE_API_KEY?: string })
    .API_KEY ||
  (import.meta.env as unknown as { API_KEY?: string; VITE_API_KEY?: string })
    .VITE_API_KEY ||
  "";

// Enhanced chain configuration with L2s and popular networks
export const DYNAMIC_CHAINS = [
  // Ethereum Mainnet
  {
    blockExplorerUrls: ["https://etherscan.io/"],
    chainId: 1,
    chainName: "Ethereum Mainnet",
    iconUrls: ["https://app.dynamic.xyz/assets/networks/eth.svg"],
    name: "Ethereum",
    nativeCurrency: {
      decimals: 18,
      name: "Ether",
      symbol: "ETH",
    },
    networkId: 1,
    rpcUrls: [
      `https://eth-mainnet.g.alchemy.com/v2/${API_KEY}`,
    ],
    vanityName: "Ethereum",
  },

  // Polygon
  {
    blockExplorerUrls: ["https://polygonscan.com/"],
    chainId: 137,
    chainName: "Polygon Mainnet",
    iconUrls: ["https://app.dynamic.xyz/assets/networks/polygon.svg"],
    name: "Polygon",
    nativeCurrency: {
      decimals: 18,
      name: "MATIC",
      symbol: "MATIC",
    },
    networkId: 137,
    rpcUrls: [
      `https://polygon-mainnet.g.alchemy.com/v2/${API_KEY}`,
    ],
    vanityName: "Polygon",
  },

  // Arbitrum
  {
    blockExplorerUrls: ["https://arbiscan.io/"],
    chainId: 42161,
    chainName: "Arbitrum One",
    iconUrls: ["https://app.dynamic.xyz/assets/networks/arbitrum.svg"],
    name: "Arbitrum",
    nativeCurrency: {
      decimals: 18,
      name: "Ether",
      symbol: "ETH",
    },
    networkId: 42161,
    rpcUrls: [
      `https://arb-mainnet.g.alchemy.com/v2/${API_KEY}`,
    ],
    vanityName: "Arbitrum",
  },

  // Optimism
  {
    blockExplorerUrls: ["https://optimistic.etherscan.io/"],
    chainId: 10,
    chainName: "Optimism",
    iconUrls: ["https://app.dynamic.xyz/assets/networks/optimism.svg"],
    name: "Optimism",
    nativeCurrency: {
      decimals: 18,
      name: "Ether",
      symbol: "ETH",
    },
    networkId: 10,
    rpcUrls: [
      `https://opt-mainnet.g.alchemy.com/v2/${API_KEY}`,
    ],
    vanityName: "Optimism",
  },

  // Base
  {
    blockExplorerUrls: ["https://basescan.org/"],
    chainId: 8453,
    chainName: "Base",
    iconUrls: ["https://app.dynamic.xyz/assets/networks/base.svg"],
    name: "Base",
    nativeCurrency: {
      decimals: 18,
      name: "Ether",
      symbol: "ETH",
    },
    networkId: 8453,
    rpcUrls: [
      `https://base-mainnet.g.alchemy.com/v2/${API_KEY}`,
    ],
    vanityName: "Base",
  },

  // BSC
  {
    blockExplorerUrls: ["https://bscscan.com/"],
    chainId: 56,
    chainName: "BNB Smart Chain",
    iconUrls: ["https://app.dynamic.xyz/assets/networks/bsc.svg"],
    name: "BSC",
    nativeCurrency: {
      decimals: 18,
      name: "BNB",
      symbol: "BNB",
    },
    networkId: 56,
    rpcUrls: [
      "https://bsc-dataseed.binance.org/",
    ],
    vanityName: "BSC",
  },

  // Avalanche
  {
    blockExplorerUrls: ["https://snowtrace.io/"],
    chainId: 43114,
    chainName: "Avalanche C-Chain",
    iconUrls: ["https://app.dynamic.xyz/assets/networks/avalanche.svg"],
    name: "Avalanche",
    nativeCurrency: {
      decimals: 18,
      name: "Avalanche",
      symbol: "AVAX",
    },
    networkId: 43114,
    rpcUrls: [
      "https://api.avax.network/ext/bc/C/rpc",
    ],
    vanityName: "Avalanche",
  },
];

export const dynamicConfig = {
  environmentId: "your-environment-id-here",
  walletConnectors: [EthereumWalletConnectors],
  settings: {
    initialAuthenticationMode: "connect-and-sign" as const,
    eventsCallbacks: {
      onAuthSuccess: (user: unknown) => {
        console.log("Dynamic auth success:", user);
      },
      onLogout: () => {
        console.log("Dynamic logout");
      },
    },
  },
};

export const DynamicWeb3Provider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <DynamicContextProvider settings={{...dynamicConfig.settings, environmentId: dynamicConfig.environmentId}}>
      <DynamicWagmiConnector>
        {children}
      </DynamicWagmiConnector>
    </DynamicContextProvider>
  );
};
