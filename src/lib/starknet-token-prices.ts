// Starknet token metadata and USD price registry, sourced from AVNU Impulse.
//
// The /v1/tokens endpoint returns every Starknet token AVNU recognises
// with `market.currentPrice` populated for each. We slurp the whole list
// once per session (with a 10-minute TTL) and expose a single `useTokenPrice`
// hook plus a price-formatter for the Token Movements VALUE column.
//
// Why a separate module instead of piggy-backing on starknet-token-icons.ts?
// At the time the price layer landed the icons module hadn't been
// committed, so to avoid file-edit lock contention we keep the two
// concerns split. Both modules query the same AVNU endpoint, but each
// retains its own cache shape (icons need logoUri, prices need
// currentPrice plus display metadata) so the redundancy is small in practice.
//
// Address normalisation: AVNU sometimes returns an unpadded variant of
// a felt (e.g. USDC at `0x33068…b35fb` instead of `0x053c91…`). We
// normalise both the API response and lookup keys via BigInt to compare
// values rather than string forms.

import { useEffect, useState } from "react";

const AVNU_TOKENS_URL = "https://starknet.impulse.avnu.fi/v1/tokens";
const CACHE_TTL_MS = 10 * 60 * 1000;

interface AvnuTokenPayload {
  address: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  market?: {
    currentPrice?: number;
  } | null;
}

interface PriceEntry {
  key: string;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  priceUsd: number | null;
}

interface PriceCache {
  /** Map<bigint key as string, PriceEntry> keyed by `BigInt(addr).toString(16)`. */
  byAddr: Map<string, PriceEntry>;
  fetchedAt: number;
}

let cache: PriceCache | null = null;
let inflight: Promise<PriceCache> | null = null;

/** Subscribers notified when the cache is hydrated for the first time. */
const subscribers = new Set<() => void>();

function addrKey(addr: string | null | undefined): string | null {
  if (!addr) return null;
  try {
    return BigInt(addr).toString(16);
  } catch {
    return null;
  }
}

async function fetchAvnuTokens(): Promise<PriceCache> {
  if (inflight) return inflight;
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache;

  inflight = (async () => {
    try {
      const res = await fetch(AVNU_TOKENS_URL, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        // On failure return an empty cache so consumers don't block forever.
        const empty: PriceCache = { byAddr: new Map(), fetchedAt: Date.now() };
        cache = empty;
        return empty;
      }
      const data = (await res.json()) as AvnuTokenPayload[];
      const byAddr = new Map<string, PriceEntry>();
      for (const t of data) {
        const k = addrKey(t.address);
        if (!k) continue;
        const price = t.market?.currentPrice;
        byAddr.set(k, {
          key: k,
          name: t.name ?? null,
          symbol: t.symbol ?? null,
          decimals: typeof t.decimals === "number" ? t.decimals : null,
          priceUsd: typeof price === "number" && Number.isFinite(price) ? price : null,
        });
      }
      const fresh: PriceCache = { byAddr, fetchedAt: Date.now() };
      cache = fresh;
      return fresh;
    } catch {
      const empty: PriceCache = { byAddr: new Map(), fetchedAt: Date.now() };
      cache = empty;
      return empty;
    } finally {
      inflight = null;
      for (const fn of subscribers) {
        try {
          fn();
        } catch {
          /* ignore */
        }
      }
      subscribers.clear();
    }
  })();
  return inflight;
}

/** Synchronous cache lookup — returns null when the cache is cold or
 *  the token isn't on AVNU's list. Triggers a background fetch as a
 *  side effect so subsequent calls can resolve. */
export function getTokenPriceUsd(addr: string | null | undefined): number | null {
  return getStarknetTokenRegistryEntry(addr)?.priceUsd ?? null;
}

export function getStarknetTokenRegistryEntry(
  addr: string | null | undefined,
): PriceEntry | null {
  const k = addrKey(addr);
  if (!k) return null;
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.byAddr.get(k) ?? null;
  }
  void fetchAvnuTokens();
  return null;
}

/** React hook variant — re-renders the consumer when the AVNU cache
 *  finishes hydrating. */
export function useTokenPrice(addr: string | null | undefined): number | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return;
    let cancelled = false;
    const notify = () => {
      if (!cancelled) setTick((n) => n + 1);
    };
    subscribers.add(notify);
    void fetchAvnuTokens();
    return () => {
      cancelled = true;
      subscribers.delete(notify);
    };
  }, []);
  return getTokenPriceUsd(addr);
}

/** Hook that hydrates the cache without returning a price. Useful when
 *  a component renders many rows and wants a single subscription
 *  instead of one per row. */
export function useStarknetTokenPriceRegistry(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return;
    let cancelled = false;
    const notify = () => {
      if (!cancelled) {
        setVersion((n) => n + 1);
      }
    };
    subscribers.add(notify);
    void fetchAvnuTokens();
    return () => {
      cancelled = true;
      subscribers.delete(notify);
    };
  }, []);
  return version;
}

/** Compute USD value for a raw on-chain amount + decimals + price.
 *  Returns null when the price is unknown or the inputs are malformed. */
export function computeUsdValue(
  rawAmount: bigint,
  decimals: number,
  priceUsd: number | null,
): number | null {
  if (priceUsd === null || !Number.isFinite(priceUsd)) return null;
  if (rawAmount === 0n) return 0;
  try {
    if (decimals < 0) return null;
    if (decimals === 0) {
      // Treat as an integer count (NFT id etc).
      return Number(rawAmount) * priceUsd;
    }
    const div = 10n ** BigInt(decimals);
    const whole = rawAmount / div;
    const frac = rawAmount % div;
    // Number(frac)/Number(div) loses precision for huge fractions but
    // the rest of the UI rounds to cents anyway, so this is fine.
    const tokenAmount = Number(whole) + Number(frac) / Number(div);
    return tokenAmount * priceUsd;
  } catch {
    return null;
  }
}

/** Format a USD number for the Token Movements VALUE column.
 *
 *   * `null`            → "—"
 *   * `0`               → "$0.00"
 *   * `0 < |x| < 0.01`  → "<$0.01" (prefixed with sign for negatives)
 *   * `|x| < 1`         → "$0.0001" style — up to 4 fraction digits, trailing 0s trimmed
 *   * else              → "$1,234.56" with thousands separators and 2 decimals
 *
 *  The optional `signed` flag prepends `+` for positive values; the
 *  caller can also color-code via the existing `sim-amount--positive` /
 *  `sim-amount--negative` classes. */
export function formatUsdValue(
  value: number | null,
  opts: { signed?: boolean } = {},
): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value === 0) return "$0.00";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : opts.signed ? "+" : "";

  if (abs < 0.01) return `${sign}<$0.01`;

  if (abs < 1) {
    // Up to 4 decimals, trim trailing zeros but keep at least 2.
    let s = abs.toFixed(4);
    s = s.replace(/0+$/, "").replace(/\.$/, "");
    // Ensure at least 2 decimals so we don't render "$0.4".
    if (!s.includes(".")) s += ".00";
    else {
      const [intp, frac = ""] = s.split(".");
      if (frac.length < 2) s = `${intp}.${frac.padEnd(2, "0")}`;
    }
    return `${sign}$${s}`;
  }

  // Standard formatting with thousands separators and 2 decimals.
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}$${formatted}`;
}
