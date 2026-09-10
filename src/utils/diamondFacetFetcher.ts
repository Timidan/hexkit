import { ethers } from "ethers";
import type { Chain, ExplorerSource } from "../types";
import { contractResolver } from "./resolver";
import type { FacetInfo } from "./resolver";
import { facetInfoToDiamondFacet } from "./resolver/facetAdapter";
import {
  fetchFromWhatsABI,
  createFunctionStubsFromSelectors,
} from "./whatsabiFetcher";
import { networkConfigManager } from "../config/networkConfig";

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
  /**
   * Selectors per facet captured from a prior facets() loupe call (see
   * getDiamondFacetAddressesWithSelectors). When a facet is present here it is
   * used directly (0 RPC) instead of issuing facetFunctionSelectors(); facets
   * absent from the map fall back to the per-facet RPC call.
   */
  loupeSelectors?: Map<string, string[]>;
}

// Batch processing configuration
const BATCH_SIZE = 6;

// Helper to get RPC URL for a chain
function getRpcUrl(chain: Chain): string {
  const resolved = networkConfigManager.resolveRpcUrl(chain.id, chain.rpcUrl);
  if (resolved?.url) {
    return resolved.url;
  }

  // Use the chain's default RPC as final fallback
  return chain.rpcUrl;
}

// Split a raw ABI into read (view/pure) and write functions.
function categorizeFunctions(abi: unknown[]): {
  read: unknown[];
  write: unknown[];
} {
  const read: unknown[] = [];
  const write: unknown[] = [];
  (abi || []).forEach((item: unknown) => {
    const entry = item as { type?: string; stateMutability?: string };
    if (entry?.type === "function") {
      if (entry.stateMutability === "view" || entry.stateMutability === "pure") {
        read.push(item);
      } else {
        write.push(item);
      }
    }
  });
  return { read, write };
}

