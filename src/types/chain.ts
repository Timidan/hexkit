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
