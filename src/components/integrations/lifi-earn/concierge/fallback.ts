import type { EarnVault } from "../types";
import type { IdleAsset, VaultRecommendation, RecommendationPick } from "./types";
import { DEFAULT_CONFIG } from "./types";

// ── Chain cost tiers ────────────────────────────────────────────────────────
// Used to enrich candidate data sent to the AI and to pre-filter unviable
// cross-chain routes for small deposits.

export type ChainCostTier = "L1" | "L2";

// Chains with significant per-tx gas costs ($5-20+ per tx).
const L1_CHAINS = new Set([1, 43114, 56, 25, 2020, 14]);

export function chainCostTier(chainId: number): ChainCostTier {
  return L1_CHAINS.has(chainId) ? "L1" : "L2";
}

/**
 * Pre-filter candidates that are obviously unviable given the deposit size.
 * This runs BEFORE the top-N slice so the LLM only sees reasonable options.
 *
 * Rules (applied per route type):
 * - direct:         always viable
 * - swap:           viable on L2 for any amount; on L1 only if > $50 (swap gas)
 * - bridge:         viable if amount > $20 (L2→L2) or > $100 (to/from L1)
 * - bridge_and_swap: viable if amount > $50 (L2→L2 only, already filtered in candidatesForAsset)
 */
export function filterByViability(
  candidates: EarnVault[],
  asset: IdleAsset,
): EarnVault[] {
  const amountUsd = asset.amountUsd;

  // If we don't know the USD value, assume it's small and only keep
  // same-chain vaults. Cross-chain deposits have a cost floor ($1-20+)
  // that makes them destructive for any amount we can't confirm is large.
  if (amountUsd == null || amountUsd <= 0) {
    return candidates.filter((v) => v.chainId === asset.chainId);
  }

  return candidates.filter((v) => {
    const route = classifyRoute(asset, v);

    if (route === "direct") return true;

    if (route === "swap") {
      // Swap gas on L1 is ~$5-15; on L2 it's negligible
      return chainCostTier(asset.chainId) === "L2" || amountUsd >= 50;
    }

    if (route === "bridge") {
      if (amountUsd < 20) return false;
      if (amountUsd < 100 && chainCostTier(v.chainId) === "L1") return false;
      return true;
    }

    // bridge_and_swap: already L2→L2 only (from candidatesForAsset)
    return amountUsd >= 50;
  });
}

// ── Symbol alias groups ────────────────────────────────────────────────────
// Near-1:1 pegs: ETH/WETH, BTC/WBTC, MATIC/WMATIC/POL, etc.
// When a user holds native ETH, vaults accepting WETH should match.
const SYMBOL_ALIAS_GROUPS: ReadonlyArray<ReadonlySet<string>> = [
  new Set(["ETH", "WETH"]),
  new Set(["BTC", "WBTC", "CBBTC", "TBTC"]),
  new Set(["USDC", "USDC.E", "USDBC"]),
  new Set(["USDT", "USDT.E"]),
  new Set(["DAI", "DAI.E"]),
  new Set(["MATIC", "WMATIC", "POL"]),
  new Set(["AVAX", "WAVAX"]),
  new Set(["BNB", "WBNB"]),
  new Set(["S", "WS"]),
];

function symbolAliases(symbol: string): ReadonlySet<string> {
  const upper = symbol.toUpperCase();
  for (const group of SYMBOL_ALIAS_GROUPS) {
    if (group.has(upper)) return group;
  }
  return new Set([upper]);
}

// ── Route types ────────────────────────────────────────────────────────────
// How a user's idle asset reaches a vault's underlying token.
export type RouteType = "direct" | "swap" | "bridge" | "bridge_and_swap";

export function classifyRoute(
  asset: IdleAsset,
  vault: EarnVault,
): RouteType {
  const isSameChain = vault.chainId === asset.chainId;
  const aliases = symbolAliases(asset.token.symbol);
  const hasSymbolMatch = (vault.underlyingTokens ?? []).some((u) =>
    aliases.has(u.symbol.toUpperCase())
  );
  if (isSameChain && hasSymbolMatch) return "direct";
  if (isSameChain && !hasSymbolMatch) return "swap";
  if (!isSameChain && hasSymbolMatch) return "bridge";
  return "bridge_and_swap";
}

