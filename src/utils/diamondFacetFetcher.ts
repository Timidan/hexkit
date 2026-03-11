import axios from "axios";
import { ethers } from "ethers";
import type { Chain, ExtendedABIFetchResult, ExplorerSource } from "../types";
import {
  fetchFromWhatsABI,
  createFunctionStubsFromSelectors,
  type SelectorFunctionStub,
} from "./whatsabiFetcher";
import { fetchContractABIMultiSource } from "./multiSourceAbiFetcher";
import { networkConfigManager } from "../config/networkConfig";
import { postEtherscanLookup } from "./etherscanProxy";

// Diamond facet information
export interface DiamondFacet {
  address: string;
  name: string;
  abi: unknown[];
  source: string;
  isVerified: boolean;
  functions: {
    read: unknown[];
    write: unknown[];
  };
  selectors?: string[];
  confidence?: "verified" | "inferred" | "extracted";
  inferenceSource?: "verified" | "whatsabi" | "selectors";
}

// Progress callback for facet fetching
export interface FacetProgressUpdate {
  /** Number of facets that have finished processing (success or error). */
  current: number;
  /** Total number of facets detected on the diamond. */
  total: number;
  /** The facet address associated with this update. */
  currentFacet: string;
  /** Status of the facet currently being processed. */
  status: "fetching" | "success" | "error";
  /** 1-based ordinal of the facet within the address list. */
  index: number;
}

export type FacetProgressCallback = (progress: FacetProgressUpdate) => void;

interface FacetFetchOptions {
  etherscanApiKey?: string;
  blockscoutApiKey?: string;
  provider?: ethers.providers.Provider;
  preferredSources?: ExplorerSource[];
  onPreferredSourceDetected?: (source: ExplorerSource) => void;
}

const facetFetchCache = new Map<string, Promise<DiamondFacet | null>>();
const FACET_CACHE_MAX_SIZE = 200;

// Batch processing configuration
const BATCH_SIZE = 6;
const FETCH_TIMEOUT = 10000; // 10 seconds per facet

// Helper to get RPC URL for a chain
function getRpcUrl(chain: Chain): string {
  const resolved = networkConfigManager.resolveRpcUrl(chain.id, chain.rpcUrl);
  if (resolved?.url) {
    return resolved.url;
  }

  // Use the chain's default RPC as final fallback
  return chain.rpcUrl;
}

// Helper to get explorer API URLs (using Vite proxy paths)
function getExplorerUrls(chain: Chain, address: string) {
  const id = chain.id;

  const blockscoutProxyMap: Record<number, string> = {
    137: "/api/polygon-blockscout",
    42161: "/api/arbitrum-blockscout",
    84532: "/api/base-sepolia-blockscout",
    4202: "/api/lisk-sepolia-blockscout",
  };

  const blockscoutBase = blockscoutProxyMap[id] || "/api/blockscout";
  const sourcifyBase = "/api/sourcify";

  return {
    blockscout: `${blockscoutBase}?module=contract&action=getabi&address=${address}`,
    sourcify: `${sourcifyBase}/server/files/${id}/${address}`,
  };
}

