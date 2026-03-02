/**
 * Comprehensive Contract Fetcher (Compatibility Layer)
 *
 * This module delegates to the optimized resolver system.
 * Provides backward-compatible `fetchContractInfoComprehensive()` API.
 *
 * @deprecated Use `contractResolver` from `./resolver` directly for new code.
 */

import type { Chain } from "../types";
import type { ContractInfoResult } from "../types/contractInfo";
import { contractResolver, type ResolveResult } from "./resolver";

export type { ContractInfoResult } from "../types/contractInfo";

/**
 * Progress callback options (kept for backward compatibility)
 */
interface ProgressOptions {
  progressCallback?: (progress: {
    source: string;
    status: "searching" | "found" | "not_found" | "error";
    message?: string;
  }) => void;
  etherscanApiKey?: string;
  blockscoutApiKey?: string;
  preferredSources?: ("sourcify" | "blockscout" | "etherscan")[];
}

/**
 * Convert new ResolveResult to legacy ContractInfoResult format
 */
const toContractInfoResult = (
  result: ResolveResult,
  address: string,
  chain: Chain
): ContractInfoResult => {
  return {
    success: !!result.abi,
    address,
    chain,
    contractName: result.name || undefined,
    abi: result.abi ? JSON.stringify(result.abi) : undefined,
    source: result.source || undefined,
    explorerName: result.source
      ? result.source.charAt(0).toUpperCase() + result.source.slice(1)
      : undefined,
    verified: result.verified,
    tokenInfo: result.tokenInfo
      ? {
          name: result.tokenInfo.name,
          symbol: result.tokenInfo.symbol,
          decimals: result.tokenInfo.decimals,
          totalSupply: result.tokenInfo.totalSupply,
        }
      : undefined,
    externalFunctions: [...result.functions.read, ...result.functions.write].map(
      (fn) => ({
        name: fn.name,
        signature: fn.signature,
        inputs: fn.inputs.map((i) => ({ name: i.name, type: i.type })),
        outputs: fn.outputs.map((o) => ({ name: o.name, type: o.type })),
        stateMutability: fn.stateMutability,
      })
    ),
    error: result.error,
    searchProgress: result.attempts.map((a) => ({
      source: a.source,
      status:
        a.status === "success"
          ? "found"
          : a.status === "failed" || a.status === "timeout"
            ? "not_found"
            : a.status === "fetching"
              ? "searching"
              : "error",
      message: a.error,
    })),
  };
};

/**
 * Fetch comprehensive contract info.
 *
 * This function now uses the optimized resolver which:
 * - Races all sources in parallel
 * - Has built-in request deduplication
 * - Uses two-layer caching (memory + IndexedDB)
 *
 * @deprecated Use `contractResolver.resolve()` from `./resolver` for new code.
 */
export const fetchContractInfoComprehensive = async (
  address: string,
  chain: Chain,
  progressCallback?: ProgressOptions["progressCallback"],
  options: Omit<ProgressOptions, "progressCallback"> = {}
): Promise<ContractInfoResult> => {
  try {
    const result = await contractResolver.resolve(address, chain, {
      etherscanApiKey: options.etherscanApiKey,
      blockscoutApiKey: options.blockscoutApiKey,
      preferredSources: options.preferredSources,
      onProgress: progressCallback
        ? (attempt) => {
            progressCallback({
              source: attempt.source,
              status:
                attempt.status === "success"
                  ? "found"
                  : attempt.status === "failed" || attempt.status === "timeout"
                    ? "not_found"
                    : attempt.status === "fetching"
                      ? "searching"
                      : "error",
              message: attempt.error,
            });
          }
        : undefined,
    });

    return toContractInfoResult(result, address, chain);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      address,
      chain,
      error: errorMessage,
      searchProgress: [],
    };
  }
};
