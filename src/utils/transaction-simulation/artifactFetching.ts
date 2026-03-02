import axios from 'axios';
import type {
  SourcifySourceEntry,
  SourcifyArtifact,
  SourcifyMetadataResult,
  ArtifactCacheEntry,
  BlockscoutContractResponse,
} from './types';
import { fetchSourcifyV2Cached } from '../cache/sourcifyCache';

export const ARTIFACT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const ARTIFACT_CACHE_STORAGE_PREFIX = 'web3toolkit:sim:artifact:v1:';
export const ARTIFACT_CACHE_MAX_BYTES = 1_500_000;
export const SOURCIFY_SOURCE_CONCURRENCY = 6;

export const BLOCKSCOUT_INSTANCES: Record<number, string> = {
  1: 'https://eth.blockscout.com',
  8453: 'https://base.blockscout.com',
  10: 'https://optimism.blockscout.com',
  42161: 'https://arbitrum.blockscout.com',
  137: 'https://polygon.blockscout.com',
  100: 'https://gnosis.blockscout.com',
  56: 'https://bsc.blockscout.com',
};

export const artifactCache = new Map<string, ArtifactCacheEntry>();
export const artifactFetchInflight = new Map<string, Promise<SourcifyMetadataResult>>();
export const sourcifySourceCache = new Map<string, Promise<string | null>>();
const SOURCIFY_SOURCE_CACHE_MAX_SIZE = 100;

export const buildArtifactCacheKey = (source: string, address: string, chainId: number) =>
  `${source}:${chainId}:${address.toLowerCase()}`;

export const getArtifactCacheEntry = (key: string): SourcifyMetadataResult | null => {
  const cached = artifactCache.get(key);
  const now = Date.now();
  if (cached && now - cached.cachedAt < ARTIFACT_CACHE_TTL_MS) {
    return cached.result;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(`${ARTIFACT_CACHE_STORAGE_PREFIX}${key}`);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as ArtifactCacheEntry;
    if (!parsed || typeof parsed.cachedAt !== 'number' || !parsed.result) {
      window.localStorage.removeItem(`${ARTIFACT_CACHE_STORAGE_PREFIX}${key}`);
      return null;
    }
    if (now - parsed.cachedAt >= ARTIFACT_CACHE_TTL_MS) {
      window.localStorage.removeItem(`${ARTIFACT_CACHE_STORAGE_PREFIX}${key}`);
      return null;
    }
    artifactCache.set(key, parsed);
    return parsed.result;
  } catch {
    return null;
  }
};

export const setArtifactCacheEntry = (key: string, result: SourcifyMetadataResult) => {
  const entry: ArtifactCacheEntry = { cachedAt: Date.now(), result };
  artifactCache.set(key, entry);

  if (typeof window === 'undefined') return;

  try {
    const serialized = JSON.stringify(entry);
    if (serialized.length > ARTIFACT_CACHE_MAX_BYTES) return;
    window.localStorage.setItem(`${ARTIFACT_CACHE_STORAGE_PREFIX}${key}`, serialized);
  } catch {
    // Ignore storage failures, memory cache is enough.
  }
};

export const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let index = 0;
  const workerCount = Math.min(limit, items.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
};

export const fetchSourcifyMetadataJson = async (
  address: string,
  chainId: number
): Promise<{ meta: Record<string, unknown>; matchType: string } | null> => {
  const lower = address.toLowerCase();
  const bases = [
    `https://repo.sourcify.dev/contracts/full_match/${chainId}/${lower}/metadata.json`,
    `https://repo.sourcify.dev/contracts/partial_match/${chainId}/${lower}/metadata.json`,
  ];

  for (const url of bases) {
    try {
      const response = await axios.get(url, { timeout: 5000 });
      if (response.data && typeof response.data === 'object') {
        const matchType = url.includes('full_match') ? 'full_match' : 'partial_match';
        return { meta: response.data, matchType };
      }
    } catch {
      // Try next URL
    }
  }
  return null;
};

