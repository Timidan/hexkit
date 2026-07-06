// BTL Runtime model registry.
//
// Verified callable on our tier (OpenAI + DeepSeek providers only). Everything
// else in the 314-model catalog either 400s or returns HTTP 200 with empty
// content on our key:
//   - btl-2            → non-deterministically routes to gpt-4o-mini OR an empty
//                        free route; too flaky to pin for a demo.
//   - minimax-m3,
//     gemini-*,
//     deepseek-r1,
//     deepseek-chat-v3.1 → route to openrouter/free, return content:"".
//   - claude-*         → require /v1/messages + paid Anthropic credits (blocked).
export const BTL_BASE_URL_DEFAULT = "https://api.badtheorylabs.com";

/** Default model: DeepSeek, tool-calling + json_object verified live. */
export const BTL_DEFAULT_MODEL = "deepseek-v3.2";

/** Proven fallback / A-B alternate: OpenAI, tool-calling verified. */
export const BTL_FALLBACK_MODEL = "gpt-4o-mini";

/** The cross-provider A/B toggle: DeepSeek vs OpenAI, both tool-capable. */
export const BTL_AB_MODELS = [
  { id: "deepseek-v3.2", label: "DeepSeek v3.2", provider: "DeepSeek" },
  { id: "gpt-4o-mini", label: "GPT-4o mini", provider: "OpenAI" },
] as const;
