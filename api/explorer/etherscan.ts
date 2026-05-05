import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleEtherscanLookup } from "./etherscanShared.js";
import {
  enforcePublicProxyAccess,
  resolveAllowedProxyOrigin,
} from "../_utils/publicProxyGuard.js";

export const config = {
  api: { bodyParser: true },
  maxDuration: 30,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const allowedOrigin = resolveAllowedProxyOrigin(req);

  if (req.method === "OPTIONS") {
    if (allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    }
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, x-proxy-secret");
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

  if (
    !enforcePublicProxyAccess(req, res, {
      allowedOrigin,
      rateLimit: { bucket: "etherscan-proxy", limit: 120, windowMs: 60_000 },
    })
  ) {
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
