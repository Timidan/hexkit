import type { Chain } from "../types";

const API_KEY =
  (import.meta.env as unknown as { API_KEY?: string; VITE_API_KEY?: string })
    .API_KEY ||
  (import.meta.env as unknown as { API_KEY?: string; VITE_API_KEY?: string })
    .VITE_API_KEY ||
  "";

export const SUPPORTED_CHAINS: Chain[] = [
  {
    id: 1,
    name: "Ethereum",
    rpcUrl: API_KEY ? `https://eth-mainnet.g.alchemy.com/v2/${API_KEY}` : "https://ethereum.publicnode.com",
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
    rpcUrl: API_KEY
      ? `https://eth-sepolia.g.alchemy.com/v2/${API_KEY}`
      : "https://rpc.sepolia.ethpandaops.io",
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
    rpcUrl: `https://base-mainnet.g.alchemy.com/v2/${API_KEY}`,
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
    rpcUrl: API_KEY
      ? `https://base-sepolia.g.alchemy.com/v2/${API_KEY}`
      : "https://sepolia.base.org",
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
    rpcUrl: "https://ethereum-holesky.publicnode.com",
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
    rpcUrl: "https://rpc.sepolia-api.lisk.com",
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
    rpcUrl: `https://polygon-mainnet.g.alchemy.com/v2/${API_KEY}`,
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
    rpcUrl: "https://rpc-amoy.polygon.technology",
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
    rpcUrl: `https://arb-mainnet.g.alchemy.com/v2/${API_KEY}`,
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
    rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
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
    rpcUrl: `https://opt-mainnet.g.alchemy.com/v2/${API_KEY}`,
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
    rpcUrl: "https://sepolia.optimism.io",
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
    rpcUrl: "https://bsc-dataseed.binance.org/",
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
    rpcUrl: "https://bsc-testnet.public.blastapi.io",
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
    rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
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
];

export const getChainById = (id: number): Chain | undefined => {
  return SUPPORTED_CHAINS.find((chain) => chain.id === id);
};

export const getChainByName = (name: string): Chain | undefined => {
  return SUPPORTED_CHAINS.find((chain) => chain.name.toLowerCase() === name.toLowerCase());
};

export const getChainByRpcUrl = (rpcUrl: string): Chain | undefined => {
  return SUPPORTED_CHAINS.find((chain) => chain.rpcUrl === rpcUrl);
};

export const getAllChainIds = (): number[] => {
  return SUPPORTED_CHAINS.map((chain) => chain.id);
};

export const getAllChainNames = (): string[] => {
  return SUPPORTED_CHAINS.map((chain) => chain.name);
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

export const getApiUrl = (chainId: number): string => {
  const chain = getChainById(chainId);
  return chain?.apiUrl || "";
};

export const getRpcUrl = (chainId: number): string => {
  const chain = getChainById(chainId);
  return chain?.rpcUrl || "";
};