export const fetchSourcifySourceContent = async (url: string): Promise<string | null> => {
  const cached = sourcifySourceCache.get(url);
  if (cached) {
    return cached;
  }

  const promise = axios
    .get(url, { timeout: 5000, responseType: 'text' })
    .then((response) => response.data as string)
    .catch(() => null);

  sourcifySourceCache.set(url, promise);

  // LRU eviction: if cache exceeds max size, delete oldest entries
  if (sourcifySourceCache.size > SOURCIFY_SOURCE_CACHE_MAX_SIZE) {
    const keysIter = sourcifySourceCache.keys();
    while (sourcifySourceCache.size > SOURCIFY_SOURCE_CACHE_MAX_SIZE) {
      const oldest = keysIter.next();
      if (oldest.done) break;
      sourcifySourceCache.delete(oldest.value);
    }
  }

  return promise;
};

export const fetchFirstAvailableSource = async (urls: string[]): Promise<string | null> => {
  if (urls.length === 0) return null;
  if (urls.length === 1) return fetchSourcifySourceContent(urls[0]);

  const candidates = urls.map(async (url) => {
    const content = await fetchSourcifySourceContent(url);
    if (content === null) {
      throw new Error('missing');
    }
    return content;
  });

  try {
    return await Promise.any(candidates);
  } catch {
    return null;
  }
};

