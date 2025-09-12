import type { Chain } from '../types';

export const SUPPORTED_CHAINS: Chain[] = [
  {
    id: 1,
    name: 'Ethereum',
    rpcUrl: 'https://mainnet.infura.io/v3/',
    explorerUrl: 'https://etherscan.io',
    blockExplorer: 'https://etherscan.io',
    apiUrl: 'https://api.etherscan.io/api',
    explorers: [
      { name: 'Etherscan', url: 'https://api.etherscan.io/api', type: 'etherscan' },
      { name: 'Blockscout', url: 'https://eth.blockscout.com/api', type: 'blockscout' }
    ],
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  {
    id: 8453,
    name: 'Base',
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    blockExplorer: 'https://basescan.org',
    apiUrl: 'https://api.basescan.org/api',
    explorers: [
      { name: 'BaseScan', url: 'https://api.basescan.org/api', type: 'etherscan' },
      { name: 'Blockscout', url: 'https://base.blockscout.com/api', type: 'blockscout' }
    ],
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  {
    id: 137,
    name: 'Polygon',
    rpcUrl: 'https://polygon-rpc.com/',
    explorerUrl: 'https://polygonscan.com',
    blockExplorer: 'https://polygonscan.com',
    apiUrl: 'https://api.polygonscan.com/api',
    explorers: [
      { name: 'PolygonScan', url: 'https://api.polygonscan.com/api', type: 'etherscan' },
      { name: 'Blockscout', url: 'https://polygon.blockscout.com/api', type: 'blockscout' }
    ],
    nativeCurrency: {
      name: 'Polygon',
      symbol: 'MATIC',
      decimals: 18,
    },
  },
  {
    id: 56,
    name: 'BSC',
    rpcUrl: 'https://bsc-dataseed.binance.org/',
    explorerUrl: 'https://bscscan.com',
    blockExplorer: 'https://bscscan.com',
    apiUrl: 'https://api.bscscan.com/api',
    explorers: [
      { name: 'BSCScan', url: 'https://api.bscscan.com/api', type: 'etherscan' }
    ],
    nativeCurrency: {
      name: 'Binance Coin',
      symbol: 'BNB',
      decimals: 18,
    },
  },
  {
    id: 42161,
    name: 'Arbitrum One',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    blockExplorer: 'https://arbiscan.io',
    apiUrl: 'https://api.arbiscan.io/api',
    explorers: [
      { name: 'Arbiscan', url: 'https://api.arbiscan.io/api', type: 'etherscan' },
      { name: 'Blockscout', url: 'https://arbitrum.blockscout.com/api', type: 'blockscout' }
    ],
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  {
    id: 10,
    name: 'Optimism',
    rpcUrl: 'https://mainnet.optimism.io',
    explorerUrl: 'https://optimistic.etherscan.io',
    blockExplorer: 'https://optimistic.etherscan.io',
    apiUrl: 'https://api-optimistic.etherscan.io/api',
    explorers: [
      { name: 'Optimistic Etherscan', url: 'https://api-optimistic.etherscan.io/api', type: 'etherscan' },
      { name: 'Blockscout', url: 'https://optimism.blockscout.com/api', type: 'blockscout' }
    ],
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  {
    id: 100,
    name: 'Gnosis',
    rpcUrl: 'https://rpc.gnosischain.com',
    explorerUrl: 'https://gnosisscan.io',
    blockExplorer: 'https://gnosisscan.io',
    apiUrl: 'https://api.gnosisscan.io/api',
    explorers: [
      { name: 'GnosisScan', url: 'https://api.gnosisscan.io/api', type: 'etherscan' },
      { name: 'Blockscout', url: 'https://gnosis.blockscout.com/api', type: 'blockscout' }
    ],
    nativeCurrency: {
      name: 'xDAI',
      symbol: 'xDAI',
      decimals: 18,
    },
  },
];

export const getChainById = (chainId: number): Chain | undefined => {
  return SUPPORTED_CHAINS.find(chain => chain.id === chainId);
};

export const getChainByName = (name: string): Chain | undefined => {
  return SUPPORTED_CHAINS.find(chain => chain.name.toLowerCase() === name.toLowerCase());
};