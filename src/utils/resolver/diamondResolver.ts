/**
 * Diamond Resolver
 *
 * Resolves Diamond (EIP-2535) contracts by fetching all facet ABIs.
 *
 * Key optimizations:
 * - Batched parallel fetching (configurable concurrency)
 * - ABI-based diamond detection (avoid unnecessary RPC calls)
 * - Combined ABI generation for unified interface
 */

import { ethers } from 'ethers';
import type { Chain } from '../../types';
import type {
  DiamondInfo,
  FacetInfo,
  DiamondResolveOptions,
  AbiItem,
  ExternalFunction,
} from './types';
import { hasDiamondLoupeFunctions } from './diamondLoupe';
import { contractResolver } from './ContractResolver';
import { getSharedProvider } from '../providerPool';

const DEFAULT_CONCURRENCY = 6;
const FACET_TIMEOUT_MS = 10000;

// Diamond Loupe interface
const DIAMOND_LOUPE_ABI = [
  'function facetAddresses() external view returns (address[])',
  'function facets() external view returns ((address facetAddress, bytes4[] functionSelectors)[])',
  'function facetFunctionSelectors(address _facet) external view returns (bytes4[])',
  'function facetAddress(bytes4 _functionSelector) external view returns (address)',
];

function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function extractFunctions(abi: AbiItem[]): ExternalFunction[] {
  return abi
    .filter((item): item is AbiItem & { name: string } =>
      item.type === 'function' && !!item.name
    )
    .map((item) => ({
      name: item.name,
      signature: `${item.name}(${(item.inputs || []).map((i) => i.type).join(',')})`,
      selector: '',
      inputs: item.inputs || [],
      outputs: item.outputs || [],
      stateMutability: item.stateMutability || 'nonpayable',
    }));
}

function mergeFacetAbis(facets: FacetInfo[]): AbiItem[] {
  const seenSignatures = new Set<string>();
  const combined: AbiItem[] = [];

  for (const facet of facets) {
    if (!facet.abi) continue;

    for (const item of facet.abi) {
      let key: string;
      if (item.type === 'function' && item.name) {
        key = `function:${item.name}:${(item.inputs || []).map((i) => i.type).join(',')}`;
      } else if (item.type === 'event' && item.name) {
        key = `event:${item.name}`;
      } else if (item.type === 'error' && item.name) {
        key = `error:${item.name}`;
      } else {
        key = `${item.type}:${JSON.stringify(item, (_k, v) => typeof v === 'bigint' ? v.toString() : v)}`;
      }

      if (!seenSignatures.has(key)) {
        seenSignatures.add(key);
        combined.push(item);
      }
    }
  }

  return combined;
}

/**
 * Detect if a contract is a Diamond by calling facetAddresses().
 */
export async function detectDiamond(
  address: string,
  chain: Chain
): Promise<{ isDiamond: boolean; facetAddresses?: string[] }> {
  try {
    const provider = getSharedProvider(chain);
    const contract = new ethers.Contract(address, DIAMOND_LOUPE_ABI, provider);

    try {
      const addresses = await contract.facetAddresses();
      if (Array.isArray(addresses) && addresses.length > 0) {
        return { isDiamond: true, facetAddresses: addresses };
      }
    } catch {
      try {
        const facets = await contract.facets();
        if (Array.isArray(facets) && facets.length > 0) {
          const addresses = facets.map((f: { facetAddress: string }) => f.facetAddress);
          return { isDiamond: true, facetAddresses: addresses };
        }
      } catch {
        // Not a diamond
      }
    }

    return { isDiamond: false };
  } catch {
    return { isDiamond: false };
  }
}

async function getFacetSelectors(
  diamondAddress: string,
  facetAddress: string,
  chain: Chain
): Promise<string[]> {
  try {
    const provider = getSharedProvider(chain);
    const contract = new ethers.Contract(diamondAddress, DIAMOND_LOUPE_ABI, provider);
    const selectors = await contract.facetFunctionSelectors(facetAddress);
    return selectors || [];
  } catch {
    return [];
  }
}

export async function resolveDiamond(
  diamondAddress: string,
  chain: Chain,
  options: DiamondResolveOptions = {}
): Promise<DiamondInfo> {
  const { signal, concurrency = DEFAULT_CONCURRENCY, onFacetProgress } = options;

  const detection = await detectDiamond(diamondAddress, chain);

  if (!detection.isDiamond || !detection.facetAddresses) {
    return {
      isDiamond: false,
      facets: [],
      combinedAbi: [],
      totalFunctions: 0,
      totalSelectors: 0,
    };
  }

  const facetAddresses = detection.facetAddresses;
  const facets: FacetInfo[] = [];
  let completed = 0;
  const total = facetAddresses.length;

  const batches = chunk(facetAddresses, concurrency);

  for (const batch of batches) {
    if (signal?.aborted) break;

    const batchPromises = batch.map(async (facetAddress): Promise<FacetInfo> => {
      try {
        const [selectors, resolveResult] = await Promise.all([
          getFacetSelectors(diamondAddress, facetAddress, chain),
          contractResolver.resolve(facetAddress, chain, {
            signal,
            etherscanApiKey: options.etherscanApiKey,
            priority: 'speed',
          }),
        ]);

        const facetInfo: FacetInfo = {
          address: facetAddress,
          name: resolveResult.name || undefined,
          abi: resolveResult.abi,
          confidence: resolveResult.confidence,
          source: resolveResult.source || undefined,
          selectors,
          functions: resolveResult.abi ? extractFunctions(resolveResult.abi) : [],
        };

        return facetInfo;
      } catch (error) {
        return {
          address: facetAddress,
          name: undefined,
          abi: null,
          confidence: 'bytecode-only',
          selectors: [],
          functions: [],
        };
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        facets.push(result.value);
        completed++;
        onFacetProgress?.(completed, total, result.value);
      }
    }
  }

  const combinedAbi = mergeFacetAbis(facets);
  const totalFunctions = facets.reduce((sum, f) => sum + f.functions.length, 0);
  const totalSelectors = facets.reduce((sum, f) => sum + f.selectors.length, 0);

  return {
    isDiamond: true,
    facets,
    combinedAbi,
    totalFunctions,
    totalSelectors,
  };
}

export { hasDiamondLoupeFunctions, mightBeDiamond } from './diamondLoupe';