// Candidate set across four tiers, capped to keep the LLM prompt manageable:
//
//  1. direct   — same chain, same token alias (always included)
//  2. swap     — same chain, different token (cheap on L2s)
//  3. bridge   — different chain, same token alias
//  4. bridge+swap — different chain, different token (cheap when both L2)
//
// Tiers 2-4 are only populated when the source chain is an L2 (low tx costs).
// Within each tier, vaults are sorted by APY descending and capped so the
// total stays under maxCandidatesPerAsset × 2 (caller slices to final cap).
export function candidatesForAsset(
  asset: IdleAsset,
  allVaults: EarnVault[]
): EarnVault[] {
  const tokenAddr = asset.token.address.toLowerCase();
  const aliases = symbolAliases(asset.token.symbol);
  const sourceIsL2 = chainCostTier(asset.chainId) === "L2";

  const direct: EarnVault[] = [];
  const swap: EarnVault[] = [];
  const bridge: EarnVault[] = [];
  const bridgeAndSwap: EarnVault[] = [];

  for (const v of allVaults) {
    if (!v.isTransactional) continue;

    const isSameChain = v.chainId === asset.chainId;
    const symbols = (v.underlyingTokens ?? []).map((u) => u.symbol.toUpperCase());
    const hasAliasMatch = symbols.some((s) => aliases.has(s));
    const hasExactAddr = isSameChain && (v.underlyingTokens ?? []).some(
      (u) => u.address.toLowerCase() === tokenAddr
    );

    if (hasExactAddr || (isSameChain && hasAliasMatch)) {
      direct.push(v);
    } else if (isSameChain && !hasAliasMatch) {
      // Same chain, needs a token swap — only viable on L2
      if (sourceIsL2) swap.push(v);
    } else if (!isSameChain && hasAliasMatch) {
      bridge.push(v);
    } else if (!isSameChain && !hasAliasMatch) {
      // Cross-chain + swap — only viable when both chains are cheap L2s
      if (sourceIsL2 && chainCostTier(v.chainId) === "L2") {
        bridgeAndSwap.push(v);
      }
    }
  }

  // Sort each tier by APY descending — the caller will slice to final cap.
  const byApy = (a: EarnVault, b: EarnVault) =>
    (b.analytics.apy.total ?? 0) - (a.analytics.apy.total ?? 0);

  direct.sort(byApy);
  swap.sort(byApy);
  bridge.sort(byApy);
  bridgeAndSwap.sort(byApy);

  // Allocate slots: direct gets all it needs, remaining tiers share the rest.
  // Cap swap/bridge/bridgeAndSwap to top-N each so we don't flood the prompt.
  const MAX_PER_TIER = 4;

  return [
    ...direct,
    ...swap.slice(0, MAX_PER_TIER),
    ...bridge.slice(0, MAX_PER_TIER),
    ...bridgeAndSwap.slice(0, MAX_PER_TIER),
  ];
}

