import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as crypto from "crypto";

export const config = {
  api: { bodyParser: true },
  maxDuration: 60,
};

const BTL_MODEL = process.env.BTL_MODEL || "deepseek-v4-flash";
const BTL_API_KEY = process.env.BTL_API_KEY || "";
const BTL_BASE_URL = process.env.BTL_BASE_URL || "https://api.badtheorylabs.com";

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

const MAX_BODY_BYTES = 64 * 1024;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // TEMP debug probe — reports env visibility without leaking the key. Remove after diagnosis.
  if (req.query?.debug === "1") {
    const k = process.env.BTL_API_KEY || "";
    return res.status(200).json({
      vercelEnv: process.env.VERCEL_ENV || null,
      gitBranch: process.env.VERCEL_GIT_COMMIT_REF || null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
      hasKey: k.length > 0,
      keyLen: k.length,
      keyPrefix: k ? k.slice(0, 3) : null,
      baseUrl: process.env.BTL_BASE_URL || "(default)",
      btlEnvNames: Object.keys(process.env).filter((n) => n.toUpperCase().includes("BTL")),
    });
  }

  const allowedOrigin = getAllowedOrigin(req);

  if (req.method === "OPTIONS") {
    if (allowedOrigin) res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-proxy-secret");
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

  if (!Array.isArray((body as any).messages)) {
    return res.status(400).json({ error: "Body must include `messages` array" });
  }

  const serialized = JSON.stringify(body);
  if (serialized.length > MAX_BODY_BYTES) {
    return res.status(413).json({ error: "Request body too large" });
  }

  if (!BTL_API_KEY) {
    return res.status(500).json({ error: "No BTL_API_KEY configured" });
  }

  const btlHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${BTL_API_KEY}`,
  };

  const url = `${BTL_BASE_URL}/v1/chat/completions`;

  try {
    const upstreamRes = await fetch(url, {
      method: "POST",
      headers: btlHeaders,
      body: serialized,
      signal: AbortSignal.timeout(55_000),
    });

    const text = await upstreamRes.text();

    if (allowedOrigin) res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Content-Type", "application/json");

    // Forward BTL cost/routing headers so the browser can render AiCostChip.
    const BTL_HEADERS = [
      "x-btl-benchmark-cost",
      "x-btl-customer-charge",
      "x-btl-saved",
      "x-gateway-fee-pct",
      "x-gateway-cost",
      "x-request-id",
    ];
    for (const h of BTL_HEADERS) {
      const v = upstreamRes.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    const requestedModel = (body as any)?.model || BTL_MODEL;
    res.setHeader("X-BTL-Model", String(requestedModel));
    res.setHeader("Access-Control-Expose-Headers", [...BTL_HEADERS, "x-btl-model"].join(", "));

    return res.status(upstreamRes.status).send(text);
  } catch (err: any) {
    console.error("[llm-recommend] upstream error:", err);
    return res.status(502).json({ error: "Upstream request failed" });
  }
}
