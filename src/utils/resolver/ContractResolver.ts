/**
 * Contract Resolver
 *
 * The single entry point for all contract resolution.
 *
 * Features:
 * - Request deduplication (same address/chain never fetched twice simultaneously)
 * - Two-layer caching (memory + IndexedDB)
 * - Racing source strategy (first success wins)
 * - Purposeful speed/completeness resolution modes
 * - Proper abort signal propagation
 * - Progress callbacks for UI
 */

import type { Chain } from '../../types';
import { networkAccess } from '../../config/networkAccess';
import type {
  ResolveResult,
  ResolveOptions,
  SourceResult,
  Source,
  SourceAttempt,
  CacheStats,
} from './types';
import { extractExternalFunctions } from './types';
import { contractCache } from './ContractCache';
import { fetchEtherscan, fetchSourcify, fetchBlockscout } from './sources';

const SOURCE_TIMEOUT_MS = 5000; // Default timeout per source

interface ContractResolverCache {
  get(address: string, chainId: number): Promise<ResolveResult | null>;
  set(address: string, chainId: number, result: ResolveResult): Promise<void>;
  delete(address: string, chainId: number): Promise<void>;
  clearAll(): Promise<void>;
  getStats(): Promise<CacheStats>;
}

interface ContractResolverDependencies {
  fetchSource?: (
    source: Source,
    address: string,
    chain: Chain,
    options: ResolveOptions,
    signal: AbortSignal
  ) => Promise<SourceResult>;
  cache?: ContractResolverCache;
  getPolicy?: (chainId: number) => {
    sourcePriority: Source[];
    etherscanApiKey?: string;
    blockscoutApiKey?: string;
  };
  sourceTimeoutMs?: number;
}

function createEmptyResult(address: string, chainId: number, chain: Chain): ResolveResult {
  return {
    address,
    chainId,
    chain,
    abi: null,
    name: null,
    source: null,
    confidence: 'bytecode-only',
    verified: false,
    functions: { read: [], write: [] },
    resolvedAt: Date.now(),
    durationMs: 0,
    attempts: [],
    fromCache: false,
  };
}

class ContractResolver {
  private inflightRequests = new Map<string, Promise<ResolveResult>>();
  private requestSequence = 0;
  private readonly dependencies: ContractResolverDependencies;
  private readonly cache: ContractResolverCache;

  constructor(dependencies: ContractResolverDependencies = {}) {
    this.dependencies = dependencies;
    this.cache = dependencies.cache ?? contractCache;
  }

  async resolve(
    address: string,
    chain: Chain,
    options: ResolveOptions = {}
  ): Promise<ResolveResult> {
    const startTime = performance.now();
    const chainId = chain.id;
    const policy = this.dependencies.getPolicy?.(chainId) ??
      networkAccess.contractResolutionPolicy(chainId);
    const resolvedEtherscanKey =
      options.etherscanApiKey?.trim() || policy.etherscanApiKey;
    const resolvedBlockscoutKey =
      options.blockscoutApiKey?.trim() || policy.blockscoutApiKey;
    const resolvedPreferredSources =
      options.preferredSources && options.preferredSources.length > 0
        ? options.preferredSources
        : policy.sourcePriority;
    const resolvedOptions: ResolveOptions = {
      ...options,
      etherscanApiKey: resolvedEtherscanKey,
      blockscoutApiKey: resolvedBlockscoutKey,
      preferredSources: resolvedPreferredSources,
    };
    const sourceOrder = this.getSourceOrder(resolvedPreferredSources);
    const requestKey = [
      chainId,
      address.toLowerCase(),
      resolvedOptions.priority ?? 'speed',
      resolvedOptions.skipCache ? 'reload' : 'cache',
      sourceOrder.join(','),
      resolvedEtherscanKey ? 'etherscan-auth' : 'etherscan-anon',
      resolvedBlockscoutKey ? 'blockscout-auth' : 'blockscout-anon',
      resolvedOptions.signal ? `signal-${this.requestSequence += 1}` : 'shared',
    ].join(':');

    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return {
        ...createEmptyResult(address, chainId, chain),
        error: 'Invalid contract address format',
      };
    }

