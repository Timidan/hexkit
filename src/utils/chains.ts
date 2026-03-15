import type { Chain } from "../types";

/**
 * Public RPC fallback URLs for each chain.
 *
 * IMPORTANT: These are FALLBACK URLs only. User-configured RPC providers
 * (Alchemy, Infura, Custom) are resolved through networkConfigManager.
 *
 * Components should use:
 *   networkConfigManager.resolveRpcUrl(chain.id, chain.rpcUrl)
 * to get the correct RPC URL that respects user settings.
 */

// Public RPC fallbacks (used only when user hasn't configured a provider
// OR when user's provider doesn't support the chain)
const PUBLIC_RPC_URLS = {
  1: "https://ethereum-rpc.publicnode.com",
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
  8453: "https://base-rpc.publicnode.com",
  84532: "https://base-sepolia-rpc.publicnode.com",
  137: "https://polygon-bor-rpc.publicnode.com",
  17000: "https://holesky.rpc.thirdweb.com",
  4202: "https://rpc.sepolia-api.lisk.com",
  80002: "https://polygon-amoy-bor-rpc.publicnode.com",
  42161: "https://arbitrum-one-rpc.publicnode.com",
  421614: "https://arbitrum-sepolia-rpc.publicnode.com",
  10: "https://optimism-rpc.publicnode.com",
  11155420: "https://sepolia.optimism.io",
  56: "https://bsc-dataseed.binance.org",
  97: "https://bsc-testnet-rpc.publicnode.com",
  43114: "https://api.avax.network/ext/bc/C/rpc",
  100: "https://rpc.gnosischain.com",
} as const;

