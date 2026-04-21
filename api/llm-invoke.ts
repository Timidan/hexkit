import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as crypto from "crypto";
import { resolveProviderUrl, isAllowedProviderUrl } from "./_llm/allowlist";
import { checkRequestGuards, readGuardConfigFromEnv } from "./_llm/guardHeaders";
import type { LlmProvider } from "../src/utils/llm/types";

export const config = {
  api: { bodyParser: true },
  maxDuration: 60,
};

interface InvokeBody {
  provider: LlmProvider;
  path: string;
  body: Record<string, unknown>;
}

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean),
);
const PROXY_SECRET = process.env.PROXY_SECRET || "";
const MAX_BODY_BYTES = 64 * 1024;
const UPSTREAM_TIMEOUT_MS = 55_000;

function getAllowedOrigin(req: VercelRequest): string | null {
  const origin = req.headers.origin;
  if (!origin) return null;
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  if (origin.startsWith("http://localhost:")) return origin;
  const host = req.headers.host;
  if (host && origin === `https://${host}`) return origin;
  return null;
}

function hasValidSecret(req: VercelRequest): boolean {
  if (!PROXY_SECRET) return false;
  const header = req.headers["x-proxy-secret"];
  if (typeof header !== "string") return false;
  const a = Buffer.from(header);
  const b = Buffer.from(PROXY_SECRET);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function setCorsHeaders(res: VercelResponse, allowedOrigin: string | null) {
  if (allowedOrigin) res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-proxy-secret, x-user-api-key",
  );
}

function providerAuthHeaders(
  provider: LlmProvider,
  userKey: string | undefined,
): Record<string, string> {
  const key = userKey && userKey.length > 0 ? userKey : "";
  switch (provider) {
    case "anthropic":
      return key
        ? { "x-api-key": key, "anthropic-version": "2023-06-01" }
        : { "anthropic-version": "2023-06-01" };
    case "openai":
      return key ? { Authorization: `Bearer ${key}` } : {};
    case "gemini": {
      const effectiveKey = key || process.env.GEMINI_API_KEY || "";
      return effectiveKey ? { "x-goog-api-key": effectiveKey } : {};
    }
    case "custom":
      return {};
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  const allowedOrigin = getAllowedOrigin(req);

  if (req.method === "OPTIONS") {
    setCorsHeaders(res, allowedOrigin);
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  if (PROXY_SECRET) {
    if (!hasValidSecret(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
  } else {
    const origin = req.headers.origin;
    if (origin && !allowedOrigin) {
      res.status(403).json({ error: "origin_not_allowed" });
      return;
    }
  }

  const guard = checkRequestGuards(req, readGuardConfigFromEnv());
  if (!guard.ok) {
    res.status(guard.status ?? 403).json({ error: guard.reason ?? "forbidden" });
    return;
  }

  const body = (req.body ?? {}) as InvokeBody;
  if (!body.provider || !body.path || !body.body) {
    res.status(400).json({ error: "missing provider/path/body" });
    return;
  }

  if (body.provider === "custom") {
    res.status(400).json({
      error:
        "custom provider endpoints must be called browser-direct with the user key; server proxy allowlists known providers only",
    });
    return;
  }

  if (!isAllowedProviderUrl(body.provider, body.path)) {
    res.status(400).json({ error: `path not allowed for provider ${body.provider}` });
    return;
  }

  const serialized = JSON.stringify(body.body);
  if (serialized.length > MAX_BODY_BYTES) {
    res.status(413).json({ error: "request_body_too_large" });
    return;
  }

  let upstreamUrl: string;
  try {
    upstreamUrl = resolveProviderUrl(body.provider, body.path);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }

  const userKey = (req.headers["x-user-api-key"] as string | undefined) || undefined;
  const authHeaders = providerAuthHeaders(body.provider, userKey);

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders,
      },
      body: serialized,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    const contentType = upstream.headers.get("content-type") ?? "application/json";
    const isStream = contentType.includes("event-stream");

    res.status(upstream.status);
    res.setHeader("content-type", contentType);
    setCorsHeaders(res, allowedOrigin);
    if (isStream) {
      res.setHeader("cache-control", "no-cache, no-transform");
      res.setHeader("connection", "keep-alive");
    }

    if (!upstream.body) {
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    const flushable = res as unknown as { flush?: () => void };
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          res.write(Buffer.from(value));
          if (isStream && typeof flushable.flush === "function") flushable.flush();
        }
      }
    } finally {
      reader.releaseLock();
    }
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ error: "upstream_failed", detail: (err as Error).message });
    } else {
      res.end();
    }
  }
}
