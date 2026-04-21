export type { Chain, ExplorerAPI, ExplorerSource } from './chain';

export type {
  ABIFetchResult,
  ExtendedABIFetchResult,
  ExtendedABITokenInfo,
} from './abi';

import type { Chain } from './chain';

export interface ContractInfo {
  address: string;
  chain: Chain;
  abi?: string;
  name?: string;
  verified?: boolean;
}

export type { ContractInfoResult } from './contractInfo';
