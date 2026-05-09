// Starknet token icon registry.
//
// Resolution chain (first hit wins):
//   1. Bundled-asset map keyed by canonical address — instant first paint
//      for the most common tokens (ETH, USDC, etc). License-safe sources
//      only (Trustwallet MIT, AVNU's own CDN, Endur.fi for xSTRK).
//   2. AVNU Impulse registry at /v1/tokens — 70+ verified mainnet tokens
//      with `logoUri` pointing at remote CDNs. Fetched lazily on first
//      hook call, persisted to localStorage with 24 h TTL.
//   3. CoinGecko per-address fallback at /coins/starknet/contract/<addr> —
//      throttled 1 req / 2.5 s, negative-cached for 1 week. Used only
//      when the AVNU registry has no entry for a token we encounter.
//
// All caches key off `normalizeAddr(addr)` so leading-zero felt
// representations and case variations collapse into one entry.
//
// Bundled PNGs/SVGs come in via Vite's `?url` import suffix — that
// returns a string URL we can hand directly to <img src=…>.

import { useEffect, useSyncExternalStore } from "react";

import ethIcon from "@/assets/starknet-token-icons/eth.svg?url";
import xstrkIcon from "@/assets/starknet-token-icons/xstrk.svg?url";
import usdcIcon from "@/assets/starknet-token-icons/usdc.png?url";
import usdcEIcon from "@/assets/starknet-token-icons/usdc-e.png?url";
import wbtcIcon from "@/assets/starknet-token-icons/wbtc.png?url";
import daiIcon from "@/assets/starknet-token-icons/dai.png?url";
import strkIcon from "@/assets/starknet-token-icons/strk.png?url";
import usdtIcon from "@/assets/starknet-token-icons/usdt.png?url";
import ekuboIcon from "@/assets/starknet-token-icons/ekubo.svg?url";
import nstrIcon from "@/assets/starknet-token-icons/nstr.jpg?url";
import lordsIcon from "@/assets/starknet-token-icons/lords.png?url";
import lbtcIcon from "@/assets/starknet-token-icons/lbtc.svg?url";

export interface TokenIconInfo {
  symbol: string;
  name: string;
  decimals: number;
  /** Remote URL or bundled asset URL. `null` means we have metadata
   *  (symbol/decimals) but no logo — caller renders the letter-disc
   *  fallback. */
  logoUri: string | null;
  verified: boolean;
}

// ── Address normalization ─────────────────────────────────────────────────

/** Normalize a Starknet address to its canonical form: `0x` prefix +
 *  lowercase hex digits with leading zeros stripped (but never empty —
 *  a zero address normalizes to `0x0`). Non-hex input falls back to
 *  the raw lowercased string so callers don't have to type-guard.
 *
 *  Edge cases:
 *  - Mixed-case `0xAB12` → `0xab12`
 *  - Padded felt `0x0049d36…` → `0x49d36…`
 *  - Zero address `0x0000…000` → `0x0`
 *  - Missing prefix `49d36…`   → `0x49d36…`
 *  - Garbage input             → lowercased input untouched
 */
export function normalizeAddr(addr: string): string {
  if (!addr) return "";
  const trimmed = addr.trim();
  let body = trimmed.toLowerCase();
  if (body.startsWith("0x")) body = body.slice(2);
  // Validate hex shape; if not pure hex, return original lowercased
  // so we don't silently corrupt unrelated identifiers.
  if (!/^[0-9a-f]*$/.test(body)) return trimmed.toLowerCase();
  body = body.replace(/^0+/, "");
  if (body === "") body = "0";
  return `0x${body}`;
}

// ── Bundled icon table ────────────────────────────────────────────────────
//
// Keys are canonical addresses (post-normalizeAddr). Values are bundled
// asset URLs Vite resolves at build time. Authored from the AVNU Impulse
// /v1/tokens dump on 2026-04-26; we only bundle assets whose source
// licensing we have verified (Trustwallet's repo is MIT, AVNU's own CDN
// for ETH, Endur.fi for xSTRK). CoinGecko-only logos are NOT bundled —
// they live behind the registry fetch instead.

