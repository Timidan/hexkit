/**
 * Contract Resolver
 *
 * The single entry point for all contract resolution.
 *
 * Features:
 * - Request deduplication (same address/chain never fetched twice simultaneously)
 * - Two-layer caching (memory + IndexedDB)
 * - Racing source strategy (first success wins)
 * - Settlement window (allows better sources to complete after first success)
 * - Proper abort signal propagation
 * - Progress callbacks for UI
 */

import type { Chain } from '../../types';
import { networkConfigManager } from '../../config/networkConfig';
import type {
  ResolveResult,
  ResolveOptions,
  SourceResult,
  Source,
  SourceAttempt,
  AbiItem,
} from './types';
import { extractExternalFunctions } from './types';
import { contractCache } from './ContractCache';
import { fetchEtherscan, fetchSourcify, fetchBlockscout, fetchWhatsabi } from './sources';
import { raceWithTimeout } from '../withAbortTimeout';

const SOURCE_TIMEOUT_MS = 5000; // Default timeout per source
// Head-start given to the verified explorer sources (Sourcify/Etherscan/Blockscout)
// before whatsabi is allowed to begin its bytecode analysis. If a verified result
// lands inside this window the race aborts and whatsabi never touches RPC.
const WHATSABI_DELAY_MS = 2000;

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

  async resolve(
    address: string,
    chain: Chain,
    options: ResolveOptions = {}
  ): Promise<ResolveResult> {
    const startTime = performance.now();
    const chainId = chain.id;
    const cacheKey = `${chainId}:${address.toLowerCase()}`;
    const resolvedEtherscanKey =
      options.etherscanApiKey?.trim() || networkConfigManager.getEtherscanApiKey();
    const resolvedBlockscoutKey =
      options.blockscoutApiKey?.trim() || networkConfigManager.getBlockscoutApiKey();
    const resolvedPreferredSources =
      options.preferredSources && options.preferredSources.length > 0
        ? options.preferredSources
        : (networkConfigManager.getSourcePriority() as Source[]);
    const resolvedOptions: ResolveOptions = {
      ...options,
      etherscanApiKey: resolvedEtherscanKey,
      blockscoutApiKey: resolvedBlockscoutKey,
      preferredSources: resolvedPreferredSources,
    };

    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return {
        ...createEmptyResult(address, chainId, chain),
        error: 'Invalid contract address format',
      };
    }

    if (!resolvedOptions.skipCache) {
      const cached = await contractCache.get(address, chainId);
      if (cached) {
        return {
          ...cached,
          fromCache: true,
          durationMs: performance.now() - startTime,
        };
      }
    }

    const inflight = this.inflightRequests.get(cacheKey);
    if (inflight) {
      const result = await inflight;
      return {
        ...result,
        durationMs: performance.now() - startTime,
      };
    }

    const resolvePromise = this.doResolve(address, chain, resolvedOptions, startTime);
    this.inflightRequests.set(cacheKey, resolvePromise);

    try {
      const result = await resolvePromise;

      // Only persist verified results. Inferred (whatsabi) ABIs are never
      // cached — we want every future request to get a fresh shot at the
      // verified explorers rather than reading a bytecode-guessed ABI back.
      if (result.abi && result.confidence === 'verified') {
        await contractCache.set(address, chainId, result);
      }

      return result;
    } finally {
      this.inflightRequests.delete(cacheKey);
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

    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const sourceOrder = this.getSourceOrder(options.preferredSources, options.enableInferred);

    type SourceFetcher = {
      source: Source;
      fetch: () => Promise<SourceResult>;
    };

    const fetchers: SourceFetcher[] = sourceOrder.map((source) => {
      const runFetch = () =>
        this.fetchWithTimeout(source, address, chain, options, controller.signal);

      // whatsabi joins the race after a head-start so the HTTP-only verified
      // sources get first crack. If any of them returns verified within the
      // window, controller.abort() fires and the delay rejects before
      // whatsabi ever hits RPC.
      if (source === 'whatsabi') {
        return {
          source,
          fetch: () => this.delayedFetch(WHATSABI_DELAY_MS, runFetch, controller.signal),
        };
      }

      return { source, fetch: runFetch };
    });

    let bestResult: SourceResult | null = null;
    let resolved = false;

    const firstVerifiedPromise = new Promise<void>((resolveFirst) => {
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
              resolveFirst();
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

      // Also resolve if all sources complete without finding verified
      Promise.allSettled(racePromises).then(() => {
        if (!resolved) {
          resolveFirst();
        }
      });
    });

    await firstVerifiedPromise;
    controller.abort();

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
    return raceWithTimeout(
      this.fetchFromSource(source, address, chain, options, signal),
      SOURCE_TIMEOUT_MS,
      () => new Error(`${source} timed out after ${SOURCE_TIMEOUT_MS}ms`)
    );
  }

  private async fetchFromSource(
    source: Source,
    address: string,
    chain: Chain,
    options: ResolveOptions,
    signal: AbortSignal
  ): Promise<SourceResult> {
    switch (source) {
      case 'sourcify':
        return fetchSourcify(address, chain, signal);

      case 'etherscan':
        return fetchEtherscan(address, chain, options.etherscanApiKey, signal);

      case 'blockscout':
        return fetchBlockscout(address, chain, options.blockscoutApiKey, signal);

      case 'whatsabi':
        return fetchWhatsabi(address, chain, signal);

      default:
        return { success: false, error: `Unknown source: ${source}` };
    }
  }

  private delayedFetch(
    delayMs: number,
    fetch: () => Promise<SourceResult>,
    signal: AbortSignal
  ): Promise<SourceResult> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }

      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };

      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        fetch().then(resolve, reject);
      }, delayMs);

      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private getSourceOrder(preferred?: Source[], enableInferred = true): Source[] {
    const verifiedOrder: Source[] = ['sourcify', 'etherscan', 'blockscout'];
    const defaultOrder: Source[] = enableInferred
      ? [...verifiedOrder, 'whatsabi']
      : verifiedOrder;

    if (!preferred || preferred.length === 0) {
      return defaultOrder;
    }

    // Put preferred sources first, then add remaining
    const remaining = defaultOrder.filter((s) => !preferred.includes(s));
    return [...preferred.filter((s) => defaultOrder.includes(s)), ...remaining];
  }

  private isBetterResult(newResult: SourceResult, existing: SourceResult): boolean {
    if (newResult.confidence === 'verified' && existing.confidence !== 'verified') {
      return true;
    }

    if (newResult.name && !existing.name) return true;
    if (newResult.metadata && !existing.metadata) return true;

    return false;
  }

  async clearCache(address?: string, chainId?: number): Promise<void> {
    if (address && chainId) {
      await contractCache.delete(address, chainId);
    } else {
      await contractCache.clearAll();
    }
  }

  async getCacheStats() {
    return contractCache.getStats();
  }
}

export const contractResolver = new ContractResolver();

export { ContractResolver };
