// Bridge-backed Sierra→Cairo source-line mapping. Mirrors the
// resolved/inflight cache + subscriber pattern used by
// `sierraDebugClient.ts` and `cairoSourceClient.ts`. Cache key is
// `${network}:${classHash}` since the same class can resolve
// differently per network.

import type { StarknetNetwork } from "@/config/networkConfig";
import { getBridgeHeaders, getStarknetSimBridgeUrl } from "@/utils/env";
import { createAsyncCache } from "./asyncCache";
import { rpcOverrideHeaderFor } from "./simulatorClient";

const FETCH_TIMEOUT_MS = 120_000;

export type SourceMapNetwork = StarknetNetwork;

export interface StatementLocation {
  statementIdx: number;
  file: string;
  lineStart: number;
  columnStart: number;
  lineEnd: number;
  columnEnd: number;
}

export interface SourceMapAvailable {
  available: true;
  classHash: string;
  network: SourceMapNetwork;
  compilerVersion: string;
  sourceDigest: string;
  contractName: string | null;
  statementCount: number;
  mappedStatementCount: number;
  statementToSource: StatementLocation[];
  warnings: string[];
}

export interface SourceMapUnavailable {
  available: false;
  classHash: string;
  network: SourceMapNetwork;
  reason: string;
  message: string;
  compilerVersion: string | null;
  statementToSource: [];
  warnings: string[];
}

export type SourceMapResponse = SourceMapAvailable | SourceMapUnavailable;

export function sourceMapStatementCountMatches(
  sourceMap: SourceMapResponse | null | undefined,
  sierraStatementCount: number | null | undefined,
): sourceMap is SourceMapAvailable {
  if (!sourceMap || sourceMap.available !== true) return false;
  if (
    typeof sierraStatementCount !== "number" ||
    !Number.isFinite(sierraStatementCount) ||
    sierraStatementCount <= 0
  ) {
    return false;
  }
  return sourceMap.statementCount === sierraStatementCount;
}

const sierraSourceMapCache = createAsyncCache<SourceMapResponse>();

function normalizeClassHash(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("0x") || trimmed.length < 3) return null;
  return trimmed.toLowerCase();
}

function cacheKey(classHash: string, network: SourceMapNetwork): string {
  return `${network}:${classHash}`;
}

export async function fetchSierraSourceMap(
  rawClassHash: string,
  network: SourceMapNetwork = "mainnet",
  signal?: AbortSignal,
): Promise<SourceMapResponse> {
  const classHash = normalizeClassHash(rawClassHash);
  if (!classHash) {
    throw new Error("invalid class hash");
  }
  const key = cacheKey(classHash, network);

  return sierraSourceMapCache.fetch(key, () =>
    loadSierraSourceMap(classHash, network, signal),
  );
}

async function loadSierraSourceMap(
  classHash: string,
  network: SourceMapNetwork,
  signal?: AbortSignal,
): Promise<SourceMapResponse> {
  const base = getStarknetSimBridgeUrl();
  if (!base) {
    throw new Error("starknet-sim bridge URL is disabled");
  }
  const url =
    `${base.replace(/\/+$/, "")}/sierra-source-map` +
    `?class_hash=${encodeURIComponent(classHash)}` +
    `&network=${encodeURIComponent(network)}`;
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
      /* body unavailable */
    }
    throw new Error(
      `bridge returned ${response.status}${body ? `: ${body}` : ""}`,
    );
  }
  const raw = (await response.json()) as Partial<SourceMapResponse> & {
    available?: boolean;
  };
  const normalized = normalizeResponse(classHash, network, raw);
  return normalized;
}

function normalizeResponse(
  classHash: string,
  network: SourceMapNetwork,
  rawIn: Partial<SourceMapResponse> & { available?: boolean },
): SourceMapResponse {
  // Treat the raw payload as a loose record so we can probe both the
  // `available` and `unavailable` envelopes without TS narrowing
  // away one set of fields.
  const raw = rawIn as Record<string, unknown> & { available?: boolean };
  if (raw.available === true) {
    return {
      available: true,
      classHash,
      network,
      compilerVersion:
        typeof raw.compilerVersion === "string" ? raw.compilerVersion : "",
      sourceDigest:
        typeof raw.sourceDigest === "string" ? raw.sourceDigest : "",
      contractName:
        typeof raw.contractName === "string" ? raw.contractName : null,
      statementCount:
        typeof raw.statementCount === "number" ? raw.statementCount : 0,
      mappedStatementCount:
        typeof raw.mappedStatementCount === "number"
          ? raw.mappedStatementCount
          : 0,
      statementToSource: Array.isArray(raw.statementToSource)
        ? (raw.statementToSource.filter(
            (s): s is StatementLocation =>
              !!s &&
              typeof (s as StatementLocation).statementIdx === "number" &&
              typeof (s as StatementLocation).file === "string",
          ) as StatementLocation[])
        : [],
      warnings: Array.isArray(raw.warnings)
        ? raw.warnings.filter((w): w is string => typeof w === "string")
        : [],
    };
  }
  return {
    available: false,
    classHash,
    network,
    reason: typeof raw.reason === "string" ? raw.reason : "unknown",
    message: typeof raw.message === "string" ? raw.message : "",
    compilerVersion:
      typeof raw.compilerVersion === "string" ? raw.compilerVersion : null,
    statementToSource: [],
    warnings: Array.isArray(raw.warnings)
      ? raw.warnings.filter((w): w is string => typeof w === "string")
      : [],
  };
}

export function useSierraSourceMap(
  classHash: string | null,
  network: SourceMapNetwork = "mainnet",
): {
  data: SourceMapResponse | null;
  loading: boolean;
  error: string | null;
} {
  const normalized = normalizeClassHash(classHash);
  const key = normalized ? cacheKey(normalized, network) : null;
  return sierraSourceMapCache.useCache(
    key,
    normalized ? () => loadSierraSourceMap(normalized, network) : null,
  );
}

/** Binary-search the sorted statement-to-source table for an EXACT
 *  match. Returns `null` when no entry maps the requested statement —
 *  callers fall back to frame-entry granularity in that case. We
 *  deliberately don't use floor-lookup here: the Sierra-statement
 *  table is sparse (many statements have no Cairo source location,
 *  e.g. compiler-generated AP tracking), and floor would silently
 *  highlight whatever previous statement *did* map, which is the
 *  wrong line. */
export function findStatementLocation(
  table: ReadonlyArray<StatementLocation>,
  statementIdx: number,
): StatementLocation | null {
  if (table.length === 0) return null;
  let lo = 0;
  let hi = table.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const midIdx = table[mid].statementIdx;
    if (midIdx === statementIdx) return table[mid];
    if (midIdx < statementIdx) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return null;
}

export function __resetSierraSourceMapCacheForTests(): void {
  sierraSourceMapCache.reset();
}
