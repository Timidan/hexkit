import type { EvidencePacket, Verdict } from "../utils/tx-analysis/types";

const DB_NAME = "web3-toolkit-tx-analysis";
const DB_VERSION = 1;
const STORE_NAME = "analyses";

const SENSITIVE_KEYS = new Set([
  "rpcurl",
  "rpc_url",
  "apikey",
  "api_key",
  "privatekey",
  "private_key",
  "secret",
  "password",
  "authtoken",
  "auth_token",
]);

function normalizeKey(k: string): string {
  return k.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
}

function sanitize<T>(input: T): T {
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) return input.map(sanitize) as unknown as T;
  if (typeof input !== "object") return input;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    if (SENSITIVE_KEYS.has(normalizeKey(k))) continue;
    out[k] = sanitize(v as unknown);
  }
  return out as T;
}

export type AnalysisDepth = "simple" | "complex";

export interface AnalysisRecord {
  id: string;
  createdAt: number;
  depth: AnalysisDepth;
  rawPromptHash: string;
  packet: EvidencePacket;
  verdict: Verdict;
}

export interface SaveInput {
  packet: EvidencePacket;
  verdict: Verdict;
  depth: AnalysisDepth;
  rawPromptHash: string;
}

export class TxAnalysisStore {
  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt");
          store.createIndex("simulationId", "packet.simulationId");
          store.createIndex("txHash", "packet.txHash");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async save(input: SaveInput): Promise<string> {
    const db = await this.openDb();
    const record: AnalysisRecord = sanitize({
      id: `ana_${crypto.randomUUID()}`,
      createdAt: Date.now(),
      depth: input.depth,
      rawPromptHash: input.rawPromptHash,
      packet: input.packet,
      verdict: input.verdict,
    });
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve(record.id);
      tx.onerror = () => reject(tx.error);
    });
  }

  async get(id: string): Promise<AnalysisRecord | null> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve((req.result as AnalysisRecord) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async list(opts: { limit?: number } = {}): Promise<AnalysisRecord[]> {
    const db = await this.openDb();
    const limit = opts.limit ?? 50;
    return new Promise((resolve, reject) => {
      const results: AnalysisRecord[] = [];
      const tx = db.transaction(STORE_NAME, "readonly");
      const idx = tx.objectStore(STORE_NAME).index("createdAt");
      const req = idx.openCursor(null, "prev");
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor || results.length >= limit) {
          resolve(results);
          return;
        }
        results.push(cursor.value as AnalysisRecord);
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }

  async delete(id: string): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const txAnalysisStore = new TxAnalysisStore();
