// Batch USD-price lookup via DeFiLlama /prices/current. Missing entries mean
// the asset could not be priced — keep amountUsd null, don't fabricate zero.
import { formatUnits } from "../../../../../features/earn/shared/formatUnits";
import type { IdleAsset } from "../types";
import { isNativeToken } from "../../../../../utils/addressConstants";

const LLAMA_CHAIN_SLUG: Record<number, string> = {
  1: "ethereum",
  10: "optimism",
  25: "cronos",
  56: "bsc",
  100: "xdai",
  130: "unichain",
  137: "polygon",
  146: "sonic",
  204: "op_bnb",
  250: "fantom",
  252: "fraxtal",
  324: "era",
  1088: "metis",
  1135: "lisk",
  1284: "moonbeam",
  1329: "sei",
  1868: "soneium",
  2020: "ronin",
  2741: "abstract",
  5000: "mantle",
  8453: "base",
  33139: "apechain",
  34443: "mode",
  42161: "arbitrum",
  42220: "celo",
  43114: "avax",
  57073: "ink",
  59144: "linea",
  60808: "bob",
  80094: "berachain",
  81457: "blast",
  167000: "taiko",
  534352: "scroll",
};

const NATIVE_COINGECKO_ID: Record<number, string> = {
  1: "coingecko:ethereum",
  10: "coingecko:ethereum",
  25: "coingecko:crypto-com-chain",
  56: "coingecko:binancecoin",
  100: "coingecko:xdai",
  130: "coingecko:ethereum",
  137: "coingecko:matic-network",
  146: "coingecko:sonic-3",
  204: "coingecko:binancecoin",
  250: "coingecko:fantom",
  252: "coingecko:frax",
  324: "coingecko:ethereum",
  1088: "coingecko:metis-token",
  1135: "coingecko:ethereum",
  1284: "coingecko:moonbeam",
  1329: "coingecko:sei-network",
  1868: "coingecko:ethereum",
  2020: "coingecko:ronin",
  2741: "coingecko:ethereum",
  5000: "coingecko:mantle",
  8453: "coingecko:ethereum",
  33139: "coingecko:apecoin",
  34443: "coingecko:ethereum",
  42161: "coingecko:ethereum",
  42220: "coingecko:celo",
  43114: "coingecko:avalanche-2",
  57073: "coingecko:ethereum",
  59144: "coingecko:ethereum",
  60808: "coingecko:bitcoin",
  80094: "coingecko:berachain-bera",
  81457: "coingecko:ethereum",
  167000: "coingecko:ethereum",
  534352: "coingecko:ethereum",
};

function keyFor(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

function coinIdForAsset(asset: IdleAsset): string | null {
  if (isNativeToken(asset.token.address)) {
    return NATIVE_COINGECKO_ID[asset.chainId] ?? null;
  }
  const slug = LLAMA_CHAIN_SLUG[asset.chainId];
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
