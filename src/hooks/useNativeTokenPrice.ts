/**
 * Lightweight hook for fetching native token (ETH) USD price.
 * Uses DeFiLlama API with a 10-minute cache.
 *
 * Returns approximate USD value — suitable for display context only.
 */

import { useState, useEffect, useRef } from 'react';

// Chain ID → DeFiLlama identifier for the native wrapped token
const NATIVE_TOKEN_ID: Record<number, string> = {
  1: 'coingecko:ethereum',
  10: 'coingecko:ethereum', // Optimism uses ETH
  56: 'coingecko:binancecoin',
  137: 'coingecko:matic-network',
  8453: 'coingecko:ethereum', // Base uses ETH
  42161: 'coingecko:ethereum', // Arbitrum uses ETH
  43114: 'coingecko:avalanche-2',
  534352: 'coingecko:ethereum', // Scroll uses ETH
  324: 'coingecko:ethereum', // zkSync uses ETH
};

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const priceCache = new Map<string, { price: number; fetchedAt: number }>();

async function fetchNativePrice(chainId: number): Promise<number | null> {
  const coinId = NATIVE_TOKEN_ID[chainId] ?? 'coingecko:ethereum';

  const cached = priceCache.get(coinId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.price;
  }

  try {
    const response = await fetch(
      `https://coins.llama.fi/prices/current/${coinId}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) return cached?.price ?? null;

    const data = await response.json();
    const coinData = data?.coins?.[coinId];
    if (!coinData?.price) return cached?.price ?? null;

    const price = coinData.price as number;
    priceCache.set(coinId, { price, fetchedAt: Date.now() });
    return price;
  } catch {
    return cached?.price ?? null;
  }
}

export interface NativeTokenPrice {
  /** USD price of 1 native token, or null if unavailable */
  price: number | null;
  /** Format a wei string as approximate USD */
  formatUsd: (weiValue?: string | null) => string;
  /** Whether the price is still loading */
  loading: boolean;
}

/**
 * Hook to get native token USD price for a given chain.
 * Returns a `formatUsd` helper that converts wei → ~$X.XX
 */
export function useNativeTokenPrice(chainId: number = 1): NativeTokenPrice {
  const [price, setPrice] = useState<number | null>(() => {
    const coinId = NATIVE_TOKEN_ID[chainId] ?? 'coingecko:ethereum';
    const cached = priceCache.get(coinId);
    return cached && Date.now() - cached.fetchedAt < CACHE_TTL ? cached.price : null;
  });
  const [loading, setLoading] = useState(price === null);
  const chainRef = useRef(chainId);
  chainRef.current = chainId;

  useEffect(() => {
    let cancelled = false;
    fetchNativePrice(chainId).then((p) => {
      if (!cancelled && chainRef.current === chainId) {
        setPrice(p);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [chainId]);

  const formatUsd = (weiValue?: string | null): string => {
    if (!weiValue || price === null) return '';
    try {
      const wei = BigInt(weiValue);
      if (wei === 0n) return '~$0.00';
      // BigInt-safe: convert to ETH then multiply by price
      const intPart = wei / (10n ** 18n);
      const fracPart = wei % (10n ** 18n);
      const ethValue = Number(intPart) + Number(fracPart) / 1e18;
      const usd = ethValue * price;
      if (usd < 0.01 && usd > 0) return '~<$0.01';
      return `~$${usd.toFixed(2)}`;
    } catch {
      return '';
    }
  };

  return { price, formatUsd, loading };
}
