/**
 * Storage Layout Fetcher
 *
 * Fetches compiler storage layout metadata from public verification sources
 * (Sourcify). Falls back to AST-based reconstruction when compiler layout
 * is unavailable (pre-Solidity 0.5.13 contracts).
 *
 * Performance optimizations:
 * - Uses shared SourcifyCache for cross-module request dedup and caching
 * - Single V2 API call per contract fetches storageLayout + sources + compilation
 *   (eliminates the previous 2-request-per-facet pattern)
 * - Pre-warms cache for all diamond facet addresses before batch processing
 * - Increased concurrency for diamond facets (8 vs previous 5)
 * - Skips source fetch when compiler layout is sufficient (no fallbacks)
 *
 * Consumed by: useStorageEvidence.ts (standalone layout pipeline)
 */

import type { StorageLayoutResponse } from '../../../types/debug';
import { reconstructStorageLayout, reconstructBestStorageLayout } from '../../../utils/solidity-layout';
import { fetchSourcifyV2Cached, prewarmSourcifyCache } from '../../../utils/cache/sourcifyCache';

/** Confidence level for the layout source */
export type LayoutConfidence = 'compiler' | 'reconstructed';

/** Result from fetchStorageLayout including confidence metadata */
export interface StorageLayoutResult {
  layout: StorageLayoutResponse;
  confidence: LayoutConfidence;
}

/**
 * Extract storageLayout from a cached V2 API response.
 */
function extractStorageLayout(data: Record<string, unknown>): StorageLayoutResponse | null {
  const layout = data?.storageLayout as Record<string, unknown> | undefined;
  if (layout?.storage && layout?.types) {
    return layout as unknown as StorageLayoutResponse;
  }
  return null;
}

/**
 * Extract source files + compilation info from a cached V2 API response.
 */
function extractSources(data: Record<string, unknown>): {
  files: Record<string, string>;
  contractName: string;
  compilerVersion?: string;
} | null {
  const sources = data?.sources;
  if (!sources || typeof sources !== 'object') return null;

  const files: Record<string, string> = {};
  for (const [path, content] of Object.entries(sources as Record<string, unknown>)) {
    if (typeof content === 'string') {
      files[path] = content;
    } else if (content && typeof (content as Record<string, unknown>).content === 'string') {
      files[path] = (content as Record<string, string>).content;
    }
  }

  if (Object.keys(files).length === 0) return null;

  const compilation = data?.compilation as Record<string, unknown> | undefined;
  const contractName = (compilation?.name as string) || '';
  const compilerVersion = compilation?.compilerVersion as string | undefined;

  return { files, contractName, compilerVersion };
}

/**
 * Fetch storage layout from Sourcify V2 API.
 * Uses the shared cache to avoid redundant requests.
 */
export async function fetchStorageLayoutFromSourcify(
  chainId: number,
  address: string,
  signal?: AbortSignal
): Promise<StorageLayoutResponse | null> {
  const data = await fetchSourcifyV2Cached(chainId, address, ['storageLayout'], signal);
  if (!data) return null;
  return extractStorageLayout(data);
}

/**
 * Fetch BOTH storage layout AND sources in a single V2 API call.
 * Returns both results, avoiding the 2-request-per-facet pattern.
 */
async function fetchLayoutAndSourcesCombined(
  chainId: number,
  address: string,
  signal?: AbortSignal,
): Promise<{
  layout: StorageLayoutResponse | null;
  sources: { files: Record<string, string>; contractName: string; compilerVersion?: string } | null;
}> {
  const data = await fetchSourcifyV2Cached(
    chainId,
    address,
    ['storageLayout', 'sources', 'compilation'],
    signal,
  );
  if (!data) return { layout: null, sources: null };
  return {
    layout: extractStorageLayout(data),
    sources: extractSources(data),
  };
}

/** Options for enhanced layout fetching */
export interface FetchLayoutOptions {
  signal?: AbortSignal;
  /** Pre-fetched source bundle (avoids redundant Sourcify call) */
  sourceBundle?: { files: Record<string, string>; contractName?: string; compilerVersion?: string };
  /** Observed non-zero seed slots for candidate scoring */
  observedSlots?: Set<number>;
  /** Additional addresses to try fetching layout from (e.g., diamond facets) */
  fallbackAddresses?: string[];
}

/**
 * Score a storage layout for richness comparison.
 * Considers struct members, storage entries, and type definitions.
 * Diamond facets compiled at different times have different AppStorage versions.
 * The facet with the MOST members has the newest, most complete layout.
 */
function scoreLayout(layout: import('../../../types/debug').StorageLayoutResponse): number {
  let score = 0;
  // Struct member count (primary signal for diamond facets)
  for (const typeDef of Object.values(layout.types)) {
    score += (typeDef.members?.length ?? 0) * 10;
  }
  // Storage entry count (important for proxy vs implementation comparison)
  score += layout.storage.length * 5;
  // Type definition count (richer type dicts indicate more complete sources)
  score += Object.keys(layout.types).length;
  return score;
}

/**
 * Pick the richest layout from multiple candidates.
 * Uses weighted scoring: struct members > storage entries > type definitions.
 */
function pickRichestLayout(layouts: StorageLayoutResult[]): StorageLayoutResult {
  let best = layouts[0];
  let bestScore = scoreLayout(best.layout);

  for (let i = 1; i < layouts.length; i++) {
    const score = scoreLayout(layouts[i].layout);
    if (score > bestScore) {
      best = layouts[i];
      bestScore = score;
    }
  }

  return best;
}

/**
 * Orchestrator: try to fetch storage layout from public sources.
 * Fallback chain:
 *   1. Sourcify compiler layout (direct storageLayout field)
 *   2. AST reconstruction for target contract
 *   3. Candidate reconstruction (best-scoring contract from sources)
 *   4. Diamond facet fallback (try each facet address)
 */
