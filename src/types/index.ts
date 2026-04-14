export interface ExplorerAPI {
  name: string;
  url: string;
  type: 'etherscan' | 'blockscout';
}

export type ExplorerSource = 'sourcify' | 'blockscout' | 'etherscan';

export interface Chain {
  id: number;
  name: string;
  rpcUrl: string;
  explorerUrl?: string;
  blockExplorer?: string;
  apiUrl?: string;
  explorers?: ExplorerAPI[];
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

export type {
  ContractInfoResult,
} from './contractInfo';

export type {
  ExtendedABIFetchResult,
  ExtendedABITokenInfo,
} from './abi';
