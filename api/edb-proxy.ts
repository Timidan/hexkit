import type { VercelRequest, VercelResponse } from "@vercel/node";
import { maybeInjectDefaultEtherscanKey } from "./edbShared.js";
import {
  applyCorsHeaders,
  fetchUpstream,
  handleCorsPreflight,
  readRawBody,
  sendBufferedUpstreamResponse,
  sendProxyError,
  streamSseResponse,
} from "./_utils/proxyHelper";

export const config = {
  api: { bodyParser: false },
  maxDuration: 300,
};

const MAX_BODY_BYTES = 50 * 1024 * 1024; // 50 MB (artifacts_inline can be large)
const FETCH_TIMEOUT_MS = 120_000; // 2 min for regular requests
const ALLOWED_METHODS = new Set(["GET", "POST", "OPTIONS", "HEAD"]);

// CORS allowlist — dev servers by default; extend via EDB_CORS_ALLOWED_ORIGINS (comma-separated).
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
  // Allow same-host requests (covers prod + every Vercel preview deployment)
  if (host && origin === `https://${host}`) return origin;
  const extra = process.env.EDB_CORS_ALLOWED_ORIGINS;
  if (extra) {
    const list = extra
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.includes(origin)) return origin;
  }
  return null;
}

function applyCors(req: VercelRequest, res: VercelResponse) {
  const origin =
    typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  const host =
    typeof req.headers.host === "string" ? req.headers.host : undefined;
  const allowed = resolveAllowedOrigin(origin, host);
  if (allowed) {
    applyCorsHeaders(res, {
      allowedOrigin: allowed,
      allowMethods: "GET, POST, OPTIONS, HEAD",
      allowHeaders: "Content-Type, Accept",
      maxAge: "600",
      varyOrigin: true,
    });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res);

  const bridgeUrl = process.env.EDB_BRIDGE_URL;
  const apiKey = process.env.EDB_API_KEY;
  const defaultEtherscanApiKey = process.env.ETHERSCAN_API_KEY;

  if (!bridgeUrl) {
    return res.status(503).json({ error: "bridge_not_configured" });
  }
  if (!apiKey) {
    return res.status(503).json({ error: "bridge_not_configured" });
  }

  // OPTIONS preflight — CORS headers already set above
  if (req.method === "OPTIONS") {
    handleCorsPreflight(req, res);
    return;
  }

  // Origin check: allow same-origin requests (no Origin header) and allowlisted origins.
  const reqOrigin =
    typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  const reqHost =
    typeof req.headers.host === "string" ? req.headers.host : undefined;
  if (reqOrigin && !resolveAllowedOrigin(reqOrigin, reqHost)) {
    return res.status(403).json({ error: "origin_required" });
  }

  // Method allowlist
  if (!ALLOWED_METHODS.has(req.method || "GET")) {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  // Extract sub-path from the `path` query param populated by the Vercel
  // rewrite rule in vercel.json. Vercel's file-based catch-all routing
  // (`api/edb/[...path].ts`) does not reliably match multi-segment requests
  // under `/api/edb/*` on this project, so we route via an explicit rewrite
  // that mirrors the lifi-composer pattern.
  const pathParam = req.query?.path;
  const subPath = Array.isArray(pathParam)
    ? pathParam.join("/")
    : typeof pathParam === "string"
      ? pathParam
      : "";

  // Validate each path segment
  const parts = subPath ? subPath.split("/") : [];
  for (const seg of parts) {
    if (seg === "." || seg === ".." || /[^a-zA-Z0-9_\-:.]/.test(seg)) {
      return res.status(400).json({ error: "invalid_path" });
    }
  }

  const target = `${bridgeUrl.replace(/\/+$/, "")}/${subPath}`;

  // Build upstream headers (explicit allowlist — no client headers leak through)
  const upstreamHeaders: Record<string, string> = {
    "X-API-Key": apiKey,
  };
  const ct = req.headers["content-type"];
  if (ct) upstreamHeaders["Content-Type"] = ct;
  const accept = req.headers["accept"];
  if (accept) upstreamHeaders["Accept"] = accept;
  const acceptEncoding = req.headers["accept-encoding"];
  if (acceptEncoding) upstreamHeaders["Accept-Encoding"] = acceptEncoding;

  try {
    const rawBody =
      req.method !== "GET" && req.method !== "HEAD"
        ? await readRawBody(req, MAX_BODY_BYTES)
        : undefined;
    const body = maybeInjectDefaultEtherscanKey(
      rawBody,
      req.headers["content-type"],
      subPath,
      defaultEtherscanApiKey,
    );

    // Detect SSE path — use longer timeout, abort on client disconnect
    const isSSE = subPath.match(/debug\/prepare\/[^/]+\/events$/);

    const upstream = await fetchUpstream(
      req,
      target,
      {
        method: req.method || "GET",
        headers: upstreamHeaders,
        body,
        redirect: "error", // never follow redirects — prevents key leaking to unexpected hosts
      },
      isSSE ? { abortOnClose: true } : { timeoutMs: FETCH_TIMEOUT_MS },
    );

    if (await streamSseResponse(res, upstream)) {
      return;
    }

    // Standard response — pipe status + body
    await sendBufferedUpstreamResponse(res, upstream);
  } catch (err: unknown) {
    return sendProxyError(res, err, {
      logLabel: "edb",
      timeout: { status: 504, body: { error: "bridge_timeout" } },
      upstream: { status: 502, body: { error: "bridge_unreachable" } },
    });
  }
}
