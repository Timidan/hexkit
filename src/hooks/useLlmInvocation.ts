import { useCallback } from "react";
import { useLlmConfig } from "../contexts/LlmConfigContext";
import { useLlmConsentGate } from "../contexts/LlmConsentGateContext";
import { llmConfigManager } from "../config/llmConfig";
import {
  LlmError,
  type LlmErrorClass,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
} from "../utils/llm/types";
import {
  parseAnthropicSseChunk,
  parseGeminiSseChunk,
  parseOpenAISseChunk,
  type StreamEvent,
} from "../utils/llm/streamParser";

const PROVIDER_PATHS: Record<Exclude<LlmProvider, "custom">, string> = {
  anthropic: "/v1/messages",
  openai: "/v1/chat/completions",
  gemini: "/v1beta/models/:model:generateContent",
};

function classifyHttpError(status: number): LlmErrorClass {
  if (status === 401 || status === 403) return "bad_key";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "provider_down";
  if (status === 413 || status === 414) return "context_overflow";
  return "unknown";
}

function buildProviderBody(req: LlmRequest): Record<string, unknown> {
  switch (req.provider) {
    case "anthropic":
      return {
        model: req.model,
        max_tokens: 4096,
        messages: req.messages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role, content: m.content })),
        system: req.messages.find((m) => m.role === "system")?.content,
      };
    case "openai":
      return { model: req.model, messages: req.messages };
    case "gemini":
      return {
        contents: req.messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
      };
    case "custom":
      throw new LlmError(
        "unauthorized_endpoint",
        "custom provider must be invoked browser-direct, not through useLlmInvocation",
        "custom",
        false,
      );
  }
}

function stripJsonEnvelope(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text.trim();
}

function extractText(provider: LlmProvider, upstream: any): string {
  if (provider === "anthropic") {
    const blocks = upstream?.content ?? [];
    return blocks.map((b: any) => (b?.text ?? "")).join("");
  }
  if (provider === "openai") {
    return upstream?.choices?.[0]?.message?.content ?? "";
  }
  if (provider === "gemini") {
    const parts = upstream?.candidates?.[0]?.content?.parts ?? [];
    return parts.map((p: any) => p?.text ?? "").join("");
  }
  return "";
}

export function useLlmInvocation() {
  const { config } = useLlmConfig();
  const { requestConsent } = useLlmConsentGate();

  const invoke = useCallback(async <TParsed = unknown>(
    req: LlmRequest,
  ): Promise<LlmResponse<TParsed>> => {
    if (!config.consentAcknowledged) {
      const providerLabel =
        req.provider === "gemini" ? "Gemini (hexkit proxy)" :
        req.provider === "anthropic" ? "Anthropic" :
        req.provider === "openai" ? "OpenAI" :
        "a custom LLM endpoint";
      const ack = await requestConsent(providerLabel);
      if (!ack) {
        throw new LlmError("consent_required", "user declined consent", req.provider, false);
      }
    }
    if (req.provider === "custom") {
      throw new LlmError(
        "unauthorized_endpoint",
        "custom provider endpoints must be invoked browser-direct (not implemented yet)",
        "custom",
        false,
      );
    }

    const path = PROVIDER_PATHS[req.provider].replace(":model", encodeURIComponent(req.model));
    const userKey = llmConfigManager.getProviderKey(req.provider);
    const maxRetries = req.maxRetries ?? 2;

    let lastErr: LlmError | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch("/api/llm-invoke", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(userKey ? { "x-user-api-key": userKey } : {}),
          },
          body: JSON.stringify({
            provider: req.provider,
            path,
            body: buildProviderBody(req),
          }),
          signal: req.signal,
        });
        if (!res.ok) {
          const cls = classifyHttpError(res.status);
          const detail = await res.text().catch(() => "");
          const err = new LlmError(cls, `${res.status}: ${detail}`, req.provider, cls === "provider_down" || cls === "rate_limit");
          if (!err.retryable || attempt === maxRetries) throw err;
          lastErr = err;
          continue;
        }
        const json = await res.json();
        const text = extractText(req.provider, json);
        if (req.schema && req.responseFormat === "json") {
          const jsonText = stripJsonEnvelope(text);
          let parsed: unknown;
          try {
            parsed = JSON.parse(jsonText);
          } catch {
            const err = new LlmError(
              "schema_invalid",
              `model did not return valid JSON: ${jsonText.slice(0, 120)}`,
              req.provider,
              true,
            );
            if (attempt === maxRetries) throw err;
            lastErr = err;
            continue;
          }
          const schemaResult = (req.schema as any).safeParse(parsed);
          if (!schemaResult.success) {
            const err = new LlmError(
              "schema_invalid",
              `schema validation failed: ${schemaResult.error.issues[0]?.message ?? "?"}`,
              req.provider,
              true,
            );
            if (attempt === maxRetries) throw err;
            lastErr = err;
            continue;
          }
          return {
            text,
            parsed: schemaResult.data,
            provider: req.provider,
            model: req.model,
          };
        }
        return { text, provider: req.provider, model: req.model };
      } catch (err) {
        if (err instanceof LlmError) {
          if (!err.retryable || attempt === maxRetries) throw err;
          lastErr = err;
          continue;
        }
        if ((err as any)?.name === "AbortError") throw err;
        lastErr = new LlmError("network", (err as Error).message, req.provider, true);
        if (attempt === maxRetries) throw lastErr;
      }
    }
    throw lastErr ?? new LlmError("unknown", "unknown", req.provider, false);
  }, [config.consentAcknowledged, requestConsent]);

  return { invoke };
}

