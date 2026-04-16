/**
 * Contract Context Resolver
 *
 * THE single entry point for all contract resolution across modules.
 * Combines ABI fetching, proxy detection, implementation ABI resolution,
 * token detection, and diamond resolution into one unified pipeline.
 *
 * Consumers:
 * - SmartDecoder: { abi: true, proxy: true }
 * - SimpleGridUI: { abi: true, proxy: true, token: true, diamond: true }
 * - ContractExplorer: { abi: true, proxy: true, token: true }
 *
 * Pipeline:
 * 1. Check bytecode exists
 * 2. PARALLEL: contractResolver.resolve(address) + resolveProxyInfo(address)
 * 3. IF proxy with implementationAddress → contractResolver.resolve(implAddress)
 * 4. Merge ABIs (implementation takes priority, proxy admin functions kept)
 * 5. IF token detection requested → detectTokenType()
 * 6. IF diamond detection requested → resolveDiamond()
 * 7. Cache and return
 */

import { ethers } from 'ethers';
import type { Chain } from '../../types';
import type {
  AbiItem,
  ExternalFunction,
  ProxyInfo,
  TokenInfo,
  DiamondInfo,
  ContractMetadata,
  Source,
  Confidence,
  SourceAttempt,
  ResolveResult,
} from './types';
import { extractExternalFunctions } from './types';
import { getSharedProvider } from '../providerPool';
import { resolveProxyInfo } from './proxyResolver';
import { contractResolver } from './ContractResolver';
import { hasDiamondLoupeFunctions } from './diamondLoupe';
import { detectTokenType, type TokenDetectionResult } from '../universalTokenDetector';
import { networkConfigManager } from '../../config/networkConfig';
import { ZERO_ADDRESS } from '../addressConstants';

export interface ContractContext {
  address: string;
  chainId: number;

  // Existence check
  exists: boolean;
  hasCode: boolean;

  // ABI data (merged if proxy — implementation functions + proxy admin functions)
  abi: AbiItem[] | null;
  implementationAbi: AbiItem[] | null;
  implementationAddress: string | null;
  name: string | null;
  proxyName: string | null;
  implementationName: string | null;

  // Quality indicators
  source: Source | null;
  confidence: Confidence;
  verified: boolean;
  implementationSource: Source | null;
  implementationConfidence: Confidence | null;
  implementationVerified: boolean;

  // Parsed functions (for UI convenience)
  functions: { read: ExternalFunction[]; write: ExternalFunction[] };

  // Proxy detection (checked in correct order - Diamond first)
  proxyInfo: ProxyInfo | null;

  // Token detection
  tokenInfo: TokenInfo | null;
  tokenType: 'ERC20' | 'ERC721' | 'ERC1155' | null;

  // Diamond info
  diamondInfo: DiamondInfo | null;

  // Contract metadata (compiler, source code, etc.)
  metadata: ContractMetadata | null;
  implementationMetadata: ContractMetadata | null;
  implementationAttempts: SourceAttempt[];

  // Telemetry
  attempts: SourceAttempt[];
  resolvedAt: number;
  durationMs: number;
  fromCache: boolean;
}

export interface ContractContextOptions {
  /** Fetch ABI from sources (default: true) */
  abi?: boolean;
  /** Detect proxy type via RPC (default: true) */
  proxy?: boolean;
  /** Detect token type (default: false) */
  token?: boolean;
  /** Resolve diamond facets (default: false) */
  diamond?: boolean;

  /** Skip cache lookup */
  skipCache?: boolean;
  /** Timeout for proxy detection in ms (default: 10000) */
  proxyTimeout?: number;
  /** Timeout for ABI fetching in ms (default: 15000) */
  abiTimeout?: number;

  /** Progress callback for UI feedback */
  onProgress?: (step: string, detail?: string) => void;
  /** Abort signal */
  signal?: AbortSignal;

  /** API keys */
  etherscanApiKey?: string;
  blockscoutApiKey?: string;
}

