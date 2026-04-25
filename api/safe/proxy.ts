import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as crypto from "crypto";

export const config = {
  api: { bodyParser: false },
  maxDuration: 20,
};

// Mirror of api/lifi-composer.ts guard pattern — browsers can't hit
// safe-transaction-*.safe.global cross-origin, so this proxy forwards reads.
const ALLOWED_HOSTS = new Set<string>([
  "safe-transaction-mainnet.safe.global",
  "safe-transaction-optimism.safe.global",
  "safe-transaction-polygon.safe.global",
  "safe-transaction-base.safe.global",
  "safe-transaction-arbitrum.safe.global",
]);

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

  if (PROXY_SECRET) {
    if (!hasValidSecret(req)) {
      return res.status(403).json({ error: "Forbidden" });
    }
  } else {
    const origin = req.headers.origin;
    if (origin && !allowedOrigin) {
      return res.status(403).json({ error: "Origin not allowed" });
    }
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const host = String(req.query.host ?? "");
  const path = String(req.query.path ?? "");
  if (!ALLOWED_HOSTS.has(host)) {
    return res.status(400).json({ error: "host not allowed" });
  }
  if (!/^\/?[a-zA-Z0-9/._-]*$/.test(path)) {
    return res.status(400).json({ error: "invalid path" });
  }

  const upstream = `https://${host}${path.startsWith("/") ? "" : "/"}${path}`;
  try {
    const resp = await fetch(upstream, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    const body = await resp.text();
    if (allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    }
    res.status(resp.status);
    res.setHeader("content-type", resp.headers.get("content-type") ?? "application/json");
    return res.send(body);
  } catch (e) {
    return res.status(502).json({ error: "upstream fetch failed", detail: (e as Error).message });
  }
}
