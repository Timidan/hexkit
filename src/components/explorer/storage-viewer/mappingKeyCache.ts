/**
 * Mapping Key Cache — IndexedDB persistence for auto-discovered mapping keys.
 *
 * Cache key: `{chainId}:{contractAddress}:{baseSlot}`
 * Stored: discovered keys array, lastScannedBlock, updatedAt, schema version.
 *
 * Behavior:
 * - On load: hydrate cached keys immediately (sync from memory, async from IDB).
 * - Resume scan from `lastScannedBlock + 1`.
 * - TTL-based expiry + schema version invalidation.
 */

import {
  getDiscoverySourceLabel,
  sortDiscoverySources,
  type DiscoveredKey,
  type DiscoveredKeySource,
} from './mappingKeyDiscovery';

// ─── Constants ───────────────────────────────────────────────────────

const DB_NAME = 'web3-toolkit-mapping-keys';
const DB_VERSION = 1;
const STORE_NAME = 'discoveredKeys';
/** Schema version for invalidating stale cache entries */
const SCHEMA_VERSION = 3;
/** Default TTL: 7 days (mapping keys don't expire quickly) */
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Types ───────────────────────────────────────────────────────────

export interface CachedMappingKeys {
  /** IDB key: `{chainId}:{contractAddress}:{baseSlot}` */
  key: string;
  chainId: number;
  contractAddress: string;
  baseSlot: string;
  keys: DiscoveredKey[];
  lastScannedBlock: number;
  updatedAt: number;
  schemaVersion: number;
}

export interface CacheHydrateResult {
  /** baseSlot (lowercase hex) -> cached keys */
  keys: Map<string, DiscoveredKey[]>;
  /** Minimum lastScannedBlock across all slots (for resume) */
  resumeFromBlock: number | null;
}

function mergeCachedDiscoveredKey(existing: DiscoveredKey, incoming: DiscoveredKey): DiscoveredKey {
  const sources = sortDiscoverySources([
    ...((existing.sources.length > 0 ? existing.sources : [existing.source]) as DiscoveredKeySource[]),
    ...((incoming.sources.length > 0 ? incoming.sources : [incoming.source]) as DiscoveredKeySource[]),
  ]);
  const primarySource = sources[0] ?? 'manual_lookup';

  return {
    ...existing,
    ...incoming,
    value: incoming.value ?? existing.value,
    source: primarySource,
    sourceLabel: getDiscoverySourceLabel(primarySource),
    sources,
    sourceLabels: sources.map(getDiscoverySourceLabel),
    evidenceCount: sources.length,
  };
}

// ─── Cache Implementation ────────────────────────────────────────────

class MappingKeyCache {
  private db: IDBDatabase | null = null;
  private dbInitPromise: Promise<void> | null = null;

  constructor() {
    this.dbInitPromise = this.initDB();
  }

  // ─── IndexedDB Init ──────────────────────────────────────────────

