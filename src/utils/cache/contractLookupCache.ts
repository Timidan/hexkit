import type { ContractInfoResult } from '../../types/contractInfo';

type CacheKey = string;

interface CacheEntry {
  timestamp: number;
  data: ContractInfoResult;
}

const memoryCache = new Map<CacheKey, CacheEntry>();

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch (error) {
    console.warn('contractLookupCache: localStorage unavailable', error);
    return null;
  }
};

const STORAGE_PREFIX = 'web3-toolkit:contract-lookup:';

const buildKey = (address: string, chainId: number) =>
  `${STORAGE_PREFIX}${chainId}:${address.toLowerCase()}`;

const readEntry = (key: CacheKey): CacheEntry | undefined => {
  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }

  const storage = getStorage();
  if (!storage) return undefined;

  const raw = storage.getItem(key);
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as CacheEntry;
    memoryCache.set(key, parsed);
    return parsed;
  } catch (error) {
    console.warn('contractLookupCache: failed to parse entry', { key, error });
    storage.removeItem(key);
    return undefined;
  }
};

const writeEntry = (key: CacheKey, entry: CacheEntry) => {
  memoryCache.set(key, entry);
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.warn('contractLookupCache: failed to persist entry', { key, error });
  }
};

export interface CacheGetOptions {
  maxAgeMs: number;
}

export const contractLookupCache = {
  get(address: string, chainId: number, options: CacheGetOptions): ContractInfoResult | undefined {
    const key = buildKey(address, chainId);
    const entry = readEntry(key);
    if (!entry) return undefined;

    if (Date.now() - entry.timestamp > options.maxAgeMs) {
      memoryCache.delete(key);
      const storage = getStorage();
      storage?.removeItem(key);
      return undefined;
    }

    return entry.data;
  },

  set(address: string, chainId: number, data: ContractInfoResult) {
    const key = buildKey(address, chainId);
    writeEntry(key, {
      timestamp: Date.now(),
      data,
    });
  },

  clear(address: string, chainId: number) {
    const key = buildKey(address, chainId);
    memoryCache.delete(key);
    const storage = getStorage();
    storage?.removeItem(key);
  },

  clearAll() {
    memoryCache.clear();
    const storage = getStorage();
    if (!storage) return;

    Object.keys(storage)
      .filter((key) => key.startsWith(STORAGE_PREFIX))
      .forEach((key) => storage.removeItem(key));
  },
};
