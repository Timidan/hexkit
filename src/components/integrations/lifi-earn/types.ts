export interface EarnToken {
  address: string;
  symbol: string;
  name?: string;
  decimals: number;
  chainId?: number;
  logoURI?: string;
  /** USD price per unit (from Composer quote responses). */
  priceUSD?: string;
}

export interface EarnProtocol {
  name: string;
  slug?: string;
  url?: string;
  logoURI?: string;
}

// GET /v1/earn/chains response element — authoritative list of chains Earn indexes.
// networkCaip is EIP-155 CAIP-2 format ("eip155:1") — unused today but kept for
// future WalletConnect v2 scope wiring.
export interface EarnChainInfo {
  chainId: number;
  name: string;
  networkCaip: string;
}

// GET /v1/earn/protocols response element. `name` is the slug we compare against
// `EarnVault.protocol.name` (both are "aave-v3", "morpho-v1", etc.). `url` is
// the protocol's canonical frontend.
export interface EarnProtocolInfo {
  name: string;
  url: string;
}

export interface EarnApy {
  base: number | null;
  reward: number | null;
  total: number | null;
}

export interface EarnAnalytics {
  apy: EarnApy;
  apy1d: number | null;
  apy7d: number | null;
  apy30d: number | null;
  tvl: {
    usd: string;
  };
  updatedAt?: string;
}

export interface EarnVault {
  address: string;
  name?: string;
  network: string;
  chainId: number;
  slug: string;
  protocol: EarnProtocol;
  underlyingTokens: EarnToken[];
  tags: string[];
  analytics: EarnAnalytics;
  isTransactional: boolean;
  isRedeemable: boolean;
  depositPacks: Array<{ name: string; stepsType?: string }>;
  redeemPacks: Array<{ name: string; stepsType?: string }>;
}

export interface EarnVaultsResponse {
  data: EarnVault[];
  nextCursor?: string | null;
}

// balanceUsd/balanceNative are top-level strings, not nested. protocolName
// is a slug like "aave-v3" — display code prettifies it.
export interface EarnPosition {
  chainId: number;
  protocolName: string;
  asset: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
  };
  balanceUsd: string;
  balanceNative: string;
}

export interface EarnPortfolioResponse {
  positions: EarnPosition[];
}

export interface ComposerQuoteResponse {
  transactionRequest: {
    to: string;
    data: string;
    value: string;
    gasLimit: string;
    gasPrice?: string;
    chainId: number;
  };
  estimate: {
    fromAmount: string;
    fromAmountUSD?: string;
    toAmount: string;
    toAmountMin: string;
    toAmountUSD?: string;
    gasCosts: Array<{
      amount: string;
      amountUSD: string;
      token: EarnToken;
    }>;
    approvalAddress: string;
  };
  action: {
    fromToken: EarnToken;
    toToken: EarnToken;
    fromChainId: number;
    toChainId: number;
    fromAmount: string;
  };
  includedSteps?: Array<{
    action?: {
      fromToken?: EarnToken;
      toToken?: EarnToken;
    };
  }>;
}

export interface VaultFilters {
  chainId: number | null;
  protocol: string | null;
  tag: string | null;
  minApy: number | null;
  search: string;
  sortBy: "apy" | "tvl" | "name";
  sortDir: "asc" | "desc";
}

// https://docs.li.fi/references/api-reference#status
export interface LifiStatusResponse {
  status: "NOT_FOUND" | "INVALID" | "PENDING" | "DONE" | "FAILED";
  substatus?: string;
  substatusMessage?: string;
  sending?: {
    txHash?: string;
    chainId?: number;
    amount?: string;
  };
  receiving?: {
    txHash?: string;
    chainId?: number;
    amount?: string;
  };
}
