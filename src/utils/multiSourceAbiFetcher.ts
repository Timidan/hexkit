/**
 * Multi-Source ABI Fetcher (Compatibility Layer)
 *
 * This module now delegates to the new optimized resolver system.
 * All existing imports continue to work without changes.
 *
 * @deprecated Use `contractResolver` from `./resolver` directly for new code.
 */

import { ethers } from "ethers";
import type {
  Chain,
  ExtendedABIFetchResult,
  ExtendedABITokenInfo,
  ExplorerSource,
} from "../types";
import {
  contractResolver,
  type ResolveResult,
} from "./resolver";

const isValidAddress = (address: string) =>
  address?.startsWith("0x") && address.length === 42;

/**
 * Convert new ResolveResult to legacy ExtendedABIFetchResult format
 */
const toExtendedResult = (result: ResolveResult): ExtendedABIFetchResult => {
  const tokenInfo: ExtendedABITokenInfo | undefined = result.tokenInfo
    ? {
        name: result.tokenInfo.name,
        symbol: result.tokenInfo.symbol,
        decimals: result.tokenInfo.decimals?.toString(),
        totalSupply: result.tokenInfo.totalSupply,
      }
    : undefined;

  return {
    success: !!result.abi,
    abi: result.abi ? JSON.stringify(result.abi) : undefined,
    error: result.error,
    source: result.source || undefined,
    explorerName: result.source
      ? result.source.charAt(0).toUpperCase() + result.source.slice(1)
      : undefined,
    contractName: result.name || undefined,
    tokenInfo,
    confidence: result.confidence,
  };
};

export interface FetchABIMultiSourceOptions {
  etherscanApiKey?: string;
  blockscoutApiKey?: string;
  provider?: ethers.providers.Provider;
  preferredSources?: ExplorerSource[];
}

/**
 * Fetch contract ABI from multiple sources.
 *
 * This function now uses the optimized resolver which:
 * - Races all sources in parallel
 * - Has built-in request deduplication
 * - Uses two-layer caching (memory + IndexedDB)
 *
 * @deprecated Use `contractResolver.resolve()` from `./resolver` for new code.
 */
export const fetchContractABIMultiSource = async (
  contractAddress: string,
  chain: Chain,
  options: FetchABIMultiSourceOptions = {}
): Promise<ExtendedABIFetchResult> => {
  const { etherscanApiKey, blockscoutApiKey, preferredSources } = options;

  // Validate address
  if (!isValidAddress(contractAddress)) {
    return {
      success: false,
      error: "Invalid contract address format",
    };
  }

  try {
    // Use the new optimized resolver
    const result = await contractResolver.resolve(contractAddress, chain, {
      etherscanApiKey,
      blockscoutApiKey,
      preferredSources,
    });

    return toExtendedResult(result);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
    };
  }
};

