import { useQuery } from "@tanstack/react-query";
import { useLlmInvocation } from "../../../../../../hooks/useLlmInvocation";
import { useLlmConfig } from "../../../../../../contexts/LlmConfigContext";
import { llmRecommendationSchema, type LlmRecommendationResponse } from "../../schema";
import { DEFAULT_CONFIG } from "../../types";
import type {
  VaultRecommendation,
  RecommendationPick,
} from "../../types";
import type { EarnVault } from "../../../types";
import type { IdleAsset } from "../../types";
import type { ParsedIntent } from "../schema";

const ALIAS_GROUPS: ReadonlyArray<ReadonlySet<string>> = [
  new Set(["ETH", "WETH"]),
  new Set(["BTC", "WBTC", "CBBTC", "TBTC"]),
  new Set(["USDC", "USDC.E", "USDBC"]),
  new Set(["USDT", "USDT.E"]),
  new Set(["MATIC", "WMATIC", "POL"]),
  new Set(["AVAX", "WAVAX"]),
  new Set(["BNB", "WBNB"]),
];

function normalizeUnderlyingKey(vault: EarnVault): string {
  const symbols = (vault.underlyingTokens ?? [])
    .map((t) => {
      const upper = t.symbol.toUpperCase();
      for (const group of ALIAS_GROUPS) {
        if (group.has(upper)) return [...group].sort().join("/");
      }
      return upper;
    })
    .sort();
  return `${vault.chainId}:${(vault.protocol.name ?? "").toLowerCase()}:${symbols.join("+")}`;
}

function isDuplicatePick(
  a: RecommendationPick,
  b: RecommendationPick,
): boolean {
  if (a.vaultSlug === b.vaultSlug) return true;
  if (a.vault.address && b.vault.address && a.vault.chainId === b.vault.chainId && a.vault.address.toLowerCase() === b.vault.address.toLowerCase()) return true;
  return normalizeUnderlyingKey(a.vault) === normalizeUnderlyingKey(b.vault);
}

// "live" → call Gemini, "off" → skip LLM entirely and use rules fallback.
const LLM_MODE =
  (import.meta.env.VITE_LLM_MODE as "live" | "fixture" | "off" | undefined) ??
  "live";

// How many of the already-ranked intent vaults we surface to the LLM. Must
// stay low — candidate payload size drives token cost and latency.
const MAX_CANDIDATES_DEFAULT = 8;
const MAX_CANDIDATES_DISCOVERY = 12;

interface IntentRecommendationArgs {
  /** Synthetic key used as forChainId/forTokenAddress in the returned rec. */
  synthChainId: number;
  synthTokenAddress: string;
  /** The parsed intent — shapes prompt context. */
  intent: ParsedIntent;
  /** Intent-filtered + pre-ranked vaults (top-first). */
  rankedVaults: EarnVault[];
  /** User's idle wallet balances — for personalized route/cost reasoning. */
  walletAssets: IdleAsset[];
  /** Source token symbol for per-asset mode (e.g. "BNB"). When set, the LLM
   *  should factor in entry cost from this specific token. */
  sourceTokenSymbol?: string;
  /** Source chain ID for the asset being recommended for. */
  sourceChainId?: number;
}

interface IntentRecommendationResult {
  recommendation: VaultRecommendation | null;
  llmError: string | null;
}

type InvokeFn = ReturnType<typeof useLlmInvocation>["invoke"];

/**
 * Produces a single VaultRecommendation (best / safest / alts + rationale) for
 * an intent-filtered vault set.
 *
 * Intentionally separate from `useVaultRecommendations`:
 *   • no per-asset fan-out — intent mode has exactly one target
 *   • no symbol-based candidate filter — intent filters already narrowed the pool
 *   • uses a different system prompt tailored to "goal satisfaction" rather
 *     than "what do with existing holdings"
 */
export function useIntentRecommendation(
  args: IntentRecommendationArgs | null
): IntentRecommendationResult & { isLoading: boolean; isFetching: boolean; refetch: () => void } {
  const { invoke } = useLlmInvocation();
  const { config } = useLlmConfig();
  const geminiModel = config.providers.gemini.model || "gemini-2.5-pro";

  const query = useQuery<IntentRecommendationResult>({
    queryKey: [
      "intent-recommendation",
      LLM_MODE,
      geminiModel,
      args?.synthChainId ?? 0,
      args?.synthTokenAddress ?? "",
      intentCacheKey(args?.intent),
      args?.rankedVaults.slice(0, args?.intent?.target_symbol === null && !args?.intent?.my_assets ? MAX_CANDIDATES_DISCOVERY : MAX_CANDIDATES_DEFAULT).map((v) => v.slug).join(",") ?? "",
      args?.walletAssets.map((a) => `${a.chainId}:${a.token.symbol}`).join(",") ?? "",
    ] as const,
    enabled: !!args && args.rankedVaults.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<IntentRecommendationResult> => {
      if (!args) return { recommendation: null, llmError: null };
      return buildRecommendation(invoke, args, geminiModel);
    },
  });

  return {
    recommendation: query.data?.recommendation ?? null,
    llmError: query.data?.llmError ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: () => void query.refetch(),
  };
}

