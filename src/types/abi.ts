export interface ABIFetchResult {
  success: boolean;
  abi?: string;
  error?: string;
}

export interface ExtendedABITokenInfo {
  name?: string;
  symbol?: string;
  decimals?: string;
  totalSupply?: string;
  tokenType?: string;
  divisor?: string;
}

export interface ExtendedABIFetchResult extends ABIFetchResult {
  source?: string;
  explorerName?: string;
  contractName?: string;
  compilerVersion?: string;
  sourceCode?: string;
  contractType?: string;
  tokenInfo?: ExtendedABITokenInfo;
  confidence?: string;
  selectors?: string[];
  proxyType?: string;
  implementations?: string[];
}