export const BUNDLED_ICONS: Record<string, string> = {
  // ETH on Starknet — AVNU CDN (imagedelivery.net)
  "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7": ethIcon,
  // USDC (Circle, native) — Trustwallet MIT
  "0x33068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb": usdcIcon,
  // USDC.e (bridged) — Trustwallet MIT
  "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8": usdcEIcon,
  // WBTC — Trustwallet MIT
  "0x3fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac": wbtcIcon,
  // DAI — Trustwallet MIT
  "0x5574eb6b8789a91466f902c380d978e472db68170ff82a5b650b95a58ddf4ad": daiIcon,
  // xSTRK (Endur liquid staking) — Endur.fi
  "0x28d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a": xstrkIcon,
  // STRK (Starknet native) — Trustwallet MIT
  // (ETH allowlist /assets/0xCa14007Eff0dB1f8135f4C25B34De49AB0d42766)
  "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d": strkIcon,
  // USDT (Tether) — Trustwallet MIT
  // (ETH allowlist /assets/0xdAC17F958D2ee523a2206206994597C13D831ec7)
  "0x68f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8": usdtIcon,
  // EKUBO (Ekubo Protocol) — avnu-labs/starknet-meta MIT
  // (repository/ekubo/icon.svg, protocol brand mark also used for token)
  "0x75afe6402ad5a5c20dd25e10ec3b3986acaa647b77e4ae24b0cbc9a54a27a87": ekuboIcon,
  // NSTR (Nostra) — avnu-labs/starknet-meta MIT
  // (repository/nostra/icon.jpg)
  "0xc530f2c0aa4c16a0806365b0898499fba372e5df7a7172dc6fe9ba777e8007": nstrIcon,
  // LORDS (Realms / Bibliotheca DAO) — avnu-labs/starknet-meta MIT
  // (repository/realms/icon.png — metadata.json confirms LORDS contract
  //  matches our canonical address)
  "0x124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49": lordsIcon,
  // LBTC (Lombard Staked Bitcoin) — Lombard Finance brand mark
  // (lombard.finance/favicon.svg, project's own published brand asset)
  "0x36834a40984312f7f7de8d31e3f6305b325389eaeea5b1c0664b2fb936461a4": lbtcIcon,
};

// ── Module-level cache ────────────────────────────────────────────────────

const REGISTRY_KEY = "hexkit:starknet-tokens:v1";
const REGISTRY_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const NEG_CACHE_KEY = "hexkit:starknet-tokens:neg:v1";
const NEG_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
const COINGECKO_THROTTLE_MS = 2_500;

const AVNU_TOKENS_URL = "https://starknet.impulse.avnu.fi/v1/tokens";
const COINGECKO_BY_CONTRACT_URL =
  "https://api.coingecko.com/api/v3/coins/starknet/contract";

interface RegistryShape {
  fetchedAt: number;
  tokens: Record<string, TokenIconInfo>;
}

interface NegCacheShape {
  // addr → expires-at epoch ms
  [addr: string]: number;
}

const memoryRegistry: Map<string, TokenIconInfo> = new Map();
const negCache: Map<string, number> = new Map();
let registryLoaded = false;
let registryFetchInFlight: Promise<void> | null = null;
let lastCoingeckoCallAt = 0;
const coingeckoQueue: Array<() => void> = [];

// Tiny pub-sub so React hooks re-render when a new token entry lands
// in the registry asynchronously. useSyncExternalStore subscribes to
// this and re-reads its snapshot.
const subscribers = new Set<() => void>();
let registryVersion = 0;
function notify(): void {
  registryVersion++;
  for (const cb of subscribers) {
    try {
      cb();
    } catch {
      /* swallow — never let one bad subscriber kill the rest */
    }
  }
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

function getVersion(): number {
  return registryVersion;
}

// ── localStorage helpers ──────────────────────────────────────────────────

function readRegistryFromStorage(): RegistryShape | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(REGISTRY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RegistryShape;
    if (
      !parsed ||
      typeof parsed.fetchedAt !== "number" ||
      !parsed.tokens ||
      Date.now() - parsed.fetchedAt > REGISTRY_TTL_MS
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeRegistryToStorage(tokens: Record<string, TokenIconInfo>): void {
  if (typeof window === "undefined") return;
  try {
    const payload: RegistryShape = { fetchedAt: Date.now(), tokens };
    window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(payload));
  } catch {
    /* quota — ignore */
  }
}

function readNegCacheFromStorage(): NegCacheShape | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(NEG_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as NegCacheShape;
  } catch {
    return null;
  }
}

function writeNegCacheToStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const obj: NegCacheShape = {};
    for (const [k, v] of negCache) obj[k] = v;
    window.localStorage.setItem(NEG_CACHE_KEY, JSON.stringify(obj));
  } catch {
    /* quota — ignore */
  }
}

