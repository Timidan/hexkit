// Bridge-backed contract-name resolver. The Rust bridge does the heavy
// lifting (calling `name()` / `symbol()` on the contract via
// `starknet_call`); this module is a thin fetch wrapper plus a shared
// React hook so multiple components can render the same address
// without re-fetching.
//
// The bridge endpoint is `GET /contract-name?address=0x…` and
// always returns 200 (no name resolved → `name: null`). We mirror that
// here — the hook never throws on transport errors, it just resolves
// to `{ name: null, loading: false }` so the rendering side falls back
// to the truncated hex without surfacing a spinner forever.

import type { StarknetNetwork } from "@/config/networkConfig";
import { rpcOverrideHeaderFor } from "@/chains/starknet/simulatorClient";
import { getBridgeHeaders, getStarknetSimBridgeUrl } from "@/utils/env";
import { createAsyncCache } from "./asyncCache";

const FETCH_TIMEOUT_MS = 6_000;

/** Bridge response shape — matches `crates/bridge/src/http/contract_name.rs`. */
export interface ContractNameResponse {
  address: string;
  name: string | null;
  /** Selector that resolved the name (`name` / `symbol` / `cache`).
   *  Useful for the Dev tab if we ever want to surface the source. */
  source: string | null;
  classHash: string | null;
}

const contractNameCache = createAsyncCache<string | null>({
  maxConcurrent: 1,
});

function normalizeAddr(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("0x") || trimmed.length < 3) return null;
  return trimmed.toLowerCase();
}

function cacheKeyFor(address: string, network?: StarknetNetwork): string {
  return `${network ?? "default"}:${address}`;
}

/** Imperative one-shot fetch. Resolves to the contract's friendly
 *  label or `null` when nothing was derivable. Network failures are
 *  swallowed and treated as "no name" — caller should not rely on
 *  this rejecting. */
export async function fetchContractName(
  rawAddress: string,
  options?: { signal?: AbortSignal; network?: StarknetNetwork },
): Promise<string | null> {
  const address = normalizeAddr(rawAddress);
  if (!address) return null;
  const cacheKey = cacheKeyFor(address, options?.network);

  return contractNameCache.fetch(cacheKey, () =>
    loadContractName(address, options),
  );
}

async function loadContractName(
  address: string,
  options?: { signal?: AbortSignal; network?: StarknetNetwork },
): Promise<string | null> {
  try {
    const base = getStarknetSimBridgeUrl();
    if (!base) return null;
    const url = `${base.replace(/\/+$/, "")}/contract-name?address=${encodeURIComponent(
      address,
    )}`;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => controller.abort(),
      FETCH_TIMEOUT_MS,
    );
    const onUserAbort = () => controller.abort();
    const signal = options?.signal;
    if (signal) signal.addEventListener("abort", onUserAbort, { once: true });
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: getBridgeHeaders(
          options?.network ? rpcOverrideHeaderFor(options.network) : undefined,
          { method: "GET" },
        ),
        signal: controller.signal,
        credentials: "same-origin",
      });
    } finally {
      window.clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onUserAbort);
    }
    if (!response.ok) return null;
    const body = (await response.json()) as ContractNameResponse;
    const name =
      body && typeof body.name === "string" && body.name.length > 0
        ? body.name
        : null;
    return name;
  } catch {
    // Network / abort / parse failure — treat as null and don't
    // poison the cache so a later retry can succeed.
    return null;
  }
}

/** React hook flavour. Returns `{ name, loading }` — name is `null`
 *  while pending and after a soft-failure. Components should render
 *  the truncated hex when `name === null` and optionally hint the
 *  spinner via `loading`. */
export function useContractName(
  rawAddress: string | null | undefined,
  network?: StarknetNetwork,
): {
  name: string | null;
  loading: boolean;
} {
  const address = normalizeAddr(rawAddress ?? null);
  const cacheKey = address ? cacheKeyFor(address, network) : null;
  const { data, loading } = contractNameCache.useCache(
    cacheKey,
    address ? () => loadContractName(address, { network }) : null,
  );
  return { name: data, loading };
}

/** Test-only — clears both resolved and in-flight caches. Not
 *  exported via the package barrel; consumers shouldn't need it. */
export function __resetContractNameCacheForTests(): void {
  contractNameCache.reset();
}