// Fetch ABI from Sourcify (repo endpoint)
async function fetchFromSourcify(
  chain: Chain,
  address: string
): Promise<ExtendedABIFetchResult | null> {
  try {
    const id = chain.id;
    const endpoints = [
      `/api/repo/contracts/full_match/${id}/${address}/metadata.json`,
      `/api/repo/contracts/partial_match/${id}/${address}/metadata.json`,
    ];

    for (const url of endpoints) {
      try {
        const response = await axios.get(url, { timeout: FETCH_TIMEOUT });
        if (response.status === 200 && response.data) {
          const metadata = response.data as {
            output?: { abi?: unknown[] };
            settings?: { compilationTarget?: Record<string, string> };
            metadata?: { name?: string };
          };
          const abi = Array.isArray(metadata?.output?.abi)
            ? (metadata.output!.abi as unknown[])
            : [];
          if (abi.length > 0) {
            let contractName: string | undefined;
            const compilationTarget = metadata?.settings?.compilationTarget;
            if (compilationTarget) {
              const keys = Object.keys(compilationTarget);
              if (keys.length > 0) contractName = compilationTarget[keys[0]];
            }
            if (!contractName && metadata?.metadata?.name) {
              contractName = metadata.metadata.name;
            }
            return {
              abi: JSON.stringify(abi),
              source: "Sourcify",
              contractName,
              success: true,
            };
          }
        }
      } catch (e) {
        // try next endpoint
        continue;
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

// Fetch ABI from Etherscan
async function fetchFromEtherscan(
  chain: Chain,
  address: string,
  apiKey?: string
): Promise<ExtendedABIFetchResult | null> {
  try {
    const response = await postEtherscanLookup({
      action: "getabi",
      address,
      chainId: chain.id,
      personalApiKey: apiKey,
    });
    const data = await response.json();

    if (response.ok && data.status === "1" && data.result !== "Contract source code not verified") {
      const abi = JSON.parse(data.result);
      return {
        abi: JSON.stringify(abi),
        source: "Etherscan",
        success: true,
      };
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Fetch ABI from Blockscout
async function fetchFromBlockscout(
  chain: Chain,
  address: string,
  apiKey?: string
): Promise<ExtendedABIFetchResult | null> {
  try {
    const id = chain.id;
    // Use vite proxy base, target will be base-mainnet.blockscout.com for Base by default
    const basePath =
      id === 137
        ? "/api/polygon-blockscout"
        : id === 42161
          ? "/api/arbitrum-blockscout"
          : id === 84532
            ? "/api/base-sepolia-blockscout"
            : id === 4202
              ? "/api/lisk-sepolia-blockscout"
              : "/api/blockscout";

    // Try Etherscan-style and Blockscout v2 endpoints
    const keyParam = apiKey ? `&apikey=${encodeURIComponent(apiKey)}` : "";
    const tokenParam = apiKey ? `?token=${encodeURIComponent(apiKey)}` : "";
    const endpoints = [
      `${basePath}/api?module=contract&action=getabi&address=${address}${keyParam}`,
      `${basePath}/api/v2/smart-contracts/${address}${tokenParam}`, // note: includes /api/v2 to survive proxy rewrite
    ];

    let interimAbi: unknown[] | null = null;
    let interimName: string | undefined;

    for (const url of endpoints) {
      try {
        const response = await axios.get(url, { timeout: FETCH_TIMEOUT });
        // Etherscan-style
        if (response.data?.status === "1" && response.data?.result) {
          const rawResult = response.data.result;
          if (rawResult === "Contract source code not verified") {
            continue;
          }
          try {
            const parsed = JSON.parse(rawResult);
            if (Array.isArray(parsed)) {
              interimAbi = parsed as unknown[];
            }
          } catch {
            continue;
          }
          // v1 path does not include name, try to fetch name below
          continue;
        }
        // Blockscout v2
        if (response.data?.abi && Array.isArray(response.data.abi)) {
          interimAbi = response.data.abi as unknown[];
          interimName = response.data.name || response.data.contract_name;
          break;
        }
      } catch {
        continue;
      }
    }

    // If we have ABI from v1 but no name, fetch name via v2 or getsourcecode
    if (interimAbi && !interimName) {
      const nameEndpoints = [
        `${basePath}/api?module=contract&action=getsourcecode&address=${address}${keyParam}`,
        `${basePath}/api/v2/smart-contracts/${address}${tokenParam}`,
      ];
      for (const nurl of nameEndpoints) {
        try {
          const r = await axios.get(nurl, { timeout: FETCH_TIMEOUT });
          if (r.data?.status === "1" && r.data?.result?.[0]?.ContractName) {
            interimName = r.data.result[0].ContractName;
            break;
          }
          if (r.data?.name || r.data?.contract_name) {
            interimName = r.data.name || r.data.contract_name;
            break;
          }
        } catch {
          /* try next */
        }
      }
    }

    if (interimAbi && Array.isArray(interimAbi) && interimAbi.length > 0) {
      return {
        abi: JSON.stringify(interimAbi),
        source: "Blockscout",
        contractName: interimName,
        success: true,
      };
    }

    return null;
  } catch (error) {
    return null;
  }
}

// Categorize functions into read and write
function categorizeFunctions(abi: unknown[]): {
  read: unknown[];
  write: unknown[];
} {
  const readFunctions: unknown[] = [];
  const writeFunctions: unknown[] = [];

  (abi || []).forEach((item: unknown) => {
    const entry = item as { type?: string; stateMutability?: string };
    if (entry?.type === "function") {
      if (
        entry.stateMutability === "view" ||
        entry.stateMutability === "pure"
      ) {
        readFunctions.push(item);
      } else {
        writeFunctions.push(item);
      }
    }
  });

  return { read: readFunctions, write: writeFunctions };
}

// Fetch ABI for a single facet
async function fetchFacetSelectors(
  chain: Chain,
  diamondAddress: string,
  facetAddress: string,
  provider?: ethers.providers.Provider
): Promise<string[]> {
  try {
    const rpcProvider =
      provider ?? new ethers.providers.JsonRpcProvider(getRpcUrl(chain));
    const diamondContract = new ethers.Contract(
      diamondAddress,
      [
        "function facetFunctionSelectors(address facet) external view returns (bytes4[] memory)",
      ],
      rpcProvider
    );

    const selectors: string[] = await diamondContract.facetFunctionSelectors(
      facetAddress
    );
    return (selectors || []).map((selector) => selector.toLowerCase());
  } catch {
    return [];
  }
}

async function fetchFacetABI(
  chain: Chain,
  diamondAddress: string,
  facetAddress: string,
  options: FacetFetchOptions = {}
): Promise<DiamondFacet | null> {
  const cacheKey = `${chain.id}:${facetAddress.toLowerCase()}`;
  if (facetFetchCache.has(cacheKey)) {
    return facetFetchCache.get(cacheKey)!;
  }

  const promise = (async (): Promise<DiamondFacet | null> => {
    let resolvedAbi: unknown[] | null = null;
    let resolvedName = "Facet";
    let resolvedSource = "Unknown";
    let isVerified = false;
    let confidence: "verified" | "inferred" | "extracted" = "extracted";
    let selectors: string[] = [];
    let selectorStubs: SelectorFunctionStub[] = [];

    try {
      const result = await fetchContractABIMultiSource(facetAddress, chain, {
        etherscanApiKey: options.etherscanApiKey,
        blockscoutApiKey:
          options.blockscoutApiKey ?? options.etherscanApiKey,
        provider: options.provider,
        preferredSources: options.preferredSources,
      });
      if (result && result.success && typeof result.abi === "string") {
        const parsed = JSON.parse(result.abi) as unknown[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          resolvedAbi = parsed;
          resolvedName =
            result.contractName && String(result.contractName).trim() !== ""
              ? String(result.contractName)
              : resolvedName;
          resolvedSource = result.source || resolvedSource;
          const normalizedSource = result.source
            ? String(result.source).toLowerCase()
            : undefined;
          if (normalizedSource === "blockscout") {
            options.onPreferredSourceDetected?.("blockscout");
          } else if (
            normalizedSource &&
            (normalizedSource === "sourcify" || normalizedSource === "etherscan")
          ) {
            options.onPreferredSourceDetected?.(
              normalizedSource as ExplorerSource
            );
          }
          selectors = Array.isArray(result.selectors)
            ? result.selectors.map((selector) => selector.toLowerCase())
            : selectors;
          if (
            result.confidence === "verified" ||
            result.confidence === "inferred" ||
            result.confidence === "extracted"
          ) {
            confidence = result.confidence;
            isVerified = result.confidence === "verified";
          } else {
            isVerified =
              resolvedSource !== "whatsabi" && resolvedSource !== "Selectors";
            confidence = isVerified ? "verified" : "extracted";
          }
        }
      }
    } catch {
      // Aggregator ABI fetch failed, try individual sources
    }

    if (!resolvedAbi) {
      const sourceRunners: Array<{
        key: ExplorerSource;
        runner: () => Promise<ExtendedABIFetchResult | null>;
      }> = [
        {
          key: "sourcify",
          runner: () => fetchFromSourcify(chain, facetAddress),
        },
        {
          key: "etherscan",
          runner: () => fetchFromEtherscan(
            chain,
            facetAddress,
            options.etherscanApiKey
          ),
        },
        {
          key: "blockscout",
          runner: () =>
            fetchFromBlockscout(
              chain,
              facetAddress,
              options.blockscoutApiKey ?? options.etherscanApiKey
            ),
        },
      ];

      const preferenceOrder = options.preferredSources?.length
        ? [
            ...options.preferredSources,
            ...sourceRunners
              .map((runner) => runner.key)
              .filter((key) => !options.preferredSources?.includes(key)),
          ]
        : sourceRunners.map((runner) => runner.key);

      for (const sourceKey of preferenceOrder) {
        const runnerEntry = sourceRunners.find((entry) => entry.key === sourceKey);
        if (!runnerEntry) {
          continue;
        }

        try {
          const result = await runnerEntry.runner();
          if (!result || !result.success || typeof result.abi !== "string") {
            continue;
          }

          const parsed = JSON.parse(result.abi) as unknown[];
          if (!Array.isArray(parsed) || parsed.length === 0) {
            continue;
          }

          resolvedAbi = parsed;
          resolvedName =
            result.contractName && String(result.contractName).trim() !== ""
              ? String(result.contractName)
              : resolvedName;
          resolvedSource = result.source || runnerEntry.key;

          options.onPreferredSourceDetected?.(runnerEntry.key);

          if (
            result.confidence === "verified" ||
            result.confidence === "inferred" ||
            result.confidence === "extracted"
          ) {
            confidence = result.confidence;
            isVerified = result.confidence === "verified";
          }
          break;
        } catch {
          // Fallback ABI fetch failed, try next source
        }
      }
    }

  // WhatsABI fallback for unverified facets
  if (!resolvedAbi) {
    try {
      const whatsabiResult = await fetchFromWhatsABI(facetAddress, chain);
      if (whatsabiResult.success && whatsabiResult.abi) {
        resolvedAbi = JSON.parse(whatsabiResult.abi) as unknown[];
        resolvedName = whatsabiResult.contractName || "Facet";
        resolvedSource = "WhatsABI";
        confidence = whatsabiResult.confidence;
        selectors = whatsabiResult.selectors || [];
      }
    } catch {
      // WhatsABI analysis failed, try selector-based inference
    }
  }

  // Selector-based inference if we still don't have an ABI or if WhatsABI returned empty
  if (!resolvedAbi || (Array.isArray(resolvedAbi) && resolvedAbi.length === 0)) {
    selectors = selectors.length
      ? selectors
      : await fetchFacetSelectors(
          chain,
          diamondAddress,
          facetAddress,
          options.provider
        );

    if (selectors.length > 0) {
      try {
        selectorStubs = await createFunctionStubsFromSelectors(
          selectors,
          facetAddress,
          resolvedName
        );
        resolvedAbi = selectorStubs.map((stub) => stub.abi);
        resolvedSource = "Selectors";
        confidence = selectorStubs.some((stub) => stub.confidence === "inferred")
          ? "inferred"
          : "extracted";
      } catch {
        // Selector stub building failed
      }
    }
  }

  if (!resolvedAbi) {
    resolvedAbi = [];
  }

  const functions = categorizeFunctions(resolvedAbi);

  // If we inferred the ABI via selectors but state classification is empty, expose inferred functions via read list
  if (!isVerified && functions.read.length === 0 && resolvedAbi.length > 0) {
    functions.read = resolvedAbi.filter((item) => {
      const entry = item as { type?: string };
      return entry?.type === "function";
    });
  }

  return {
    address: facetAddress,
    name: resolvedName,
    abi: resolvedAbi,
    source: resolvedSource,
    isVerified,
    functions,
    selectors,
    confidence,
    inferenceSource: isVerified ? "verified" : resolvedSource === "WhatsABI" ? "whatsabi" : resolvedSource === "Selectors" ? "selectors" : undefined,
  };
  })();

  facetFetchCache.set(cacheKey, promise);

  // LRU eviction: if cache exceeds max size, delete oldest entries
  if (facetFetchCache.size > FACET_CACHE_MAX_SIZE) {
    const keysIter = facetFetchCache.keys();
    while (facetFetchCache.size > FACET_CACHE_MAX_SIZE) {
      const oldest = keysIter.next();
      if (oldest.done) break;
      facetFetchCache.delete(oldest.value);
    }
  }

  try {
    const result = await promise;
    return result;
  } catch (error) {
    facetFetchCache.delete(cacheKey);
    throw error;
  }
}

// Process facets in batches
interface ProgressState {
  completed: number;
}

async function processBatch(
  chain: Chain,
  diamondAddress: string,
  facetAddresses: string[],
  batch: string[],
  progressCallback: FacetProgressCallback,
  startIndex: number,
  progressState: ProgressState,
  options: FacetFetchOptions
): Promise<DiamondFacet[]> {
  const promises = batch.map(async (address, batchIndex) => {
    const globalIndex = startIndex + batchIndex;
    const ordinal = globalIndex + 1;

    // Add error handling for progress callback
    try {
      progressCallback({
        current: progressState.completed,
        total: facetAddresses.length,
        currentFacet: address || "Unknown",
        status: "fetching",
        index: ordinal,
      });
    } catch {
      // Progress callback failed
    }

    const facet = await fetchFacetABI(
      chain,
      diamondAddress,
      address,
      options
    );

    try {
      if (facet) {
        progressState.completed += 1;
        progressCallback({
          current: progressState.completed,
          total: facetAddresses.length,
          currentFacet: address || "Unknown",
          status: "success",
          index: ordinal,
        });
      } else {
        progressState.completed += 1;
        progressCallback({
          current: progressState.completed,
          total: facetAddresses.length,
          currentFacet: address || "Unknown",
          status: "error",
          index: ordinal,
        });
      }
    } catch {
      // Progress callback failed
    }

    return facet;
  });

  const results = await Promise.all(promises);
  return results.filter((facet): facet is DiamondFacet => facet !== null);
}

// Main function to fetch all Diamond facets
export async function fetchDiamondFacets(
  chain: Chain,
  diamondAddress: string,
  facetAddresses: string[],
  progressCallback: FacetProgressCallback,
  options: FacetFetchOptions = {}
): Promise<DiamondFacet[]> {
  if (facetAddresses.length === 0) {
    return [];
  }

  const allFacets: DiamondFacet[] = [];
  const progressState: ProgressState = { completed: 0 };
  const provider =
    options.provider ?? new ethers.providers.JsonRpcProvider(getRpcUrl(chain));
  let sharedPreferredSources = options.preferredSources?.slice();
  const sharedOptions: FacetFetchOptions = {
    ...options,
    provider,
    preferredSources: sharedPreferredSources,
  };

  sharedOptions.onPreferredSourceDetected = (source) => {
    if (
      sharedPreferredSources &&
      sharedPreferredSources.length === 1 &&
      sharedPreferredSources[0] === source
    ) {
      return;
    }

    sharedPreferredSources = [source];
    sharedOptions.preferredSources = sharedPreferredSources;
  };

  // Process facets in batches
  for (let i = 0; i < facetAddresses.length; i += BATCH_SIZE) {
    const batch = facetAddresses.slice(i, i + BATCH_SIZE);
    const batchResults = await processBatch(
      chain,
      diamondAddress,
      facetAddresses,
      batch,
      progressCallback,
      i,
      progressState,
      sharedOptions
    );
    allFacets.push(...batchResults);
  }

  return allFacets;
}

// Helper to get facet addresses from Diamond contract
export async function getDiamondFacetAddresses(
  chain: Chain,
  diamondAddress: string
): Promise<string[]> {
  try {
    const { ethers } = await import("ethers");
    const provider = new ethers.providers.JsonRpcProvider(getRpcUrl(chain));

    // Diamond Loupe interface
    const loupeFacetAddressesABI = [
      "function facetAddresses() external view returns (address[] facetAddresses_)",
    ];
    const loupeFacetsABI = [
      "function facets() external view returns (tuple(address facetAddress, bytes4[] functionSelectors)[] facets_)",
    ];

    // Try facetAddresses() first
    try {
      const contract = new ethers.Contract(
        diamondAddress,
        loupeFacetAddressesABI,
        provider
      );
      const facetAddresses: string[] = await contract.facetAddresses();
      if (Array.isArray(facetAddresses) && facetAddresses.length > 0) {
        return facetAddresses;
      }
    } catch {
      // fall through to facets()
    }

    // Fallback: use facets() and extract addresses
    try {
      const contract = new ethers.Contract(
        diamondAddress,
        loupeFacetsABI,
        provider
      );
      const facets: Array<{
        facetAddress: string;
        functionSelectors: string[];
      }> = await contract.facets();
      const addresses = Array.from(
        new Set((facets || []).map((f) => f.facetAddress))
      ).filter(Boolean);
      return addresses;
    } catch {
      // Fallback facets() also failed
    }

    return [];
  } catch {
    return [];
  }
}
