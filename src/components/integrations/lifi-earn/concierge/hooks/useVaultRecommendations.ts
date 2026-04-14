import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { postLlmRecommend } from "../../earnApi";
import type { EarnVault } from "../../types";
import type {
  IdleAsset,
  SelectedSource,
  VaultRecommendation,
  RecommendationPick,
} from "../types";
import {
  pickAllByRules,
  pickByRules,
  candidatesForAsset,
  enforceDistinctPicks,
  filterByViability,
  chainCostTier,
  classifyRoute,
} from "../fallback";
import { llmRecommendationSchema, type LlmRecommendationResponse } from "../schema";
import { DEFAULT_CONFIG } from "../types";

// Client-side rate limit: 3 LLM calls per address per hour for non-connected addresses.
const LLM_RATE_LIMIT = 3;
const LLM_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const llmCallLog = new Map<string, number[]>();

const LLM_MAX_TRACKED_ADDRESSES = 50;

function isLlmRateLimited(address: string): boolean {
  const key = address.toLowerCase();
  const now = Date.now();
  const log = llmCallLog.get(key) ?? [];
  const recent = log.filter((t) => now - t < LLM_RATE_WINDOW_MS);
  if (recent.length > 0) {
    llmCallLog.set(key, recent);
  } else {
    llmCallLog.delete(key);
  }
  return recent.length >= LLM_RATE_LIMIT;
}

function recordLlmCall(address: string): void {
  const key = address.toLowerCase();
  const log = llmCallLog.get(key) ?? [];
  log.push(Date.now());
  llmCallLog.set(key, log);
  // Evict oldest entries if map grows too large
  if (llmCallLog.size > LLM_MAX_TRACKED_ADDRESSES) {
    const firstKey = llmCallLog.keys().next().value;
    if (firstKey !== undefined) llmCallLog.delete(firstKey);
  }
}

// "live" → call Gemini, "fixture" → read from fixtures/llm/*.json,
// "off" → skip LLM and always use rules-based fallback.
const LLM_MODE =
  (import.meta.env.VITE_LLM_MODE as "live" | "fixture" | "off" | undefined) ??
  "live";

export interface RecommendationsResult {
  recommendations: VaultRecommendation[];
  llmError: string | null;
}

interface UseVaultRecommendationsReturn {
  data: RecommendationsResult | undefined;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<void>;
}

