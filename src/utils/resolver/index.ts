/**
 * Contract Resolver Module
 *
 * Unified contract resolution with:
 * - Multi-source fetching (Sourcify, Etherscan, Blockscout)
 * - Racing strategy with settlement window
 * - Request deduplication
 * - Two-layer caching (memory + IndexedDB)
 * - Multi-chain parallel search
 * - Diamond contract resolution
 */

// Main resolver
export { contractResolver, ContractResolver } from './ContractResolver';

// Multi-chain search
export {
  searchAcrossChains,
  quickSearchAcrossChains,
  findAllDeployments,
} from './multiChainSearch';

// Diamond resolution helpers (lightweight ABI checks only)
export {
  hasDiamondLoupeFunctions,
  mightBeDiamond,
} from './diamondLoupe';

// Proxy resolution
export {
  resolveProxyInfo,
  isLikelyProxy,
  resolveNestedProxies,
  clearProxyCache,
  clearAllProxyCache,
} from './proxyResolver';

// Contract context (unified proxy + token detection)
export {
  resolveContractContext,
  contractExists,
  clearContextCache,
  clearAllContextCache,
  type ContractContext,
  type ContractContextOptions,
} from './contractContext';

// Cache
export { contractCache } from './ContractCache';

// Types
export type {
  // Core types
  Source,
  Confidence,
  SourceStatus,
  SourceAttempt,
  SourceConfig,

  // ABI types
  AbiItem,
  AbiInput,
  AbiOutput,
  ExternalFunction,

  // Result types
  ResolveResult,
  ResolveOptions,
  SourceResult,

  // Enrichment types
  TokenInfo,
  ProxyInfo,
  ProxyType,
  DiamondInfo,
  FacetInfo,
  ContractMetadata,

  // Search types
  MultiChainSearchOptions,
  MultiChainSearchResult,
  DiamondResolveOptions,

  // Cache types
  CachedContract,
  CacheStats,
} from './types';

// Constants & Helpers
export { SOURCE_CONFIGS, isVerifiedConfidence, isReadFunction, isWriteFunction, extractExternalFunctions } from './types';
