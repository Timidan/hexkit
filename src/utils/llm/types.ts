export type LlmProvider = "anthropic" | "openai" | "gemini" | "custom";

export type LlmMode = "live" | "fixture" | "off";

export interface LlmProviderConfig {
  provider: LlmProvider;
  model: string;
  apiKey?: string;        // BYOK; undefined for hexkit-proxied default (gemini)
  customBaseUrl?: string; // only when provider === "custom"; enforces browser-direct path
}

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmRequest<TSchema = unknown> {
  task: string;             // telemetry tag e.g. "vault-intent" or "tx-analysis-simple"
  provider: LlmProvider;
  model: string;
  messages: LlmMessage[];
  stream?: boolean;
  responseFormat?: "json" | "text";
  schema?: TSchema;         // zod schema for JSON validation (client-side)
  maxRetries?: number;      // default 2
  signal?: AbortSignal;
}

export interface LlmResponse<TParsed = unknown> {
  text: string;
  parsed?: TParsed;         // populated when schema supplied and validation succeeds
  provider: LlmProvider;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export type LlmErrorClass =
  | "bad_key"
  | "rate_limit"
  | "network"
  | "context_overflow"
  | "schema_invalid"
  | "provider_down"
  | "unauthorized_endpoint"
  | "consent_required"
  | "unknown";

export class LlmError extends Error {
  errorClass: LlmErrorClass;
  provider: LlmProvider;
  retryable: boolean;
  constructor(
    errorClass: LlmErrorClass,
    message: string,
    provider: LlmProvider,
    retryable: boolean,
  ) {
    super(message);
    this.name = "LlmError";
    this.errorClass = errorClass;
    this.provider = provider;
    this.retryable = retryable;
  }
}
