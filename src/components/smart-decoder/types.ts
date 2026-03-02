export const ETHERSCAN_INSTANCES = [
  { name: 'Ethereum Mainnet', url: 'https://api.etherscan.io', chainId: '1', apiKeyParam: 'etherscan' },
  { name: 'Polygon', url: 'https://api.polygonscan.com', chainId: '137', apiKeyParam: 'polygonscan' },
  { name: 'BSC', url: 'https://api.bscscan.com', chainId: '56', apiKeyParam: 'bscscan' },
  { name: 'Arbitrum One', url: 'https://api.arbiscan.io', chainId: '42161', apiKeyParam: 'arbiscan' },
  { name: 'Optimism', url: 'https://api-optimistic.etherscan.io', chainId: '10', apiKeyParam: 'optimism' },
  { name: 'Base Mainnet', url: 'https://api.basescan.org', chainId: '8453', apiKeyParam: 'basescan' },
  { name: 'Avalanche', url: 'https://api.snowtrace.io', chainId: '43114', apiKeyParam: 'snowtrace' },
  { name: 'Fantom', url: 'https://api.ftmscan.com', chainId: '250', apiKeyParam: 'ftmscan' },
];

export const BLOCKSCOUT_INSTANCES = [
  { name: 'Ethereum Mainnet', url: 'https://eth.blockscout.com', chainId: '1' },
  { name: 'Base Mainnet', url: 'https://base.blockscout.com', chainId: '8453' },
  { name: 'Arbitrum One', url: 'https://arbitrum.blockscout.com', chainId: '42161' },
  { name: 'Optimism', url: 'https://optimism.blockscout.com', chainId: '10' },
  { name: 'Polygon', url: 'https://polygon.blockscout.com', chainId: '137' },
  { name: 'Gnosis Chain', url: 'https://gnosis.blockscout.com', chainId: '100' },
  { name: 'BSC', url: 'https://bsc.blockscout.com', chainId: '56' },
  { name: 'Ethereum Classic', url: 'https://etc.blockscout.com', chainId: '61' },
];

export type AbiAcquisitionMode = 'address' | 'paste';
export type DecoderViewMode = 'overview' | 'raw';
export type LookupMode = 'multi' | 'single';

export type CachedAbiEntry = {
  abi: any[];
  sourceLabel: string;
  kind: 'etherscan' | 'blockscout';
  contractName?: string;
  functionCount: number;
  eventCount: number;
  chainId?: string;
};

export type AbiFetchResult = {
  abi: any[];
  chainId?: string;
  sourceKind: 'etherscan' | 'blockscout';
  sourceName: string;
};

export type AbiSourceType = 'sourcify' | 'blockscout' | 'etherscan' | 'manual' | 'signatures' | 'heuristic' | null;

export type ContractConfirmationState = {
  show: boolean;
  contractInfo: any;
  abi: any;
  onConfirm: () => void;
  onContinueSearch: () => void;
} | null;