export const buildArtifactsFromSourcify = async (
  address: string,
  chainId: number
): Promise<SourcifyMetadataResult> => {
  const cacheKey = buildArtifactCacheKey('sourcify', address, chainId);
  const cached = getArtifactCacheEntry(cacheKey);
  if (cached) {
    return cached;
  }

  const inflight = artifactFetchInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const fetchPromise = (async () => {
    // ----- V2 API Fast Path (shared cache) -----
    // Try the V2 API first — it returns sources inline in a single request,
    // which is much faster than the repo API path (metadata.json + N source files).
    // If the shared cache already has this contract (from resolver or fetchStorageLayout),
    // this is an instant cache hit with zero network requests.
    try {
      const v2Data = await fetchSourcifyV2Cached(chainId, address, ['abi', 'metadata', 'sources']);
      if (v2Data) {
        const v2Sources = v2Data.sources as Record<string, unknown> | undefined;
        const v2Metadata = v2Data.metadata as Record<string, unknown> | undefined;
        const v2Abi = v2Data.abi;

        if (v2Sources && typeof v2Sources === 'object' && Object.keys(v2Sources).length > 0) {
          const sourceEntries: SourcifySourceEntry[] = [];
          for (const [path, content] of Object.entries(v2Sources)) {
            if (typeof content === 'string') {
              sourceEntries.push({ path, content });
            } else if (content && typeof (content as Record<string, unknown>).content === 'string') {
              sourceEntries.push({ path, content: (content as Record<string, string>).content });
            }
          }

          if (sourceEntries.length > 0) {
            const metaSettings = (v2Metadata as any)?.settings || {};
            const targetEntry = metaSettings.compilationTarget || {};
            const firstKey = Object.keys(targetEntry)[0];
            const contractName = firstKey ? targetEntry[firstKey] : 'Contract';

            const settings: SourcifyArtifact['settings'] = {
              optimizer: metaSettings.optimizer,
              evmVersion: metaSettings.evmVersion,
              compilationTarget: metaSettings.compilationTarget,
              libraries: metaSettings.libraries,
              outputSelection: metaSettings.outputSelection,
            };

            const artifact: SourcifyArtifact = {
              contractName,
              compilerVersion: (v2Metadata as any)?.compiler?.version || null,
              sources: sourceEntries,
              abi: Array.isArray(v2Abi) ? JSON.stringify(v2Abi) : ((v2Metadata as any)?.output?.abi ? JSON.stringify((v2Metadata as any).output.abi) : null),
              sourceProvider: 'sourcify',
              address: address.toLowerCase(),
              settings,
            };
            const result: SourcifyMetadataResult = {
              artifacts: [artifact],
              metadata: v2Metadata || null,
            };
            setArtifactCacheEntry(cacheKey, result);
            return result;
          }
        }
      }
    } catch {
      // V2 fast path failed — fall through to repo API
    }

    // ----- Repo API Fallback -----
    const metaRes = await fetchSourcifyMetadataJson(address, chainId);
    if (!metaRes) {
      const emptyResult = { artifacts: null, metadata: null };
      setArtifactCacheEntry(cacheKey, emptyResult);
      return emptyResult;
    }

    const { meta, matchType } = metaRes;
    const sources = (meta as any).sources || {};
    const sourceEntries: SourcifySourceEntry[] = [];

    const sourceTasks = Object.entries(sources).map(([path, info]) => {
      const base = `https://repo.sourcify.dev/contracts/${matchType}/${chainId}/${address.toLowerCase()}/sources/`;
      const tryUrls: string[] = [];
      tryUrls.push(base + encodeURIComponent(path));
      const infoObj = info as { urls?: string[] } | undefined;
      if (infoObj?.urls && Array.isArray(infoObj.urls)) {
        tryUrls.push(...infoObj.urls.filter((u: string) => u.startsWith('http')));
      }
      return { path, tryUrls };
    });

    const results = await mapWithConcurrency(
      sourceTasks,
      SOURCIFY_SOURCE_CONCURRENCY,
      async (task) => {
        const content = await fetchFirstAvailableSource(task.tryUrls);
        return content ? { path: task.path, content } : null;
      }
    );

    for (const result of results) {
      if (result) {
        sourceEntries.push(result);
      }
    }

    if (sourceEntries.length === 0) {
      const emptyArtifacts = { artifacts: null, metadata: meta };
      setArtifactCacheEntry(cacheKey, emptyArtifacts);
      return emptyArtifacts;
    }

    const metaSettings = (meta as any).settings || {};
    const targetEntry = metaSettings.compilationTarget || {};
    const firstKey = Object.keys(targetEntry)[0];
    const contractName = firstKey ? targetEntry[firstKey] : 'Contract';

    const settings: SourcifyArtifact['settings'] = {
      optimizer: metaSettings.optimizer,
      evmVersion: metaSettings.evmVersion,
      compilationTarget: metaSettings.compilationTarget,
      libraries: metaSettings.libraries,
      outputSelection: metaSettings.outputSelection,
    };

    const artifact: SourcifyArtifact = {
      contractName,
      compilerVersion: (meta as any).compiler?.version || null,
      sources: sourceEntries,
      abi: (meta as any).output?.abi ? JSON.stringify((meta as any).output.abi) : null,
      sourceProvider: 'sourcify',
      address: address.toLowerCase(),
      settings,
    };
    const result: SourcifyMetadataResult = {
      artifacts: [artifact],
      metadata: meta as Record<string, unknown>,
    };
    setArtifactCacheEntry(cacheKey, result);
    return result;
  })();

  artifactFetchInflight.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    artifactFetchInflight.delete(cacheKey);
  }
};

export const fetchSingleBlockscoutContract = async (
  address: string,
  blockscoutUrl: string
): Promise<{ artifact: SourcifyArtifact; sources: SourcifySourceEntry[] } | null> => {
  try {
    const url = `${blockscoutUrl}/api/v2/smart-contracts/${address.toLowerCase()}`;
    const response = await axios.get<BlockscoutContractResponse>(url, { timeout: 10000 });
    const data = response.data;

    if (!data.is_verified || !data.source_code) {
      return null;
    }

    const sources: SourcifySourceEntry[] = [];

    if (data.source_code) {
      const mainPath = data.name ? `${data.name}.sol` : 'Contract.sol';
      sources.push({ path: mainPath, content: data.source_code });
    }

    if (data.additional_sources && Array.isArray(data.additional_sources)) {
      for (const src of data.additional_sources) {
        if (src.file_path && src.source_code) {
          sources.push({ path: src.file_path, content: src.source_code });
        }
      }
    }

    const artifact: SourcifyArtifact = {
      contractName: data.name || 'Contract',
      compilerVersion: data.compiler_version || null,
      sources,
      abi: data.abi ? JSON.stringify(data.abi) : null,
      sourceProvider: 'blockscout',
      address: address.toLowerCase(),
      missingSettings: true,
    };

    return { artifact, sources };
  } catch {
    return null;
  }
};