export async function buildRecommendation(
  invoke: InvokeFn,
  args: IntentRecommendationArgs,
  model: string = "gemini-2.5-pro",
): Promise<IntentRecommendationResult> {
  const { synthChainId, synthTokenAddress, intent, rankedVaults } = args;
  const maxCandidates =
    intent.target_symbol === null && !intent.my_assets
      ? MAX_CANDIDATES_DISCOVERY
      : MAX_CANDIDATES_DEFAULT;
  const candidates = rankedVaults.slice(0, maxCandidates);

  // Only one vault → no meaningful ranking. Return it directly as best pick
  // with a rules-derived rationale. No LLM round-trip.
  if (candidates.length <= 1) {
    return {
      recommendation: rulesFallback(synthChainId, synthTokenAddress, intent, candidates),
      llmError: null,
    };
  }

  if (LLM_MODE === "off") {
    return {
      recommendation: rulesFallback(synthChainId, synthTokenAddress, intent, candidates),
      llmError: null,
    };
  }

  const { system, userText } = buildIntentPrompt(intent, candidates, args.walletAssets, args.sourceTokenSymbol, args.sourceChainId);

  let llmError: string | null = null;
  try {
    // Note: no responseMimeType:"application/json" — shared hook's stripJsonEnvelope handles
    // markdown-fenced output. No temperature:0.2 — uses provider defaults (slightly less
    // deterministic). No thought-part filtering — Gemini 2.5 Pro without thinkingConfig
    // doesn't emit thought parts in practice. maxRetries:2 instead of 3; shared hook only
    // retries schema_invalid + network/rate_limit/provider_down, not every error class.
    const res = await invoke<LlmRecommendationResponse>({
      task: "yield-recommendation",
      provider: "gemini",
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText },
      ],
      responseFormat: "json",
      schema: llmRecommendationSchema,
      maxRetries: 2,
    });
    if (!res.parsed) throw new Error("recommendation parse failed");
    const rec = res.parsed.recommendations[0];
    if (!rec) throw new Error("LLM returned empty recommendations array");

    const slugToVault = new Map(candidates.map((v) => [v.slug, v]));
    const resolve = (
      p: { vault_slug: string; rationale: string } | null
    ): RecommendationPick | null => {
      if (!p) return null;
      const v = slugToVault.get(p.vault_slug);
      if (!v) return null;
      return { vaultSlug: p.vault_slug, vault: v, rationale: p.rationale };
    };

    const bestPick = resolve(rec.best_pick);
    const safestPick = resolve(rec.safest_pick);
    const alternatives = rec.alternatives
      .map((a) => resolve(a))
      .filter((p): p is RecommendationPick => p !== null);

    // If the LLM returned slugs outside the candidate list, both picks
    // resolve to null. Fall back to rules so users get usable results.
    if (!bestPick && !safestPick && candidates.length > 0) {
      return {
        recommendation: rulesFallback(synthChainId, synthTokenAddress, intent, candidates),
        llmError: "LLM returned unknown vault slugs — used rules fallback",
      };
    }

    // Enforce distinct best/safest when candidate list allows — mirrors
    // enforceDistinctPicks in idle-sweep fallback.
    let finalSafest = safestPick;
    if (
      bestPick &&
      safestPick &&
      bestPick.vaultSlug === safestPick.vaultSlug &&
      candidates.length > 1
    ) {
      const runner = candidates.find((v) => v.slug !== bestPick.vaultSlug);
      if (runner) {
        finalSafest = {
          vaultSlug: runner.slug,
          vault: runner,
          rationale: `Next-most-conservative alternative after the best pick on ${runner.protocol.name}.`,
        };
      } else {
        finalSafest = null;
      }
    }

    // Deduplicate alternatives against best/safest picks
    const dedupedAlts: RecommendationPick[] = [];
    const seenPicks: RecommendationPick[] = [];
    if (bestPick) seenPicks.push(bestPick);
    if (finalSafest) seenPicks.push(finalSafest);
    for (const alt of alternatives) {
      if (seenPicks.some((sp) => isDuplicatePick(sp, alt))) continue;
      if (dedupedAlts.some((da) => isDuplicatePick(da, alt))) continue;
      dedupedAlts.push(alt);
    }

    return {
      recommendation: {
        forChainId: synthChainId,
        forTokenAddress: synthTokenAddress.toLowerCase(),
        bestPick,
        safestPick: finalSafest,
        alternatives: dedupedAlts,
        source: "ai",
        topRationale: rec.best_pick?.rationale ?? "",
      },
      llmError: null,
    };
  } catch (err) {
    llmError = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn("[intent-rec] LLM failed, falling back to rules:", llmError);
  }

  return {
    recommendation: rulesFallback(synthChainId, synthTokenAddress, intent, candidates),
    llmError,
  };
}

