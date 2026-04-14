import { useMutation } from "@tanstack/react-query";
import { postLlmRecommend } from "../../../earnApi";
import { parsedIntentSchema, type ParsedIntent, DEFAULT_INTENT } from "../schema";
import type { EarnChainInfo, EarnProtocolInfo } from "../../../types";

// "live" → call Gemini, "off" → skip LLM (dev aid, returns DEFAULT_INTENT).
const LLM_MODE =
  (import.meta.env.VITE_LLM_MODE as "live" | "fixture" | "off" | undefined) ??
  "live";

export interface ParseIntentArgs {
  text: string;
  chains: EarnChainInfo[];
  protocols: EarnProtocolInfo[];
}

export interface ParseIntentResult {
  intent: ParsedIntent;
  rawText: string;
}

export function useIntentParser() {
  return useMutation<ParseIntentResult, Error, ParseIntentArgs>({
    mutationFn: async ({ text, chains, protocols }) => {
      const trimmed = text.trim();
      if (!trimmed) {
        throw new Error("Please describe your yield goal.");
      }
      if (LLM_MODE === "off") {
        return { intent: DEFAULT_INTENT, rawText: trimmed };
      }

      const request = buildParseRequest(trimmed, chains, protocols);

      let lastError: string | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const raw = await postLlmRecommend(request);
          const responseText = extractGeminiText(raw);
          if (!responseText) throw new Error("empty LLM response");
          const json = safeParseJson(responseText);
          if (!json) throw new Error("LLM did not return JSON");
          const result = parsedIntentSchema.safeParse(json);
          if (!result.success) {
            throw new Error(
              `schema: ${result.error.issues[0]?.path.join(".") ?? "?"}: ${
                result.error.issues[0]?.message ?? "unknown"
              }`
            );
          }
          return { intent: result.data, rawText: trimmed };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          lastError = msg;
          // eslint-disable-next-line no-console
          console.warn(`[intent-parser] attempt ${attempt + 1} failed:`, msg);
        }
      }
      throw new Error(lastError ?? "Failed to parse intent");
    },
  });
}

function buildParseRequest(
  userText: string,
  chains: EarnChainInfo[],
  protocols: EarnProtocolInfo[]
) {
  // Ship a compact chain/protocol registry so Gemini can resolve "Arbitrum"
  // to chainId 42161 and "Aave" to slug "aave-v3" without hallucinating.
  const chainRegistry = chains.map((c) => ({
    chain_id: c.chainId,
    name: c.name,
  }));
  const protocolRegistry = protocols.map((p) => p.name);

  const system = `You are a yield intent parser. The user will describe a DeFi yield goal in plain English. Convert their goal into a strict JSON object matching the required shape.

Rules:
- Return ONLY JSON matching the shape below. No prose, no code fences, no commentary.
- Use null for any field the user did not specify. Never invent values.

MY_ASSETS RULES:
- "my_assets": set to true ONLY when the user wants per-holding recommendations across their wallet. Trigger phrases: "my assets", "my portfolio", "each of my tokens", "all my holdings", "my bag", "my balance", "what I have", "put my holdings to work".
- Set to false for single-token references with possessive language: "my ETH" means target_symbol="ETH", my_assets=false. The word "my" before a specific token name indicates which token to target, NOT a wallet scan.
- Set to false for generic discovery: "top 3 vaults", "best yield opportunities", "where should I earn" — these are broad searches, not wallet scans.
- "invest in" is a generic action phrase — set my_assets=false unless the user clearly references multiple specific holdings.
- "pool my assets", "put my assets", "deposit my assets" — user references "my assets" as a whole: set my_assets=true.

ROUTING_MODE RULES:
- ONLY meaningful when my_assets is true.
- "per-asset": each asset goes to its own best vault. Triggered ONLY when user explicitly wants separate vaults per token (e.g. "best vault for each token").
- "consolidate" (default when my_assets=true): ALL assets funnel into one or a few vaults. Triggered by "pool", "consolidate", "combine", singular "vault", a specific count of vaults ("top 3 vaults"), or any phrasing that implies bringing assets together.

TARGET_SYMBOL RULES:
- The token the user wants to EARN YIELD ON (destination, not source). Uppercase it.
- "put my ETH into a USDC vault" → target_symbol="USDC" (destination).
- "top 3 best vaults" → target_symbol=null (broad discovery).
- When my_assets is true, set target_symbol to null.
- If the user says "best vault regardless of token" or "find me the highest yield vault", set to null.

RESULT_COUNT RULES:
- Parse explicit counts: "top 3" → 3, "best 5" → 4 (clamp to max 4), "give me one" → 1, "a vault" → 1, "the best vault" → 1.
- Plural without count ("best vaults", "top vaults") → null (default 4 slots).
- Clamp to [1, 4]. If user says a number > 4, return 4.

OBJECTIVE RULES:
- "safest" — user explicitly prioritizes safety, low risk, battle-tested protocols, or high TVL.
- "highest" — user explicitly asks for maximum APY, highest yield, or max returns.
- "balanced" — user wants a good vault overall, or did not express a specific preference. Words like "best", "top", "good" imply quality across both yield and safety — use "balanced" unless there is a clear signal toward one extreme.

OTHER FIELDS:
- "target_chain_id" must be one of the chain_ids in CHAIN_REGISTRY below. Never invent a chain id.
- "min_apy_pct" and "max_apy_pct" are raw percents (5 means ≥5%).
- "include_protocols" and "exclude_protocols" must contain slugs from PROTOCOL_REGISTRY below.
- "min_tvl_usd" is a raw USD number (10000000 for "$10M TVL floor").

DISAMBIGUATION EXAMPLES (for tricky fields only — use your judgment for objective):
- "my ETH" → my_assets=false, target_symbol="ETH" (possessive + specific token = targeted search)
- "each of my assets" / "my portfolio" → my_assets=true
- "invest my USDC in a vault" → my_assets=false, target_symbol="USDC" (specific token action)
- "top 3 vaults for my assets" / "pool my assets" → my_assets=true, routing_mode="consolidate", result_count=3
- "best vault for each token" → my_assets=true, routing_mode="per-asset"
- "top 3" → result_count=3, "a vault" / "the best vault" → result_count=1
- "consolidate into one vault" → my_assets=true, routing_mode="consolidate"
- "I need 10% on my ETH" → target_symbol="ETH", min_apy_pct=10

If the user gives a clearly non-yield or off-topic message, return all-null/default values.`;

  const shape = {
    target_symbol: "string | null",
    my_assets: "boolean",
    routing_mode: "'per-asset' | 'consolidate'",
    target_chain_id: "number | null",
    min_apy_pct: "number | null",
    max_apy_pct: "number | null",
    objective: "'safest' | 'highest' | 'balanced'",
    min_tvl_usd: "number | null",
    include_protocols: "string[]",
    exclude_protocols: "string[]",
    result_count: "number (1-4) | null",
  };

  const payload = {
    user_text: userText,
    chain_registry: chainRegistry,
    protocol_registry: protocolRegistry,
    required_output_shape: shape,
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
              JSON.stringify(payload, null, 2) +
              "\n```\n\nReturn ONLY the JSON object.",
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
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
