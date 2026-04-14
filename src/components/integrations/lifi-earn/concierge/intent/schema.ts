import { z } from "zod";

/**
 * Parsed yield intent — what the LLM turns a free-form prompt into.
 *
 * Every field is nullable because the user may only specify some of them
 * ("put my USDC into the safest vault" = target_symbol + objective, rest null).
 * Post-parse we hydrate these into vault filters with sensible defaults.
 *
 * Kept intentionally small: keys the guide's own example intents reference
 * ("safest vault above 5% APY on Arbitrum") plus protocol allow/deny list.
 */
export const parsedIntentSchema = z.object({
  target_symbol: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .nullable()
    .describe("Token symbol the user wants to end up holding (e.g. 'USDC')"),
  /** When true, the user wants recommendations for every token they hold. */
  my_assets: z
    .boolean()
    .describe("True when the user references their own portfolio/bag/holdings"),
  /** How to route multiple assets.
   *  - "per-asset": each asset goes to its own best vault (user said "vaults" plural)
   *  - "consolidate": all assets funnel into one single vault (user said "vault" singular, or "consolidate", "combine", "one vault")
   *  Only meaningful when my_assets is true. */
  routing_mode: z
    .enum(["per-asset", "consolidate"])
    .describe("'consolidate' when user wants all assets in one vault; 'per-asset' when they want best vault per token"),
  target_chain_id: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe("EVM chain id the vault must live on"),
  min_apy_pct: z
    .number()
    .min(0)
    .max(1000)
    .nullable()
    .describe("Minimum total APY in percent (5 means ≥5%)"),
  max_apy_pct: z
    .number()
    .min(0)
    .max(1000)
    .nullable()
    .describe("Maximum total APY — rarely set, used to cap risk"),
  objective: z
    .enum(["safest", "highest", "balanced"])
    .describe("Ranking objective; default 'balanced' when unspecified"),
  min_tvl_usd: z
    .number()
    .min(0)
    .nullable()
    .describe("Minimum vault TVL in USD (safety floor)"),
  include_protocols: z
    .array(z.string().trim().min(1))
    .max(16)
    .describe("Protocol slugs the user explicitly asked for (allowlist)"),
  exclude_protocols: z
    .array(z.string().trim().min(1))
    .max(16)
    .describe("Protocol slugs the user explicitly ruled out (denylist)"),
});

export type ParsedIntent = z.infer<typeof parsedIntentSchema>;

export const DEFAULT_INTENT: ParsedIntent = {
  target_symbol: null,
  my_assets: false,
  routing_mode: "per-asset",
  target_chain_id: null,
  min_apy_pct: null,
  max_apy_pct: null,
  objective: "balanced",
  min_tvl_usd: null,
  include_protocols: [],
  exclude_protocols: [],
};
