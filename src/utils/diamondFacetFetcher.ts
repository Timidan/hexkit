import axios from "axios";
import { ethers } from "ethers";
import type { Chain, ExtendedABIFetchResult } from "../types";
import {
  fetchFromWhatsABI,
  createFunctionStubsFromSelectors,
  type SelectorFunctionStub,
} from "./whatsabiFetcher";
import { fetchContractABIMultiSource } from "./multiSourceAbiFetcher";

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
}

const facetFetchCache = new Map<string, Promise<DiamondFacet | null>>();

// Batch processing configuration
const BATCH_SIZE = 6;
const FETCH_TIMEOUT = 10000; // 10 seconds per facet

// Get API key from environment
const API_KEY =
  (import.meta.env as unknown as { VITE_API_KEY?: string }).VITE_API_KEY ||
  (import.meta.env as unknown as { API_KEY?: string }).API_KEY ||
  "";

// Helper to get RPC URL for a chain
function getRpcUrl(chain: Chain): string {
  // Prefer the chain-provided RPC first
  if (chain.rpcUrl) {
    return chain.rpcUrl as string;
  }

  // Fallbacks by numeric chain id
  const id = chain.id;
  if (id === 1) return `https://eth-mainnet.g.alchemy.com/v2/${API_KEY}`;
  if (id === 8453)
    return API_KEY
      ? `https://base-mainnet.g.alchemy.com/v2/${API_KEY}`
      : "https://mainnet.base.org";
  if (id === 137) return `https://polygon-mainnet.g.alchemy.com/v2/${API_KEY}`;
  if (id === 42161) return `https://arb-mainnet.g.alchemy.com/v2/${API_KEY}`;
  if (id === 10) return `https://opt-mainnet.g.alchemy.com/v2/${API_KEY}`;
  // Common public fallbacks
  return "https://cloudflare-eth.com";
}

// Helper to get explorer API URLs (using Vite proxy paths)
function getExplorerUrls(chain: Chain, address: string) {
  const id = chain.id;

  const etherscanProxyMap: Record<number, string> = {
    1: "/api/etherscan",
    8453: "/api/basescan",
    11155111: "/api/sepolia-etherscan",
    17000: "/api/holesky-etherscan",
    84532: "/api/base-sepolia-basescan",
    137: "/api/polygonscan",
    80002: "/api/amoy-polygonscan",
    42161: "/api/arbiscan",
  };

  const blockscoutProxyMap: Record<number, string> = {
    137: "/api/polygon-blockscout",
    42161: "/api/arbitrum-blockscout",
    84532: "/api/base-sepolia-blockscout",
    4202: "/api/lisk-sepolia-blockscout",
  };

  const etherscanBase = etherscanProxyMap[id] || "/api/etherscan";
  const blockscoutBase = blockscoutProxyMap[id] || "/api/blockscout";
  const sourcifyBase = "/api/sourcify";

  return {
    etherscan: `${etherscanBase}?module=contract&action=getabi&address=${address}`,
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
    const urls = getExplorerUrls(chain, address);
    const keyParam = apiKey ? `&apikey=${encodeURIComponent(apiKey)}` : "";
    const response = await axios.get(`${urls.etherscan}${keyParam}`, {
      timeout: FETCH_TIMEOUT,
    });

    if (
      response.data.status === "1" &&
      response.data.result !== "Contract source code not verified"
    ) {
      const abi = JSON.parse(response.data.result);
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
  } catch (error) {
    console.warn(
      `Failed to fetch facetFunctionSelectors for ${facetAddress}:`,
      error
    );
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
      const result = await fetchContractABIMultiSource(
        facetAddress,
        chain,
        options.etherscanApiKey,
        options.provider
      );
      if (result && result.success && typeof result.abi === "string") {
        const parsed = JSON.parse(result.abi) as unknown[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          resolvedAbi = parsed;
          resolvedName =
            result.contractName && String(result.contractName).trim() !== ""
              ? String(result.contractName)
              : resolvedName;
          resolvedSource = result.source || resolvedSource;
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
    } catch (error) {
      console.warn(
        `Aggregator ABI fetch failed for ${facetAddress}:`,
        error
      );
    }

    if (!resolvedAbi) {
      try {
        const outcomes = await Promise.allSettled([
          fetchFromSourcify(chain, facetAddress),
          fetchFromEtherscan(chain, facetAddress, options.etherscanApiKey),
          fetchFromBlockscout(
            chain,
            facetAddress,
            options.blockscoutApiKey ?? options.etherscanApiKey
          ),
        ]);

        const prioritized = outcomes.flatMap((outcome, idx) => {
          if (outcome.status !== "fulfilled" || !outcome.value) return [];
          return [{ result: outcome.value, order: idx }];
        });

        prioritized.sort((a, b) => a.order - b.order);

        for (const candidate of prioritized) {
          const result = candidate.result;
          if (result && result.success && typeof result.abi === "string") {
            try {
              const parsed = JSON.parse(result.abi) as unknown[];
              if (!Array.isArray(parsed) || parsed.length === 0) {
                continue;
              }
              resolvedAbi = parsed;
              resolvedName =
                result.contractName && String(result.contractName).trim() !== ""
                  ? String(result.contractName)
                  : resolvedName;
              resolvedSource = result.source || resolvedSource;
              if (
                result.confidence === "verified" ||
                result.confidence === "inferred" ||
                result.confidence === "extracted"
              ) {
                confidence = result.confidence;
                isVerified = result.confidence === "verified";
              }
              break;
            } catch (parseError) {
              continue;
            }
          }
        }
      } catch (parallelError) {
        console.warn(
          `Parallel ABI sources failed for ${facetAddress}:`,
          parallelError
        );
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
    } catch (error) {
      console.warn(
        `WhatsABI analysis failed for facet ${facetAddress}:`,
        error
      );
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
      } catch (error) {
        console.warn(
          `Failed to build selector stubs for facet ${facetAddress}:`,
          error
        );
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
    } catch (error) {
      console.warn("Progress callback failed:", error);
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
    } catch (error) {
      console.warn("Progress callback failed:", error);
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
  const sharedOptions: FacetFetchOptions = {
    ...options,
    provider,
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
    } catch (e2) {
      console.error(
        "Error fetching Diamond facet addresses (fallback facets()):",
        e2
      );
    }

    return [];
  } catch (error) {
    console.error("Error fetching Diamond facet addresses:", error);
    return [];
  }
}
