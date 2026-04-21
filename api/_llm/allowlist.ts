import type { LlmProvider } from "../../src/utils/llm/types";

const BASE_URLS: Record<Exclude<LlmProvider, "custom">, string> = {
  anthropic: (process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").replace(/\/$/, ""),
  openai: (process.env.OPENAI_BASE_URL ?? "https://api.openai.com").replace(/\/$/, ""),
  gemini: (process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com").replace(/\/$/, ""),
};

const ALLOWED_PATHS: Record<Exclude<LlmProvider, "custom">, RegExp[]> = {
  anthropic: [/^\/v1\/messages$/],
  openai: [/^\/v1\/chat\/completions$/, /^\/v1\/responses$/],
  gemini: [
    /^\/v1beta\/models\/[A-Za-z0-9._-]+:generateContent$/,
    /^\/v1beta\/models\/[A-Za-z0-9._-]+:streamGenerateContent(\?alt=sse)?$/,
  ],
};

export function isAllowedProviderUrl(
  provider: LlmProvider,
  path: string,
): boolean {
  if (provider === "custom") return false;
  if (!(provider in BASE_URLS)) return false;
  if (path.startsWith("http://") || path.startsWith("https://")) return false;
  if (path.includes("..")) return false;
  const rules = ALLOWED_PATHS[provider];
  return rules.some((rx) => rx.test(path));
}

export function resolveProviderUrl(
  provider: LlmProvider,
  path: string,
): string {
  if (!isAllowedProviderUrl(provider, path)) {
    throw new Error(`Provider URL not allowed: ${provider}${path}`);
  }
  return `${BASE_URLS[provider as Exclude<LlmProvider, "custom">]}${path}`;
}

export function listAllowedProviders(): LlmProvider[] {
  return Object.keys(BASE_URLS) as LlmProvider[];
}
