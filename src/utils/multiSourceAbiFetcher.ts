import { ethers } from "ethers";
import { fetchFromWhatsABI, type WhatsABIResult } from "./whatsabiFetcher";
import {
  fetchContractInfoComprehensive,
  type ContractInfoResult,
} from "./comprehensiveContractFetcher";
import type {
  Chain,
  ExtendedABIFetchResult,
  ExtendedABITokenInfo,
  ExplorerSource,
} from "../types";

const isValidAddress = (address: string) =>
  address?.startsWith("0x") && address.length === 42;

const providerCache = new Map<number, ethers.providers.JsonRpcProvider>();
const contractExistenceCache = new Map<string, boolean>();

const formatTokenInfo = (
  tokenInfo?: ContractInfoResult["tokenInfo"]
): ExtendedABITokenInfo | undefined => {
  if (!tokenInfo) return undefined;
  const { name, symbol, decimals, totalSupply } = tokenInfo;
  return {
    name,
    symbol,
    decimals: decimals !== undefined ? String(decimals) : undefined,
    totalSupply,
  };
};

const toExtendedResult = (
  result: Partial<ContractInfoResult>,
  fallback: { source: string; explorerName: string }
): ExtendedABIFetchResult => ({
  success: Boolean(result.success && result.abi),
  abi: result.abi,
  error: result.error,
  source: result.source ?? fallback.source,
  explorerName: result.explorerName ?? fallback.explorerName,
  contractName: result.contractName,
  tokenInfo: formatTokenInfo(result.tokenInfo),
});

const fromWhatsAbi = (result: WhatsABIResult): ExtendedABIFetchResult => ({
  success: result.success,
  abi: result.abi,
  error: result.error,
  source: result.source,
  explorerName: result.explorerName,
  contractName: result.contractName,
  confidence: result.confidence,
  selectors: result.selectors,
  proxyType: result.proxyType,
  implementations: result.implementations,
});

const ensureContractExists = async (
  contractAddress: string,
  chain: Chain,
  provider?: ethers.providers.Provider
) => {
  const cacheKey = `${chain.id}:${contractAddress.toLowerCase()}`;
  if (contractExistenceCache.get(cacheKey) === true) {
    return;
  }

  const signer =
    provider ||
    (() => {
      if (!providerCache.has(chain.id)) {
        providerCache.set(
          chain.id,
          new ethers.providers.JsonRpcProvider(chain.rpcUrl, {
            name: chain.name,
            chainId: chain.id,
          })
        );
      }
      return providerCache.get(chain.id)!;
    })();

  const bytecode = await signer.getCode(contractAddress);
  if (!bytecode || bytecode === "0x") {
    throw new Error(
      `No contract deployed at ${contractAddress} on ${chain.name}`
    );
  }

  contractExistenceCache.set(cacheKey, true);
};

const summarizeAttempts = (attempts: ExtendedABIFetchResult[]) =>
  attempts
    .map((attempt) => {
      if (attempt.success) {
        return `${attempt.explorerName || attempt.source}: success`;
      }
      return `${attempt.explorerName || attempt.source}: ${attempt.error}`;
    })
    .join("; ");

export interface FetchABIMultiSourceOptions {
  etherscanApiKey?: string;
  blockscoutApiKey?: string;
  provider?: ethers.providers.Provider;
  preferredSources?: ExplorerSource[];
}

export const fetchContractABIMultiSource = async (
  contractAddress: string,
  chain: Chain,
  options: FetchABIMultiSourceOptions = {}
): Promise<ExtendedABIFetchResult> => {
  const { etherscanApiKey, blockscoutApiKey, provider, preferredSources } =
    options;
  if (!isValidAddress(contractAddress)) {
    return {
      success: false,
      error: "Invalid contract address format",
    };
  }

  try {
    await ensureContractExists(contractAddress, chain, provider);
  } catch (error: any) {
    return {
      success: false,
      error: error.message || String(error),
    };
  }

  const attempts: ExtendedABIFetchResult[] = [];

  try {
    const comprehensive = await fetchContractInfoComprehensive(
      contractAddress,
      chain,
      undefined,
      {
        etherscanApiKey,
        blockscoutApiKey,
        preferredSources,
      }
    );
    const comprehensiveResult = toExtendedResult(comprehensive, {
      source: "aggregator",
      explorerName: "Multi-Source Aggregator",
    });
    attempts.push(comprehensiveResult);
    if (comprehensiveResult.success) {
      return comprehensiveResult;
    }
  } catch (error: any) {
    attempts.push({
      success: false,
      source: "aggregator",
      explorerName: "Multi-Source Aggregator",
      error: String(error),
    });
  }

  try {
    const whatsabiResult = fromWhatsAbi(
      await fetchFromWhatsABI(contractAddress, chain, provider)
    );
    attempts.push(whatsabiResult);
    if (whatsabiResult.success) {
      return whatsabiResult;
    }
  } catch (error: any) {
    attempts.push({
      success: false,
      source: "whatsabi",
      explorerName: "WhatsABI",
      error: String(error),
    });
  }

  return {
    success: false,
    error: `ABI not found on ${chain.name}. Attempts: ${summarizeAttempts(
      attempts
    )}`,
  };
};

export const searchContractAcrossNetworks = async (
  contractAddress: string,
  etherscanApiKey?: string
): Promise<Array<{ chain: Chain; result: ExtendedABIFetchResult }>> => {
  const { SUPPORTED_CHAINS } = await import("./chains");
  const results: Array<{ chain: Chain; result: ExtendedABIFetchResult }> = [];

  const lookups = SUPPORTED_CHAINS.map(async (chain) => {
    const result = await fetchContractABIMultiSource(contractAddress, chain, {
      etherscanApiKey,
    });
    return { chain, result };
  });

  const settled = await Promise.allSettled(lookups);
  for (const entry of settled) {
    if (entry.status === "fulfilled") {
      results.push(entry.value);
    }
  }

  return results.sort((a, b) => {
    if (a.result.success && !b.result.success) return -1;
    if (!a.result.success && b.result.success) return 1;
    return 0;
  });
};