type ResolutionFlags = {
  abi: boolean;
  proxy: boolean;
  token: boolean;
  diamond: boolean;
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CONTEXT_CACHE_MAX_SIZE = 300;

interface CacheEntry {
  result: ContractContext;
  timestamp: number;
}

const contextCache = new Map<string, CacheEntry>();

// In-flight deduplication
const inflightRequests = new Map<string, Promise<ContractContext>>();

function flagsToKey(flags: ResolutionFlags): string {
  return `${flags.abi ? 1 : 0}${flags.proxy ? 1 : 0}${flags.token ? 1 : 0}${flags.diamond ? 1 : 0}`;
}

function getCacheKey(address: string, chainId: number, flags?: ResolutionFlags): string {
  const base = `${chainId}:${address.toLowerCase()}`;
  if (!flags) return base;
  return `${base}:${flagsToKey(flags)}`;
}

function getCachedContext(
  address: string,
  chainId: number,
  flags: ResolutionFlags
): ContractContext | null {
  const key = getCacheKey(address, chainId, flags);
  const entry = contextCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.result;
  }
  if (entry) {
    contextCache.delete(key);
  }
  return null;
}

function setCachedContext(
  address: string,
  chainId: number,
  flags: ResolutionFlags,
  result: ContractContext
): void {
  const key = getCacheKey(address, chainId, flags);
  contextCache.set(key, { result, timestamp: Date.now() });

  // LRU eviction: if cache exceeds max size, delete oldest entries
  if (contextCache.size > CONTEXT_CACHE_MAX_SIZE) {
    const keysIter = contextCache.keys();
    while (contextCache.size > CONTEXT_CACHE_MAX_SIZE) {
      const oldest = keysIter.next();
      if (oldest.done) break;
      contextCache.delete(oldest.value);
    }
  }
}

/**
 * Clear cache for a specific contract
 */
export function clearContextCache(address: string, chainId: number): void {
  const baseKey = getCacheKey(address, chainId);
  for (const key of contextCache.keys()) {
    if (key === baseKey || key.startsWith(`${baseKey}:`)) {
      contextCache.delete(key);
    }
  }
}

/**
 * Clear all context cache
 */
export function clearAllContextCache(): void {
  contextCache.clear();
}

/**
 * Merge proxy ABI with implementation ABI.
 * Implementation functions take priority. Proxy admin functions are kept.
 * All events and errors from both are included (deduped by name+inputs).
 */
function mergeAbis(proxyAbi: AbiItem[], implAbi: AbiItem[]): AbiItem[] {
  const implMap = new Map<string, AbiItem>();
  for (const item of implAbi) {
    const key = getAbiItemKey(item);
    if (key) implMap.set(key, item);
  }

  const merged: AbiItem[] = [...implAbi];
  const mergedKeys = new Set(
    implAbi.map(getAbiItemKey).filter((k): k is string => k !== null)
  );

  for (const item of proxyAbi) {
    const key = getAbiItemKey(item);
    if (key && !mergedKeys.has(key)) {
      merged.push(item);
      mergedKeys.add(key);
    }
  }

  return merged;
}

function getAbiItemKey(item: AbiItem): string | null {
  if (!item.name) return null;
  const inputTypes = (item.inputs || []).map((i) => i.type).join(',');
  return `${item.type}:${item.name}(${inputTypes})`;
}

const IMPLEMENTATION_SELECTOR = '0x5c60da1b'; // implementation()

function slotToAddress(slotValue: string): string | null {
  if (!slotValue || slotValue === '0x' || slotValue === '0x0') return null;
  const hex = slotValue.replace(/^0x/, '').padStart(64, '0');
  const addressHex = hex.slice(-40);
  const address = `0x${addressHex}`;
  if (address.toLowerCase() === ZERO_ADDRESS) return null;
  return /^0x[0-9a-fA-F]{40}$/i.test(address) ? address : null;
}

async function getDirectImplementation(
  proxyAddress: string,
  provider: ethers.providers.Provider
): Promise<string | null> {
  try {
    const result = await provider.call({
      to: proxyAddress,
      data: IMPLEMENTATION_SELECTOR,
    });

    if (!result || result === '0x' || result.length < 66) return null;
    const impl = slotToAddress(result);
    if (!impl) return null;

    const code = await provider.getCode(impl);
    if (!code || code === '0x') return null;

    return impl;
  } catch {
    return null;
  }
}

