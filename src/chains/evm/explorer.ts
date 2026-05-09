import type { EvmChainDescriptor } from "../types";
import {
  getExplorerUrl as getLegacyExplorerUrl,
  getExplorerBaseUrlFromApiUrl,
  getChainById,
} from "../registry";

export interface EvmExplorerClient {
  readonly baseUrl: string;
  readonly apiUrl: string | null;
  urlFor(type: "tx" | "address" | "block", identifier: string): string;
}

export function createEvmExplorerClient(
  descriptor: EvmChainDescriptor,
): EvmExplorerClient {
  const chainId = descriptor.chainId as number;
  const legacy = getChainById(chainId);
  const baseUrl = legacy?.explorerUrl ?? legacy?.blockExplorer ?? "";
  const apiUrl = legacy?.apiUrl ?? null;

  return {
    baseUrl,
    apiUrl,
    urlFor(type, identifier) {
      return getLegacyExplorerUrl(chainId, type, identifier);
    },
  };
}

export { getExplorerBaseUrlFromApiUrl };