function rulesFallback(
  synthChainId: number,
  synthTokenAddress: string,
  intent: ParsedIntent,
  candidates: EarnVault[]
): VaultRecommendation | null {
  if (candidates.length === 0) return null;

  const byApy = [...candidates].sort(
    (a, b) => (b.analytics.apy.total ?? 0) - (a.analytics.apy.total ?? 0)
  );
  const byTvl = [...candidates].sort(
    (a, b) => Number(b.analytics.tvl.usd) - Number(a.analytics.tvl.usd)
  );

  // "Best" respects the user's objective; "safest" always leans on TVL.
  const best =
    intent.objective === "safest" ? byTvl[0] : byApy[0];
  const safest = byTvl.find((v) => !best || v.slug !== best.slug) ?? null;

  const usedSlugs = new Set<string>();
  if (best) usedSlugs.add(best.slug);
  if (safest) usedSlugs.add(safest.slug);
  const alternatives = byApy
    .filter((v) => !usedSlugs.has(v.slug))
    .slice(0, 2)
    .map((v) => ({
      vaultSlug: v.slug,
      vault: v,
      rationale: `Alt: ${formatApy(v.analytics.apy.total)} APY on ${v.protocol.name}.`,
    }));

  const mkPick = (v: EarnVault | null, reason: string): RecommendationPick | null =>
    v ? { vaultSlug: v.slug, vault: v, rationale: reason } : null;

  return {
    forChainId: synthChainId,
    forTokenAddress: synthTokenAddress.toLowerCase(),
    bestPick: mkPick(
      best,
      best
        ? `${objectiveLabel(intent.objective)}: ${formatApy(best.analytics.apy.total)} APY on ${best.protocol.name}${
            Number(best.analytics.tvl.usd) >= DEFAULT_CONFIG.minTvlForSafe
              ? ", TVL above safety floor."
              : "."
          }`
        : "no candidate"
    ),
    safestPick: mkPick(
      safest,
      safest
        ? `Highest TVL among remaining candidates ($${formatCompactUsd(Number(safest.analytics.tvl.usd))}).`
        : "no alternative candidate"
    ),
    alternatives,
    source: "rules",
    topRationale: best ? `rules:best=${best.slug}` : "rules:none",
  };
}

/**
 * Builds the system prompt and user text for the intent recommendation LLM call.
 * Extracted from the old buildGeminiIntentRequest — all string content is preserved verbatim.
 */
