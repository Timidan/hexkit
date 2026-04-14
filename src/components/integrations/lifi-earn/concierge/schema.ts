import { z } from "zod";

// Gemini occasionally returns `{ vault_slug: "", rationale: "..." }` for a
// pick it couldn't populate instead of null. Preprocess empty slugs to null
// so we don't fall back for every asset when only one pick was blank.
const pickSchema = z.preprocess(
  (val) => {
    if (val == null) return null;
    if (typeof val !== "object") return null;
    const slug = (val as Record<string, unknown>).vault_slug;
    // Gemini sometimes returns { vault_slug: null } or { vault_slug: "" }
    // instead of null for picks it couldn't populate — normalise to null.
    if (slug == null || (typeof slug === "string" && slug.trim() === "")) {
      return null;
    }
    return val;
  },
  z
    .object({
      vault_slug: z.string().min(1),
      rationale: z.string().min(1).max(500),
    })
    .nullable()
);

const alternativesSchema = z.preprocess(
  (val) => {
    if (!Array.isArray(val)) return val;
    return val.filter((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const slug = (entry as Record<string, unknown>).vault_slug;
      return typeof slug === "string" && slug.trim() !== "";
    });
  },
  z
    .array(
      z.object({
        vault_slug: z.string().min(1),
        rationale: z.string().min(1).max(500),
      })
    )
    .max(3)
);

export const llmRecommendationSchema = z.object({
  recommendations: z
    .array(
      z.object({
        for_chain_id: z.number().int().positive(),
        for_token_address: z.string().min(4),
        best_pick: pickSchema,
        safest_pick: pickSchema,
        alternatives: alternativesSchema,
      })
    )
    .min(1),
});

export type LlmRecommendationResponse = z.infer<typeof llmRecommendationSchema>;
