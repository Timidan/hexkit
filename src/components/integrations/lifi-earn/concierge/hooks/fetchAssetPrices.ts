// Batch USD-price lookup via DeFiLlama /prices/current. Missing entries mean
// the asset could not be priced — keep amountUsd null, don't fabricate zero.
import { formatUnits } from "viem";
import type { IdleAsset } from "../types";
import {
  DEFILLAMA_CHAIN_SLUG,
  NATIVE_COINGECKO_ID,
} from "../../../../../utils/priceRegistry";

const NATIVE_SENTINELS = new Set([
  "0x0000000000000000000000000000000000000000",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
]);

function keyFor(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

function isNative(address: string): boolean {
  return NATIVE_SENTINELS.has(address.toLowerCase());
}

function coinIdForAsset(asset: IdleAsset): string | null {
  if (isNative(asset.token.address)) {
    return NATIVE_COINGECKO_ID[asset.chainId] ?? null;
  }
  const slug = DEFILLAMA_CHAIN_SLUG[asset.chainId];
  if (!slug) return null;
  return `${slug}:${asset.token.address.toLowerCase()}`;
}

interface LlamaResponse {
  coins?: Record<string, { price?: number; decimals?: number; symbol?: string; timestamp?: number; confidence?: number }>;
}

export async function fetchAssetPrices(
  assets: IdleAsset[],
  timeoutMs = 5000
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  if (assets.length === 0) return prices;

  // Native ETH on many L2s shares coingecko:ethereum — multiple assets
  // can map to the same coin id.
  const coinIdToAssetKeys = new Map<string, string[]>();
  for (const asset of assets) {
    const coinId = coinIdForAsset(asset);
    if (!coinId) continue;
    const assetKey = keyFor(asset.chainId, asset.token.address);
    const existing = coinIdToAssetKeys.get(coinId);
    if (existing) existing.push(assetKey);
    else coinIdToAssetKeys.set(coinId, [assetKey]);
  }

  const coinIds = Array.from(coinIdToAssetKeys.keys());
  if (coinIds.length === 0) return prices;

  const CHUNK = 100;
  const chunks: string[][] = [];
  for (let i = 0; i < coinIds.length; i += CHUNK) {
    chunks.push(coinIds.slice(i, i + CHUNK));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const url = `https://coins.llama.fi/prices/current/${chunk.join(",")}`;
        const res = await fetch(url, {
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return;
        const data = (await res.json()) as LlamaResponse;
        const coins = data.coins ?? {};
        for (const [coinId, info] of Object.entries(coins)) {
          if (typeof info?.price !== "number") continue;
          const keys = coinIdToAssetKeys.get(coinId);
          if (!keys) continue;
          for (const k of keys) prices.set(k, info.price);
        }
      } catch (err) {
        console.warn("[concierge] price fetch chunk failed:", err);
      }
    })
  );

  return prices;
}

export function applyPricesToAssets(
  assets: IdleAsset[],
  prices: Map<string, number>
): IdleAsset[] {
  if (prices.size === 0) return assets;
  return assets.map((a) => {
    const price = prices.get(keyFor(a.chainId, a.token.address));
    if (price == null) return a;
    try {
      const decimal = Number(formatUnits(BigInt(a.amountRaw), a.token.decimals));
      if (!Number.isFinite(decimal)) return a;
      return { ...a, amountUsd: decimal * price };
    } catch {
      return a;
    }
  });
}
