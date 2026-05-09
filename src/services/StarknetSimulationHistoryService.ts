/**
 * StarknetSimulationHistoryService — IndexedDB-backed history for Starknet
 * simulations. Mirrors the EVM `SimulationHistoryService` API
 * (saveSimulation / getSimulation / getSimulations / deleteSimulation /
 * clearAll) but stores Cairo-shaped fields (l1Gas, classHash, selector …).
 *
 * Database: `web3-toolkit-starknet-simulations` v1
 * Stores: `simulations` (full row) + `simulations-meta` (lightweight).
 * Cap: 100-entry FIFO via timestamp-ascending cursor.
 *
 * Sanitization: any RPC URL / API-key fields that leak into a stored row
 * are stripped before persistence (defensive — `InvokeFormState` doesn't
 * carry them today).
 */

import type { SimulateResponse } from "@/chains/starknet/simulatorTypes";
import type { StarknetNetwork } from "@/config/networkConfig";
import type { InvokeFormState } from "@/components/starknet/invokeRequestBuilder";
import { starknetDebugVault } from "@/chains/starknet/debug/starknetDebugVault";
import type {
  StarknetSimulationEntry,
  StarknetSimulationSource,
} from "@/contexts/StarknetSimulationContext";

// --- Sanitization ---------------------------------------------------------

const SENSITIVE_FIELDS = [
  "rpcUrl",
  "rpc_url",
  "rpcURL",
  "apiKey",
  "api_key",
  "apikey",
  "privateKey",
  "private_key",
  "secret",
  "password",
  "token",
  "authToken",
  "accessToken",
];

function normalizeSensitiveKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

const SENSITIVE_KEY_SET = new Set(
  SENSITIVE_FIELDS.map((field) => normalizeSensitiveKey(field)),
);

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_SET.has(normalizeSensitiveKey(key));
}

function sanitizeObject<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item)) as T;
  }
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }
    if (isSensitiveKey(key)) continue;
    sanitized[key] = sanitizeObject(value);
  }
  return sanitized as T;
}

function cloneJson<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

async function moveDebugTraceToVault(
  simulationId: string,
  response: SimulateResponse,
): Promise<SimulateResponse> {
  const cloned = cloneJson(response);
  for (const result of cloned.results ?? []) {
    const trace = result.debugTrace;
    if (!trace) continue;
    try {
      const saved = await starknetDebugVault.saveDebugTrace(simulationId, trace);
      if (!saved) continue;
      delete result.debugTrace;
      result.debugTraceHandle = saved.handle;
      result.debugTraceMeta = saved.meta;
    } catch (err) {
      console.warn("[StarknetSimulationHistory] Debug trace vault save failed:", err);
    }
  }
  return cloned;
}

// --- Stored row shape -----------------------------------------------------

export interface StarknetStoredSimulation {
  id: string;
  timestamp: number;
  schemaVersion: number;
  source: StarknetSimulationSource;
  status: "success" | "reverted" | "failed";
  txHash?: string;
  network: StarknetNetwork;
  chainId?: string | null;
  // Cairo function info (extracted at save time so the meta-store list
  // can render them without rehydrating the full response).
  senderAddress?: string;
  contractAddress?: string;
  classHash?: string;
  contractName?: string;
  entrypoint?: string;
  selector?: string;
  blockNumber?: number;
  // Cairo gas metrics (string so big-int felts don't lose precision).
  l1GasConsumed?: string;
  l2GasConsumed?: string;
  l1DataGasConsumed?: string;
  // Heavy artifacts (stored only in the full row store).
  response?: SimulateResponse;
  formSnapshot?: InvokeFormState;
  bridgeGitSha?: string | null;
}

export type StarknetSimulationMeta = Omit<
  StarknetStoredSimulation,
  "response" | "formSnapshot"
>;

export interface StarknetSimulationHistoryFilter {
  source?: StarknetSimulationSource;
  status?: "success" | "reverted" | "failed";
  network?: StarknetNetwork;
  txHash?: string;
  contractAddress?: string;
  classHash?: string;
  contractName?: string;
  entrypoint?: string;
  fromTimestamp?: number;
  toTimestamp?: number;
}

