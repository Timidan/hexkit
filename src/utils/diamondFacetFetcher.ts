import axios from "axios";
import type { Chain, ExtendedABIFetchResult } from "../types";

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

// Batch processing configuration
const BATCH_SIZE = 4;
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
  // Etherscan-family proxy path
  const etherscanBase =
    id === 8453
      ? "/api/basescan"
      : id === 1
        ? "/api/etherscan"
        : id === 137
          ? "/api/polygonscan"
          : id === 42161
            ? "/api/arbiscan"
            : "/api/etherscan";
  // Blockscout proxy path (Base by default)
  const blockscoutBase =
    id === 137
      ? "/api/polygon-blockscout"
      : id === 42161
        ? "/api/arbitrum-blockscout"
        : "/api/blockscout";
  // Sourcify proxy path
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
  address: string
): Promise<ExtendedABIFetchResult | null> {
  try {
    const urls = getExplorerUrls(chain, address);
    const response = await axios.get(urls.etherscan, {
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
  address: string
): Promise<ExtendedABIFetchResult | null> {
  try {
    const id = chain.id;
    // Use vite proxy base, target will be base-mainnet.blockscout.com for Base by default
    const basePath =
      id === 137
        ? "/api/polygon-blockscout"
        : id === 42161
          ? "/api/arbitrum-blockscout"
          : "/api/blockscout";

    // Try Etherscan-style and Blockscout v2 endpoints
    const endpoints = [
      `${basePath}/api?module=contract&action=getabi&address=${address}`,
      `${basePath}/api/v2/smart-contracts/${address}`, // note: includes /api/v2 to survive proxy rewrite
    ];

    let interimAbi: unknown[] | null = null;
    let interimName: string | undefined;

    for (const url of endpoints) {
      try {
        const response = await axios.get(url, { timeout: FETCH_TIMEOUT });
        // Etherscan-style
        if (response.data?.status === "1" && response.data?.result) {
          const parsed = JSON.parse(response.data.result);
          if (Array.isArray(parsed)) {
            interimAbi = parsed as unknown[];
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
        `${basePath}/api?module=contract&action=getsourcecode&address=${address}`,
        `${basePath}/api/v2/smart-contracts/${address}`,
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
async function fetchFacetABI(
  chain: Chain,
  facetAddress: string
): Promise<DiamondFacet | null> {
  const sources = [
    () => fetchFromSourcify(chain, facetAddress),
    () => fetchFromEtherscan(chain, facetAddress),
    () => fetchFromBlockscout(chain, facetAddress),
    // WhatsABI fallback disabled for facets to avoid API key or heavy analysis
  ];

  for (const source of sources) {
    try {
      const result = await source();
      if (
        result &&
        result.success &&
        result.abi &&
        (typeof result.abi === "string"
          ? JSON.parse(result.abi).length > 0
          : false)
      ) {
        // Parse ABI only once and reuse it
        const parsedABI =
          typeof result.abi === "string"
            ? JSON.parse(result.abi)
            : (result.abi as unknown[]);
        const functions = categorizeFunctions(parsedABI as unknown[]);
        // Prefer name from source; otherwise use a generic label
        const nameFromSource =
          result.contractName && String(result.contractName).trim() !== ""
            ? String(result.contractName)
            : "Facet";
        // Consider facet verified if we successfully fetched a non-empty ABI from a known source
        const verified =
          Array.isArray(parsedABI) &&
          parsedABI.length > 0 &&
          !!result.source &&
          result.source !== "Unknown";
        return {
          address: facetAddress,
          name: nameFromSource,
          abi: parsedABI as unknown[],
          source: result.source || "Unknown",
          isVerified: verified,
          functions,
        };
      }
    } catch (error) {
      console.warn(
        `Failed to fetch ABI from source for ${facetAddress}:`,
        error
      );
      continue;
    }
  }

  // If all sources fail, return unverified facet
  return {
    address: facetAddress,
    name: "Facet",
    abi: [],
    source: "Unknown",
    isVerified: false,
    functions: { read: [], write: [] },
  };
}

// Process facets in batches
interface ProgressState {
  completed: number;
}

async function processBatch(
  chain: Chain,
  facetAddresses: string[],
  batch: string[],
  progressCallback: FacetProgressCallback,
  startIndex: number,
  progressState: ProgressState
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

    const facet = await fetchFacetABI(chain, address);

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
  facetAddresses: string[],
  progressCallback: FacetProgressCallback
): Promise<DiamondFacet[]> {
  if (facetAddresses.length === 0) {
    return [];
  }

  const allFacets: DiamondFacet[] = [];
  const progressState: ProgressState = { completed: 0 };

  // Process facets in batches
  for (let i = 0; i < facetAddresses.length; i += BATCH_SIZE) {
    const batch = facetAddresses.slice(i, i + BATCH_SIZE);
    const batchResults = await processBatch(
      chain,
      facetAddresses,
      batch,
      progressCallback,
      i,
      progressState
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
