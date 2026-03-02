import type { Chain } from './index';

export type ContractSearchStatus = 'searching' | 'found' | 'not_found' | 'error';

export interface ContractInfoResult {
  success: boolean;
  address: string;
  chain: Chain;
  contractName?: string;
  abi?: string;
  source?: 'sourcify' | 'blockscout' | 'etherscan' | 'blockscout-bytecode' | 'blockscout-ebd' | 'whatsabi';
  explorerName?: string;
  verified?: boolean;
  // Optional tokenType for legacy UI; current detection happens elsewhere
  tokenType?: string;
  // NOTE: tokenType is now determined exclusively by ERC165 supportsInterface() calls in the main component
  tokenInfo?: {
    name?: string;
    symbol?: string;
    decimals?: number;
    totalSupply?: string;
  };
  externalFunctions?: Array<{
    name: string;
    signature: string;
    inputs: Array<{ name: string; type: string }>;
    outputs: Array<{ name: string; type: string }>;
    stateMutability: 'view' | 'pure' | 'nonpayable' | 'payable';
  }>;
  error?: string;
  searchProgress?: Array<{
    source: string;
    status: ContractSearchStatus;
    message?: string;
  }>;
}

export type ContractExternalFunction = NonNullable<
  ContractInfoResult['externalFunctions']
>[number];

export type ContractTokenInfo = NonNullable<ContractInfoResult['tokenInfo']>;

export type ContractSearchProgress = NonNullable<
  ContractInfoResult['searchProgress']
>[number];
