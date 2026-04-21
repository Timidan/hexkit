/**
 * Shared Sourcify API Cache + Request Deduplication
 *
 * Provides a single in-memory TTL cache and request deduplication layer
 * for ALL Sourcify V2 API calls across the application.
 *
 * Consumers:
 * - fetchStorageLayout.ts (storage layout + sources)
 * - resolver/sources/sourcify.ts (ABI + metadata + sources)
 * - transaction-simulation/artifactFetching.ts (metadata + sources)
 *
 * Design:
 * - Cache is keyed by `${chainId}:${address}:${fieldsKey}` where fieldsKey
 *   is the sorted, comma-joined fields list (e.g., "abi,metadata,sources").
 * - Responses with a SUPERSET of requested fields can satisfy cache lookups
 *   for subsets — e.g., a cached "abi,metadata,sources" response satisfies
 *   a request for just "abi".
 * - In-flight request dedup: concurrent requests for the same URL reuse
 *   the same Promise instead of making duplicate HTTP requests.
 * - TTL: 10 minutes (Sourcify data is immutable once verified, so this
 *   is conservative).
 * - Max entries: 500 (LRU eviction when exceeded).
 */

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_ENTRIES = 500;

const SOURCIFY_API_PROXY = '/api/sourcify/server';
const SOURCIFY_API_DIRECT = 'https://sourcify.dev/server';

const isBrowser = typeof window !== 'undefined';
const getApiBase = (): string => (isBrowser ? SOURCIFY_API_PROXY : SOURCIFY_API_DIRECT);

interface CacheEntry {
  data: Record<string, unknown>;
  fields: Set<string>;
  cachedAt: number;
  lastAccessed: number;
}

/** Canonical cache keyed by `${chainId}:${address}` */
const responseCache = new Map<string, CacheEntry>();

/** In-flight request dedup keyed by full URL */
const inflightRequests = new Map<string, Promise<Record<string, unknown> | null>>();

function makeCacheKey(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

function makeUrl(chainId: number, address: string, fields: string[]): string {
  const sorted = [...fields].sort();
  return `${getApiBase()}/v2/contract/${chainId}/${address.toLowerCase()}?fields=${sorted.join(',')}`;
}

/**
 * Evict oldest entries when cache exceeds MAX_CACHE_ENTRIES.
 * Uses lastAccessed timestamp for LRU behavior.
 */
function evictIfNeeded(): void {
  if (responseCache.size <= MAX_CACHE_ENTRIES) return;

  // Sort by lastAccessed ascending and remove oldest 20%
  const entries = [...responseCache.entries()].sort(
    (a, b) => a[1].lastAccessed - b[1].lastAccessed,
  );
  const toRemove = Math.max(1, Math.floor(MAX_CACHE_ENTRIES * 0.2));
  for (let i = 0; i < toRemove && i < entries.length; i++) {
    responseCache.delete(entries[i][0]);
  }
}

/**
 * Check if a cached entry satisfies the requested fields.
 * Returns the cached data if the entry contains ALL requested fields
 * and hasn't expired.
 */
function getCachedResponse(
  chainId: number,
  address: string,
  fields: string[],
): Record<string, unknown> | null {
  const key = makeCacheKey(chainId, address);
  const entry = responseCache.get(key);
  if (!entry) return null;

  // Check TTL
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }

  // Check if cached entry has all requested fields
  const hasAllFields = fields.every((f) => entry.fields.has(f));
  if (!hasAllFields) return null;

  // Update LRU timestamp
  entry.lastAccessed = Date.now();
  return entry.data;
}

/**
 * Store a response in cache, merging with any existing cached fields.
 */
function setCachedResponse(
  chainId: number,
  address: string,
  fields: string[],
  data: Record<string, unknown>,
): void {
  const key = makeCacheKey(chainId, address);
  const existing = responseCache.get(key);

  if (existing && Date.now() - existing.cachedAt <= CACHE_TTL_MS) {
    // Merge: keep existing data, overlay new fields
    const mergedData = { ...existing.data, ...data };
    const mergedFields = new Set([...existing.fields, ...fields]);
    existing.data = mergedData;
    existing.fields = mergedFields;
    existing.lastAccessed = Date.now();
  } else {
    responseCache.set(key, {
      data,
      fields: new Set(fields),
      cachedAt: Date.now(),
      lastAccessed: Date.now(),
    });
    evictIfNeeded();
  }
}