// We fan out to one React Query per selected asset so adding/removing a
// source doesn't churn the cache of previously-resolved assets.
export function useVaultRecommendations(args: {
  sources: SelectedSource[];
  vaults: EarnVault[];
  enabled?: boolean;
  destinationChainId?: number;
  targetAddress?: string | null;      // NEW
  connectedAddress?: string | null;   // NEW
}): UseVaultRecommendationsReturn {
  const { sources, vaults, enabled = true, destinationChainId, targetAddress, connectedAddress } = args;

  const isExternalAddress = targetAddress != null &&
    targetAddress.toLowerCase() !== connectedAddress?.toLowerCase();
  const assets = useMemo(() => sources.map((s) => s.asset), [sources]);

  // In consolidate mode, restrict the vault pool once so every downstream
  // path (candidates, LLM prompt, rules fallback) sees only destination-chain
  // vaults.
  const chainRestrictedVaults = useMemo(() => {
    if (destinationChainId === undefined) return vaults;
    return vaults.filter((v) => v.chainId === destinationChainId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaults.length, destinationChainId]);

  const candidateMap = useMemo(() => {
    const map = new Map<string, EarnVault[]>();
    for (const a of assets) {
      const raw = candidatesForAsset(a, chainRestrictedVaults);
      const viable = filterByViability(raw, a);
      const capped = viable.slice(0, DEFAULT_CONFIG.maxCandidatesPerAsset);

      // eslint-disable-next-line no-console
      const routeCounts = { direct: 0, swap: 0, bridge: 0, bridge_and_swap: 0 };
      for (const v of capped) routeCounts[classifyRoute(a, v)]++;
      // eslint-disable-next-line no-console
      console.log(
        `[concierge] candidates for ${a.token.symbol}@${a.chainName}:`,
        `raw=${raw.length} viable=${viable.length} sent=${capped.length}`,
        routeCounts
      );

      map.set(keyOf(a), capped);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    assets.map((a) => keyOf(a)).join(","),
    chainRestrictedVaults.length,
    destinationChainId,
  ]);

  const queries = useQueries({
    queries: sources.map((source) => {
      const asset = source.asset;
      const key = keyOf(asset);
      const cands = candidateMap.get(key) ?? [];
      // Coarse amount bucket (0..10) so slider jitter doesn't thrash the
      // cache but a 5% vs 100% slice gets distinct LLM results.
      const amountBucket = bucketAmount(source.amountRaw, asset.amountRaw);
      // Fingerprint the exact candidate set we'll send to Gemini. `cands.length`
      // alone is unsafe: once an asset has the maxCandidatesPerAsset ceiling
      // (currently 8), re-ranking can swap which slugs make the cut without
      // changing the length, and we'd serve stale picks from the cache.
      const candSig = cands.map((v) => v.slug).join(",");
      return {
        queryKey: [
          "concierge-recommendations",
          LLM_MODE,
          key,
          candSig,
          destinationChainId ?? "any",
          amountBucket,
          isExternalAddress ? "external" : "connected",
        ] as const,
        enabled: enabled && chainRestrictedVaults.length > 0,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: async (): Promise<{
          rec: VaultRecommendation;
          llmError: string | null;
        }> => {
          const skipLlm = isExternalAddress && targetAddress != null && isLlmRateLimited(targetAddress);
          const result = await fetchRecommendationForAsset(source, cands, chainRestrictedVaults, skipLlm);
          if (!skipLlm && isExternalAddress && targetAddress != null) {
            recordLlmCall(targetAddress);
          }
          return result;
        },
      };
    }),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const isFetching = queries.some((q) => q.isFetching);

  const data: RecommendationsResult | undefined = useMemo(() => {
    if (assets.length === 0) return { recommendations: [], llmError: null };
    if (queries.some((q) => q.data === undefined)) return undefined;

    const recommendations: VaultRecommendation[] = [];
    let firstLlmError: string | null = null;
    for (const q of queries) {
      if (!q.data) continue;
      recommendations.push(q.data.rec);
      if (firstLlmError === null && q.data.llmError) {
        firstLlmError = q.data.llmError;
      }
    }
    return { recommendations, llmError: firstLlmError };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries.map((q) => q.dataUpdatedAt).join(","), assets.length]);

  const refetch = async () => {
    await Promise.all(queries.map((q) => q.refetch()));
  };

  return { data, isLoading, isFetching, refetch };
}

// vaultPool MUST already be chain-restricted by the caller in consolidate
// mode — do not pass the raw vault list here.
async function fetchRecommendationForAsset(
  source: SelectedSource,
  candidates: EarnVault[],
  vaultPool: EarnVault[],
  skipLlm = false,
): Promise<{ rec: VaultRecommendation; llmError: string | null }> {
  const asset = source.asset;
  if (LLM_MODE === "off" || skipLlm) {
    const rec = enforceDistinctPicks(
      pickByRules(asset, candidates),
      candidates
    );
    return { rec, llmError: skipLlm ? "Rate limited — using rules-based fallback" : null };
  }

  const candidateMap = new Map<string, EarnVault[]>([[keyOf(asset), candidates]]);
  const request = buildGeminiRequest([source], candidateMap);

  let parsed: LlmRecommendationResponse | null = null;
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await postLlmRecommend(request);
      const text = extractGeminiText(raw);
      if (!text) {
        // eslint-disable-next-line no-console
        console.warn("[concierge] raw LLM response (no text extracted):", raw);
        throw new Error("empty LLM response");
      }
      const json = safeParseJson(text);
      if (!json) {
        // eslint-disable-next-line no-console
        console.warn("[concierge] LLM text (not valid JSON):", text.slice(0, 500));
        throw new Error("LLM did not return JSON");
      }
      const result = llmRecommendationSchema.safeParse(json);
      if (!result.success) {
        // eslint-disable-next-line no-console
        console.warn("[concierge] schema validation failed:", result.error.issues, "\nparsed JSON:", JSON.stringify(json).slice(0, 800));
        throw new Error(
          `schema: ${result.error.issues[0]?.path.join(".") ?? "?"}: ${result.error.issues[0]?.message ?? "unknown"}`
        );
      }
      parsed = result.data;
      lastError = null;
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = msg;
      // eslint-disable-next-line no-console
      console.warn(
        `[concierge] LLM attempt ${attempt + 1} failed for ${keyOf(asset)}:`,
        msg
      );
      if (attempt === 1) parsed = null;
    }
  }

  if (!parsed) {
    const rec = enforceDistinctPicks(
      pickByRules(asset, candidates),
      candidates
    );
    return { rec, llmError: lastError };
  }

  const merged = mergeLlmWithCandidates([asset], candidateMap, parsed, vaultPool);
  const rec = enforceDistinctPicks(
    merged[0] ?? pickByRules(asset, candidates),
    candidates
  );
  return { rec, llmError: null };
}

function buildGeminiRequest(
  sources: SelectedSource[],
  candidateMap: Map<string, EarnVault[]>
) {
  const system = `You are a yield strategy assistant. For each idle asset, pick the single "best" vault (highest net-of-costs APY) and single "safest" vault (most battle-tested, lowest risk) from the candidate list.

RULES:
- best_pick and safest_pick MUST be different vault_slugs when the list has 2+ vaults.
- You MAY return up to 3 alternatives; they must differ from best/safest picks.
- You MUST only return slugs from the candidate list — invented slugs are rejected.
- Rationales: one sentence, under 280 chars, specific to why that vault fits. Do NOT write raw APY/TVL numbers.
- If no vault is economically viable for this deposit size, return null for that pick and explain why in the rationale of the other pick.

ROUTE TYPES (each candidate has a route_type field):
- "direct"         → same chain, same/wrapped token. Cost: gas only (~$0.01–0.50 on L2, $5–20 on L1).
- "swap"           → same chain, different token. LI.FI Composer auto-swaps. Cost: gas + ~0.1–0.5% swap fee. Very cheap on L2.
- "bridge"         → different chain, same/wrapped token. LI.FI bridges automatically. Cost: L2→L2 ~$0.50–3, involving L1 ~$5–25+.
- "bridge_and_swap"→ different chain AND different token. LI.FI handles both in one tx. Cost: bridge + swap fee. Only shown for L2→L2 routes.

IMPORTANT: Do NOT dismiss "swap" or "bridge" routes just because they aren't "direct". On L2s, swaps cost fractions of a cent and bridges cost $0.50–3. A USDC vault at 12% APY with route_type="swap" on the same L2 is often BETTER than a WETH vault at 3% APY with route_type="direct".

ENTRY COST ESTIMATES BY ROUTE:
- direct on L2:          ~$0.01–0.10
- swap on L2:            ~$0.05–0.50
- bridge L2→L2:          ~$0.50–3.00
- bridge_and_swap L2→L2: ~$1.00–4.00
- Any route involving L1: ~$5–25+

AMOUNT-AWARE REASONING:
amount_usd is the deposit value in USD. You MUST weigh entry costs against it:
- break_even_months ≈ (entry_cost / amount_usd) / (apy_total / 100 / 12)
- If break-even > 6 months, the vault is a BAD recommendation regardless of APY.
- For deposits > $10 on L2: swap and bridge routes are almost always viable.
- For deposits < $20: only "direct" and "swap" (same-chain) routes are viable.

TVL AND LIQUIDITY:
High TVL = deep liquidity = low deposit slippage. Very low TVL vaults (<$500K) can have severe entry slippage. Weight TVL into safety assessment.

DECISION PRIORITY:
1. Eliminate vaults where break-even > 6 months
2. Among remaining, rank by net effective APY (APY minus annualized entry cost drag)
3. For "safest", additionally weight high TVL and established protocols (Aave, Compound, Morpho, Euler)
4. A high-APY vault with route_type="swap" or "bridge" on L2 CAN beat a low-APY "direct" vault — do the math`;

  const userPayload = {
    assets: sources.map((s) => ({
      chain_id: s.asset.chainId,
      chain_name: s.asset.chainName,
      chain_cost_tier: chainCostTier(s.asset.chainId),
      token_symbol: s.asset.token.symbol,
      token_address: s.asset.token.address.toLowerCase(),
      amount_decimal: effectiveAmountDecimal(s),
      amount_usd: s.asset.amountUsd ?? 0,
    })),
    candidates_per_asset: sources.map((s) => {
      const a = s.asset;
      const cands = candidateMap.get(keyOf(a)) ?? [];
      return {
        chain_id: a.chainId,
        token_address: a.token.address.toLowerCase(),
        vaults: cands.map((v) => ({
          slug: v.slug,
          name: v.name ?? v.slug,
          protocol: v.protocol.name,
          chain_id: v.chainId,
          chain_cost_tier: chainCostTier(v.chainId),
          is_same_chain: v.chainId === a.chainId,
          route_type: classifyRoute(a, v),
          tags: v.tags,
          apy_total: v.analytics.apy.total,
          tvl_usd: v.analytics.tvl.usd,
          underlying_symbols: (v.underlyingTokens ?? []).map((t) => t.symbol),
        })),
      };
    }),
    required_output_shape: {
      recommendations: [
        {
          for_chain_id: "number",
          for_token_address: "string",
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
          { text: system },
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

function extractGeminiText(raw: unknown): string | null {
  // Gemini 3 Pro can return multi-part content with `thought: true` parts
  // before the answer — concatenate every non-thought text part.
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
    // Strip common noise: code fences, leading commentary
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

function mergeLlmWithCandidates(
  assets: IdleAsset[],
  candidateMap: Map<string, EarnVault[]>,
  parsed: LlmRecommendationResponse,
  allVaults: EarnVault[]
): VaultRecommendation[] {
  const result: VaultRecommendation[] = [];
  for (const asset of assets) {
    const key = keyOf(asset);
    const cands = candidateMap.get(key) ?? [];
    const slugToVault = new Map(cands.map((v) => [v.slug, v]));

    const rec = parsed.recommendations.find(
      (r) =>
        r.for_chain_id === asset.chainId &&
        r.for_token_address.toLowerCase() === asset.token.address.toLowerCase()
    );
    if (!rec) {
      // LLM skipped this asset — fall back for this one row
      result.push(
        ...fallbackOne(asset, allVaults)
      );
      continue;
    }

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

    // If the LLM returned slugs that don't exist in the candidate list,
    // both picks resolve to null. Fall back to rules so the user still
    // gets usable recommendations instead of empty pills.
    if (!bestPick && !safestPick && cands.length > 0) {
      result.push(...fallbackOne(asset, allVaults));
      continue;
    }

    result.push({
      forChainId: asset.chainId,
      forTokenAddress: asset.token.address.toLowerCase(),
      bestPick,
      safestPick,
      alternatives,
      source: "ai",
      topRationale: rec.best_pick?.rationale ?? "",
    });
  }
  return result;
}

function fallbackOne(
  asset: IdleAsset,
  allVaults: EarnVault[]
): VaultRecommendation[] {
  return pickAllByRules([asset], allVaults);
}

function keyOf(a: IdleAsset): string {
  return `${a.chainId}:${a.token.address.toLowerCase()}`;
}

// Bucket amountRaw into 11 slots (0..10) as a coarse cache discriminator.
function bucketAmount(amountRaw: string, maxRaw: string): number {
  try {
    const amt = BigInt(amountRaw);
    const max = BigInt(maxRaw);
    if (max === 0n) return 0;
    if (amt >= max) return 10;
    if (amt <= 0n) return 0;
    return Number((amt * 10n) / max);
  } catch {
    return 10;
  }
}

function effectiveAmountDecimal(source: SelectedSource): string {
  try {
    return formatUnits(BigInt(source.amountRaw), source.asset.token.decimals);
  } catch {
    return source.asset.amountDecimal;
  }
}
