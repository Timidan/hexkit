import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as crypto from "crypto";

export const config = {
  api: { bodyParser: false },
  maxDuration: 30,
};

const ORDER_BASE = "https://order.li.fi";

// Allowlist keeps solver-only endpoints out of the browser surface; they'd
// 401 upstream, but a clean 404 here is friendlier and saves a round trip.
const ALLOWED_PATHS = new Set([
  "quote/request",
  "orders/submit",
  "orders/status",
  "orders",
  "routes",
  "chains/supported",
]);

const ALLOWED_METHODS = new Set(["GET", "POST", "OPTIONS", "HEAD"]);
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean),
);
const PROXY_SECRET = process.env.PROXY_SECRET || "";

// Real /quote/request payloads are ~1-2 KiB; cap at 16 KiB to bound serverless
// CPU on abuse traffic.
const MAX_BODY_BYTES = 16 * 1024;

// Best-effort per-IP rate limit (resets on cold start). Friction, not auth.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(req: VercelRequest): boolean {
  const fwd = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd ?? req.socket?.remoteAddress ?? "")
    .toString()
    .split(",")[0]
    .trim();
  if (!ip) return true; // can't identify caller — let it through, upstream will protect
  const now = Date.now();
  const slot = rateBuckets.get(ip);
  if (!slot || slot.resetAt < now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (slot.count >= RATE_LIMIT_MAX) return false;
  slot.count += 1;
  return true;
}

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

class BodyTooLargeError extends Error {
  constructor() {
    super("body_too_large");
  }
}

async function readBody(req: VercelRequest, cap: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.from(chunk);
    total += buf.length;
    if (total > cap) throw new BodyTooLargeError();
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  const allowedOrigin = getAllowedOrigin(req);

  if (req.method === "OPTIONS") {
    if (allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, x-proxy-secret",
    );
    return res.status(204).end();
  }

  if (PROXY_SECRET) {
    if (!hasValidSecret(req)) {
      return res.status(403).json({ error: "Forbidden" });
    }
  } else {
    // Without PROXY_SECRET we require a known Origin — rejecting missing-Origin
    // requests (curl, server-to-server) keeps the public endpoint scrape-resistant.
    if (!allowedOrigin || !req.headers.origin) {
      return res.status(403).json({ error: "Origin required" });
    }
  }

  if (!ALLOWED_METHODS.has(req.method || "")) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!rateLimit(req)) {
    return res.status(429).json({ error: "rate_limited" });
  }

  const pathParam = req.query?.path;
  const subPath = (
    Array.isArray(pathParam)
      ? pathParam.join("/")
      : typeof pathParam === "string"
        ? pathParam
        : ""
  ).replace(/^\/+/, "");

  if (!ALLOWED_PATHS.has(subPath)) {
    return res.status(404).json({ error: "unsupported_intents_path" });
  }

  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(req.query || {})) {
    if (key === "path") continue;
    if (Array.isArray(val)) {
      val.forEach((v) => params.append(key, v));
    } else if (typeof val === "string") {
      params.append(key, val);
    }
  }
  const qs = params.toString();

  const upstream = `${ORDER_BASE}/${subPath}${qs ? `?${qs}` : ""}`;
  const method = (req.method || "GET").toUpperCase();
  let body: string | undefined;
  if (method === "POST") {
    try {
      body = await readBody(req, MAX_BODY_BYTES);
    } catch (err) {
      if (err instanceof BodyTooLargeError) {
        return res.status(413).json({ error: "body_too_large", maxBytes: MAX_BODY_BYTES });
      }
      throw err;
    }
  }

  try {
    const upstreamRes = await fetch(upstream, {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body,
      signal: AbortSignal.timeout(25_000),
    });

    const text = await upstreamRes.text();

    if (allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    }
    res.setHeader("Content-Type", "application/json");
    return res.status(upstreamRes.status).send(text);
  } catch (err) {
    console.error("[lifi-intents] upstream error:", err);
    return res.status(502).json({ error: "Upstream request failed" });
  }
}
