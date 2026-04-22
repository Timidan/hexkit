import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as crypto from "crypto";
import { LLM_UPSTREAM_TIMEOUT_MS } from "./_shared/limits.js";

export const config = {
  api: { bodyParser: { sizeLimit: "64kb" } },
  maxDuration: 60,
};

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const ALLOWED_METHODS = new Set(["POST", "OPTIONS"]);
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean)
);
const PROXY_SECRET = process.env.PROXY_SECRET || "";

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

// Per-instance sliding-window rate limit. Vercel serverless may spread traffic
// across cold instances so this is best-effort, not a hard guarantee — but it
// removes the client bypass and is enough to deter casual abuse.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_PER_ADDRESS = 3;
const RATE_LIMIT_PER_IP = 30;
const RATE_LIMIT_MAX_BUCKETS = 2_000;
const rateLimitBuckets = new Map<string, number[]>();

function normalizeAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(trimmed)) return null;
  return trimmed;
}

function extractTargetAddress(req: VercelRequest): string | null {
  const header = req.headers["x-target-address"];
  const raw = Array.isArray(header) ? header[0] : header;
  return normalizeAddress(raw);
}

function getClientIp(req: VercelRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  if (typeof raw === "string" && raw.length > 0) {
    return raw.split(",")[0]!.trim();
  }
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.length > 0) return realIp;
  return req.socket?.remoteAddress ?? "unknown";
}

function checkRateLimit(key: string, limit: number, now: number): number {
  const log = rateLimitBuckets.get(key) ?? [];
  const recent = log.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= limit) {
    const oldest = recent[0]!;
    return Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldest)) / 1000));
  }
  return 0;
}

function recordRateLimit(key: string, now: number): void {
  const log = rateLimitBuckets.get(key) ?? [];
  log.push(now);
  if (rateLimitBuckets.size >= RATE_LIMIT_MAX_BUCKETS && !rateLimitBuckets.has(key)) {
    const firstKey = rateLimitBuckets.keys().next().value;
    if (firstKey !== undefined) rateLimitBuckets.delete(firstKey);
  }
  rateLimitBuckets.set(key, log);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const allowedOrigin = getAllowedOrigin(req);

  if (req.method === "OPTIONS") {
    if (allowedOrigin) res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, x-proxy-secret, x-target-address"
    );
    return res.status(204).end();
  }

  if (PROXY_SECRET) {
    if (!hasValidSecret(req)) {
      return res.status(403).json({ error: "Forbidden" });
    }
  } else {
    // No PROXY_SECRET: allow same-origin (no Origin header) and matching origins.
    const origin = req.headers.origin;
    if (origin && !allowedOrigin) {
      return res.status(403).json({ error: "Origin not allowed" });
    }
  }

  if (!ALLOWED_METHODS.has(req.method || "")) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body;
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "Missing JSON body" });
  }

  if (!Array.isArray((body as any).contents)) {
    return res.status(400).json({ error: "Body must include `contents` array" });
  }

  const serialized = JSON.stringify(body);

  const now = Date.now();
  const clientIp = getClientIp(req);
  const targetAddress = extractTargetAddress(req);

  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  }

  const ipKey = `ip:${clientIp}`;
  const ipRetry = checkRateLimit(ipKey, RATE_LIMIT_PER_IP, now);
  if (ipRetry > 0) {
    res.setHeader("Retry-After", String(ipRetry));
    return res.status(429).json({ error: "rate_limited_ip", retryAfterSec: ipRetry });
  }

  let addressKey: string | null = null;
  if (targetAddress) {
    addressKey = `addr:${targetAddress}`;
    const addrRetry = checkRateLimit(addressKey, RATE_LIMIT_PER_ADDRESS, now);
    if (addrRetry > 0) {
      res.setHeader("Retry-After", String(addrRetry));
      return res.status(429).json({ error: "rate_limited_address", retryAfterSec: addrRetry });
    }
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: "No GEMINI_API_KEY configured" });
  }

  const geminiHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "x-goog-api-key": GEMINI_API_KEY,
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  try {
    const upstreamRes = await fetch(url, {
      method: "POST",
      headers: geminiHeaders,
      body: serialized,
      signal: AbortSignal.timeout(LLM_UPSTREAM_TIMEOUT_MS),
    });

    const text = await upstreamRes.text();

    // Only charge the rate limit buckets on successful upstream calls.
    if (upstreamRes.status >= 200 && upstreamRes.status < 300) {
      recordRateLimit(ipKey, now);
      if (addressKey) recordRateLimit(addressKey, now);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-Gemini-Model", GEMINI_MODEL);
    return res.status(upstreamRes.status).send(text);
  } catch (err: any) {
    console.error("[llm-recommend] upstream error:", err);
    return res.status(502).json({ error: "Upstream request failed" });
  }
}
