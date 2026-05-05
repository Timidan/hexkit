import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  applyCorsHeaders,
  fetchUpstream,
  handleCorsPreflight,
  readRawBody,
  sendBufferedUpstreamResponse,
  sendProxyError,
  streamSseResponse,
} from "./_utils/proxyHelper";
import { enforceRateLimit } from "./_utils/rateLimit";
import { validatePublicRpcUrl } from "./_utils/rpcUrlSafety";

export const config = {
  api: { bodyParser: false },
  maxDuration: 300,
};

const MAX_BODY_BYTES = 50 * 1024 * 1024; // 50 MB — matches EDB
const FETCH_TIMEOUT_MS = 120_000;
const ALLOWED_METHODS = new Set(["GET", "POST", "OPTIONS", "HEAD"]);

const DEFAULT_ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);

function resolveAllowedOrigin(
  origin: string | undefined,
  host?: string,
): string | null {
  if (!origin) return null;
  if (DEFAULT_ALLOWED_ORIGINS.has(origin)) return origin;
  if (host && origin === `https://${host}`) return origin;
  const extra = process.env.STARKNET_SIM_CORS_ALLOWED_ORIGINS;
  if (extra) {
    const list = extra
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.includes(origin)) return origin;
  }
  return null;
}

function corsOptionsFor(req: VercelRequest) {
  const origin =
    typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  const host =
    typeof req.headers.host === "string" ? req.headers.host : undefined;
  const allowed = resolveAllowedOrigin(origin, host);
  if (!allowed) return undefined;
  return {
    allowedOrigin: allowed,
    allowMethods: "GET, POST, OPTIONS, HEAD",
    allowHeaders: "Content-Type, Accept, X-Starknet-Rpc-Url",
    maxAge: "600",
    varyOrigin: true,
  };
}

function applyCors(req: VercelRequest, res: VercelResponse) {
  const options = corsOptionsFor(req);
  if (options) applyCorsHeaders(res, options);
}

function isHeavyBridgePath(subPath: string): boolean {
  return (
    subPath === "simulate" ||
    subPath === "simulate/prepare" ||
    subPath === "estimate-fee" ||
    /^trace\/[^/]+$/.test(subPath)
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    handleCorsPreflight(req, res, () => corsOptionsFor(req));
    return;
  }

  applyCors(req, res);

  const bridgeUrl = process.env.STARKNET_SIM_BRIDGE_URL;
  const apiKey = process.env.STARKNET_SIM_API_KEY;

  if (!bridgeUrl || !apiKey) {
    return res.status(503).json({ error: "bridge_not_configured" });
  }

  const reqOrigin =
    typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  const reqHost =
    typeof req.headers.host === "string" ? req.headers.host : undefined;

  // Requests that carry a disallowed Origin are always rejected.
  if (reqOrigin && !resolveAllowedOrigin(reqOrigin, reqHost)) {
    return res.status(403).json({ error: "origin_not_allowed" });
  }

  // If the request carries an RPC override header and no Origin, we cannot
  // verify it came from an allowed browser context. Reject to close the
  // SSRF path where a non-browser client bypasses the CORS check by simply
  // omitting the Origin header and supplies an arbitrary RPC URL.
  const hasRpcOverride = typeof req.headers["x-starknet-rpc-url"] === "string"
    || Array.isArray(req.headers["x-starknet-rpc-url"]);
  if (hasRpcOverride && !reqOrigin) {
    return res.status(403).json({ error: "origin_required_for_rpc_override" });
  }

  if (!ALLOWED_METHODS.has(req.method || "GET")) {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const pathParam = req.query?.path;
  const subPath = Array.isArray(pathParam)
    ? pathParam.join("/")
    : typeof pathParam === "string"
      ? pathParam
      : "";

  const parts = subPath ? subPath.split("/") : [];
  for (const seg of parts) {
    if (seg === "." || seg === ".." || /[^a-zA-Z0-9_\-:.]/.test(seg)) {
      return res.status(400).json({ error: "invalid_path" });
    }
  }

  const isHeavyPath = isHeavyBridgePath(subPath);
  if (isHeavyPath && !reqOrigin) {
    return res.status(403).json({ error: "origin_required_for_heavy_route" });
  }

  const targetUrl = new URL(
    `${bridgeUrl.replace(/\/+$/, "")}/${subPath}`,
  );
  for (const [key, raw] of Object.entries(req.query ?? {})) {
    if (key === "path") continue;
    if (Array.isArray(raw)) {
      for (const value of raw) targetUrl.searchParams.append(key, value);
    } else if (typeof raw === "string") {
      targetUrl.searchParams.append(key, raw);
    }
  }
  const target = targetUrl.toString();

  if (
    !enforceRateLimit(req, res, {
      bucket: isHeavyPath ? "starknet-sim-heavy" : "starknet-sim",
      limit: isHeavyPath ? 12 : 120,
      windowMs: 60_000,
    })
  ) {
    return;
  }

  const upstreamHeaders: Record<string, string> = {};
  upstreamHeaders["X-API-Key"] = apiKey;
  const ct = req.headers["content-type"];
  if (ct) upstreamHeaders["Content-Type"] = Array.isArray(ct) ? ct[0] : ct;
  const accept = req.headers["accept"];
  if (accept) upstreamHeaders["Accept"] = Array.isArray(accept) ? accept[0] : accept;
  const acceptEncoding = req.headers["accept-encoding"];
  if (acceptEncoding)
    upstreamHeaders["Accept-Encoding"] = Array.isArray(acceptEncoding)
      ? acceptEncoding[0]
      : acceptEncoding;

  // Forward per-request RPC override the frontend resolves from the
  // user's network config. The bridge's `rpc_override::resolve` reads
  // it for /simulate, /trace, /estimate-fee and falls back to its
  // STARKNET_RPC_URL env if the header is missing.
  const rpcOverride = req.headers["x-starknet-rpc-url"];
  if (rpcOverride) {
    const value = Array.isArray(rpcOverride) ? rpcOverride[0] : rpcOverride;
    if (typeof value === "string") {
      const validation = validatePublicRpcUrl(value, {
        allowedHostsEnv: "STARKNET_SIM_RPC_ALLOWED_HOSTS",
      });
      if (!validation.ok) {
        return res.status(400).json({
          error: "invalid_rpc_override",
          reason: validation.reason,
        });
      }
      upstreamHeaders["X-Starknet-Rpc-Url"] = value;
    }
  }

  try {
    const rawBody =
      req.method !== "GET" && req.method !== "HEAD"
        ? await readRawBody(req, MAX_BODY_BYTES)
        : undefined;

    // SSE paths — no hard timeout, abort on client disconnect.
    const isSSE =
      /^step\/[^/]+\/events$/.test(subPath) ||
      /^simulate\/prepare\/[^/]+\/events$/.test(subPath);

    const upstream = await fetchUpstream(
      req,
      target,
      {
        method: req.method || "GET",
        headers: upstreamHeaders,
        body: rawBody,
        redirect: "error",
      },
      isSSE ? { abortOnClose: true } : { timeoutMs: FETCH_TIMEOUT_MS },
    );

    if (await streamSseResponse(res, upstream)) {
      return;
    }

    await sendBufferedUpstreamResponse(res, upstream);
  } catch (err: unknown) {
    return sendProxyError(res, err, {
      logLabel: "starknet-sim",
      bodyTooLarge: { status: 413, body: { error: "body_too_large" } },
      timeout: { status: 504, body: { error: "bridge_timeout" } },
      upstream: { status: 502, body: { error: "bridge_unreachable" } },
    });
  }
}
