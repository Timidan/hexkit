/**
 * SimulationHistoryService - IndexedDB-based storage for simulation history
 * Provides persistent local storage for simulation results with query capabilities
 *
 * SECURITY NOTE: This service MUST NOT store credentials like RPC URLs.
 * All stored data is sanitized before saving to remove any sensitive fields.
 */

import type { DecodedTraceRow } from '../utils/traceDecoder';

/**
 * Fields that should NEVER be stored (credentials/secrets)
 * These are stripped from contractContext and result before storage
 */
const SENSITIVE_FIELDS = [
  'rpcUrl',
  'rpc_url',
  'rpcURL',
  'apiKey',
  'api_key',
  'apikey',
  'privateKey',
  'private_key',
  'secret',
  'password',
  'token',
  'authToken',
  'accessToken',
];

/**
 * Normalize object keys for credential matching while avoiding path collisions.
 * Example: "authToken" -> "auth_token", "rpc-url" -> "rpc_url".
 */
function normalizeSensitiveKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

const SENSITIVE_KEY_SET = new Set(
  SENSITIVE_FIELDS.map((field) => normalizeSensitiveKey(field))
);

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeSensitiveKey(key);
  return SENSITIVE_KEY_SET.has(normalized);
}

/**
 * Large fields that should NOT be stored to prevent memory bloat
 * These are stripped from rawTrace before storage
 * NOTE: snapshots are intentionally preserved for trace fidelity across reloads.
 */
const HEAVY_TRACE_FIELDS = [
  '__rawText',      // Raw JSON text stored for gas extraction
];

/**
 * Recursively remove sensitive fields from an object
 */
function sanitizeObject<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item)) as T;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    // Prototype pollution guard
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    // Skip sensitive fields
    if (isSensitiveKey(key)) {
      continue;
    }
    // Recursively sanitize nested objects
    sanitized[key] = sanitizeObject(value);
  }
  return sanitized as T;
}

/**
 * Strip only non-essential raw text while preserving snapshots/opcodes/source maps.
 * This keeps decoded traces deterministic after reload.
 */
function stripHeavyTraceData(result: any): any {
  if (!result || typeof result !== 'object') return result;

  const stripped = { ...result };

  // Strip heavy fields from rawTrace
  if (stripped.rawTrace && typeof stripped.rawTrace === 'object') {
    const rawTrace = { ...stripped.rawTrace };

    // Remove heavy fields
    for (const field of HEAVY_TRACE_FIELDS) {
      if (field in rawTrace) {
        delete rawTrace[field];
      }
    }

    stripped.rawTrace = rawTrace;
  }

  return stripped;
}

export interface StoredSimulation {
  id: string;
  timestamp: number;
  status: 'success' | 'failed' | 'reverted';
  // Transaction details
  from: string;
  to: string;
  functionName: string | null;
  functionSelector: string | null;
  // Network info
  networkId: number;
  networkName: string;
  blockNumber: number | null;
  // Gas info
  gasUsed: string | null;
  gasLimit: string | null;
  // Contract info
  contractName: string | null;
  contractAddress: string;
  // Error info (if failed/reverted)
  error: string | null;
  revertReason: string | null;
  // Full data for restoration
  result: any; // Full EDB response
  contractContext: any; // For re-simulation
  // Decoded trace rows (pre-computed, stored separately from rawTrace snapshots)
  decodedTraceRows?: DecodedTraceRow[];
  // Metadata
  calldata: string | null;
  value: string | null;
  // Simulation origin: how this simulation was created
  origin?: 'manual' | 'tx-hash-replay';
  // For tx-hash replays: the original transaction hash
  transactionHash?: string;
}

/** Lightweight metadata stored in its own IndexedDB store for fast list queries */
export type SimulationMeta = Omit<StoredSimulation, 'result' | 'contractContext' | 'decodedTraceRows'>;

export interface SimulationHistoryFilter {
  status?: 'success' | 'failed' | 'reverted';
  networkId?: number;
  contractAddress?: string;
  from?: string;
  to?: string;
  functionName?: string;
  fromTimestamp?: number;
  toTimestamp?: number;
}

interface TraceRowQuality {
  rowCount: number;
  jumpCount: number;
  internalCount: number;
  internalParentCount: number;
  sourceMappedCount: number;
}

