import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as crypto from "crypto";

export const config = {
  api: { bodyParser: false },
  maxDuration: 30,
};

const LIFI_BASE = "https://li.quest";
const LIFI_API_KEY = process.env.LIFI_API_KEY || "";
const ALLOWED_METHODS = new Set(["GET", "OPTIONS", "HEAD"]);
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean)
);

// Shared secret the frontend embeds at build time. When set, every request
// must present it in the x-proxy-secret header — Origin alone is spoofable
// from non-browser clients and cannot protect a paid API key.
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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const allowedOrigin = getAllowedOrigin(req);

  if (req.method === "OPTIONS") {
    if (allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-proxy-secret");
    return res.status(204).end();
  }

  // When PROXY_SECRET is configured, require it on every non-OPTIONS request.
  // Origin headers are spoofable from non-browser clients, so the secret is
  // the only reliable gate protecting the paid upstream key.
  if (PROXY_SECRET) {
    if (!hasValidSecret(req)) {
      return res.status(403).json({ error: "Forbidden" });
    }
  } else if (!allowedOrigin) {
    return res.status(403).json({ error: "Origin required" });
  }

  if (!ALLOWED_METHODS.has(req.method || "")) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!LIFI_API_KEY) {
    return res.status(500).json({ error: "LIFI_API_KEY not configured" });
  }

  const pathParam = req.query?.path;
  const subPath = Array.isArray(pathParam)
    ? pathParam.join("/")
    : typeof pathParam === "string"
      ? pathParam
      : "";

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
  const upstream = `${LIFI_BASE}/${subPath.replace(/^\/+/, "")}${qs ? `?${qs}` : ""}`;

  try {
    const upstreamRes = await fetch(upstream, {
      method: "GET",
      headers: {
        "x-lifi-api-key": LIFI_API_KEY,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(25000),
    });

    const body = await upstreamRes.text();

    if (allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    }
    res.setHeader("Content-Type", "application/json");
    return res.status(upstreamRes.status).send(body);
  } catch (err: any) {
    console.error("[lifi-composer] upstream error:", err);
    return res.status(502).json({ error: "Upstream request failed" });
  }
}