// --- DB constants ---------------------------------------------------------

const DB_NAME = "web3-toolkit-starknet-simulations";
const DB_VERSION = 1;
const STORE_NAME = "simulations";
const META_STORE_NAME = "simulations-meta";
/** Schema versions:
 *   1 — initial: senderAddress only pulled from executeInvocation, entrypoint
 *       polluted with raw selector when no decoded name was available.
 *   2 — senderAddress falls back through txBody/exec/formSnapshot;
 *       entrypoint is decoded-name-only, with selector kept separate. Rows
 *       at v1 are re-extracted from the stored response on next load. */
const ROW_SCHEMA_VERSION = 2;
const MAX_SIMULATIONS = 100;

// --- ID generation --------------------------------------------------------

/** Mirrors the EVM `SimulationHistoryService.generateId` format
 * (`xxxxxxxx-yyyyyyy`, base36) so Starknet sim IDs read as friendly handles
 * in the history table instead of UUID hex prefixes that look like tx
 * hashes. */
export function generateStarknetSimulationId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const seg = (len: number) => {
    let s = "";
    const arr = crypto.getRandomValues(new Uint8Array(len));
    for (const b of arr) s += chars[b % chars.length];
    return s;
  };
  return `${seg(8)}-${seg(7)}`;
}

// --- Field extraction -----------------------------------------------------

function extractCairoFields(entry: StarknetSimulationEntry): {
  senderAddress?: string;
  contractAddress?: string;
  classHash?: string;
  contractName?: string;
  entrypoint?: string;
  selector?: string;
  blockNumber?: number;
  l1GasConsumed?: string;
  l2GasConsumed?: string;
  l1DataGasConsumed?: string;
  status: "success" | "reverted" | "failed";
} {
  const response = entry.response;
  const result = response?.results?.[0];
  if (!result) {
    return { status: "failed" };
  }

  // Cairo statuses: SUCCEEDED / REVERTED / others.
  const status: "success" | "reverted" | "failed" =
    result.status === "SUCCEEDED"
      ? "success"
      : result.status === "REVERTED"
        ? "reverted"
        : "failed";

  // Inner call: the user-intent target inside execute(). For multi-call
  // accounts (the common case) the first inner call carries the
  // contractAddress + entryPointSelector that matter. The outer
  // `executeInvocation.contractAddress` is the dispatching account
  // contract — that's the "from" / sender.
  const exec = result.executeInvocation;
  const inner = exec?.calls?.[0];
  // Sender resolution priority:
  //   1. txBody.sender_address — present on /trace responses, survives
  //      reverted txs where the bridge nulls executeInvocation.
  //   2. executeInvocation.contractAddress — outer execute() frame.
  //   3. formSnapshot.senderAddress — manual sim form input, the only
  //      thing we can rely on when the bridge doesn't return an execute
  //      frame (e.g. validation-stage failures).
  const senderAddress =
    response?.txBody?.sender_address ??
    exec?.contractAddress ??
    entry.formSnapshot?.senderAddress;
  const contractAddress = inner?.contractAddress ?? exec?.contractAddress;
  const selector = inner?.entryPointSelector ?? exec?.entryPointSelector;
  // Decoded entrypoint name only — the raw selector is stored separately
  // in `selector` so the UI can render `entrypoint ?? shortHex(selector)`
  // and keep the column readable instead of showing a 64-char hex blob.
  const entrypoint =
    inner?.decodedFunctionAbi?.name ??
    inner?.decodedSelector ??
    exec?.decodedFunctionAbi?.name ??
    exec?.decodedSelector ??
    undefined;
  const classHash = inner?.classHash ?? exec?.classHash ?? undefined;
  const contractName = undefined;

  const fee = result.feeEstimate;
  const stringify = (v: unknown): string | undefined => {
    if (v === null || v === undefined) return undefined;
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "bigint") return String(v);
    return undefined;
  };

  const blockNumber = response?.blockContext?.blockNumber;

  return {
    senderAddress,
    contractAddress,
    classHash: classHash ?? undefined,
    contractName,
    entrypoint,
    selector,
    blockNumber: typeof blockNumber === "number" ? blockNumber : undefined,
    l1GasConsumed: stringify(fee?.l1GasConsumed),
    l2GasConsumed: stringify(fee?.l2GasConsumed),
    l1DataGasConsumed: stringify(fee?.l1DataGasConsumed),
    status,
  };
}