export const fetchBlockscoutMetadata = async (
  address: string,
  chainId: number
): Promise<SourcifyMetadataResult> => {
  const cacheKey = buildArtifactCacheKey('blockscout', address, chainId);
  const cached = getArtifactCacheEntry(cacheKey);
  if (cached) {
    return cached;
  }

  const inflight = artifactFetchInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const fetchPromise = (async () => {
  const blockscoutUrl = BLOCKSCOUT_INSTANCES[chainId];
  if (!blockscoutUrl) {
    const emptyResult = { artifacts: null, metadata: null };
    setArtifactCacheEntry(cacheKey, emptyResult);
    return emptyResult;
  }

  try {
    const url = `${blockscoutUrl}/api/v2/smart-contracts/${address.toLowerCase()}`;
    const response = await axios.get<BlockscoutContractResponse>(url, { timeout: 10000 });
    const data = response.data;

    if (!data.is_verified || !data.source_code) {
      return { artifacts: null, metadata: null };
    }

    const allSources: SourcifySourceEntry[] = [];
    const allArtifacts: SourcifyArtifact[] = [];

    if (data.source_code) {
      const mainPath = data.name ? `${data.name}.sol` : 'Contract.sol';
      allSources.push({ path: mainPath, content: data.source_code });
    }

    if (data.additional_sources && Array.isArray(data.additional_sources)) {
      for (const src of data.additional_sources) {
        if (src.file_path && src.source_code) {
          allSources.push({ path: src.file_path, content: src.source_code });
        }
      }
    }

    const mainArtifact: SourcifyArtifact = {
      contractName: data.name || 'Contract',
      compilerVersion: data.compiler_version || null,
      sources: [...allSources],
      abi: data.abi ? JSON.stringify(data.abi) : null,
      sourceProvider: 'blockscout',
      address: address.toLowerCase(),
      missingSettings: true,
    };
    allArtifacts.push(mainArtifact);

    if (data.proxy_type === 'eip2535' && data.implementations && data.implementations.length > 0) {
      const facetAddresses = data.implementations.map(impl => impl.address_hash);
      const BATCH_SIZE = 5;

      for (let i = 0; i < facetAddresses.length; i += BATCH_SIZE) {
        const batch = facetAddresses.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(facetAddr => fetchSingleBlockscoutContract(facetAddr, blockscoutUrl))
        );

        for (const result of batchResults) {
          if (result) {
            allArtifacts.push(result.artifact);
            const existingPaths = new Set(allSources.map(s => s.path));
            for (const src of result.sources) {
              if (!existingPaths.has(src.path)) {
                allSources.push(src);
                existingPaths.add(src.path);
              }
            }
          }
        }
      }

    }

    const metadata: Record<string, unknown> = {
      compiler: { version: data.compiler_version },
      settings: {
        compilationTarget: { [allSources[0]?.path || 'Contract.sol']: data.name || 'Contract' },
      },
      output: { abi: data.abi },
      sources: Object.fromEntries(allSources.map(s => [s.path, { content: s.content }])),
    };

    return { artifacts: allArtifacts, metadata };
  } catch (error) {
    console.warn('[simulation] Failed to fetch Blockscout metadata:', error);
    const emptyResult = { artifacts: null, metadata: null };
    setArtifactCacheEntry(cacheKey, emptyResult);
    return emptyResult;
  }
  })();

  artifactFetchInflight.set(cacheKey, fetchPromise);
  try {
    const result = await fetchPromise;
    if (result) {
      setArtifactCacheEntry(cacheKey, result);
    }
    return result;
  } finally {
    artifactFetchInflight.delete(cacheKey);
  }
};