export interface StreamHandle {
  onText: (cb: (delta: string) => void) => void;
  done: Promise<LlmResponse>;
  abort: () => void;
}

export function useLlmInvocationStream() {
  const { config } = useLlmConfig();
  const { requestConsent } = useLlmConsentGate();

  const invokeStream = useCallback((req: LlmRequest): StreamHandle => {
    if (req.provider === "custom") {
      throw new LlmError("unauthorized_endpoint", "custom provider must go browser-direct", "custom", false);
    }

    const basePath = PROVIDER_PATHS[req.provider].replace(":model", encodeURIComponent(req.model)).replace("generateContent", "streamGenerateContent");
    // Gemini's REST streaming endpoint is `:streamGenerateContent?alt=sse`; without
    // alt=sse it returns a buffered JSON array, not an SSE stream. Anthropic/OpenAI
    // use `stream: true` in the body instead.
    const path = req.provider === "gemini" ? `${basePath}?alt=sse` : basePath;
    const userKey = llmConfigManager.getProviderKey(req.provider);
    const textCbs: Array<(d: string) => void> = [];
    const controller = new AbortController();

    const done: Promise<LlmResponse> = (async () => {
      if (!config.consentAcknowledged) {
        const providerLabel =
          req.provider === "gemini" ? "Gemini (hexkit proxy)" :
          req.provider === "anthropic" ? "Anthropic" :
          req.provider === "openai" ? "OpenAI" :
          "a custom LLM endpoint";
        const ack = await requestConsent(providerLabel);
        if (!ack) {
          throw new LlmError("consent_required", "user declined consent", req.provider, false);
        }
      }
      const res = await fetch("/api/llm-invoke", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(userKey ? { "x-user-api-key": userKey } : {}),
        },
        body: JSON.stringify({
          provider: req.provider,
          path,
          body:
            req.provider === "gemini"
              ? buildProviderBody(req)
              : { ...buildProviderBody(req), stream: true },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new LlmError(classifyHttpError(res.status), `${res.status}`, req.provider, false);
      }
      if (!res.body) throw new LlmError("network", "no response body", req.provider, false);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      const parse = (chunk: string): StreamEvent[] =>
        req.provider === "anthropic" ? parseAnthropicSseChunk(chunk)
        : req.provider === "openai" ? parseOpenAISseChunk(chunk)
        : parseGeminiSseChunk(chunk);

      while (true) {
        const { value, done: readerDone } = await reader.read();
        if (readerDone) break;
        buffer += decoder.decode(value, { stream: true });
        const splitAt = buffer.lastIndexOf("\n\n");
        if (splitAt < 0) continue;
        const ready = buffer.slice(0, splitAt + 2);
        buffer = buffer.slice(splitAt + 2);
        for (const ev of parse(ready)) {
          if (ev.type === "text") {
            fullText += ev.value;
            textCbs.forEach((cb) => cb(ev.value));
          }
        }
      }
      return { text: fullText, provider: req.provider, model: req.model };
    })();

    return {
      onText: (cb) => { textCbs.push(cb); },
      done,
      abort: () => controller.abort(),
    };
  }, [config.consentAcknowledged, requestConsent]);

  return { invokeStream };
}
