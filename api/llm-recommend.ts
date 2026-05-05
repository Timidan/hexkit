import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  enforcePublicProxyAccess,
  resolveAllowedProxyOrigin,
} from "./_utils/publicProxyGuard";

export const config = {
  api: { bodyParser: true },
  maxDuration: 60,
};

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const ALLOWED_METHODS = new Set(["POST", "OPTIONS"]);

const MAX_BODY_BYTES = 64 * 1024;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const allowedOrigin = resolveAllowedProxyOrigin(req);

  if (req.method === "OPTIONS") {
    if (allowedOrigin) res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-proxy-secret");
    return res.status(204).end();
  }

  if (!ALLOWED_METHODS.has(req.method || "")) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (
    !enforcePublicProxyAccess(req, res, {
      allowedOrigin,
      rateLimit: { bucket: "llm-recommend", limit: 12, windowMs: 5 * 60_000 },
    })
  ) {
    return;
  }

  const body = req.body;
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "Missing JSON body" });
  }

  if (!Array.isArray((body as Record<string, unknown>).contents)) {
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
  } catch (err) {
    console.error("[llm-recommend] upstream error:", err);
    return res.status(502).json({ error: "Upstream request failed" });
  }
}