    if (!resolvedOptions.skipCache) {
      const cached = await this.cache.get(address, chainId);
      const cacheIsComplete =
        cached?.metadata?.sources &&
        Object.keys(cached.metadata.sources).length > 0 &&
        cached.metadata.compilerVersion &&
        cached.metadata.compilerSettings;
      if (
        cached &&
        (resolvedOptions.priority !== 'completeness' || cacheIsComplete)
      ) {
        return {
          ...cached,
          fromCache: true,
          durationMs: performance.now() - startTime,
        };
      }
    }

    const inflight = this.inflightRequests.get(requestKey);
    if (inflight) {
      const result = await inflight;
      return {
        ...result,
        durationMs: performance.now() - startTime,
      };
    }

    const resolvePromise = this.doResolve(address, chain, resolvedOptions, startTime);
    this.inflightRequests.set(requestKey, resolvePromise);

    try {
      const result = await resolvePromise;

      if (result.abi) {
        await this.cache.set(address, chainId, result);
      }

      return result;
    } finally {
      this.inflightRequests.delete(requestKey);
    }
  }

  private async doResolve(
    address: string,
    chain: Chain,
    options: ResolveOptions,
    startTime: number
  ): Promise<ResolveResult> {
    const chainId = chain.id;
    const attempts: SourceAttempt[] = [];
    const controller = new AbortController();

    if (options.signal?.aborted) {
      controller.abort();
    } else if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const sourceOrder = this.getSourceOrder(options.preferredSources);

    type SourceFetcher = {
      source: Source;
      fetch: () => Promise<SourceResult>;
    };

    const fetchers: SourceFetcher[] = sourceOrder.map((source) => ({
      source,
      fetch: () =>
        this.fetchWithTimeout(
          source,
          address,
          chain,
          options,
          controller.signal
        ),
    }));

    let bestResult: SourceResult | null = null;
    let resolved = false;

    let resolveFirst: (() => void) | null = null;
    const firstVerifiedPromise = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const racePromises = fetchers.map(async ({ source, fetch }) => {
        const sourceStart = performance.now();

        options.onProgress?.({
          source,
          status: 'fetching',
          durationMs: 0,
        });

        try {
          const result = await fetch();
          const durationMs = performance.now() - sourceStart;

          const attempt: SourceAttempt = {
            source,
            status: result.success ? 'success' : 'failed',
            durationMs,
            error: result.error,
            confidence: result.confidence,
          };

          attempts.push(attempt);
          options.onProgress?.(attempt);

          if (result.success && result.abi) {
            if (!bestResult || this.isBetterResult(result, bestResult)) {
              bestResult = result;
            }

            if (result.confidence === 'verified' && !resolved) {
              resolved = true;
              resolveFirst?.();
            }
          }

          return { source, result };
        } catch (error: unknown) {
          const durationMs = performance.now() - sourceStart;
          const errorMessage =
            error instanceof Error
              ? error.name === 'AbortError'
                ? 'Aborted'
                : error.message
              : String(error);

          const attempt: SourceAttempt = {
            source,
            status: error instanceof Error && error.name === 'AbortError' ? 'skipped' : 'failed',
            durationMs,
            error: errorMessage,
          };

          attempts.push(attempt);
          options.onProgress?.(attempt);

          return { source, result: { success: false, error: errorMessage } as SourceResult };
        }
      });

    const allSourcesSettled = Promise.allSettled(racePromises);
    void allSourcesSettled.then(() => {
      if (!resolved) resolveFirst?.();
    });

    await firstVerifiedPromise;
    if (options.priority === 'completeness') {
      await allSourcesSettled;
    } else {
      controller.abort();
    }

    const durationMs = performance.now() - startTime;
    const finalResult = bestResult as SourceResult | null;

    if (finalResult && finalResult.abi) {
      const functions = extractExternalFunctions(finalResult.abi);

      // Pass through source-provided proxy info (e.g. from Etherscan API)
      // RPC-based proxy detection is now handled by contractContext.ts
      const resolvedProxyInfo = finalResult.proxyInfo || undefined;

      return {
        address,
        chainId,
        chain,
        abi: finalResult.abi,
        name: finalResult.name || null,
        source: finalResult.source || null,
        confidence: finalResult.confidence || 'verified',
        verified: finalResult.confidence === 'verified',
        functions,
        tokenInfo: finalResult.tokenInfo,
        proxyInfo: resolvedProxyInfo,
        metadata: finalResult.metadata,
        resolvedAt: Date.now(),
        durationMs,
        attempts,
        fromCache: false,
      };
    }

    const errorMessages = attempts
      .filter((a) => a.status === 'failed' && a.error)
      .map((a) => `${a.source}: ${a.error}`)
      .join('; ');

    return {
      ...createEmptyResult(address, chainId, chain),
      error: errorMessages || 'Could not retrieve contract ABI from any source',
      durationMs,
      attempts,
    };
  }

  private async fetchWithTimeout(
    source: Source,
    address: string,
    chain: Chain,
    options: ResolveOptions,
    signal: AbortSignal
  ): Promise<SourceResult> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<SourceResult>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${source} timed out after ${SOURCE_TIMEOUT_MS}ms`));
      }, this.dependencies.sourceTimeoutMs ?? SOURCE_TIMEOUT_MS);

      signal.addEventListener('abort', () => {
        if (timeoutId) clearTimeout(timeoutId);
      });
    });

    const fetchPromise = this.fetchFromSource(source, address, chain, options, signal);
    try {
      return await Promise.race([fetchPromise, timeoutPromise]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  private async fetchFromSource(
    source: Source,
    address: string,
    chain: Chain,
    options: ResolveOptions,
    signal: AbortSignal
  ): Promise<SourceResult> {
    if (this.dependencies.fetchSource) {
      return this.dependencies.fetchSource(
        source,
        address,
        chain,
        options,
        signal
      );
    }

    switch (source) {
      case 'sourcify':
        return fetchSourcify(address, chain, signal);

      case 'etherscan':
        return fetchEtherscan(address, chain, options.etherscanApiKey, signal);

      case 'blockscout':
        return fetchBlockscout(address, chain, options.blockscoutApiKey, signal);

      default:
        return { success: false, error: `Unknown source: ${source}` };
    }
  }

  private getSourceOrder(preferred?: Source[]): Source[] {
    const defaultOrder: Source[] = ['sourcify', 'etherscan', 'blockscout'];

    if (!preferred || preferred.length === 0) {
      return defaultOrder;
    }

    // Put preferred sources first, then add remaining
    const remaining = defaultOrder.filter((s) => !preferred.includes(s));
    return [...preferred.filter((s) => defaultOrder.includes(s)), ...remaining];
  }

  private isBetterResult(newResult: SourceResult, existing: SourceResult): boolean {
    const score = (result: SourceResult): number => {
      const sources = Object.keys(result.metadata?.sources ?? {}).length;
      return (
        (result.confidence === 'verified'
          ? 1_000
          : result.confidence === 'inferred'
            ? 500
            : 0) +
        (result.abi?.length ?? 0) +
        sources * 20 +
        (result.metadata?.compilerVersion ? 40 : 0) +
        (result.metadata?.compilerSettings ? 50 : 0) +
        (result.metadata?.mainSourcePath ? 10 : 0) +
        (result.name ? 5 : 0)
      );
    };

    return score(newResult) > score(existing);
  }

  async clearCache(address?: string, chainId?: number): Promise<void> {
    if (address && chainId) {
      await this.cache.delete(address, chainId);
    } else {
      await this.cache.clearAll();
    }
  }

  async getCacheStats(): Promise<CacheStats> {
    return this.cache.getStats();
  }
}

export const contractResolver = new ContractResolver();

export { ContractResolver };