/**
 * Fetch from Sourcify V2 API with caching and request deduplication.
 *
 * @param chainId  Chain ID
 * @param address  Contract address (will be normalized to lowercase)
 * @param fields   Array of V2 API field names (e.g., ['abi', 'metadata', 'sources'])
 * @param signal   Optional AbortSignal for cancellation
 * @returns        Parsed JSON response, or null on failure/404
 */
export async function fetchSourcifyV2Cached(
  chainId: number,
  address: string,
  fields: string[],
  signal?: AbortSignal,
): Promise<Record<string, unknown> | null> {
  // 1. Check cache
  const cached = getCachedResponse(chainId, address, fields);
  if (cached) {
    return cached;
  }

  // 2. Check if aborted
  if (signal?.aborted) return null;

  // 3. Build URL and check for in-flight dedup
  const url = makeUrl(chainId, address, fields);

  const inflight = inflightRequests.get(url);
  if (inflight) {
    // Reuse the in-flight promise. If it resolves, also check that the
    // caller's signal wasn't aborted while waiting.
    try {
      const result = await inflight;
      if (signal?.aborted) return null;
      return result;
    } catch {
      return null;
    }
  }

  // 4. Make the actual HTTP request
  const fetchPromise = (async (): Promise<Record<string, unknown> | null> => {
    try {
      const res = await fetch(url, {
        signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return null;

      const data = await res.json();
      if (!data || typeof data !== 'object') return null;

      // Cache the successful response
      setCachedResponse(chainId, address, fields, data as Record<string, unknown>);
      return data as Record<string, unknown>;
    } catch (err: unknown) {
      // Don't log abort errors
      if (err instanceof Error && err.name === 'AbortError') return null;
      return null;
    }
  })();

  inflightRequests.set(url, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    inflightRequests.delete(url);
  }
}

/**
 * Fetch from Sourcify V2 API with expanded fields.
 * Attempts to fetch a wider set of fields in one request to pre-populate
 * the cache for subsequent narrower requests.
 *
 * This is useful when we know we'll need multiple field combinations
 * for the same contract (e.g., storageLayout + sources + abi).
 */
export async function fetchSourcifyV2Wide(
  chainId: number,
  address: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown> | null> {
  return fetchSourcifyV2Cached(
    chainId,
    address,
    ['abi', 'metadata', 'sources', 'compilation', 'storageLayout'],
    signal,
  );
}

/**
 * Pre-warm the cache for a set of addresses.
 * Fetches all addresses in parallel with the widest field set.
 *
 * @param chainId    Chain ID
 * @param addresses  Array of contract addresses
 * @param signal     Optional AbortSignal
 * @param concurrency Max parallel requests (default 8)
 */
export async function prewarmSourcifyCache(
  chainId: number,
  addresses: string[],
  signal?: AbortSignal,
  concurrency = 8,
): Promise<void> {
  // Filter out addresses that are already cached with wide fields
  const wideFields = ['abi', 'metadata', 'sources', 'compilation', 'storageLayout'];
  const uncached = addresses.filter((addr) => !getCachedResponse(chainId, addr, wideFields));

  if (uncached.length === 0) return;

  // Fetch in parallel with concurrency limit
  const queue = [...uncached];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    let addr: string | undefined;
    while ((addr = queue.shift()) !== undefined) {
      if (signal?.aborted) return;
      await fetchSourcifyV2Wide(chainId, addr, signal);
    }
  });

  await Promise.allSettled(workers);
}

/**
 * Invalidate cache for a specific contract.
 */
export function invalidateSourcifyCache(chainId: number, address: string): void {
  const key = makeCacheKey(chainId, address);
  responseCache.delete(key);
}

/**
 * Clear the entire Sourcify cache.
 */
export function clearSourcifyCache(): void {
  responseCache.clear();
  inflightRequests.clear();
}

/**
 * Get cache statistics for debugging/monitoring.
 */
export function getSourcifyCacheStats(): {
  size: number;
  maxSize: number;
  inflightCount: number;
} {
  return {
    size: responseCache.size,
    maxSize: MAX_CACHE_ENTRIES,
    inflightCount: inflightRequests.size,
  };
}