function summarizeTraceRows(rows: DecodedTraceRow[] | undefined): TraceRowQuality {
  const safeRows = Array.isArray(rows) ? rows : [];
  return {
    rowCount: safeRows.length,
    jumpCount: safeRows.filter((row: any) => row?.destFn || row?.jumpMarker).length,
    internalCount: safeRows.filter((row: any) => row?.isInternalCall).length,
    internalParentCount: safeRows.filter((row: any) => row?.internalParentId !== undefined && row?.internalParentId !== null).length,
    sourceMappedCount: safeRows.filter((row: any) => !!row?.sourceFile).length,
  };
}

function shouldKeepExistingTraceRows(
  existingRows: DecodedTraceRow[] | undefined,
  incomingRows: DecodedTraceRow[] | undefined
): boolean {
  const existing = summarizeTraceRows(existingRows);
  const incoming = summarizeTraceRows(incomingRows);

  if (existing.rowCount === 0) return false;
  if (incoming.rowCount === 0) return true;

  const incomingClearlyBetter =
    incoming.rowCount > existing.rowCount ||
    incoming.jumpCount > existing.jumpCount ||
    incoming.internalCount > existing.internalCount ||
    incoming.internalParentCount > existing.internalParentCount ||
    incoming.sourceMappedCount > existing.sourceMappedCount;

  if (incomingClearlyBetter) return false;

  const incomingIsDowngrade =
    incoming.rowCount < existing.rowCount &&
    incoming.jumpCount <= existing.jumpCount &&
    incoming.internalCount <= existing.internalCount &&
    incoming.internalParentCount <= existing.internalParentCount &&
    incoming.sourceMappedCount <= existing.sourceMappedCount;

  return incomingIsDowngrade;
}

const DB_NAME = 'web3-toolkit-simulations';
const DB_VERSION = 2;
const STORE_NAME = 'simulations';
const META_STORE_NAME = 'simulations-meta';
const MAX_SIMULATIONS = 100; // Keep last 100 simulations