// --- Service --------------------------------------------------------------

class StarknetSimulationHistoryService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private metaCache: Map<string, StarknetSimulationMeta> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    const openDb = new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error(
          "[StarknetSimulationHistory] Failed to open database:",
          request.error,
        );
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
          this.initPromise = null;
          this.metaCache = null;
        };
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;

        if (oldVersion < 1) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("timestamp", "timestamp", { unique: false });
          store.createIndex("source", "source", { unique: false });
          store.createIndex("network", "network", { unique: false });
          store.createIndex("txHash", "txHash", { unique: false });
          store.createIndex("contractAddress", "contractAddress", {
            unique: false,
          });
          store.createIndex("entrypoint", "entrypoint", { unique: false });

          const metaStore = db.createObjectStore(META_STORE_NAME, {
            keyPath: "id",
          });
          metaStore.createIndex("timestamp", "timestamp", { unique: false });
          metaStore.createIndex("source", "source", { unique: false });
          metaStore.createIndex("network", "network", { unique: false });
          metaStore.createIndex("txHash", "txHash", { unique: false });
          metaStore.createIndex("contractAddress", "contractAddress", {
            unique: false,
          });
          metaStore.createIndex("entrypoint", "entrypoint", { unique: false });
        }
      };
    });

    // Block init resolution on the backfill so the first read sees v2 rows.
    // Walks all rows but only writes those still on an earlier schema —
    // becomes a no-op once the local IDB has been migrated.
    this.initPromise = openDb.then(() =>
      this.backfillStaleRows().catch((err) => {
        console.warn(
          "[StarknetSimulationHistory] Backfill failed:",
          err,
        );
      }),
    );

    return this.initPromise;
  }

  async saveSimulation(entry: StarknetSimulationEntry): Promise<string> {
    await this.init();
    if (!this.db) throw new Error("Database not initialized");

    const cairo = extractCairoFields(entry);

    const sanitizedFormSnapshot = entry.formSnapshot
      ? sanitizeObject(entry.formSnapshot)
      : undefined;

    const responseForStorage = await moveDebugTraceToVault(entry.id, entry.response);

    const stored: StarknetStoredSimulation = {
      id: entry.id,
      timestamp: entry.createdAt ?? Date.now(),
      schemaVersion: ROW_SCHEMA_VERSION,
      source: entry.source,
      status: cairo.status,
      txHash: entry.txHash,
      network: entry.network,
      chainId: entry.chainId ?? null,
      senderAddress: cairo.senderAddress,
      contractAddress: cairo.contractAddress,
      classHash: cairo.classHash,
      contractName: cairo.contractName,
      entrypoint: cairo.entrypoint,
      selector: cairo.selector,
      blockNumber: cairo.blockNumber,
      l1GasConsumed: cairo.l1GasConsumed,
      l2GasConsumed: cairo.l2GasConsumed,
      l1DataGasConsumed: cairo.l1DataGasConsumed,
      response: sanitizeObject(responseForStorage),
      formSnapshot: sanitizedFormSnapshot,
      bridgeGitSha: entry.bridgeGitSha ?? null,
    };

    const meta: StarknetSimulationMeta = (() => {
      const { response: _r, formSnapshot: _f, ...rest } = stored;
      return rest;
    })();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(
        [STORE_NAME, META_STORE_NAME],
        "readwrite",
      );
      tx.objectStore(STORE_NAME).put(stored);
      tx.objectStore(META_STORE_NAME).put(meta);

      tx.oncomplete = () => {
        if (this.metaCache) this.metaCache.set(stored.id, meta);
        // Best-effort cleanup; failures don't block the save.
        this.cleanupOldSimulations().catch((err) => {
          console.warn(
            "[StarknetSimulationHistory] Cleanup failed:",
            err,
          );
        });
        resolve(stored.id);
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async getSimulation(id: string): Promise<StarknetStoredSimulation | null> {
    await this.init();
    if (!this.db) throw new Error("Database not initialized");

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORE_NAME], "readonly");
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  private filterMeta(
    rows: StarknetSimulationMeta[],
    filter?: StarknetSimulationHistoryFilter,
  ): StarknetSimulationMeta[] {
    let out = rows;
    if (filter) {
      out = rows.filter((row) => {
        if (filter.source && row.source !== filter.source) return false;
        if (filter.status && row.status !== filter.status) return false;
        if (filter.network && row.network !== filter.network) return false;
        if (filter.txHash && row.txHash !== filter.txHash) return false;
        if (
          filter.contractAddress &&
          row.contractAddress?.toLowerCase() !==
            filter.contractAddress.toLowerCase()
        )
          return false;
        if (filter.entrypoint && row.entrypoint !== filter.entrypoint)
          return false;
        if (filter.fromTimestamp && row.timestamp < filter.fromTimestamp)
          return false;
        if (filter.toTimestamp && row.timestamp > filter.toTimestamp)
          return false;
        return true;
      });
    }
    return out.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * lightweight=true reads from `simulations-meta` (small rows). Default
   * reads from the full `simulations` store.
   */
  async getSimulations(
    filter?: StarknetSimulationHistoryFilter,
    lightweight = false,
  ): Promise<StarknetStoredSimulation[]> {
    await this.init();
    if (!this.db) throw new Error("Database not initialized");

    if (lightweight && this.metaCache) {
      return this.filterMeta(
        Array.from(this.metaCache.values()),
        filter,
      ) as StarknetStoredSimulation[];
    }

    const storeName = lightweight ? META_STORE_NAME : STORE_NAME;

    const rows = await new Promise<StarknetStoredSimulation[]>(
      (resolve, reject) => {
        const tx = this.db!.transaction([storeName], "readonly");
        const index = tx.objectStore(storeName).index("timestamp");
        const result: StarknetStoredSimulation[] = [];
        const cursor = index.openCursor(null, "prev");

        cursor.onsuccess = (event) => {
          const c = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (c) {
            const row = c.value as StarknetStoredSimulation;
            let include = true;
            if (filter) {
              if (filter.source && row.source !== filter.source) include = false;
              if (filter.status && row.status !== filter.status) include = false;
              if (filter.network && row.network !== filter.network)
                include = false;
              if (filter.txHash && row.txHash !== filter.txHash) include = false;
              if (
                filter.contractAddress &&
                row.contractAddress?.toLowerCase() !==
                  filter.contractAddress.toLowerCase()
              )
                include = false;
              if (filter.entrypoint && row.entrypoint !== filter.entrypoint)
                include = false;
              if (filter.fromTimestamp && row.timestamp < filter.fromTimestamp)
                include = false;
              if (filter.toTimestamp && row.timestamp > filter.toTimestamp)
                include = false;
            }
            if (include) result.push(row);
            c.continue();
          } else {
            resolve(result);
          }
        };

        cursor.onerror = () => reject(cursor.error);
      },
    );

    if (lightweight) {
      this.metaCache = new Map(
        rows.map((r) => [r.id, r as StarknetSimulationMeta]),
      );
    }

    return rows;
  }

  async deleteSimulation(id: string): Promise<void> {
    await this.init();
    if (!this.db) throw new Error("Database not initialized");

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(
        [STORE_NAME, META_STORE_NAME],
        "readwrite",
      );
      tx.objectStore(STORE_NAME).delete(id);
      tx.objectStore(META_STORE_NAME).delete(id);
      tx.oncomplete = () => {
        this.metaCache?.delete(id);
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteSimulations(ids: string[]): Promise<void> {
    await this.init();
    if (!this.db) throw new Error("Database not initialized");
    if (ids.length === 0) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(
        [STORE_NAME, META_STORE_NAME],
        "readwrite",
      );
      const store = tx.objectStore(STORE_NAME);
      const metaStore = tx.objectStore(META_STORE_NAME);
      ids.forEach((id) => {
        store.delete(id);
        metaStore.delete(id);
      });
      tx.oncomplete = () => {
        if (this.metaCache) ids.forEach((id) => this.metaCache!.delete(id));
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async clearAll(): Promise<void> {
    await this.init();
    if (!this.db) throw new Error("Database not initialized");

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(
        [STORE_NAME, META_STORE_NAME],
        "readwrite",
      );
      tx.objectStore(STORE_NAME).clear();
      tx.objectStore(META_STORE_NAME).clear();
      tx.oncomplete = () => {
        this.metaCache = null;
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async getCount(): Promise<number> {
    await this.init();
    if (!this.db) throw new Error("Database not initialized");

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORE_NAME], "readonly");
      const req = tx.objectStore(STORE_NAME).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /** Re-extract Cairo fields on rows still pinned to an earlier schema
   *  version. The full row carries the original `response` + `formSnapshot`,
   *  so we can recompute senderAddress / entrypoint / etc. with the current
   *  extractor and write them back to both stores. Skips rows that are
   *  already up to date. */
  private async backfillStaleRows(): Promise<void> {
    if (!this.db) return;
    const stale = await new Promise<StarknetStoredSimulation[]>(
      (resolve, reject) => {
        const tx = this.db!.transaction([STORE_NAME], "readonly");
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => {
          const rows = (req.result ?? []) as StarknetStoredSimulation[];
          resolve(
            rows.filter((r) => (r.schemaVersion ?? 0) < ROW_SCHEMA_VERSION),
          );
        };
        req.onerror = () => reject(req.error);
      },
    );
    if (stale.length === 0) return;

    const updates = stale.map((row) => {
      const reEntry: StarknetSimulationEntry = {
        id: row.id,
        source: row.source,
        response: row.response as SimulateResponse,
        txHash: row.txHash,
        chainId: row.chainId ?? null,
        bridgeGitSha: row.bridgeGitSha ?? null,
        network: row.network,
        formSnapshot: row.formSnapshot,
        createdAt: row.timestamp,
      };
      const cairo = extractCairoFields(reEntry);
      const next: StarknetStoredSimulation = {
        ...row,
        schemaVersion: ROW_SCHEMA_VERSION,
        status: cairo.status,
        senderAddress: cairo.senderAddress ?? row.senderAddress,
        contractAddress: cairo.contractAddress ?? row.contractAddress,
        classHash: cairo.classHash ?? row.classHash,
        contractName: cairo.contractName ?? row.contractName,
        entrypoint: cairo.entrypoint,
        selector: cairo.selector ?? row.selector,
        blockNumber: cairo.blockNumber ?? row.blockNumber,
        l1GasConsumed: cairo.l1GasConsumed ?? row.l1GasConsumed,
        l2GasConsumed: cairo.l2GasConsumed ?? row.l2GasConsumed,
        l1DataGasConsumed: cairo.l1DataGasConsumed ?? row.l1DataGasConsumed,
      };
      return next;
    });

    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(
        [STORE_NAME, META_STORE_NAME],
        "readwrite",
      );
      const fullStore = tx.objectStore(STORE_NAME);
      const metaStore = tx.objectStore(META_STORE_NAME);
      for (const next of updates) {
        fullStore.put(next);
        const { response: _r, formSnapshot: _f, ...metaNext } = next;
        metaStore.put(metaNext);
      }
      tx.oncomplete = () => {
        this.metaCache = null;
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });

    console.info(
      `[StarknetSimulationHistory] Backfilled ${updates.length} row(s) to schema v${ROW_SCHEMA_VERSION}`,
    );
  }

  private async getOldestIds(count: number): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([META_STORE_NAME], "readonly");
      const index = tx.objectStore(META_STORE_NAME).index("timestamp");
      const ids: string[] = [];
      const cursor = index.openCursor(null, "next");
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

  async cleanupOldSimulations(): Promise<void> {
    const count = await this.getCount();
    if (count <= MAX_SIMULATIONS) return;
    const toDelete = count - MAX_SIMULATIONS;
    const oldestIds = await this.getOldestIds(toDelete);
    await this.deleteSimulations(oldestIds);
  }
}

export const starknetSimulationHistoryService =
  new StarknetSimulationHistoryService();
export default starknetSimulationHistoryService;