// Deterministic best/safest picker used when the LLM is disabled or fails.
// best = highest APY among high-TVL vaults; safest = highest TVL ≥ minTvlForSafe; alts = next 2 APY.
export function pickByRules(
  asset: IdleAsset,
  allVaults: EarnVault[],
  minTvlForSafe = DEFAULT_CONFIG.minTvlForSafe
): VaultRecommendation {
  const candidates = candidatesForAsset(asset, allVaults);

  const byApyDesc = [...candidates].sort(
    (a, b) => (b.analytics.apy.total ?? 0) - (a.analytics.apy.total ?? 0)
  );

  const byTvlDesc = [...candidates]
    .filter((v) => Number(v.analytics.tvl.usd) >= minTvlForSafe)
    .sort((a, b) => Number(b.analytics.tvl.usd) - Number(a.analytics.tvl.usd));

  // "Best" = highest APY among vaults that meet the TVL safety floor. Only
  // fall back to the overall APY leader when no vault meets the floor — this
  // avoids recommending tiny-TVL / high-price-impact vaults as "best".
  const best =
    byTvlDesc.length > 0
      ? [...byTvlDesc].sort(
          (a, b) => (b.analytics.apy.total ?? 0) - (a.analytics.apy.total ?? 0)
        )[0]
      : byApyDesc[0] ?? null;

  // "Safest" must differ from "best" when possible. If the TVL-filtered list
  // only contains the best pick, fall back to the next highest-TVL candidate
  // regardless of the floor so we still surface an alternative.
  let safest: EarnVault | null =
    byTvlDesc.find((v) => !best || v.slug !== best.slug) ?? null;
  if (!safest && candidates.length > 1) {
    const byTvlAll = [...candidates].sort(
      (a, b) => Number(b.analytics.tvl.usd) - Number(a.analytics.tvl.usd)
    );
    safest = byTvlAll.find((v) => !best || v.slug !== best.slug) ?? null;
  }

  const usedSlugs = new Set<string>();
  if (best) usedSlugs.add(best.slug);
  if (safest) usedSlugs.add(safest.slug);
  const alternatives = byApyDesc
    .filter((v) => !usedSlugs.has(v.slug))
    .slice(0, 2);

  const mkPick = (v: EarnVault | null, reason: string) =>
    v
      ? {
          vaultSlug: v.slug,
          vault: v,
          rationale: reason,
        }
      : null;

  return {
    forChainId: asset.chainId,
    forTokenAddress: asset.token.address.toLowerCase(),
    bestPick: mkPick(
      best,
      best
        ? `Highest APY (${formatApy(best.analytics.apy.total)}) among ${candidates.length} eligible vaults.`
        : "no candidate"
    ),
    safestPick: mkPick(
      safest,
      safest
        ? `Highest TVL ($${formatCompactUsd(Number(safest.analytics.tvl.usd))}) above the safety floor.`
        : "no candidate meets TVL floor"
    ),
    alternatives: alternatives.map((v) => ({
      vaultSlug: v.slug,
      vault: v,
      rationale: `Alt: ${formatApy(v.analytics.apy.total)} APY on ${v.protocol.name}.`,
    })),
    source: "rules",
    topRationale: best ? `rules:best=${best.slug}` : "rules:none",
  };
}

export function pickAllByRules(
  assets: IdleAsset[],
  allVaults: EarnVault[],
  minTvlForSafe?: number
): VaultRecommendation[] {
  return assets.map((a) => pickByRules(a, allVaults, minTvlForSafe));
}

// If best and safest collide on the same vault, swap safest for the
// highest-TVL alternative so the card doesn't show two identical picks.
export function enforceDistinctPicks(
  rec: VaultRecommendation,
  candidates: EarnVault[],
  minTvlForSafe = DEFAULT_CONFIG.minTvlForSafe
): VaultRecommendation {
  const { bestPick, safestPick, alternatives } = rec;
  if (!bestPick || !safestPick) return rec;
  if (bestPick.vaultSlug !== safestPick.vaultSlug) return rec;

  // Alternatives first (LLM-vetted), then remaining candidates.
  const bestSlug = bestPick.vaultSlug;
  const altPool: EarnVault[] = [];
  const seen = new Set<string>([bestSlug]);
  for (const a of alternatives) {
    if (seen.has(a.vaultSlug)) continue;
    seen.add(a.vaultSlug);
    altPool.push(a.vault);
  }
  for (const c of candidates) {
    if (seen.has(c.slug)) continue;
    seen.add(c.slug);
    altPool.push(c);
  }

  if (altPool.length === 0) {
    return { ...rec, safestPick: null };
  }

  const sortedByTvl = [...altPool].sort(
    (a, b) => Number(b.analytics.tvl.usd) - Number(a.analytics.tvl.usd)
  );
  const qualified =
    sortedByTvl.find((v) => Number(v.analytics.tvl.usd) >= minTvlForSafe) ??
    sortedByTvl[0] ??
    null;
  if (!qualified) {
    return { ...rec, safestPick: null };
  }

  const replacement: RecommendationPick = {
    vaultSlug: qualified.slug,
    vault: qualified,
    rationale: `${qualified.protocol.name} on chain ${qualified.chainId} — next-most-conservative alternative after the best pick.`,
  };

  const trimmedAlts = alternatives.filter(
    (a) => a.vaultSlug !== replacement.vaultSlug
  );

  return { ...rec, safestPick: replacement, alternatives: trimmedAlts };
}

function formatApy(apy: number | null): string {
  if (apy == null) return "—";
  // LI.FI Earn API already returns apy.total as a percent — do NOT multiply.
  return `${apy.toFixed(2)}%`;
}

function formatCompactUsd(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}