// Fetch selectors for a single facet from the diamond's loupe interface.
// When the facets() loupe call already returned this facet's selectors (passed
// via loupeSelectors), use them directly — 0 RPC. Facets absent from the map
// fall back to the per-facet facetFunctionSelectors() call (e.g. diamonds whose
// facets() reverted and resolved addresses via facetAddresses()).
async function fetchFacetSelectors(
  chain: Chain,
  diamondAddress: string,
  facetAddress: string,
  provider?: ethers.providers.Provider,
  loupeSelectors?: Map<string, string[]>
): Promise<string[]> {
  const cached = loupeSelectors?.get(facetAddress);
  // Only reuse a NON-EMPTY cached set; an empty array (a facet missing from a
  // malformed facets() response) must still fall back to the per-facet RPC.
  if (cached && cached.length > 0) {
    return cached.map((selector) => selector.toLowerCase());
  }

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
  const [selectors, result] = await Promise.all([
    fetchFacetSelectors(
      chain,
      diamondAddress,
      facetAddress,
      options.provider,
      options.loupeSelectors
    ),
    contractResolver.resolve(facetAddress, chain, {
      etherscanApiKey: options.etherscanApiKey,
      blockscoutApiKey: options.blockscoutApiKey ?? options.etherscanApiKey,
      preferredSources: options.preferredSources,
    }),
  ]);

  if (result.source) {
    options.onPreferredSourceDetected?.(result.source as ExplorerSource);
  }

  // Verified / explorer-resolved ABI: map through the resolver-shape adapter.
  if (result.abi && result.abi.length > 0) {
    const facetInfo: FacetInfo = {
      address: facetAddress,
      name: result.name || undefined,
      abi: result.abi,
      confidence: result.confidence,
      source: result.source || undefined,
      selectors,
      functions: [...result.functions.read, ...result.functions.write],
    };

    return facetInfoToDiamondFacet(facetInfo);
  }

  // Unverified facet: the resolver only races verified explorer sources, so fall
  // back to WhatsABI bytecode analysis, then loupe-selector stubs, so unverified
  // facets still surface inferred/extracted functions (preserving the pre-refactor
  // behaviour without re-introducing the deleted source ladder).
  let resolvedAbi: unknown[] | null = null;
  let resolvedName = result.name || "Facet";
  let resolvedSource = "Unknown";
  let confidence: "verified" | "inferred" | "extracted" = "extracted";
  let inferenceSource: "whatsabi" | "selectors" | undefined;

  try {
    const whatsabiResult = await fetchFromWhatsABI(
      facetAddress,
      chain,
      options.provider
    );
    if (whatsabiResult.success && whatsabiResult.abi) {
      resolvedAbi = JSON.parse(whatsabiResult.abi) as unknown[];
      resolvedName = whatsabiResult.contractName || "Facet";
      resolvedSource = "WhatsABI";
      confidence = whatsabiResult.confidence;
      inferenceSource = "whatsabi";
    }
  } catch {
    // WhatsABI analysis failed; fall through to selector-based inference.
  }

  if ((!resolvedAbi || resolvedAbi.length === 0) && selectors.length > 0) {
    try {
      const stubs = await createFunctionStubsFromSelectors(
        selectors,
        facetAddress,
        resolvedName
      );
      resolvedAbi = stubs.map((stub) => stub.abi);
      resolvedSource = "Selectors";
      confidence = stubs.some((stub) => stub.confidence === "inferred")
        ? "inferred"
        : "extracted";
      inferenceSource = "selectors";
    } catch {
      // Selector stub building failed.
    }
  }

  if (!resolvedAbi) {
    resolvedAbi = [];
  }

  const functions = categorizeFunctions(resolvedAbi);
  // If selector/bytecode inference produced functions but state classification is
  // empty, expose them via the read list (matches pre-refactor behaviour).
  if (functions.read.length === 0 && resolvedAbi.length > 0) {
    functions.read = resolvedAbi.filter(
      (item) => (item as { type?: string })?.type === "function"
    );
  }

  return {
    address: facetAddress,
    name: resolvedName,
    abi: resolvedAbi,
    source: resolvedSource,
    isVerified: false,
    functions,
    selectors,
    confidence,
    inferenceSource,
  };
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

// Helper to get facet addresses from Diamond contract, also exposing the
// per-facet selectors when discovery falls back to facets() (which returns each
// facet's selectors in the same call). Thread the returned loupeSelectors map
// into fetchDiamondFacets (options.loupeSelectors) so per-facet
// facetFunctionSelectors() RPC calls are skipped for facets present in it.
export async function getDiamondFacetAddressesWithSelectors(
  chain: Chain,
  diamondAddress: string
): Promise<{ addresses: string[]; loupeSelectors?: Map<string, string[]> }> {
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

    // Prefer facets(): one call returns every facet address AND its selectors,
    // so the per-facet facetFunctionSelectors() RPC is avoided for the common
    // EIP-2535 case (the selectors are reused via the returned loupeSelectors map).
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
      if (Array.isArray(facets) && facets.length > 0) {
        const loupeSelectors = new Map<string, string[]>();
        for (const f of facets) {
          if (!f.facetAddress) continue;
          loupeSelectors.set(f.facetAddress, (f.functionSelectors || []).slice());
        }
        const addresses = Array.from(
          new Set(facets.map((f) => f.facetAddress))
        ).filter(Boolean);
        if (addresses.length > 0) {
          return { addresses, loupeSelectors };
        }
      }
    } catch {
      // facets() not implemented / reverted — fall back to facetAddresses()
    }

    // Fallback: facetAddresses() (addresses only; selectors fetched per-facet later
    // for diamonds that implement facetAddresses() but not facets()).
    try {
      const contract = new ethers.Contract(
        diamondAddress,
        loupeFacetAddressesABI,
        provider
      );
      const facetAddresses: string[] = await contract.facetAddresses();
      if (Array.isArray(facetAddresses) && facetAddresses.length > 0) {
        return { addresses: facetAddresses };
      }
    } catch {
      // Both loupe calls failed
    }

    return { addresses: [] };
  } catch {
    return { addresses: [] };
  }
}

// Helper to get facet addresses from Diamond contract
export async function getDiamondFacetAddresses(
  chain: Chain,
  diamondAddress: string
): Promise<string[]> {
  const { addresses } = await getDiamondFacetAddressesWithSelectors(
    chain,
    diamondAddress
  );
  return addresses;
}
