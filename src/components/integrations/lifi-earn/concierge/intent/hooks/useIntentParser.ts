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
- "my_assets": set to true when the user references their OWN portfolio, wallet, holdings, bag, or balance (e.g. "best vaults for my assets", "find yield for what I hold", "put my tokens to work", "best for my portfolio"). When my_assets is true, the UI will fan out per-asset recommendations for every token the user holds — so target_symbol should be null.
- "routing_mode": ONLY meaningful when my_assets is true. Determines how multiple assets are routed:
  • "per-asset" (default): each asset goes to its own best vault. Triggered by PLURAL "vaults" (e.g. "best vaults for my assets", "find vaults for what I hold").
  • "consolidate": ALL assets funnel into ONE single vault via swaps/bridges. Triggered by SINGULAR "vault" or explicit consolidation language (e.g. "best vault for my assets", "put everything into one vault", "consolidate my portfolio", "combine all into one").
  The singular/plural distinction in the user's message is the primary signal. When in doubt, default to "per-asset".
- "target_symbol" is the token the user wants to EARN YIELD ON (e.g. "put USDC into..." → "USDC"). Uppercase it. If the user says "put my ETH into a USDC vault", the target_symbol is "USDC" (the destination), not "ETH" (the source). When my_assets is true, set target_symbol to null.
- If the user says "best vault for my ETH even if I need to swap" or "find me the highest yield vault regardless of token", set target_symbol to null — this tells the system to search ALL vaults and auto-swap the user's tokens at deposit time via LI.FI.
- "target_chain_id" must be one of the chain_ids in CHAIN_REGISTRY below. Never invent a chain id. If the user names a chain that isn't in the registry, use null.
- "objective" is "safest" when the user emphasizes safety/low risk/battle-tested/TVL, "highest" when they emphasize max APY/yield/returns, "balanced" otherwise.
- "min_apy_pct" and "max_apy_pct" are raw percents (5 means ≥5%), never fractions.
- "include_protocols" and "exclude_protocols" must contain slugs from PROTOCOL_REGISTRY below. If the user says "only Aave" use include_protocols=["aave-v3"]. If they say "no Pendle", use exclude_protocols=["pendle"]. Empty arrays if unspecified.
- "min_tvl_usd" is a raw USD number (10000000 for "$10M TVL floor"). null if unspecified.
- If the user gives a clearly non-yield or off-topic message, return DEFAULT_INTENT with empty fields.`;

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
