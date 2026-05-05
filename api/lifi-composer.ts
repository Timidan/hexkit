import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  applyCorsHeaders,
  fetchUpstream,
  handleCorsPreflight,
  sendProxyError,
  sendTextUpstreamResponse,
} from "./_utils/proxyHelper";
import {
  enforcePublicProxyAccess,
  resolveAllowedProxyOrigin,
} from "./_utils/publicProxyGuard";

export const config = {
  api: { bodyParser: false },
  maxDuration: 30,
};

const LIFI_BASE = "https://li.quest";
const LIFI_API_KEY = process.env.LIFI_API_KEY || "";
const ALLOWED_METHODS = new Set(["GET", "OPTIONS", "HEAD"]);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const allowedOrigin = resolveAllowedProxyOrigin(req);

  if (
    handleCorsPreflight(req, res, {
      allowedOrigin,
      allowMethods: "GET, OPTIONS",
      allowHeaders: "Content-Type, x-proxy-secret",
    })
  ) {
    return;
  }

  if (!ALLOWED_METHODS.has(req.method || "")) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (
    !enforcePublicProxyAccess(req, res, {
      allowedOrigin,
      rateLimit: { bucket: "lifi-composer", limit: 90, windowMs: 60_000 },
    })
  ) {
    return;
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
    const upstreamRes = await fetchUpstream(
      req,
      upstream,
      {
        method: "GET",
        headers: {
          "x-lifi-api-key": LIFI_API_KEY,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(25000),
      },
    );

    applyCorsHeaders(res, { allowedOrigin });
    await sendTextUpstreamResponse(res, upstreamRes, {
      "Content-Type": "application/json",
    });
    return;
  } catch (err) {
    return sendProxyError(res, err, {
      logLabel: "lifi-composer",
      upstream: { status: 502, body: { error: "Upstream request failed" } },
    });
  }
}