export const SUPPORTED_CHAINS: Chain[] = [
  {
    id: 1,
    name: "Ethereum",
    rpcUrl: PUBLIC_RPC_URLS[1],
    explorerUrl: "https://etherscan.io",
    blockExplorer: "https://etherscan.io",
    apiUrl: "https://api.etherscan.io/api",
    explorers: [
      {
        name: "Etherscan",
        url: "https://api.etherscan.io/api",
        type: "etherscan",
      },
      {
        name: "Blockscout",
        url: "https://eth.blockscout.com/api",
        type: "blockscout",
      },
    ],
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
  },
  {
    id: 11155111,
    name: "Ethereum Sepolia",
    rpcUrl: PUBLIC_RPC_URLS[11155111],
    explorerUrl: "https://sepolia.etherscan.io",
    blockExplorer: "https://sepolia.etherscan.io",
    apiUrl: "https://api-sepolia.etherscan.io/api",
    explorers: [
      {
        name: "Etherscan",
        url: "https://api-sepolia.etherscan.io/api",
        type: "etherscan",
      },
      {
        name: "Blockscout",
        url: "https://eth-sepolia.blockscout.com/api",
        type: "blockscout",
      },
    ],
    nativeCurrency: {
      name: "Sepolia Ether",
      symbol: "ETH",
      decimals: 18,
    },
  },
  {
    id: 8453,
    name: "Base",
    rpcUrl: PUBLIC_RPC_URLS[8453],
    explorerUrl: "https://basescan.org",
    blockExplorer: "https://basescan.org",
    apiUrl: "https://api.basescan.org/api",
    explorers: [
      {
        name: "BaseScan",
        url: "https://api.basescan.org/api",
        type: "etherscan",
      },
      {
        name: "Blockscout",
        url: "https://base.blockscout.com/api",
        type: "blockscout",
      },
    ],
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
  },
  {
    id: 84532,
    name: "Base Sepolia",
    rpcUrl: PUBLIC_RPC_URLS[84532],
    explorerUrl: "https://sepolia.basescan.org",
    blockExplorer: "https://sepolia.basescan.org",
    apiUrl: "https://api-sepolia.basescan.org/api",
    explorers: [
      {
        name: "Base Sepolia BaseScan",
        url: "https://api-sepolia.basescan.org/api",
        type: "etherscan",
      },
      {
        name: "Base Sepolia Blockscout",
        url: "https://base-sepolia.blockscout.com/api",
        type: "blockscout",
      },
    ],
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
  },
  {
    id: 17000,
    name: "Holesky",
    rpcUrl: PUBLIC_RPC_URLS[17000],
    explorerUrl: "https://holesky.etherscan.io",
    blockExplorer: "https://holesky.etherscan.io",
    apiUrl: "https://api-holesky.etherscan.io/api",
    explorers: [
      {
        name: "Holesky Etherscan",
        url: "https://api-holesky.etherscan.io/api",
        type: "etherscan",
      },
    ],
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
  },
  {
    id: 4202,
    name: "Lisk Sepolia",
    rpcUrl: PUBLIC_RPC_URLS[4202],
    explorerUrl: "https://sepolia-blockscout.lisk.com",
    blockExplorer: "https://sepolia-blockscout.lisk.com",
    apiUrl: "https://sepolia-blockscout.lisk.com/api",
    explorers: [
      {
        name: "Blockscout",
        url: "https://sepolia-blockscout.lisk.com/api",
        type: "blockscout",
      },
    ],
    nativeCurrency: {
      name: "Sepolia Ether",
      symbol: "ETH",
      decimals: 18,
    },
  },
  {
    id: 137,
    name: "Polygon",
    rpcUrl: PUBLIC_RPC_URLS[137],
    explorerUrl: "https://polygonscan.com",
    blockExplorer: "https://polygonscan.com",
    apiUrl: "https://api.polygonscan.com/api",
    explorers: [
      {
        name: "PolygonScan",
        url: "https://api.polygonscan.com/api",
        type: "etherscan",
      },
      {
        name: "Polygon Blockscout",
        url: "https://polygon.blockscout.com/api",
        type: "blockscout",
      },
    ],
    nativeCurrency: {
      name: "MATIC",
      symbol: "MATIC",
      decimals: 18,
    },
  },
  {
    id: 80002,
    name: "Polygon Amoy",
    rpcUrl: PUBLIC_RPC_URLS[80002],
    explorerUrl: "https://amoy.polygonscan.com",
    blockExplorer: "https://amoy.polygonscan.com",
    apiUrl: "https://api-amoy.polygonscan.com/api",
    explorers: [
      {
        name: "PolygonScan Amoy",
        url: "https://api-amoy.polygonscan.com/api",
        type: "etherscan",
      },
    ],
    nativeCurrency: {
      name: "MATIC",
      symbol: "MATIC",
      decimals: 18,
    },
  },
  {
    id: 42161,
    name: "Arbitrum",
    rpcUrl: PUBLIC_RPC_URLS[42161],
    explorerUrl: "https://arbiscan.io",
    blockExplorer: "https://arbiscan.io",
    apiUrl: "https://api.arbiscan.io/api",
    explorers: [
      {
        name: "Arbiscan",
        url: "https://api.arbiscan.io/api",
        type: "etherscan",
      },
      {
        name: "Arbitrum Blockscout",
        url: "https://arbitrum.blockscout.com/api",
        type: "blockscout",
      },
    ],
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
  },
  {
    id: 421614,
    name: "Arbitrum Sepolia",
    rpcUrl: PUBLIC_RPC_URLS[421614],
    explorerUrl: "https://sepolia.arbiscan.io",
    blockExplorer: "https://sepolia.arbiscan.io",
    apiUrl: "https://api-sepolia.arbiscan.io/api",
    explorers: [
      {
        name: "Arbiscan Sepolia",
        url: "https://api-sepolia.arbiscan.io/api",
        type: "etherscan",
      },
    ],
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
  },
  {
    id: 10,
    name: "Optimism",
    rpcUrl: PUBLIC_RPC_URLS[10],
    explorerUrl: "https://optimistic.etherscan.io",
    blockExplorer: "https://optimistic.etherscan.io",
    apiUrl: "https://api-optimistic.etherscan.io/api",
    explorers: [
      {
        name: "Optimistic Etherscan",
        url: "https://api-optimistic.etherscan.io/api",
        type: "etherscan",
      },
    ],
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
  },
  {
    id: 11155420,
    name: "Optimism Sepolia",
    rpcUrl: PUBLIC_RPC_URLS[11155420],
    explorerUrl: "https://sepolia-optimism.etherscan.io",
    blockExplorer: "https://sepolia-optimism.etherscan.io",
    apiUrl: "https://api-sepolia-optimism.etherscan.io/api",
    explorers: [
      {
        name: "Optimism Sepolia Etherscan",
        url: "https://api-sepolia-optimism.etherscan.io/api",
        type: "etherscan",
      },
    ],
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
  },
  {
    id: 56,
    name: "BSC",
    rpcUrl: PUBLIC_RPC_URLS[56],
    explorerUrl: "https://bscscan.com",
    blockExplorer: "https://bscscan.com",
    apiUrl: "https://api.bscscan.com/api",
    explorers: [
      {
        name: "BSCScan",
        url: "https://api.bscscan.com/api",
        type: "etherscan",
      },
    ],
    nativeCurrency: {
      name: "BNB",
      symbol: "BNB",
      decimals: 18,
    },
  },
  {
    id: 97,
    name: "BNB Testnet",
    rpcUrl: PUBLIC_RPC_URLS[97],
    explorerUrl: "https://testnet.bscscan.com",
    blockExplorer: "https://testnet.bscscan.com",
    apiUrl: "https://api-testnet.bscscan.com/api",
    explorers: [
      {
        name: "BscScan Testnet",
        url: "https://api-testnet.bscscan.com/api",
        type: "etherscan",
      },
    ],
    nativeCurrency: {
      name: "BNB",
      symbol: "tBNB",
      decimals: 18,
    },
  },
  {
    id: 43114,
    name: "Avalanche",
    rpcUrl: PUBLIC_RPC_URLS[43114],
    explorerUrl: "https://snowtrace.io",
    blockExplorer: "https://snowtrace.io",
    apiUrl: "https://api.snowtrace.io/api",
    explorers: [
      {
        name: "Snowtrace",
        url: "https://api.snowtrace.io/api",
        type: "etherscan",
      },
    ],
    nativeCurrency: {
      name: "Avalanche",
      symbol: "AVAX",
      decimals: 18,
    },
  },
  {
    id: 100,
    name: "Gnosis",
    rpcUrl: PUBLIC_RPC_URLS[100],
    explorerUrl: "https://gnosisscan.io",
    blockExplorer: "https://gnosisscan.io",
    apiUrl: "https://api.gnosisscan.io/api",
    explorers: [
      {
        name: "GnosisScan",
        url: "https://api.gnosisscan.io/api",
        type: "etherscan",
      },
      {
        name: "Gnosis Blockscout",
        url: "https://gnosis.blockscout.com/api",
        type: "blockscout",
      },
    ],
    nativeCurrency: {
      name: "xDai",
      symbol: "xDAI",
      decimals: 18,
    },
  },
];

export const getChainById = (id: number): Chain | undefined => {
  return SUPPORTED_CHAINS.find((chain) => chain.id === id);
};

export const getExplorerUrl = (chainId: number, type: "tx" | "address" | "block", hash: string): string => {
  const chain = getChainById(chainId);
  if (!chain) return "";
  
  const baseUrl = chain.explorerUrl;
  switch (type) {
    case "tx":
      return `${baseUrl}/tx/${hash}`;
    case "address":
      return `${baseUrl}/address/${hash}`;
    case "block":
      return `${baseUrl}/block/${hash}`;
    default:
      return "";
  }
};
