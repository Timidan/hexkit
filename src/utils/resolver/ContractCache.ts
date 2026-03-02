/**
 * Contract Cache
 *
 * Two-layer caching system:
 * - L1: LRU Memory Cache (fast, limited size)
 * - L2: IndexedDB (persistent, larger capacity)
 *
 * Contracts are immutable after deployment, so we can cache aggressively.
 * We use a 24-hour TTL to catch metadata updates (e.g., newly verified contracts).
 */

import type { ResolveResult, CachedContract, CacheStats } from './types';

class LRUCache<K, V> {
  private cache: Map<K, V>;
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // Remove existing entry to update order
    this.cache.delete(key);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  keys(): IterableIterator<K> {
    return this.cache.keys();
  }
}

const DB_NAME = 'web3-toolkit-contracts';
const DB_VERSION = 1;
const STORE_NAME = 'contracts';
const MEMORY_CACHE_SIZE = 200;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class ContractCache {
  private memoryCache: LRUCache<string, ResolveResult>;
  private db: IDBDatabase | null = null;
  private dbInitPromise: Promise<void> | null = null;
  private stats = {
    hits: 0,
    misses: 0,
  };

  constructor() {
    this.memoryCache = new LRUCache(MEMORY_CACHE_SIZE);
    this.dbInitPromise = this.initDB();
  }

  private async initDB(): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      console.warn('[ContractCache] IndexedDB not available');
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.warn('[ContractCache] Failed to open IndexedDB:', request.error);
        resolve(); // Don't reject - cache will work with memory only
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('chainId', 'chainId', { unique: false });
          store.createIndex('cachedAt', 'cachedAt', { unique: false });
          store.createIndex('lastAccessed', 'lastAccessed', { unique: false });
        }
      };
    });
  }

  private async ensureDB(): Promise<IDBDatabase | null> {
    if (this.dbInitPromise) {
      await this.dbInitPromise;
    }
    return this.db;
  }

  private buildKey(address: string, chainId: number): string {
    return `${chainId}:${address.toLowerCase()}`;
  }

  async get(
    address: string,
    chainId: number,
    options: { maxAgeMs?: number } = {}
  ): Promise<ResolveResult | null> {
    const key = this.buildKey(address, chainId);
    const maxAge = options.maxAgeMs ?? DEFAULT_TTL_MS;

    const memCached = this.memoryCache.get(key);
    if (memCached) {
      if (this.isExpired(memCached.resolvedAt, maxAge)) {
        this.memoryCache.delete(key);
      } else {
        this.stats.hits++;
        return memCached;
      }
    }

    const db = await this.ensureDB();
    if (!db) {
      this.stats.misses++;
      return null;
    }

    try {
      const cached = await this.readFromDB(db, key);

      if (!cached) {
        this.stats.misses++;
        return null;
      }

      if (this.isExpired(cached.cachedAt, maxAge)) {
        await this.deleteFromDB(db, key);
        this.stats.misses++;
        return null;
      }

      this.updateAccessStats(db, key, cached);
      this.memoryCache.set(key, cached.data);

      this.stats.hits++;
      return cached.data;
    } catch {
      this.stats.misses++;
      return null;
    }
  }

  async set(address: string, chainId: number, data: ResolveResult): Promise<void> {
    const key = this.buildKey(address, chainId);

    this.memoryCache.set(key, data);

    const db = await this.ensureDB();
    if (!db) return;

    const entry: CachedContract = {
      key,
      address: address.toLowerCase(),
      chainId,
      data,
      cachedAt: Date.now(),
      accessCount: 1,
      lastAccessed: Date.now(),
    };

    try {
      await this.writeToDB(db, entry);
    } catch {
      // IndexedDB write failed, data remains in memory cache only
    }
  }

  async delete(address: string, chainId: number): Promise<void> {
    const key = this.buildKey(address, chainId);

    this.memoryCache.delete(key);

    const db = await this.ensureDB();
    if (db) {
      await this.deleteFromDB(db, key);
    }
  }

  async clearAll(): Promise<void> {
    this.memoryCache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;

    const db = await this.ensureDB();
    if (!db) return;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async cleanupExpired(maxAgeMs: number = DEFAULT_TTL_MS): Promise<number> {
    const db = await this.ensureDB();
    if (!db) return 0;

    const cutoff = Date.now() - maxAgeMs;
    let deleted = 0;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('cachedAt');
      const range = IDBKeyRange.upperBound(cutoff);

      const request = index.openCursor(range);

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          deleted++;
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(deleted);
      tx.onerror = () => reject(tx.error);
    });
  }

  async getStats(): Promise<CacheStats> {
    const db = await this.ensureDB();
    let persistedSize = 0;

    if (db) {
      persistedSize = await this.countEntries(db);
    }

    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    return {
      memorySize: this.memoryCache.size,
      persistedSize,
      hitRate,
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
    };
  }

  private isExpired(timestamp: number, maxAge: number): boolean {
    return Date.now() - timestamp > maxAge;
  }

  private readFromDB(db: IDBDatabase, key: string): Promise<CachedContract | null> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  private writeToDB(db: IDBDatabase, entry: CachedContract): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(entry);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private deleteFromDB(db: IDBDatabase, key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private updateAccessStats(
    db: IDBDatabase,
    key: string,
    cached: CachedContract
  ): void {
    // Fire and forget - don't block on this
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    store.put({
      ...cached,
      accessCount: cached.accessCount + 1,
      lastAccessed: Date.now(),
    });
  }

  private countEntries(db: IDBDatabase): Promise<number> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

export const contractCache = new ContractCache();

// Run cleanup on init (async, fire and forget)
if (typeof window !== 'undefined') {
  setTimeout(() => {
    contractCache.cleanupExpired().catch(() => {
      // Cleanup failed silently
    });
  }, 5000);
}
