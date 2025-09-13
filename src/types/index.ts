export interface ExplorerAPI {
  name: string;
  url: string;
  type: 'etherscan' | 'blockscout';
}

export interface Chain {
  id: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  blockExplorer: string; // Add blockExplorer property
  apiUrl: string; // Primary API (for backward compatibility)
  explorers: ExplorerAPI[]; // Multiple explorer APIs
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export interface ABIFetchResult {
  success: boolean;
  abi?: string;
  error?: string;
}

export interface ContractInfo {
  address: string;
  chain: Chain;
  abi?: string;
  name?: string;
  verified?: boolean;
}