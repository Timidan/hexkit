// Bridge-backed Sierra debug fetcher. The Rust bridge endpoint
// `GET /sierra-debug?class_hash=0x…` returns the full Sierra textual
// form alongside basic stats (function/type/libfunc/statement counts)
// and a `pcToStatement` lookup table the future debugger will use to
// map runtime PCs back to Sierra statements.
//
// Cairo 0 classes don't have Sierra at all — for those the bridge
// still returns a 200 with `sierra: null` and `isCairo1: false`. The
// hook surfaces that as a loaded entry; the consumer decides how to
// render it. Any 4xx/5xx becomes an `error` string and clears the
// data field. Successful entries are cached at module level so
// re-selecting the same frame is a synchronous read.
//
// The shape mirrors `contractNameClient.ts` (subscriber + Map cache
// pattern) so multiple panels rendering the same `class_hash`
// dispatch a single fetch.

import { getBridgeHeaders, getStarknetSimBridgeUrl } from "@/utils/env";
import type { StarknetNetwork } from "@/config/networkConfig";
import { createAsyncCache } from "./asyncCache";
import { rpcOverrideHeaderFor } from "./simulatorClient";

const FETCH_TIMEOUT_MS = 30_000;

export interface SierraDebugStats {
  text: string;
  statementCount: number;
  typeCount: number;
  libfuncCount: number;
  functionCount: number;
}

export interface SierraDebugPcEntry {
  pc: number;
  statementIdx: number;
}

export interface SierraDebugInfo {
  classHash: string;
  isCairo1: boolean;
  contractClassVersion: string | null;
  sierra: SierraDebugStats | null;
  pcToStatement: SierraDebugPcEntry[];
}

const sierraDebugCache = createAsyncCache<SierraDebugInfo>();

function normalizeClassHash(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("0x") || trimmed.length < 3) return null;
  return trimmed.toLowerCase();
}

function cacheKey(classHash: string, network: StarknetNetwork): string {
  return `${network}:${classHash}`;
}

/** Imperative one-shot fetch. Resolves with a fully-populated
 *  `SierraDebugInfo`. Rejects on transport / parse failure so the
 *  hook can surface an `error` chip; the cache is *not* poisoned on
 *  failure so a later retry can succeed. */
export async function fetchSierraDebug(
  rawClassHash: string,
  network: StarknetNetwork = "mainnet",
  signal?: AbortSignal,
): Promise<SierraDebugInfo> {
  const classHash = normalizeClassHash(rawClassHash);
  if (!classHash) {
    throw new Error("invalid class hash");
  }

  const key = cacheKey(classHash, network);
  return sierraDebugCache.fetch(key, () =>
    loadSierraDebug(classHash, network, signal),
  );
}

async function loadSierraDebug(
  classHash: string,
  network: StarknetNetwork,
  signal?: AbortSignal,
): Promise<SierraDebugInfo> {
  const base = getStarknetSimBridgeUrl();
  if (!base) {
    throw new Error("starknet-sim bridge URL is disabled");
  }
  const url = `${base.replace(/\/+$/, "")}/sierra-debug?class_hash=${encodeURIComponent(
    classHash,
  )}&network=${encodeURIComponent(network)}`;
  const controller = new AbortController();
  const timer = window.setTimeout(
    () => controller.abort(),
    FETCH_TIMEOUT_MS,
  );
  const onUserAbort = () => controller.abort();
  if (signal) signal.addEventListener("abort", onUserAbort, { once: true });
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: getBridgeHeaders(rpcOverrideHeaderFor(network), {
        method: "GET",
      }),
      signal: controller.signal,
      credentials: "same-origin",
    });
  } finally {
    window.clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onUserAbort);
  }
  if (!response.ok) {
    let body = "";
    try {
      body = (await response.text()).slice(0, 256);
    } catch {
      // ignore — body unavailable
    }
    throw new Error(
      `bridge returned ${response.status}${body ? `: ${body}` : ""}`,
    );
  }
  const raw = (await response.json()) as Partial<SierraDebugInfo> & {
    sierra?: Partial<SierraDebugStats> | null;
    pcToStatement?: SierraDebugPcEntry[];
  };
  const info: SierraDebugInfo = {
    classHash:
      typeof raw.classHash === "string" ? raw.classHash : classHash,
    isCairo1: Boolean(raw.isCairo1),
    contractClassVersion:
      typeof raw.contractClassVersion === "string"
        ? raw.contractClassVersion
        : null,
    sierra:
      raw.sierra && typeof raw.sierra.text === "string"
        ? {
            text: raw.sierra.text,
            statementCount: Number(raw.sierra.statementCount ?? 0),
            typeCount: Number(raw.sierra.typeCount ?? 0),
            libfuncCount: Number(raw.sierra.libfuncCount ?? 0),
            functionCount: Number(raw.sierra.functionCount ?? 0),
          }
        : null,
    pcToStatement: Array.isArray(raw.pcToStatement) ? raw.pcToStatement : [],
  };
  return info;
}

/** React hook — returns `{ data, loading, error }` for a class hash.
 *  Synchronously hydrates from the module cache so re-selecting a
 *  previously viewed frame doesn't flash a spinner. */
export function useSierraDebug(
  classHash: string | null,
  network: StarknetNetwork = "mainnet",
): {
  data: SierraDebugInfo | null;
  loading: boolean;
  error: string | null;
} {
  const normalized = normalizeClassHash(classHash);
  const key = normalized ? cacheKey(normalized, network) : null;
  return sierraDebugCache.useCache(
    key,
    normalized ? () => loadSierraDebug(normalized, network) : null,
  );
}

/** Test-only — clears caches between unit tests. */
export function __resetSierraDebugCacheForTests(): void {
  sierraDebugCache.reset();
}
