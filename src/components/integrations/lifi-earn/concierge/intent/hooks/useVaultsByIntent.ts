import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchEarnVaults } from "../../../earnApi";
import type { EarnVault } from "../../../types";
import type { ParsedIntent } from "../schema";

/**
 * Returns the complete vault universe (React Query dedupes on the shared
 * ["earn-vaults", "all"] key with useIdleBalances, so both panels share one
 * network fetch). Then `rankVaultsForIntent` below filters + sorts in-memory
 * using the parsed intent.
 */
function useAllEarnVaults() {
  return useQuery({
    queryKey: ["earn-vaults", "all"],
    queryFn: async () => {
      const SAFETY_MAX_PAGES = 200;
      const all: EarnVault[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < SAFETY_MAX_PAGES; i++) {
        const page = await fetchEarnVaults({ cursor });
        all.push(...page.data);
        if (!page.nextCursor) return all;
        cursor = page.nextCursor;
      }
      // eslint-disable-next-line no-console
      console.warn(
        `[intent] earn-vaults pagination hit safety cap (${SAFETY_MAX_PAGES} pages)`
      );
      return all;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface IntentVaultsResult {
  ranked: EarnVault[];
  isLoading: boolean;
  isError: boolean;
  totalBeforeFilter: number;
  /** When true, the strict symbol filter returned zero results so we relaxed
   *  it — vaults in the ranked list may require a token swap before deposit. */
  symbolRelaxed: boolean;
  /** The original symbol that was relaxed (e.g. "MATIC") — for UI hints. */
  relaxedFromSymbol: string | null;
  /** Breakdown of why candidates were dropped — helps the UI explain an empty list. */
  rejection: {
    notTransactional: number;
    symbolMismatch: number;
    chainMismatch: number;
    apyBelowFloor: number;
    apyAboveCeiling: number;
    tvlBelowFloor: number;
    protocolExcluded: number;
    protocolNotIncluded: number;
  };
}

/**
 * One-shot filter + rank over the full vault universe based on a parsed intent.
 *
 * Unlike the holdings-driven concierge (which symbol-matches against wallet
 * assets), this path sees every transactional vault. The LLM-parsed
 * `target_symbol` decides which vaults become candidates, not the user's
 * current bag.
 */
export function useVaultsByIntent(
  intent: ParsedIntent | null,
  maxResults = 20
): IntentVaultsResult {
  const { data: allVaults, isLoading, isError } = useAllEarnVaults();

  return useMemo(() => {
    const mkBlank = (): IntentVaultsResult => ({
      ranked: [],
      isLoading,
      isError,
      totalBeforeFilter: allVaults?.length ?? 0,
      symbolRelaxed: false,
      relaxedFromSymbol: null,
      rejection: {
        notTransactional: 0,
        symbolMismatch: 0,
        chainMismatch: 0,
        apyBelowFloor: 0,
        apyAboveCeiling: 0,
        tvlBelowFloor: 0,
        protocolExcluded: 0,
        protocolNotIncluded: 0,
      },
    });
    if (!allVaults || allVaults.length === 0) return mkBlank();
    if (!intent) return mkBlank();

    const result = mkBlank();
    const ranked = rankVaultsForIntent(allVaults, intent, maxResults, result.rejection);

    // If the strict symbol filter produced zero results and there IS a
    // target_symbol, retry without it — surfaces cross-asset vaults the user
    // can reach via a swap (handled by LI.FI Composer at deposit time).
    if (ranked.length === 0 && intent.target_symbol && result.rejection.symbolMismatch > 0) {
      const relaxedIntent: ParsedIntent = { ...intent, target_symbol: null };
      const relaxedResult = mkBlank();
      const relaxedRanked = rankVaultsForIntent(allVaults, relaxedIntent, maxResults, relaxedResult.rejection);
      return {
        ...relaxedResult,
        ranked: relaxedRanked,
        totalBeforeFilter: allVaults.length,
        symbolRelaxed: true,
        relaxedFromSymbol: intent.target_symbol,
      };
    }

    return {
      ...result,
      ranked,
      totalBeforeFilter: allVaults.length,
    };
  }, [allVaults, intent, maxResults, isLoading, isError]);
}

/**
 * Symbol equivalence groups. When a user says "ETH" they almost always mean
 * "an ETH-denominated position" — 99% of vaults on L2s wrap this as WETH in
 * their underlyingTokens list. Without aliasing, a literal `symbols.includes
 * ("ETH")` check rejects ~every WETH vault on every chain and we surface one
 * lonely native-ETH vault.
 *
 * Scope intentionally conservative: only near-1:1 pegs live here. Liquid
 * staking (stETH, rETH, weETH) and restaking derivatives earn yield
 * independently and are NOT treated as ETH — including them would silently
 * mix yield sources the user didn't ask for.
 */
const SYMBOL_ALIAS_GROUPS: ReadonlyArray<ReadonlySet<string>> = [
  new Set(["ETH", "WETH"]),
  new Set(["BTC", "WBTC", "CBBTC", "TBTC"]),
  new Set(["USDC", "USDC.E", "USDBC"]),
  new Set(["USDT", "USDT.E"]),
  new Set(["DAI", "DAI.E"]),
  new Set(["MATIC", "WMATIC", "POL"]),
  new Set(["AVAX", "WAVAX"]),
  new Set(["BNB", "WBNB"]),
];

function symbolAliasSet(symbol: string): ReadonlySet<string> {
  const upper = symbol.toUpperCase();
  for (const group of SYMBOL_ALIAS_GROUPS) {
    if (group.has(upper)) return group;
  }
  return new Set([upper]);
}

export function rankVaultsForIntent(
  allVaults: EarnVault[],
  intent: ParsedIntent,
  maxResults: number,
  rejection: IntentVaultsResult["rejection"]
): EarnVault[] {
  const targetSymbol = intent.target_symbol?.toUpperCase() ?? null;
  const targetAliases = targetSymbol !== null ? symbolAliasSet(targetSymbol) : null;
  const targetChainId = intent.target_chain_id;
  const minApy = intent.min_apy_pct;
  const maxApy = intent.max_apy_pct;
  const minTvl = intent.min_tvl_usd;
  const includeProtocols = intent.include_protocols.map((p) => p.toLowerCase());
  const excludeProtocols = intent.exclude_protocols.map((p) => p.toLowerCase());

  const filtered: EarnVault[] = [];
  for (const v of allVaults) {
    if (!v.isTransactional) {
      rejection.notTransactional++;
      continue;
    }
    if (targetChainId !== null && v.chainId !== targetChainId) {
      rejection.chainMismatch++;
      continue;
    }
    if (targetAliases !== null) {
      const symbols = (v.underlyingTokens ?? []).map((t) =>
        t.symbol.toUpperCase()
      );
      if (!symbols.some((s) => targetAliases.has(s))) {
        rejection.symbolMismatch++;
        continue;
      }
    }
    const apy = v.analytics.apy.total ?? 0;
    // Always reject truly zero-yield vaults unless the user explicitly set
    // min_apy to 0. A vault reporting 0% APY is either stale data or a vault
    // with no yield — never a useful recommendation.
    if (apy <= 0 && minApy !== 0) {
      rejection.apyBelowFloor++;
      continue;
    }
    if (minApy !== null && minApy > 0 && apy < minApy) {
      rejection.apyBelowFloor++;
      continue;
    }
    if (maxApy !== null && apy > maxApy) {
      rejection.apyAboveCeiling++;
      continue;
    }
    if (minTvl !== null && Number(v.analytics.tvl.usd) < minTvl) {
      rejection.tvlBelowFloor++;
      continue;
    }
    const protoSlug = (v.protocol.name ?? "").toLowerCase();
    if (excludeProtocols.length > 0 && excludeProtocols.includes(protoSlug)) {
      rejection.protocolExcluded++;
      continue;
    }
    if (includeProtocols.length > 0 && !includeProtocols.includes(protoSlug)) {
      rejection.protocolNotIncluded++;
      continue;
    }
    filtered.push(v);
  }

  // Sort by objective.
  const sorted = [...filtered];
  if (intent.objective === "highest") {
    sorted.sort(
      (a, b) => (b.analytics.apy.total ?? 0) - (a.analytics.apy.total ?? 0)
    );
  } else if (intent.objective === "safest") {
    sorted.sort(
      (a, b) => Number(b.analytics.tvl.usd) - Number(a.analytics.tvl.usd)
    );
  } else {
    // balanced: normalize apy and tvl to [0,1] within filtered set and blend.
    const apys = sorted.map((v) => v.analytics.apy.total ?? 0);
    const tvls = sorted.map((v) => Number(v.analytics.tvl.usd));
    const maxApyVal = Math.max(1, ...apys);
    const maxTvlVal = Math.max(1, ...tvls);
    sorted.sort((a, b) => {
      const aScore =
        ((a.analytics.apy.total ?? 0) / maxApyVal) * 0.55 +
        (Number(a.analytics.tvl.usd) / maxTvlVal) * 0.45;
      const bScore =
        ((b.analytics.apy.total ?? 0) / maxApyVal) * 0.55 +
        (Number(b.analytics.tvl.usd) / maxTvlVal) * 0.45;
      return bScore - aScore;
    });
  }

  // For generic discovery (no target symbol), apply protocol-diversity cap
  // so the LLM sees options across protocols, not 12 Aave vaults.
  // Skip when the user explicitly filtered by protocol (e.g. "top 4 Aave vaults").
  if (targetSymbol === null && includeProtocols.length === 0) {
    const protoCounts = new Map<string, number>();
    const diverse: EarnVault[] = [];
    for (const v of sorted) {
      const proto = (v.protocol.name ?? "").toLowerCase();
      const count = protoCounts.get(proto) ?? 0;
      if (count >= 3) continue;
      protoCounts.set(proto, count + 1);
      diverse.push(v);
      if (diverse.length >= maxResults) break;
    }
    return diverse;
  }

  return sorted.slice(0, maxResults);
}
