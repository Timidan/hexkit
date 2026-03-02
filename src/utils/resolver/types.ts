/**
 * Contract Resolver Type Definitions
 *
 * Core types for the unified contract resolution system.
 * Designed for parallel fetching, proper caching, and progressive enhancement.
 */

import type { Chain } from '../../types';

export type Source = 'sourcify' | 'etherscan' | 'blockscout' | 'blockscout-ebd' | 'whatsabi';

export type Confidence = 'verified' | 'inferred' | 'bytecode-only';

export type SourceStatus = 'pending' | 'fetching' | 'success' | 'failed' | 'timeout' | 'skipped';

export interface SourceAttempt {
  source: Source;
  status: SourceStatus;
  durationMs: number;
  error?: string;
  confidence?: Confidence;
}

export interface SourceConfig {
  name: Source;
  timeout: number;
  priority: number; // Lower = preferred (tried first in race)
  rateLimit?: number; // Requests per second (for throttling)
}

export interface AbiInput {
  name: string;
  type: string;
  internalType?: string;
  indexed?: boolean;
  components?: AbiInput[];
}

export interface AbiOutput {
  name: string;
  type: string;
  internalType?: string;
  components?: AbiOutput[];
}

export interface AbiItem {
  type: 'function' | 'event' | 'error' | 'constructor' | 'fallback' | 'receive';
  name?: string;
  inputs?: AbiInput[];
  outputs?: AbiOutput[];
  stateMutability?: 'pure' | 'view' | 'nonpayable' | 'payable';
  anonymous?: boolean;
  constant?: boolean;
  payable?: boolean;
}

export interface ExternalFunction {
  name: string;
  signature: string;
  selector: string;
  inputs: AbiInput[];
  outputs: AbiOutput[];
  stateMutability: 'pure' | 'view' | 'nonpayable' | 'payable';
}

export interface TokenInfo {
  name?: string;
  symbol?: string;
  decimals?: number;
  totalSupply?: string;
  tokenType?: 'ERC20' | 'ERC721' | 'ERC1155' | 'ERC777' | 'ERC4626';
}

export type ProxyType =
  | 'eip1967'
  | 'eip1967-beacon'
  | 'eip1822'
  | 'eip1167' // Minimal proxy / Clone
  | 'gnosis-safe'
  | 'diamond'
  | 'transparent'
  | 'unknown';

export interface ProxyInfo {
  isProxy: boolean;
  proxyType?: ProxyType;
  implementationAddress?: string;
  implementations?: string[]; // For nested or multiple implementations
  adminAddress?: string;
  beaconAddress?: string; // For beacon proxies
}

export interface FacetInfo {
  address: string;
  name?: string;
  abi: AbiItem[] | null;
  confidence: Confidence;
  source?: Source;
  selectors: string[];
  functions: ExternalFunction[];
}

export interface DiamondInfo {
  isDiamond: boolean;
  facets: FacetInfo[];
  combinedAbi: AbiItem[];
  totalFunctions: number;
  totalSelectors: number;
}

export interface ContractMetadata {
  compiler?: string;
  compilerVersion?: string;
  optimization?: boolean;
  optimizationRuns?: number;
  evmVersion?: string;
  license?: string;
  sourceCode?: string;
  constructorArguments?: string;
  /** All source files: { path: content } */
  sources?: Record<string, string>;
  /** Path to the main contract file */
  mainSourcePath?: string;
}

export interface ResolveResult {
  // Identity
  address: string;
  chainId: number;
  chain: Chain;

  // Core data
  abi: AbiItem[] | null;
  name: string | null;

  // Quality indicators
  source: Source | null;
  confidence: Confidence;
  verified: boolean;

  // Parsed functions (for UI convenience)
  functions: {
    read: ExternalFunction[];
    write: ExternalFunction[];
  };

  // Optional enrichments
  tokenInfo?: TokenInfo;
  proxyInfo?: ProxyInfo;
  diamondInfo?: DiamondInfo;
  metadata?: ContractMetadata;

  // Debugging & telemetry
  resolvedAt: number;
  durationMs: number;
  attempts: SourceAttempt[];
  fromCache: boolean;

  // Error state
  error?: string;
}

export interface ResolveOptions {
  signal?: AbortSignal;
  priority?: 'speed' | 'completeness';
  skipCache?: boolean;
  preferredSources?: Source[];
  etherscanApiKey?: string;
  blockscoutApiKey?: string;
  onProgress?: (attempt: SourceAttempt) => void;
}

export interface SourceResult {
  success: boolean;
  abi?: AbiItem[];
  name?: string;
  confidence?: Confidence;
  source?: Source;
  metadata?: ContractMetadata;
  tokenInfo?: TokenInfo;
  proxyInfo?: ProxyInfo;
  error?: string;
  needsApiKey?: boolean;
}

export interface CachedContract {
  key: string;
  address: string;
  chainId: number;
  data: ResolveResult;
  cachedAt: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheStats {
  memorySize: number;
  persistedSize: number;
  hitRate: number;
  totalHits: number;
  totalMisses: number;
}

export interface MultiChainSearchOptions {
  signal?: AbortSignal;
  stopOnFirst?: boolean;
  etherscanApiKey?: string;
  onProgress?: (chainId: number, result: ResolveResult | null, error?: string) => void;
}

export interface MultiChainSearchResult {
  results: Map<number, ResolveResult>;
  firstFound: ResolveResult | null;
  errors: Map<number, string>;
  duration: number;
}

export interface DiamondResolveOptions {
  signal?: AbortSignal;
  concurrency?: number;
  etherscanApiKey?: string;
  onFacetProgress?: (completed: number, total: number, facet?: FacetInfo) => void;
}

export const SOURCE_CONFIGS: Record<Source, SourceConfig> = {
  sourcify: { name: 'sourcify', timeout: 4000, priority: 1 },
  etherscan: { name: 'etherscan', timeout: 5000, priority: 2, rateLimit: 5 },
  blockscout: { name: 'blockscout', timeout: 5000, priority: 3 },
  'blockscout-ebd': { name: 'blockscout-ebd', timeout: 8000, priority: 4 },
  whatsabi: { name: 'whatsabi', timeout: 6000, priority: 5 },
};

export const isVerifiedConfidence = (confidence: Confidence): boolean =>
  confidence === 'verified';

export const isReadFunction = (fn: ExternalFunction): boolean =>
  fn.stateMutability === 'view' || fn.stateMutability === 'pure';

export const isWriteFunction = (fn: ExternalFunction): boolean =>
  fn.stateMutability === 'nonpayable' || fn.stateMutability === 'payable';

/**
 * Extract external functions from an ABI array, grouped into read and write buckets.
 * Shared utility used by ContractResolver and contractContext.
 */
export function extractExternalFunctions(abi: AbiItem[]): {
  read: ExternalFunction[];
  write: ExternalFunction[];
} {
  const read: ExternalFunction[] = [];
  const write: ExternalFunction[] = [];

  for (const item of abi) {
    if (item.type !== 'function' || !item.name) continue;

    const fn: ExternalFunction = {
      name: item.name,
      signature: `${item.name}(${(item.inputs || []).map((i) => i.type).join(',')})`,
      selector: '', // Will be computed if needed
      inputs: item.inputs || [],
      outputs: item.outputs || [],
      stateMutability: item.stateMutability || 'nonpayable',
    };

    if (fn.stateMutability === 'view' || fn.stateMutability === 'pure') {
      read.push(fn);
    } else {
      write.push(fn);
    }
  }

  return { read, write };
}
