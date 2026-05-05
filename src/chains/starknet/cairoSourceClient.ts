// Bridge-backed Cairo source fetcher. Mirrors `sierraDebugClient.ts`'s
// resolved/inflight cache + subscriber pattern; cache key is
// `${network}:${classHash}` since the same class can resolve differently
// per network. Without `VOYAGER_API_KEY` the bridge returns
// `verified:false` with empty files — surfaced as data, not an error.

import { getBridgeHeaders, getStarknetSimBridgeUrl } from "@/utils/env";
import { createAsyncCache } from "./asyncCache";

const FETCH_TIMEOUT_MS = 30_000;

export type CairoSourceNetwork = "mainnet" | "sepolia";

export interface CairoSourceFile {
  path: string;
  content: string;
}

export interface CairoSourceResponse {
  classHash: string;
  network: CairoSourceNetwork;
  verified: boolean;
  files: CairoSourceFile[];
  mainFile: string | null;
  scarbToml: string | null;
}

const cairoSourceCache = createAsyncCache<CairoSourceResponse>();

function normalizeClassHash(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("0x") || trimmed.length < 3) return null;
  return trimmed.toLowerCase();
}

function cacheKey(classHash: string, network: CairoSourceNetwork): string {
  return `${network}:${classHash}`;
}

export async function fetchCairoSource(
  rawClassHash: string,
  network: CairoSourceNetwork = "mainnet",
  signal?: AbortSignal,
): Promise<CairoSourceResponse> {
  const classHash = normalizeClassHash(rawClassHash);
  if (!classHash) {
    throw new Error("invalid class hash");
  }
  const key = cacheKey(classHash, network);

  return cairoSourceCache.fetch(key, () =>
    loadCairoSource(classHash, network, signal),
  );
}

async function loadCairoSource(
  classHash: string,
  network: CairoSourceNetwork,
  signal?: AbortSignal,
): Promise<CairoSourceResponse> {
  const base = getStarknetSimBridgeUrl();
  if (!base) {
    throw new Error("starknet-sim bridge URL is disabled");
  }
  const url =
    `${base.replace(/\/+$/, "")}/cairo-source` +
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
      headers: getBridgeHeaders(undefined, { method: "GET" }),
      signal: controller.signal,
      credentials: "same-origin",
    });
  } finally {
    window.clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onUserAbort);
  }
  if (!response.ok) {
    // Bridge returns 200 + verified:false for missing key / unverified;
    // anything else here is a transport failure.
    let body = "";
    try {
      body = (await response.text()).slice(0, 256);
    } catch { /* body unavailable */ }
    throw new Error(
      `bridge returned ${response.status}${body ? `: ${body}` : ""}`,
    );
  }
  const raw = (await response.json()) as Partial<CairoSourceResponse>;
  let info: CairoSourceResponse = {
    classHash:
      typeof raw.classHash === "string" ? raw.classHash : classHash,
    network:
      raw.network === "sepolia" || raw.network === "mainnet"
        ? raw.network
        : network,
    verified: Boolean(raw.verified),
    files: Array.isArray(raw.files)
      ? raw.files
          .filter(
            (f): f is CairoSourceFile =>
              Boolean(f) &&
              typeof (f as CairoSourceFile).path === "string" &&
              typeof (f as CairoSourceFile).content === "string",
          )
          .map((f) => ({ path: f.path, content: f.content }))
      : [],
    mainFile:
      typeof raw.mainFile === "string" && raw.mainFile.length > 0
        ? raw.mainFile
        : null,
    scarbToml:
      typeof raw.scarbToml === "string" && raw.scarbToml.length > 0
        ? raw.scarbToml
        : null,
  };

  // Fallback: when the bridge can't serve verified source (no
  // VOYAGER_API_KEY, or Voyager doesn't have this class), try the
  // hand-curated github-raw registry. Argent / Braavos / OZ Cairo /
  // anything we've manually added kicks in here.
  if (!info.verified) {
    try {
      const { lookupCairoSourceFallback } = await import(
        "./cairoSourceRegistry"
      );
      const fallback = await lookupCairoSourceFallback(classHash, network);
      if (fallback) info = fallback;
    } catch (err) {
      // Registry lookup is best-effort; keep the unverified envelope.
      console.warn("[cairoSourceClient] Registry fallback failed:", err);
    }
  }
  return info;
}

export function useCairoSource(
  classHash: string | null,
  network: CairoSourceNetwork = "mainnet",
): {
  data: CairoSourceResponse | null;
  loading: boolean;
  error: string | null;
} {
  const normalized = normalizeClassHash(classHash);
  const key = normalized ? cacheKey(normalized, network) : null;
  return cairoSourceCache.useCache(
    key,
    normalized ? () => loadCairoSource(normalized, network) : null,
  );
}

export function chainIdToCairoSourceNetwork(
  chainId: string | null | undefined,
): CairoSourceNetwork {
  if (!chainId) return "mainnet";
  const lower = chainId.toLowerCase();
  // 0x534e5f5345504f4c4941 === "SN_SEPOLIA"
  if (lower === "0x534e5f5345504f4c4941" || lower === "sn_sepolia") {
    return "sepolia";
  }
  return "mainnet";
}

export function __resetCairoSourceCacheForTests(): void {
  cairoSourceCache.reset();
}