function buildIntentPrompt(
  intent: ParsedIntent,
  candidates: EarnVault[],
  walletAssets: IdleAsset[],
  sourceTokenSymbol?: string,
  sourceChainId?: number,
): { system: string; userText: string } {
  const system = `You are a DeFi yield strategist with deep knowledge of vault mechanics, protocol risk, and yield sustainability. You evaluate vaults the way a seasoned DeFi portfolio manager would — not just by raw numbers, but by understanding what drives those numbers and whether they'll last.

You will be given:
(a) The user's parsed intent (target token/chain/objective/filters)
(b) A pre-filtered candidate list with detailed analytics
(c) The user's WALLET PORTFOLIO — tokens they actually hold, on which chains, with USD values

Your job: pick one "best_pick", one "safest_pick", and up to 3 "alternatives".

OUTPUT RULES:
- best_pick and safest_pick MUST be different vault_slugs whenever 2+ candidates exist.
- Alternatives must differ from best_pick and safest_pick.
- ONLY return slugs from the candidate list — inventing a slug rejects the response.
- Rationales: ONE sentence, ≤280 chars, explain WHY this vault fits the intent. No raw numbers.

═══ VAULT INTELLIGENCE ═══

APY COMPOSITION — the most important signal:
Each vault has apy_base (organic yield from lending/fees) and apy_reward (token incentive emissions).
- apy_base is SUSTAINABLE — it comes from real economic activity (borrowers paying interest, trading fees).
- apy_reward is VOLATILE — it comes from token emissions that dilute over time. High reward APY means the protocol is paying you in its own token to attract deposits. These tokens often lose value.
- A vault with 8% base + 2% reward is BETTER than 3% base + 25% reward, even though the second shows higher total APY.
- For "safest" picks: heavily prefer high base-to-total ratio. A vault where >70% of APY is base yield is sustainable.
- For "highest" picks: total APY matters more, but still flag if >80% is reward-based.
- For "balanced"/"best" picks: prefer vaults where base yield is meaningful (>40% of total). The best vault balances strong organic yield with reasonable total return.

APY TRENDS — stability matters:
Each vault has apy_1d, apy_7d, apy_30d (historical snapshots).
- STABLE: apy_total ≈ apy_7d ≈ apy_30d → reliable, predictable yield.
- SPIKING: apy_total >> apy_7d or apy_30d → likely temporary. New incentive program or low-utilization spike. Will revert.
- DECLINING: apy_total << apy_30d → yield is drying up. Incentives ending, utilization dropping, or rewards being diluted.
- For "best" picks: prefer STABLE vaults. A consistent 10% is better than a spiking 30% that was 5% last week.
- For "safest" picks: STABLE is mandatory. Any significant spike or decline is a red flag.

TVL AS TRUST SIGNAL:
TVL is not just a number — it represents how much real capital trusts this contract.
- >$100M: Battle-tested. Many sophisticated depositors have vetted this.
- $10M-$100M: Established but smaller. Acceptable for most users.
- $1M-$10M: Emerging. Only recommend if APY is compelling AND protocol is known.
- <$1M: High risk. Only for "highest" objective with strong caveats.
- For "safest" picks: strongly prefer >$50M TVL.
- When two vaults have similar APY (within 2%), ALWAYS prefer the one with higher TVL.

PROTOCOL REPUTATION:
Established protocols have survived multiple market cycles, audits, and attacks:
- TIER 1 (battle-tested): Aave, Compound, Lido, MakerDAO, Curve, Convex, Uniswap
- TIER 2 (established): Morpho, Euler, Yearn, Beefy, Balancer, Pendle, Radiant
- TIER 3 (newer): Everything else — not bad, but requires stronger APY to justify
- For "safest" picks: prefer Tier 1-2. For "highest": any tier with sufficient TVL.
- For "best"/"balanced": Tier 1-2 with competitive APY is the sweet spot.

VAULT TYPE AWARENESS:
- Single-asset vaults (lending, staking): No impermanent loss. Safest category.
- LP vaults (liquidity provision): Carry impermanent loss risk. Higher APY compensates.
  - Stable-stable pairs (USDC/USDT): Minimal IL, good for conservative users.
  - Token-stable pairs (ETH/USDC): Moderate IL, standard risk-return.
  - Token-token pairs (ETH/BTC): Higher IL, only for "highest" objective.
- Auto-compounding vaults: Generally better than manual — compound frequency matters.

═══ WALLET PERSONALIZATION ═══

Use the wallet_portfolio to make cost-aware recommendations:
- PREFER vaults on chains where the user already has assets (no bridge needed).
- PREFER vaults whose underlying token matches what the user holds (no swap needed).
- If the user has $20 of ETH on Base and $10 on Arbitrum, a Base vault is better.
- Factor deposit size: a $5 deposit into a cross-chain vault is wasteful.
- If wallet is empty/disconnected, fall back to pure intent-based ranking.

ENTRY COST FRAMEWORK:
- Same chain, same token: ~$0.01–0.50 (L2) or $5–20 (L1)
- Same chain, swap needed: ~$0.05–0.50 on L2
- Cross-chain (L2→L2): ~$0.50–3
- Cross-chain via L1: ~$5–25+
- break_even_months ≈ (entry_cost / deposit_amount) / (apy / 100 / 12)
- If break-even > 6 months, it's a BAD recommendation.

═══ OBJECTIVE INTERPRETATION ═══

"highest": Maximize total APY. Still avoid obviously unsustainable vaults (100%+ reward-only APY with <$1M TVL). Consider entry cost from wallet.
"safest": Maximize confidence the yield will persist. High TVL, Tier 1-2 protocol, high base-to-total ratio, stable APY trend. Prefer same-chain as user.
"balanced" (also: "best", "top"): The SMART choice. Good risk-adjusted return. Strong organic yield, reasonable TVL, established protocol, low entry cost from user's position. This is what a knowledgeable friend would recommend.`;

  const isDiscovery = intent.target_symbol === null && !intent.my_assets;
  const discoveryGuidance = isDiscovery
    ? `\n\nDISCOVERY MODE: The user is exploring the vault universe broadly. Rank by the stated objective without asset-specific constraints. Diversity is valuable — prefer recommending vaults across different protocols and chains rather than multiple vaults from the same protocol. Do not recommend multiple vaults that hold the same underlying token on the same chain.`
    : "";

  const dedupGuidance = `\n\nWRAPPED TOKEN EQUIVALENCE: ETH/WETH, BTC/WBTC, MATIC/WMATIC are the same economic asset. Do not recommend two vaults as separate picks if they differ only in wrapped vs. unwrapped token naming.`;

  const sourceGuidance = sourceTokenSymbol
    ? `\n\nSOURCE ASSET CONTEXT: The user holds ${sourceTokenSymbol} on chain ${sourceChainId ?? "unknown"}. This is what they will deposit FROM — it will be swapped/bridged into the vault's underlying token automatically. Strongly prefer vaults where the entry cost is low relative to the expected yield. A vault on the same chain as the source is cheaper. A vault whose underlying token is the same as the source token is cheapest.`
    : "";

  const fullSystem = system + discoveryGuidance + dedupGuidance + sourceGuidance;

  // Build a compact portfolio summary for the LLM
  const portfolio = walletAssets
    .filter((a) => a.amountUsd != null && a.amountUsd > 0.5)
    .sort((a, b) => (b.amountUsd ?? 0) - (a.amountUsd ?? 0))
    .slice(0, 15) // cap to keep prompt small
    .map((a) => ({
      chain_id: a.chainId,
      chain_name: a.chainName,
      token_symbol: a.token.symbol,
      amount_usd: Math.round((a.amountUsd ?? 0) * 100) / 100,
    }));

  const userPayload = {
    intent: {
      target_symbol: intent.target_symbol,
      target_chain_id: intent.target_chain_id,
      objective: intent.objective,
      min_apy_pct: intent.min_apy_pct,
      max_apy_pct: intent.max_apy_pct,
      min_tvl_usd: intent.min_tvl_usd,
      include_protocols: intent.include_protocols,
      exclude_protocols: intent.exclude_protocols,
    },
    wallet_portfolio: portfolio,
    candidates: candidates.map((v) => ({
      slug: v.slug,
      name: v.name ?? v.slug,
      protocol: v.protocol.name,
      chain_id: v.chainId,
      tags: v.tags,
      apy_total: v.analytics.apy.total,
      apy_base: v.analytics.apy.base,
      apy_reward: v.analytics.apy.reward,
      apy_1d: v.analytics.apy1d,
      apy_7d: v.analytics.apy7d,
      apy_30d: v.analytics.apy30d,
      tvl_usd: v.analytics.tvl.usd,
      underlying_symbols: (v.underlyingTokens ?? []).map((t) => t.symbol),
    })),
    required_output_shape: {
      recommendations: [
        {
          for_chain_id: candidates[0]?.chainId ?? 1,
          for_token_address: "0x0000000000000000000000000000000000000000",
          best_pick: { vault_slug: "string", rationale: "string (≤280 chars)" },
          safest_pick: { vault_slug: "string", rationale: "string (≤280 chars)" },
          alternatives: [{ vault_slug: "string", rationale: "string (≤280 chars)" }],
        },
      ],
    },
  };

  const userText =
    "INPUT:\n" +
    JSON.stringify(userPayload) +
    "\n\nReturn ONLY the JSON object matching required_output_shape. No prose, no code fences.";

  return { system: fullSystem, userText };
}

function intentCacheKey(intent: ParsedIntent | undefined): string {
  if (!intent) return "";
  return [
    intent.target_symbol ?? "",
    intent.my_assets ? `my:${intent.routing_mode}` : "",
    intent.target_chain_id ?? "",
    intent.objective,
    intent.min_apy_pct ?? "",
    intent.max_apy_pct ?? "",
    intent.min_tvl_usd ?? "",
    intent.include_protocols.join("+"),
    intent.exclude_protocols.join("+"),
    intent.result_count ?? "",
  ].join("|");
}

function formatApy(apy: number | null): string {
  if (apy == null) return "—";
  return `${apy.toFixed(2)}%`;
}

function formatCompactUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

function objectiveLabel(obj: ParsedIntent["objective"]): string {
  switch (obj) {
    case "highest":
      return "Highest APY in filtered set";
    case "safest":
      return "Highest TVL in filtered set";
    default:
      return "Top balanced pick";
  }
}
