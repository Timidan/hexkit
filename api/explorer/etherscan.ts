import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleEtherscanLookup } from "./etherscanShared.js";

export const config = {
  api: { bodyParser: true },
  maxDuration: 30,
};

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean)
);

function getAllowedOrigin(req: VercelRequest): string | null {
  const origin = req.headers.origin;
  if (!origin) return null;
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  if (origin.startsWith("http://localhost:")) return origin;
  const host = req.headers.host;
  if (host && origin === `https://${host}`) return origin;
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const allowedOrigin = getAllowedOrigin(req);

  if (req.method === "OPTIONS") {
    if (allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    }
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-proxy-secret");
    res.status(204).setHeader("cache-control", "no-store").end();
    return;
  }

  if (req.method !== "POST") {
    res
      .status(405)
      .setHeader("cache-control", "no-store")
      .json({ error: "method_not_allowed" });
    return;
  }

  const response = await handleEtherscanLookup(req.body, process.env);
  res.status(response.status);

  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  }
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  const body = Buffer.from(await response.arrayBuffer());
  res.send(body);
}