function createEmptyContext(address: string, chainId: number): ContractContext {
  return {
    address,
    chainId,
    exists: false,
    hasCode: false,
    abi: null,
    implementationAbi: null,
    implementationAddress: null,
    name: null,
    proxyName: null,
    implementationName: null,
    source: null,
    confidence: 'bytecode-only',
    verified: false,
    implementationSource: null,
    implementationConfidence: null,
    implementationVerified: false,
    functions: { read: [], write: [] },
    proxyInfo: null,
    tokenInfo: null,
    tokenType: null,
    diamondInfo: null,
    metadata: null,
    implementationMetadata: null,
    implementationAttempts: [],
    attempts: [],
    resolvedAt: Date.now(),
    durationMs: 0,
    fromCache: false,
  };
}

/**
 * Resolve full context for a contract address.
 *
 * This is THE entry point all UI modules should use for contract resolution.
 * It handles ABI fetching, proxy detection, implementation ABI merging,
 * token detection, and diamond resolution in one pipeline.
 */
export async function resolveContractContext(
  address: string,
  chain: Chain,
  options: ContractContextOptions = {}
): Promise<ContractContext> {
  const startTime = performance.now();
  const chainId = chain.id;
  const {
    abi: fetchAbi = true,
    proxy: detectProxy = true,
    token: detectToken = false,
    diamond: detectDiamond = false,
    skipCache = false,
    proxyTimeout = 10000,
    abiTimeout = 15000,
    onProgress,
    signal,
    etherscanApiKey,
    blockscoutApiKey,
  } = options;
  const resolvedEtherscanKey =
    etherscanApiKey?.trim() || networkConfigManager.getEtherscanApiKey();
  const resolvedBlockscoutKey =
    blockscoutApiKey?.trim() || networkConfigManager.getBlockscoutApiKey();

  const flags: ResolutionFlags = {
    abi: fetchAbi,
    proxy: detectProxy,
    token: detectToken,
    diamond: detectDiamond,
  };

  if (!address || !address.startsWith('0x') || address.length !== 42) {
    return {
      ...createEmptyContext(address, chainId),
      durationMs: performance.now() - startTime,
    };
  }

  if (!skipCache) {
    const cached = getCachedContext(address, chainId, flags);
    if (cached) {
      return {
        ...cached,
        durationMs: performance.now() - startTime,
        fromCache: true,
      };
    }
  }

  const cacheKey = getCacheKey(address, chainId, flags);
  const inflight = inflightRequests.get(cacheKey);
  if (inflight) {
    const result = await inflight;
    return {
      ...result,
      durationMs: performance.now() - startTime,
    };
  }

  const resolvePromise = doResolve(
    address,
    chain,
    {
      fetchAbi,
      detectProxy,
      detectToken,
      detectDiamond,
      proxyTimeout,
      abiTimeout,
      onProgress,
      signal,
      etherscanApiKey: resolvedEtherscanKey,
      blockscoutApiKey: resolvedBlockscoutKey,
    },
    startTime
  );

  inflightRequests.set(cacheKey, resolvePromise);

  try {
    const result = await resolvePromise;
    const shouldCache =
      !!result.abi ||
      !!result.proxyInfo ||
      !!result.tokenInfo ||
      !!result.diamondInfo ||
      result.hasCode;
    if (shouldCache) {
      setCachedContext(address, chainId, flags, result);
    }
    return result;
  } finally {
    inflightRequests.delete(cacheKey);
  }
}

interface InternalOptions {
  fetchAbi: boolean;
  detectProxy: boolean;
  detectToken: boolean;
  detectDiamond: boolean;
  proxyTimeout: number;
  abiTimeout: number;
  onProgress?: (step: string, detail?: string) => void;
  signal?: AbortSignal;
  etherscanApiKey?: string;
  blockscoutApiKey?: string;
}