function loadNegCache(): void {
  const stored = readNegCacheFromStorage();
  if (!stored) return;
  const now = Date.now();
  for (const [addr, expiresAt] of Object.entries(stored)) {
    if (expiresAt > now) negCache.set(addr, expiresAt);
  }
}

// ── AVNU Impulse fetch ────────────────────────────────────────────────────

interface AvnuToken {
  symbol?: string;
  name?: string;
  address?: string;
  decimals?: number;
  logoUri?: string;
  verified?: boolean;
}

/** Hit AVNU Impulse, populate the in-memory + localStorage caches. The
 *  response carries a `market` and `linePriceFeedInUsd` array per token
 *  (~80 KB before gzip); we strip those before persisting so the cache
 *  stays compact (~25 KB after stripping). */
export async function fetchTokenRegistry(): Promise<void> {
  if (registryLoaded) return;
  if (registryFetchInFlight) return registryFetchInFlight;

  // Hydrate from localStorage first; only network if cache is stale.
  const cached = readRegistryFromStorage();
  if (cached) {
    for (const [addr, info] of Object.entries(cached.tokens)) {
      memoryRegistry.set(addr, info);
    }
    registryLoaded = true;
    notify();
    return;
  }

  registryFetchInFlight = (async () => {
    try {
      const res = await fetch(AVNU_TOKENS_URL, {
        // No credentials — AVNU's API is public and CORS-open.
        credentials: "omit",
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error(`AVNU registry HTTP ${res.status}`);
      const list = (await res.json()) as AvnuToken[];
      const compact: Record<string, TokenIconInfo> = {};
      for (const t of list) {
        if (!t.address || !t.symbol) continue;
        const key = normalizeAddr(t.address);
        const info: TokenIconInfo = {
          symbol: t.symbol,
          name: t.name ?? t.symbol,
          decimals: typeof t.decimals === "number" ? t.decimals : 18,
          logoUri: t.logoUri || null,
          verified: t.verified === true,
        };
        compact[key] = info;
        memoryRegistry.set(key, info);
      }
      writeRegistryToStorage(compact);
      registryLoaded = true;
      notify();
    } catch (err) {
      // Don't poison `registryLoaded` — let the next caller retry. We
      // log so devs can spot it but never block the UI.
      // eslint-disable-next-line no-console
      console.warn("[starknet-token-icons] AVNU registry fetch failed", err);
    } finally {
      registryFetchInFlight = null;
    }
  })();

  return registryFetchInFlight;
}

// ── CoinGecko fallback ────────────────────────────────────────────────────

interface CoinGeckoCoinResponse {
  symbol?: string;
  name?: string;
  detail_platforms?: Record<string, { decimal_place?: number | null } | undefined>;
  image?: { thumb?: string; small?: string; large?: string };
}

function isNegativelyCached(addr: string): boolean {
  const expiresAt = negCache.get(addr);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    negCache.delete(addr);
    return false;
  }
  return true;
}

function markNegativelyCached(addr: string): void {
  negCache.set(addr, Date.now() + NEG_CACHE_TTL_MS);
  writeNegCacheToStorage();
}

/** Schedule a CoinGecko fetch, throttled to 1 req / 2.5 s globally. */
function scheduleCoingeckoFetch(addr: string): void {
  if (memoryRegistry.has(addr)) return;
  if (isNegativelyCached(addr)) return;
  // Already queued? Skip duplicate.
  // Cheap dedupe: tag addresses currently waiting.
  if (pendingCoingeckoAddrs.has(addr)) return;
  pendingCoingeckoAddrs.add(addr);

  const fire = async () => {
    pendingCoingeckoAddrs.delete(addr);
    try {
      const res = await fetch(`${COINGECKO_BY_CONTRACT_URL}/${addr}`, {
        credentials: "omit",
        headers: { accept: "application/json" },
      });
      if (res.status === 404) {
        markNegativelyCached(addr);
        return;
      }
      if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
      const json = (await res.json()) as CoinGeckoCoinResponse;
      const decimalsRaw = json.detail_platforms?.starknet?.decimal_place;
      const info: TokenIconInfo = {
        symbol: (json.symbol ?? "").toUpperCase() || "?",
        name: json.name ?? "",
        decimals: typeof decimalsRaw === "number" ? decimalsRaw : 18,
        logoUri:
          json.image?.small ?? json.image?.thumb ?? json.image?.large ?? null,
        verified: false,
      };
      memoryRegistry.set(addr, info);
      notify();
    } catch (err) {
      // Cache the failure so we don't re-bombard CoinGecko on every render.
      markNegativelyCached(addr);
      // eslint-disable-next-line no-console
      console.warn("[starknet-token-icons] CoinGecko fallback failed", addr, err);
    }
  };

  const now = Date.now();
  const delta = now - lastCoingeckoCallAt;
  if (delta >= COINGECKO_THROTTLE_MS && coingeckoQueue.length === 0) {
    lastCoingeckoCallAt = now;
    void fire();
  } else {
    const wait = Math.max(0, COINGECKO_THROTTLE_MS - delta);
    coingeckoQueue.push(() => {
      lastCoingeckoCallAt = Date.now();
      void fire();
    });
    if (coingeckoQueue.length === 1) {
      // Drain the queue spaced by the throttle window.
      const drain = () => {
        const next = coingeckoQueue.shift();
        if (!next) return;
        next();
        if (coingeckoQueue.length > 0) {
          setTimeout(drain, COINGECKO_THROTTLE_MS);
        }
      };
      setTimeout(drain, wait);
    }
  }
}

const pendingCoingeckoAddrs = new Set<string>();

// ── Public lookups ────────────────────────────────────────────────────────

let negCacheLoaded = false;
function ensureNegCacheLoaded(): void {
  if (!negCacheLoaded) {
    loadNegCache();
    negCacheLoaded = true;
  }
}

/** Synchronous lookup. Returns whatever we already have in memory —
 *  bundled, registry, or CoinGecko fallback. Does NOT trigger network
 *  fetches; use the hook for that. */
export function getTokenIconSync(addr: string): TokenIconInfo | null {
  if (!addr) return null;
  const key = normalizeAddr(addr);
  // Bundled wins because it's instant + license-vetted.
  const bundled = BUNDLED_ICONS[key];
  if (bundled) {
    const meta = memoryRegistry.get(key);
    return {
      symbol: meta?.symbol ?? "?",
      name: meta?.name ?? meta?.symbol ?? "",
      decimals: meta?.decimals ?? 18,
      logoUri: bundled,
      verified: meta?.verified ?? true,
    };
  }
  return memoryRegistry.get(key) ?? null;
}

/** React hook. On first call, kicks off the AVNU registry fetch (idempotent).
 *  When the requested address isn't covered by bundled or registry, queues
 *  a CoinGecko lookup. Re-renders the caller whenever new info lands. */
export function useTokenIcon(
  addr: string | null | undefined,
): TokenIconInfo | null {
  // Subscribe to the in-memory registry so async fills trigger re-renders.
  useSyncExternalStore(subscribe, getVersion, getVersion);

  // Kick off the registry fetch exactly once per component mount.
  useEffect(() => {
    ensureNegCacheLoaded();
    void fetchTokenRegistry();
  }, []);

  // Schedule CoinGecko fallback when needed.
  useEffect(() => {
    if (!addr) return;
    const key = normalizeAddr(addr);
    if (BUNDLED_ICONS[key]) return;
    if (memoryRegistry.has(key)) return;
    // Wait for registry to settle before triggering CoinGecko — avoids
    // a thundering herd on first paint.
    if (!registryLoaded) return;
    scheduleCoingeckoFetch(key);
  }, [addr]);

  if (!addr) return null;
  return getTokenIconSync(addr);
}