  private async initDB(): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      return;
    }

    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        resolve();
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('chainContract', ['chainId', 'contractAddress'], { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
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

  // ─── Key Building ────────────────────────────────────────────────

  private buildKey(chainId: number, contractAddress: string, baseSlot: string): string {
    return `${chainId}:${contractAddress.toLowerCase()}:${baseSlot.toLowerCase()}`;
  }

  // ─── Hydrate ─────────────────────────────────────────────────────

  /**
   * Hydrate all cached keys for a contract. Returns immediately-usable
   * key map and the block to resume scanning from.
   */
  async hydrate(
    chainId: number,
    contractAddress: string,
    ttlMs: number = DEFAULT_TTL_MS,
  ): Promise<CacheHydrateResult> {
    const empty: CacheHydrateResult = { keys: new Map(), resumeFromBlock: null };

    const db = await this.ensureDB();
    if (!db) return empty;

    try {
      const entries = await this.readAllForContract(db, chainId, contractAddress);
      const now = Date.now();
      let minBlock: number | null = null;
      const keys = new Map<string, DiscoveredKey[]>();

      for (const entry of entries) {
        // Schema version invalidation
        if (entry.schemaVersion !== SCHEMA_VERSION) continue;
        // TTL invalidation
        if (now - entry.updatedAt > ttlMs) continue;

        keys.set(entry.baseSlot.toLowerCase(), entry.keys);

        if (minBlock === null || entry.lastScannedBlock < minBlock) {
          minBlock = entry.lastScannedBlock;
        }
      }

      return {
        keys,
        resumeFromBlock: minBlock !== null ? minBlock + 1 : null,
      };
    } catch {
      return empty;
    }
  }

  // ─── Persist ─────────────────────────────────────────────────────

  /**
   * Persist discovered keys for one or more base slots.
   */
  async persist(
    chainId: number,
    contractAddress: string,
    discoveredKeys: Map<string, DiscoveredKey[]>,
    lastScannedBlock: number,
  ): Promise<void> {
    const db = await this.ensureDB();
    if (!db) return;

    const now = Date.now();

    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      for (const [baseSlot, keys] of discoveredKeys) {
        const cacheKey = this.buildKey(chainId, contractAddress, baseSlot);

        // Read existing to merge (append new keys without duplicates)
        const existingReq = store.get(cacheKey);
        await new Promise<void>((resolve, reject) => {
          existingReq.onsuccess = () => {
            const existing: CachedMappingKeys | undefined = existingReq.result;
            let mergedKeys = keys;

            if (existing && existing.schemaVersion === SCHEMA_VERSION) {
              const mergedById = new Map(
                existing.keys.map((k) => [`${k.key}:${k.derivedSlot.toLowerCase()}`, k]),
              );
              for (const key of keys) {
                const dedupeKey = `${key.key}:${key.derivedSlot.toLowerCase()}`;
                const prior = mergedById.get(dedupeKey);
                mergedById.set(dedupeKey, prior ? mergeCachedDiscoveredKey(prior, key) : key);
              }
              mergedKeys = Array.from(mergedById.values());
            }

            const entry: CachedMappingKeys = {
              key: cacheKey,
              chainId,
              contractAddress: contractAddress.toLowerCase(),
              baseSlot: baseSlot.toLowerCase(),
              keys: mergedKeys,
              lastScannedBlock: existing
                ? Math.max(existing.lastScannedBlock, lastScannedBlock)
                : lastScannedBlock,
              updatedAt: now,
              schemaVersion: SCHEMA_VERSION,
            };

            const putReq = store.put(entry);
            putReq.onsuccess = () => resolve();
            putReq.onerror = () => reject(putReq.error);
          };
          existingReq.onerror = () => reject(existingReq.error);
        });
      }

      // Wait for transaction to complete
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Persist error
    }
  }

  // ─── Invalidate ──────────────────────────────────────────────────

  /**
   * Delete all cached keys for a specific contract.
   */
  async invalidate(chainId: number, contractAddress: string): Promise<void> {
    const db = await this.ensureDB();
    if (!db) return;

    try {
      const entries = await this.readAllForContract(db, chainId, contractAddress);
      if (entries.length === 0) return;

      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      for (const entry of entries) {
        store.delete(entry.key);
      }

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Invalidate error
    }
  }

  // ─── Cleanup Expired ─────────────────────────────────────────────

  /**
   * Remove all entries older than TTL.
   */
  async cleanupExpired(ttlMs: number = DEFAULT_TTL_MS): Promise<number> {
    const db = await this.ensureDB();
    if (!db) return 0;

    const cutoff = Date.now() - ttlMs;
    let deleted = 0;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('updatedAt');
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

  // ─── IDB Helpers ──────────────────────────────────────────────────

  private readAllForContract(
    db: IDBDatabase,
    chainId: number,
    contractAddress: string,
  ): Promise<CachedMappingKeys[]> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('chainContract');
      const request = index.getAll([chainId, contractAddress.toLowerCase()]);

      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error);
    });
  }
}

// ─── Singleton Export ────────────────────────────────────────────────

export const mappingKeyCache = new MappingKeyCache();

// Run cleanup on init (async, fire and forget)
if (typeof window !== 'undefined') {
  setTimeout(() => {
    mappingKeyCache.cleanupExpired().then(() => {});
  }, 8000);
}
