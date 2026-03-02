/**
 * Multi-Chain Search
 *
 * Searches for a contract across multiple chains in parallel.
 *
 * Key optimization: All chains are searched simultaneously instead of sequentially.
 * This reduces total search time from O(n * timeout) to O(timeout).
 */

import type { Chain } from '../../types';
import type {
  ResolveResult,
  MultiChainSearchOptions,
  MultiChainSearchResult,
} from './types';
import { contractResolver } from './ContractResolver';

export async function searchAcrossChains(
  address: string,
  chains: Chain[],
  options: MultiChainSearchOptions = {}
): Promise<MultiChainSearchResult> {
  const startTime = performance.now();
  const controller = new AbortController();
  const results = new Map<number, ResolveResult>();
  const errors = new Map<number, string>();
  let firstFound: ResolveResult | null = null;

  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort());
  }

  const chainPromises = chains.map(async (chain) => {
    const chainId = chain.id;

    try {
      if (controller.signal.aborted) {
        return { chainId, result: null, error: 'Aborted' };
      }

      const result = await contractResolver.resolve(address, chain, {
        signal: controller.signal,
        etherscanApiKey: options.etherscanApiKey,
        priority: 'speed',
      });

      results.set(chainId, result);
      options.onProgress?.(chainId, result);

      if (result.abi && !firstFound) {
        firstFound = result;

        // Give other chains a short grace period before aborting
        if (options.stopOnFirst) {
          setTimeout(() => {
            controller.abort();
          }, 500);
        }
      }

      return { chainId, result, error: undefined };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (error instanceof Error && error.name === 'AbortError') {
        return { chainId, result: null, error: 'Aborted' };
      }

      errors.set(chainId, errorMessage);
      options.onProgress?.(chainId, null, errorMessage);

      return { chainId, result: null, error: errorMessage };
    }
  });

  await Promise.allSettled(chainPromises);

  return {
    results,
    firstFound,
    errors,
    duration: performance.now() - startTime,
  };
}

export async function quickSearchAcrossChains(
  address: string,
  chains: Chain[],
  options: Omit<MultiChainSearchOptions, 'stopOnFirst'> = {}
): Promise<ResolveResult | null> {
  const result = await searchAcrossChains(address, chains, {
    ...options,
    stopOnFirst: true,
  });

  return result.firstFound;
}

export async function findAllDeployments(
  address: string,
  chains: Chain[],
  options: Omit<MultiChainSearchOptions, 'stopOnFirst'> = {}
): Promise<{
  deployments: Array<{ chain: Chain; result: ResolveResult }>;
  notFound: Chain[];
  errors: Array<{ chain: Chain; error: string }>;
  duration: number;
}> {
  const result = await searchAcrossChains(address, chains, {
    ...options,
    stopOnFirst: false,
  });

  const deployments: Array<{ chain: Chain; result: ResolveResult }> = [];
  const notFound: Chain[] = [];
  const errorList: Array<{ chain: Chain; error: string }> = [];

  for (const chain of chains) {
    const chainResult = result.results.get(chain.id);
    const chainError = result.errors.get(chain.id);

    if (chainResult?.abi) {
      deployments.push({ chain, result: chainResult });
    } else if (chainError) {
      errorList.push({ chain, error: chainError });
    } else {
      notFound.push(chain);
    }
  }

  return {
    deployments,
    notFound,
    errors: errorList,
    duration: result.duration,
  };
}