export async function fetchStorageLayout(
  chainId: number,
  address: string,
  signalOrOptions?: AbortSignal | FetchLayoutOptions,
): Promise<StorageLayoutResult | null> {
  // Normalize arguments for backwards compatibility
  const opts: FetchLayoutOptions = signalOrOptions instanceof AbortSignal
    ? { signal: signalOrOptions }
    : (signalOrOptions ?? {});
  const { signal, sourceBundle, observedSlots, fallbackAddresses } = opts;

  const hasFallbacks = fallbackAddresses && fallbackAddresses.length > 0;

  // Accumulates the best result from primary contract (compiler or reconstructed).
  // When fallbackAddresses exist, we defer returning so the facet section can
  // compare all candidates and pick the richest layout.
  let primaryResult: StorageLayoutResult | null = null;

  const { layout: compilerLayout, sources: fetchedSources } =
    await fetchLayoutAndSourcesCombined(chainId, address, signal);

  // 1. Try compiler layout from Sourcify
  if (compilerLayout) {
    primaryResult = { layout: compilerLayout, confidence: 'compiler' };
    if (!hasFallbacks) return primaryResult;
  }

  // 2. Reconstruct from source code (provided bundle or fetched from Sourcify)
  const sources = sourceBundle ?? fetchedSources;
  if (sources) {
    // 2a. Try target contract first
    if (sources.contractName) {
      try {
        const result = reconstructStorageLayout({
          files: sources.files,
          contractName: sources.contractName,
          compilerVersion: sources.compilerVersion,
        });

        if (result.layout.storage.length > 0) {
          // Keep the richer of compiler vs reconstructed as primary
          const candidate: StorageLayoutResult = { layout: result.layout, confidence: 'reconstructed' };
          if (!primaryResult || scoreLayout(candidate.layout) > scoreLayout(primaryResult.layout)) {
            primaryResult = candidate;
          }
          if (!hasFallbacks) return primaryResult;
        }
      } catch {
        // Target reconstruction failed
      }
    }

    // 2b. Candidate reconstruction: try all contracts, pick best scoring one
    try {
      const best = reconstructBestStorageLayout(sources.files, observedSlots);
      if (best && best.layout.storage.length > 0) {
        const candidate: StorageLayoutResult = { layout: best.layout, confidence: 'reconstructed' };
        if (!primaryResult || scoreLayout(candidate.layout) > scoreLayout(primaryResult.layout)) {
          primaryResult = candidate;
        }
        if (!hasFallbacks) return primaryResult;
      }
    } catch {
      // Candidate reconstruction failed
    }
  }

  // If no fallbacks, return whatever primary result we have (may be null)
  if (!hasFallbacks) return primaryResult;

  // 3. Diamond facet fallback: fetch layouts from facets with early exit.
  //    Different facets may reference different versions of AppStorage, so
  //    we pick the facet with the richest type definitions (most struct members).
  //    Early-exit once a layout with >= EARLY_EXIT_THRESHOLD members is found.
  const allLayouts: StorageLayoutResult[] = [];
  // Seed with primary layout if available (diamond proxy may have minimal DiamondStorage)
  if (primaryResult) {
    allLayouts.push(primaryResult);
  }

  // Increased concurrency from 5 to 8 for faster diamond facet resolution
  const CONCURRENCY = 8;
  const EARLY_EXIT_THRESHOLD = 100;

  // Pre-warm cache: fire off all facet fetches in parallel into the shared
  // cache so that the batched processing below gets instant cache hits.
  // This avoids serializing batches of 8 and instead launches all at once.
  await prewarmSourcifyCache(chainId, fallbackAddresses!, signal, CONCURRENCY);

  for (let i = 0; i < fallbackAddresses!.length; i += CONCURRENCY) {
    const batch = fallbackAddresses!.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (facetAddr) => {
        // Optimization: single request fetches both storageLayout AND sources
        const { layout: cl, sources: facetSources } =
          await fetchLayoutAndSourcesCombined(chainId, facetAddr, signal);

        // Also try source reconstruction -- facet compiler layouts often contain
        // only the facet's own state, not the shared AppStorage struct.
        // Reconstruction parses all source files and finds the largest struct.
        let reconstructed: StorageLayoutResult | null = null;
        if (facetSources) {
          const best = reconstructBestStorageLayout(facetSources.files, observedSlots);
          if (best && best.layout.storage.length > 0) {
            reconstructed = { layout: best.layout, confidence: 'reconstructed' as LayoutConfidence };
          }
        }

        // Prefer whichever has richer type definitions (higher weighted score).
        if (cl && reconstructed) {
          const clScore = scoreLayout(cl);
          const recScore = scoreLayout(reconstructed.layout);
          return clScore >= recScore
            ? { layout: cl, confidence: 'compiler' as LayoutConfidence }
            : reconstructed;
        }
        if (cl) return { layout: cl, confidence: 'compiler' as LayoutConfidence };
        return reconstructed;
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        allLayouts.push(r.value);
      }
    }

    // Early exit: if we already have a comprehensive layout, stop fetching more facets
    if (allLayouts.length > 0) {
      const currentBest = pickRichestLayout(allLayouts);
      const layoutScore = scoreLayout(currentBest.layout);
      if (layoutScore >= EARLY_EXIT_THRESHOLD) {
        return currentBest;
      }
    }
  }

  if (allLayouts.length === 1) return allLayouts[0];
  if (allLayouts.length > 1) {
    const richest = pickRichestLayout(allLayouts);
    return richest;
  }

  // No facet layouts found either; return primary if we have one
  return primaryResult;
}
