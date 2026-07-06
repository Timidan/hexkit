import { BTL_DEFAULT_MODEL } from "./models";

export interface BtlRuntimeMeta {
  model: string | null;
  customerChargeUsd: number | null;
  benchmarkCostUsd: number | null;
  feePct: number | null;
  requestId: string | null;
}

export interface BtlChatResult {
  data: unknown;
  meta: BtlRuntimeMeta;
}

export function buildBtlChatRequest(
  system: string,
  userText: string,
  opts: { model?: string; temperature?: number; jsonMode?: boolean; tools?: unknown[]; toolChoice?: unknown; maxTokens?: number } = {},
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: opts.model ?? BTL_DEFAULT_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userText },
    ],
    temperature: opts.temperature ?? 0.2,
    // Some models (e.g. gpt-4o-mini) truncate structured JSON at a low default
    // max_tokens (finish_reason:"length" → invalid JSON → rules fallback). Set
    // a generous default so recommendation/agent JSON completes.
    max_tokens: opts.maxTokens ?? 2048,
  };
  if (opts.jsonMode !== false && !opts.tools) body.response_format = { type: "json_object" };
  if (opts.tools) body.tools = opts.tools;
  if (opts.toolChoice) body.tool_choice = opts.toolChoice;
  return body;
}

export function extractOpenAiText(raw: unknown): string | null {
  const r = raw as { choices?: Array<{ message?: { content?: string | null } }> };
  const content = r?.choices?.[0]?.message?.content;
  return typeof content === "string" && content.trim().length > 0 ? content.trim() : null;
}

export function parseBtlMeta(headers: Headers): BtlRuntimeMeta {
  const num = (k: string): number | null => {
    const v = headers.get(k);
    if (v == null || v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    model: headers.get("x-btl-model"),
    customerChargeUsd: num("x-btl-customer-charge"),
    benchmarkCostUsd: num("x-btl-benchmark-cost"),
    feePct: num("x-gateway-fee-pct"),
    requestId: headers.get("x-request-id"),
  };
}

// Lifted verbatim from the concierge hooks (was triplicated) — keep the
// fence/slice fallbacks; with response_format:json_object the content is
// usually already clean JSON, but models vary.
export function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const stripped = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    try {
      return JSON.parse(stripped);
    } catch {
      const first = stripped.indexOf("{");
      const last = stripped.lastIndexOf("}");
      if (first >= 0 && last > first) {
        try { return JSON.parse(stripped.slice(first, last + 1)); } catch { /* fall through */ }
      }
      return null;
    }
  }
}