async function doResolve(
  address: string,
  chain: Chain,
  opts: InternalOptions,
  startTime: number
): Promise<ContractContext> {
  const chainId = chain.id;
  let provider: ethers.providers.Provider | null = null;
  try {
    provider = getSharedProvider(chain);
  } catch {
    // RPC unavailable, skipping bytecode checks
  }

  let hasCode = false;
  let codeCheckSucceeded = false;

  if (provider) {
    opts.onProgress?.('Checking contract bytecode...');
    try {
      const code = await provider.getCode(address);
      hasCode = !!code && code !== '0x';
      codeCheckSucceeded = true;
    } catch {
      // Failed to check code
    }

    if (codeCheckSucceeded && !hasCode) {
      return {
        ...createEmptyContext(address, chainId),
        durationMs: performance.now() - startTime,
      };
    }
  } else {
    opts.onProgress?.('Skipping bytecode check (no RPC available)');
  }

  opts.onProgress?.('Fetching ABI and detecting proxy type...');

  let abiResult: ResolveResult | null = null;
  let proxyInfo: ProxyInfo | null = null;
  const getAbiResult = (): ResolveResult | null => abiResult as ResolveResult | null;

  const parallelTasks: Promise<void>[] = [];

  if (opts.fetchAbi) {
    parallelTasks.push(
      contractResolver
        .resolve(address, chain, {
          signal: opts.signal,
          etherscanApiKey: opts.etherscanApiKey,
          blockscoutApiKey: opts.blockscoutApiKey,
        })
        .then((result) => {
          abiResult = result;
        })
        .catch(() => {
          // ABI fetch failed
        })
    );
  }

  if (opts.detectProxy && provider) {
    parallelTasks.push(
      Promise.race([
        resolveProxyInfo(address, chain, provider),
        new Promise<ProxyInfo>((resolve) =>
          setTimeout(() => resolve({ isProxy: false }), opts.proxyTimeout)
        ),
      ])
        .then((result) => {
          if (result.isProxy) {
            proxyInfo = result;
          }
        })
        .catch(() => {
          // Proxy detection failed
        })
    );
  }

  await Promise.all(parallelTasks);

  // Use source-provided proxy info if RPC detection didn't find anything
  const resolvedAbiResult = getAbiResult();
  if (!proxyInfo && resolvedAbiResult?.proxyInfo?.isProxy) {
    proxyInfo = resolvedAbiResult.proxyInfo;
  }

  // Downgrade to generic proxy if loupe functions are missing from ABI
  if (
    proxyInfo?.proxyType === 'diamond' &&
    opts.fetchAbi &&
    resolvedAbiResult?.abi &&
    !hasDiamondLoupeFunctions(resolvedAbiResult.abi)
  ) {
    opts.onProgress?.('Diamond detection downgraded', 'Loupe functions missing in ABI');
    if (provider) {
      const directImpl = await getDirectImplementation(address, provider);
      if (directImpl) {
        proxyInfo = {
          isProxy: true,
          proxyType: 'unknown',
          implementationAddress: directImpl,
          implementations: [directImpl],
        };
      } else {
        proxyInfo = { isProxy: false };
      }
    } else {
      proxyInfo = { isProxy: false };
    }
  }

  let implementationAbi: AbiItem[] | null = null;
  let implementationAddress: string | null = null;
  let implementationName: string | null = null;
  let implementationSource: Source | null = null;
  let implementationConfidence: Confidence | null = null;
  let implementationVerified = false;
  let implementationMetadata: ContractMetadata | null = null;
  let implementationAttempts: SourceAttempt[] = [];
  const initialAbiResult = getAbiResult();
  let mergedAbi: AbiItem[] | null = initialAbiResult?.abi || null;
  const proxyName = initialAbiResult?.name || null;

  if (
    proxyInfo?.isProxy &&
    proxyInfo.implementationAddress &&
    proxyInfo.proxyType !== 'diamond' &&
    opts.fetchAbi
  ) {
    implementationAddress = proxyInfo.implementationAddress;
    opts.onProgress?.(
      'Proxy detected, fetching implementation ABI...',
      `${proxyInfo.proxyType} → ${implementationAddress.slice(0, 10)}...`
    );

    try {
      const implResult = await contractResolver.resolve(implementationAddress, chain, {
        signal: opts.signal,
        etherscanApiKey: opts.etherscanApiKey,
        blockscoutApiKey: opts.blockscoutApiKey,
      });

      implementationName = implResult.name || null;
      implementationSource = implResult.source || null;
      implementationConfidence = implResult.confidence || null;
      implementationVerified = implResult.verified || false;
      implementationMetadata = implResult.metadata || null;
      implementationAttempts = implResult.attempts || [];

      if (implResult.abi && implResult.abi.length > 0) {
        implementationAbi = implResult.abi;

        // Implementation ABI takes priority; proxy admin functions are kept
        const currentAbiResult = getAbiResult();
        if (currentAbiResult?.abi && currentAbiResult.abi.length > 0) {
          mergedAbi = mergeAbis(currentAbiResult.abi, implementationAbi);
        } else {
          mergedAbi = implementationAbi;
        }

        if (!currentAbiResult?.name && implResult.name) {
          if (currentAbiResult) {
            abiResult = { ...currentAbiResult, name: implResult.name };
          }
        }

        opts.onProgress?.(
          'Implementation ABI merged',
          `${implementationAbi.filter((i) => i.type === 'function').length} functions`
        );
      }
    } catch {
      opts.onProgress?.('Implementation ABI fetch failed, using proxy ABI');
    }
  }

  let tokenInfo: TokenInfo | null = null;
  let tokenType: 'ERC20' | 'ERC721' | 'ERC1155' | null = null;

  if (opts.detectToken && provider) {
    opts.onProgress?.('Detecting token type...');
    try {
      const detection = await Promise.race([
        detectTokenType(provider, address),
        new Promise<TokenDetectionResult>((resolve) =>
          setTimeout(
            () =>
              resolve({
                type: 'unknown',
                isDiamond: false,
                method: 'timeout',
                confidence: 0,
              }),
            opts.proxyTimeout
          )
        ),
      ]);

      if (detection.type !== 'unknown') {
        tokenType = detection.type as 'ERC20' | 'ERC721' | 'ERC1155';
        tokenInfo = {
          name: detection.name,
          symbol: detection.symbol,
          decimals: detection.decimals,
          tokenType: tokenType,
        };
      }
    } catch {
      // Token detection failed
    }
  }

  // Fall back to source-provided token info
  if (!tokenInfo && abiResult?.tokenInfo) {
    tokenInfo = abiResult.tokenInfo;
    tokenType = (tokenInfo.tokenType as 'ERC20' | 'ERC721' | 'ERC1155') || null;
  }

  let diamondInfo: DiamondInfo | null = null;

  if (opts.detectDiamond && provider && proxyInfo?.proxyType === 'diamond') {
    opts.onProgress?.('Resolving diamond facets...');
    try {
      const { resolveDiamond } = await import('./diamondResolver');
      diamondInfo = await resolveDiamond(address, chain, {
        signal: opts.signal,
        etherscanApiKey: opts.etherscanApiKey,
      });

      if (diamondInfo?.combinedAbi && diamondInfo.combinedAbi.length > 0) {
        mergedAbi = diamondInfo.combinedAbi;
      }
    } catch {
      // Diamond resolution failed
    }
  }

  const functions = mergedAbi ? extractExternalFunctions(mergedAbi) : { read: [], write: [] };
  const resolvedHasCode = codeCheckSucceeded ? hasCode : !!mergedAbi;
  const exists = codeCheckSucceeded ? hasCode : opts.fetchAbi ? true : resolvedHasCode;

  const result: ContractContext = {
    address,
    chainId,
    exists,
    hasCode: resolvedHasCode,
    abi: mergedAbi,
    implementationAbi,
    implementationAddress,
    name: abiResult?.name || null,
    proxyName,
    implementationName,
    source: abiResult?.source || null,
    confidence: abiResult?.confidence || 'bytecode-only',
    verified: abiResult?.verified || false,
    implementationSource,
    implementationConfidence,
    implementationVerified,
    functions,
    proxyInfo,
    tokenInfo,
    tokenType,
    diamondInfo,
    metadata: abiResult?.metadata || null,
    implementationMetadata,
    implementationAttempts,
    attempts: abiResult?.attempts || [],
    resolvedAt: Date.now(),
    durationMs: performance.now() - startTime,
    fromCache: false,
  };

  return result;
}

/**
 * Quick check if a contract exists on chain
 */
export async function contractExists(
  address: string,
  chain: Chain
): Promise<boolean> {
  if (!address || !address.startsWith('0x') || address.length !== 42) {
    return false;
  }

  try {
    const provider = getSharedProvider(chain);
    const code = await provider.getCode(address);
    return !!code && code !== '0x';
  } catch {
    return false;
  }
}
