import { useQuery } from "@tanstack/react-query";
import { postLlmRecommend } from "../../../earnApi";
import { llmRecommendationSchema } from "../../schema";
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
}

interface IntentRecommendationResult {
  recommendation: VaultRecommendation | null;
  llmError: string | null;
}

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
  const query = useQuery<IntentRecommendationResult>({
    queryKey: [
      "intent-recommendation",
      LLM_MODE,
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
      return buildRecommendation(args);
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

async function buildRecommendation(
  args: IntentRecommendationArgs
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

  const request = buildGeminiIntentRequest(intent, candidates, args.walletAssets);
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await postLlmRecommend(request);
      const text = extractGeminiText(raw);
      if (!text) throw new Error("empty LLM response");
      const json = safeParseJson(text);
      if (!json) throw new Error("LLM did not return JSON");
      const result = llmRecommendationSchema.safeParse(json);
      if (!result.success) {
        throw new Error(
          `schema: ${result.error.issues[0]?.path.join(".") ?? "?"}: ${
            result.error.issues[0]?.message ?? "unknown"
          }`
        );
      }
      const rec = result.data.recommendations[0];
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
      const msg = err instanceof Error ? err.message : String(err);
      lastError = msg;
      // eslint-disable-next-line no-console
      console.warn(`[intent-rec] LLM attempt ${attempt + 1} failed:`, msg);
    }
  }

  return {
    recommendation: rulesFallback(synthChainId, synthTokenAddress, intent, candidates),
    llmError: lastError,
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

function buildGeminiIntentRequest(intent: ParsedIntent, candidates: EarnVault[], walletAssets: IdleAsset[]) {
  const system = `You are a yield strategy assistant ranking vaults against a user's explicit intent. You will be given:
  (a) The user's parsed intent (target token/chain/objective/filters)
  (b) A pre-filtered candidate list that already satisfies every hard constraint
  (c) The user's WALLET PORTFOLIO — tokens they actually hold, on which chains, with USD values

Your job is to pick one "best_pick" and one "safest_pick" from the candidates, plus up to 3 "alternatives". Rules:
- best_pick and safest_pick MUST be different vault_slugs whenever the candidate list contains two or more vaults.
- Alternatives must differ from best_pick and safest_pick.
- ONLY return slugs that appear in the candidate list — inventing a slug rejects the response.
- Rationales must be ONE sentence, under 280 chars, and specific to why that vault fits THIS intent. Do NOT write APY or TVL numbers in rationales.

PERSONALIZATION (critical — use the wallet_portfolio):
The user's wallet shows what they ACTUALLY hold. Use this to make smart recommendations:
- PREFER vaults on chains where the user already has assets — no bridge needed, deposit is cheap.
- PREFER vaults whose underlying token matches (or is easily swappable from) a token the user holds — swap is cheaper than bridge.
- If the user has $20 of ETH on Base and $10 on Arbitrum, a Base vault is better because they have more capital there.
- Factor in DEPOSIT SIZE from their holdings when evaluating entry costs. A $5 deposit into a cross-chain vault with bridge fees is wasteful.
- If the wallet is empty or disconnected (no portfolio data), fall back to pure intent-based ranking.

ENTRY COST FRAMEWORK:
- Same chain, same/wrapped token: ~$0.01–0.50 (L2) or $5–20 (L1)
- Same chain, different token (swap): ~$0.05–0.50 on L2
- Cross-chain bridge (L2→L2): ~$0.50–3
- Cross-chain involving L1: ~$5–25+
- break_even_months ≈ (entry_cost / deposit_amount) / (apy / 100 / 12)
- If break-even > 6 months, it's a BAD recommendation.

OBJECTIVE:
- "highest" = prioritize APY, but still factor in the user's wallet for cost efficiency
- "safest" = prioritize TVL and battle-tested protocols, prefer chains the user is already on
- "balanced" = weigh both APY and safety, with a preference for low-cost entry from the user's current positions

TVL AND LIQUIDITY: High TVL = deep liquidity = low slippage. Vaults < $500K TVL are risky. For "safest" picks, strongly weight TVL and established protocols (Aave, Compound, Morpho, Euler).`;

  const isDiscovery = intent.target_symbol === null && !intent.my_assets;
  const discoveryGuidance = isDiscovery
    ? `\n\nDISCOVERY MODE: The user is exploring the vault universe broadly. Rank by the stated objective without asset-specific constraints. Diversity is valuable — prefer recommending vaults across different protocols and chains rather than multiple vaults from the same protocol. Do not recommend multiple vaults that hold the same underlying token on the same chain.`
    : "";

  const dedupGuidance = `\n\nWRAPPED TOKEN EQUIVALENCE: ETH/WETH, BTC/WBTC, MATIC/WMATIC are the same economic asset. Do not recommend two vaults as separate picks if they differ only in wrapped vs. unwrapped token naming.`;

  const fullSystem = system + discoveryGuidance + dedupGuidance;

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

  return {
    contents: [
      {
        role: "user",
        parts: [
          { text: fullSystem },
          {
            text:
              "INPUT:\n```json\n" +
              JSON.stringify(userPayload, null, 2) +
              "\n```\n\nReturn ONLY the JSON object matching required_output_shape. No prose, no code fences.",
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  };
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

function extractGeminiText(raw: unknown): string | null {
  try {
    const r = raw as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string; thought?: boolean }>;
        };
      }>;
    };
    const parts = r.candidates?.[0]?.content?.parts ?? [];
    const joined = parts
      .filter((p) => !p.thought && typeof p.text === "string")
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    return joined.length > 0 ? joined : null;
  } catch {
    return null;
  }
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const stripped = text
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    try {
      return JSON.parse(stripped);
    } catch {
      return null;
    }
  }
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