class SimulationHistoryService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private metaCache: Map<string, SimulationMeta> | null = null;

  /**
   * Initialize the IndexedDB database
   */
  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[SimulationHistory] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        // Handle version change from another tab
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
          this.initPromise = null;
          this.metaCache = null;
        };
        console.log('[SimulationHistory] IndexedDB database opened successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;

        // V1: Create simulations store
        if (oldVersion < 1) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('networkId', 'networkId', { unique: false });
          store.createIndex('contractAddress', 'contractAddress', { unique: false });
          store.createIndex('from', 'from', { unique: false });
          store.createIndex('to', 'to', { unique: false });
          store.createIndex('functionName', 'functionName', { unique: false });
        }

        // V2: Create simulations-meta store for fast lightweight queries
        if (oldVersion < 2) {
          const metaStore = db.createObjectStore(META_STORE_NAME, { keyPath: 'id' });
          metaStore.createIndex('timestamp', 'timestamp', { unique: false });
          metaStore.createIndex('status', 'status', { unique: false });
          metaStore.createIndex('networkId', 'networkId', { unique: false });
          metaStore.createIndex('contractAddress', 'contractAddress', { unique: false });
          metaStore.createIndex('from', 'from', { unique: false });
          metaStore.createIndex('to', 'to', { unique: false });
          metaStore.createIndex('functionName', 'functionName', { unique: false });
        }
      };
    }).then(() => this.migrateMetaStore());

    return this.initPromise;
  }

  /**
   * One-time migration: populate simulations-meta from existing simulations.
   * Uses put() which is idempotent, so safe to re-run if interrupted.
   */
  private async migrateMetaStore(): Promise<void> {
    if (!this.db) return;

    const metaCount = await this.getStoreCount(META_STORE_NAME);
    const simCount = await this.getStoreCount(STORE_NAME);

    // Already in sync (or no data to migrate)
    if (simCount === 0 || metaCount >= simCount) return;

    console.log(`[SimulationHistory] Migrating ${simCount} records to meta store...`);
    const start = performance.now();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
      const simStore = tx.objectStore(STORE_NAME);
      const metaStore = tx.objectStore(META_STORE_NAME);
      const cursor = simStore.openCursor();

      cursor.onsuccess = (event) => {
        const c = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (c) {
          const { result: _r, contractContext: _c, decodedTraceRows: _d, ...meta } = c.value;
          metaStore.put(meta);
          c.continue();
        }
      };

      tx.oncomplete = () => {
        console.log(`[SimulationHistory] Meta store migration complete in ${(performance.now() - start).toFixed(0)}ms`);
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Get the count of records in a specific store
   */
  private async getStoreCount(storeName: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([storeName], 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generate a unique ID for a simulation
   */
  private generateId(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const seg = (len: number) => {
      let s = "";
      const arr = crypto.getRandomValues(new Uint8Array(len));
      for (const b of arr) s += chars[b % chars.length];
      return s;
    };
    return `${seg(8)}-${seg(7)}`;
  }

  /**
   * Save a simulation to history
   * @param result - The simulation result
   * @param contractContext - The contract context for re-simulation
   * @param providedId - Optional ID to use (if not provided, one will be generated)
   */
  async saveSimulation(
    result: any,
    contractContext: any,
    providedId?: string
  ): Promise<string> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const id = providedId || this.generateId();
    
    // Determine status
    let status: 'success' | 'failed' | 'reverted' = 'success';
    if (result.error || result.revertReason) {
      status = result.revertReason ? 'reverted' : 'failed';
    } else if (result.success === false) {
      status = 'failed';
    }

    // Tx-hash replays should not persist guessed function names from legacy call-tree labels.
    const isTxHashReplay =
      contractContext?.simulationOrigin === 'tx-hash-replay' ||
      !!contractContext?.replayTxHash ||
      !!result.transactionHash ||
      result.mode === 'onchain';

    // Extract function info - prioritize explicit manual simulation context.
    let functionName: string | null = null;
    let functionSelector: string | null = null;
    if (!isTxHashReplay && contractContext?.selectedFunction) {
      functionName = contractContext.selectedFunction;
    } else if (!isTxHashReplay && result.functionName) {
      functionName = result.functionName;
    }
    const calldata = contractContext?.calldata || result.data;
    if (calldata && calldata.length >= 10) {
      functionSelector = calldata.substring(0, 10);
    }

    // Extract network info - prioritize contractContext, fall back to result
    const networkId = contractContext?.networkId || result.chainId || 1;
    const networkName = contractContext?.networkName || result.networkName || 'Unknown';

    const simulation: StoredSimulation = {
      id,
      timestamp: Date.now(),
      status,
      from: contractContext?.fromAddress || result.from || '0x0000000000000000000000000000000000000000',
      to: contractContext?.address || result.to || '',
      functionName,
      functionSelector,
      networkId,
      networkName,
      blockNumber: result.blockNumber || null,
      gasUsed: result.gasUsed || null,
      gasLimit: result.gasLimitSuggested || result.gasLimit || null,
      contractName: contractContext?.name || null,
      contractAddress: contractContext?.address || result.to || '',
      error: result.error || null,
      revertReason: result.revertReason || null,
      // Strip heavy trace data (snapshots can be 50-100MB+) then sanitize credentials
      result: sanitizeObject(stripHeavyTraceData(result)),
      contractContext: sanitizeObject(contractContext), // Store context (sanitized - no credentials)
      calldata: contractContext?.calldata || null,
      value: contractContext?.ethValue || '0',
      // Simulation origin: explicit if set, otherwise infer from result mode
      origin: contractContext?.simulationOrigin
        || (result.mode === 'onchain' || result.transactionHash ? 'tx-hash-replay' : 'manual'),
      // For tx-hash replays: persist the transaction hash at top level for lightweight access
      transactionHash: contractContext?.replayTxHash || result.transactionHash || undefined,
    };

    // Extract lightweight metadata for the meta store
    const { result: _r, contractContext: _c, decodedTraceRows: _d, ...meta } = simulation;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const metaStore = transaction.objectStore(META_STORE_NAME);

      // Replays can reuse a deterministic ID (e.g. tx hash).
      // Use upsert semantics so fresh simulations replace stale records.
      store.put(simulation);
      metaStore.put(meta);

      transaction.oncomplete = () => {
        console.log(`[SimulationHistory] Successfully saved simulation with ID: ${id}`);
        // Update in-memory cache
        if (this.metaCache) {
          this.metaCache.set(id, meta);
        }
        // Cleanup old simulations
        this.cleanupOldSimulations().catch(console.error);
        resolve(id);
      };

      transaction.onerror = () => {
        console.error('[SimulationHistory] Failed to save simulation:', transaction.error);
        reject(transaction.error);
      };
    });
  }

  /**
   * Get a simulation by ID
   */
  async getSimulation(id: string): Promise<StoredSimulation | null> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Update a simulation's decoded trace rows
   * Called after trace decoding completes to persist the decoded rows
   * @param id - The simulation ID
   * @param decodedTraceRows - The decoded trace rows to store
   */
  async updateSimulationDecodedRows(
    id: string,
    decodedTraceRows: DecodedTraceRow[],
    options?: { maxRetries?: number; delayMs?: number }
  ): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const maxRetries = options?.maxRetries ?? 5;
    let delayMs = options?.delayMs ?? 150;

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const tryUpdate = () =>
      new Promise<boolean>((resolve, reject) => {
        const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const getRequest = store.get(id);

        getRequest.onsuccess = () => {
          const existing = getRequest.result as StoredSimulation | undefined;
          if (!existing) {
            resolve(false);
            return;
          }

          if (shouldKeepExistingTraceRows(existing.decodedTraceRows, decodedTraceRows)) {
            const existingQuality = summarizeTraceRows(existing.decodedTraceRows);
            const incomingQuality = summarizeTraceRows(decodedTraceRows);
            console.log(
              `[SimulationHistory] Skip decoded trace downgrade for ${id}:`,
              { existing: existingQuality, incoming: incomingQuality }
            );
            resolve(true);
            return;
          }

          existing.decodedTraceRows = decodedTraceRows;

          const putRequest = store.put(existing);
          putRequest.onsuccess = () => {
            console.log(
              `[SimulationHistory] Updated simulation ${id} with ${decodedTraceRows.length} decoded trace rows`
            );
            resolve(true);
          };
          putRequest.onerror = () => {
            console.error('[SimulationHistory] Failed to update decoded rows:', putRequest.error);
            reject(putRequest.error);
          };
        };

        getRequest.onerror = () => {
          reject(getRequest.error);
        };
      });

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const updated = await tryUpdate();
      if (updated) return;
      if (attempt < maxRetries) {
        await sleep(delayMs);
        delayMs *= 2;
      }
    }

    console.warn(
      `[SimulationHistory] Cannot update decoded rows - simulation ${id} not found after ${maxRetries + 1} attempts`
    );
  }

  /**
   * Apply filters to a list of simulation metadata
   */
  private filterMeta(sims: SimulationMeta[], filter?: SimulationHistoryFilter): SimulationMeta[] {
    let filtered = sims;
    if (filter) {
      filtered = sims.filter(sim => {
        if (filter.status && sim.status !== filter.status) return false;
        if (filter.networkId && sim.networkId !== filter.networkId) return false;
        if (filter.contractAddress && sim.contractAddress.toLowerCase() !== filter.contractAddress.toLowerCase()) return false;
        if (filter.from && sim.from.toLowerCase() !== filter.from.toLowerCase()) return false;
        if (filter.to && sim.to.toLowerCase() !== filter.to.toLowerCase()) return false;
        if (filter.functionName && sim.functionName !== filter.functionName) return false;
        if (filter.fromTimestamp && sim.timestamp < filter.fromTimestamp) return false;
        if (filter.toTimestamp && sim.timestamp > filter.toTimestamp) return false;
        return true;
      });
    }
    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get all simulations, optionally filtered, sorted by timestamp descending.
   * When lightweight=true, reads from the small simulations-meta store (2-5KB/record)
   * instead of the heavy simulations store (100KB-2MB/record).
   * @param filter - Optional filter criteria
   * @param lightweight - If true, reads from meta store (excludes result/contractContext/decodedTraceRows)
   */
  async getSimulations(filter?: SimulationHistoryFilter, lightweight = false): Promise<StoredSimulation[]> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    // For lightweight queries, use in-memory cache if available
    if (lightweight && this.metaCache) {
      return this.filterMeta(Array.from(this.metaCache.values()), filter) as StoredSimulation[];
    }

    // Read from the appropriate store
    const storeName = lightweight ? META_STORE_NAME : STORE_NAME;

    const simulations = await new Promise<StoredSimulation[]>((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index('timestamp');

      const results: StoredSimulation[] = [];
      const request = index.openCursor(null, 'prev'); // Descending order

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const sim = cursor.value;

          // Apply filters
          let include = true;
          if (filter) {
            if (filter.status && sim.status !== filter.status) include = false;
            if (filter.networkId && sim.networkId !== filter.networkId) include = false;
            if (filter.contractAddress && sim.contractAddress.toLowerCase() !== filter.contractAddress.toLowerCase()) include = false;
            if (filter.from && sim.from.toLowerCase() !== filter.from.toLowerCase()) include = false;
            if (filter.to && sim.to.toLowerCase() !== filter.to.toLowerCase()) include = false;
            if (filter.functionName && sim.functionName !== filter.functionName) include = false;
            if (filter.fromTimestamp && sim.timestamp < filter.fromTimestamp) include = false;
            if (filter.toTimestamp && sim.timestamp > filter.toTimestamp) include = false;
          }

          if (include) {
            results.push(sim);
          }

          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => {
        reject(request.error);
      };
    });

    // Populate the in-memory cache for lightweight reads
    if (lightweight) {
      this.metaCache = new Map(simulations.map(s => [s.id, s as SimulationMeta]));
    }

    return simulations;
  }

  /**
   * Delete a simulation by ID (from both stores atomically)
   */
  async deleteSimulation(id: string): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.objectStore(META_STORE_NAME).delete(id);

      transaction.oncomplete = () => {
        if (this.metaCache) this.metaCache.delete(id);
        resolve();
      };

      transaction.onerror = () => {
        reject(transaction.error);
      };
    });
  }

  /**
   * Delete multiple simulations (from both stores atomically)
   */
  async deleteSimulations(ids: string[]): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');
    if (ids.length === 0) return;

    const transaction = this.db.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const metaStore = transaction.objectStore(META_STORE_NAME);

    return new Promise((resolve, reject) => {
      ids.forEach(id => {
        store.delete(id);
        metaStore.delete(id);
      });

      transaction.oncomplete = () => {
        if (this.metaCache) {
          ids.forEach(id => this.metaCache!.delete(id));
        }
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Clear all simulations (from both stores)
   */
  async clearAll(): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
      transaction.objectStore(STORE_NAME).clear();
      transaction.objectStore(META_STORE_NAME).clear();

      transaction.oncomplete = () => {
        this.metaCache = null;
        resolve();
      };

      transaction.onerror = () => {
        reject(transaction.error);
      };
    });
  }

  /**
   * Get the count of simulations
   */
  async getCount(): Promise<number> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');
    return this.getStoreCount(STORE_NAME);
  }

  /**
   * Get the N oldest simulation IDs using an ascending cursor with early stop.
   */
  private async getOldestIds(count: number): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([META_STORE_NAME], 'readonly');
      const index = tx.objectStore(META_STORE_NAME).index('timestamp');
      const ids: string[] = [];
      const cursor = index.openCursor(null, 'next'); // Ascending = oldest first

      cursor.onsuccess = (event) => {
        const c = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (c && ids.length < count) {
          ids.push(c.value.id);
          c.continue();
        } else {
          resolve(ids);
        }
      };
      cursor.onerror = () => reject(cursor.error);
    });
  }

  /**
   * Cleanup old simulations to stay under MAX_SIMULATIONS
   */
  private async cleanupOldSimulations(): Promise<void> {
    const count = await this.getCount();
    if (count <= MAX_SIMULATIONS) return;

    const toDelete = count - MAX_SIMULATIONS;
    const oldestIds = await this.getOldestIds(toDelete);
    await this.deleteSimulations(oldestIds);
  }

  /**
   * Export simulations to JSON
   */
  async exportToJson(): Promise<string> {
    const simulations = await this.getSimulations();
    return JSON.stringify(simulations, null, 2);
  }

  /**
   * Import simulations from JSON (writes to both stores)
   */
  async importFromJson(json: string): Promise<number> {
    const simulations = JSON.parse(json) as StoredSimulation[];
    await this.init();
    if (!this.db) throw new Error('Database not initialized');
    if (simulations.length === 0) return 0;

    const transaction = this.db.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const metaStore = transaction.objectStore(META_STORE_NAME);

    return new Promise((resolve, reject) => {
      simulations.forEach(sim => {
        // Generate new ID to avoid conflicts
        sim.id = this.generateId();
        store.add(sim);
        const { result: _r, contractContext: _c, decodedTraceRows: _d, ...meta } = sim;
        metaStore.add(meta);
      });

      transaction.oncomplete = () => {
        this.metaCache = null; // Invalidate cache, will be repopulated on next read
        resolve(simulations.length);
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

// Export singleton instance
export const simulationHistoryService = new SimulationHistoryService();
export default simulationHistoryService;
