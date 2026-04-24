import type { EvmChainKey } from "../chains/types/evm";

export interface ExplorerAPI {
  name: string;
  url: string;
  type: 'etherscan' | 'blockscout';
}

export type ExplorerSource = 'sourcify' | 'blockscout' | 'etherscan';

// Legacy EVM-only chain shape. chainFamily + chainKey added so generic
// code can route by family without breaking the numeric-id consumers.
export interface Chain {
  id: number;
  chainFamily: 'evm';
  chainKey: EvmChainKey;
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
