import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as crypto from "crypto";

export const config = {
  api: { bodyParser: true },
  maxDuration: 60,
};

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite-preview";
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

const MAX_BODY_BYTES = 32 * 1024;

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
  } else if (!allowedOrigin) {
    return res.status(403).json({ error: "Origin required" });
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
  if (serialized.length > MAX_BODY_BYTES) {
    return res.status(413).json({ error: "Request body too large" });
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
      signal: AbortSignal.timeout(55_000),
    });

    const text = await upstreamRes.text();

    if (allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    }
    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-Gemini-Model", GEMINI_MODEL);
    return res.status(upstreamRes.status).send(text);
  } catch (err: any) {
    console.error("[llm-recommend] upstream error:", err);
    return res.status(502).json({ error: "Upstream request failed" });
  }
}
