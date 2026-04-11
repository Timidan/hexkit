import type { VercelRequest, VercelResponse } from "@vercel/node";
import { maybeInjectDefaultEtherscanKey } from "../edbShared.js";

export const config = {
  api: { bodyParser: false },
  maxDuration: 300,
};

const MAX_BODY_BYTES = 50 * 1024 * 1024; // 50 MB (artifacts_inline can be large)
const FETCH_TIMEOUT_MS = 120_000; // 2 min for regular requests
const ALLOWED_METHODS = new Set(["GET", "POST", "OPTIONS", "HEAD"]);

// CORS allowlist — dev servers by default; extend via EDB_CORS_ALLOWED_ORIGINS (comma-separated).
// No credentials are used (auth is injected server-side), so reflecting a matched origin is safe.
const DEFAULT_ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);

function resolveAllowedOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  if (DEFAULT_ALLOWED_ORIGINS.has(origin)) return origin;
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
  const allowed = resolveAllowedOrigin(origin);
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", allowed);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
    res.setHeader("Access-Control-Max-Age", "600");
  }
}

function getRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("body_too_large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Apply CORS first so every response path (errors, preflight, streaming) includes headers.
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

  // Method allowlist
  if (!ALLOWED_METHODS.has(req.method || "GET")) {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  // OPTIONS preflight — CORS headers already set above
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // Extract sub-path from URL — more reliable than req.query.path across Vercel runtimes
  const urlPath = (req.url || "").split("?")[0];
  const subPath = urlPath.replace(/^\/api\/edb\/?/, "");

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
        ? await getRawBody(req)
        : undefined;
    const body = maybeInjectDefaultEtherscanKey(
      rawBody,
      req.headers["content-type"],
      subPath,
      defaultEtherscanApiKey,
    );

    // Detect SSE path — use longer timeout, abort on client disconnect
    const isSSE = subPath.match(/debug\/prepare\/[^/]+\/events$/);
    const controller = new AbortController();

    if (isSSE) {
      // Abort upstream when client disconnects
      req.on("close", () => controller.abort());
    } else {
      // Regular requests get a hard timeout
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      req.on("close", () => clearTimeout(timer));
    }

    const upstream = await fetch(target, {
      method: req.method || "GET",
      headers: upstreamHeaders,
      body,
      signal: controller.signal,
      redirect: "error", // never follow redirects — prevents key leaking to unexpected hosts
    });

    // SSE streaming response
    const contentType = upstream.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream") && upstream.body) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(decoder.decode(value, { stream: true }));
        }
      } catch {
        // client disconnected or upstream closed
      } finally {
        reader.cancel().catch(() => {});
        res.end();
      }
      return;
    }

    // Standard response — pipe status + body
    res.status(upstream.status);

    const upstreamContentType = upstream.headers.get("content-type");
    if (upstreamContentType) res.setHeader("content-type", upstreamContentType);
    // Merge upstream Vary with any Vary header set in applyCors (e.g., "Origin")
    // so CORS cache keys remain correct.
    const upstreamVary = upstream.headers.get("vary");
    if (upstreamVary) {
      const existing = res.getHeader("Vary");
      res.setHeader(
        "Vary",
        existing ? `${existing}, ${upstreamVary}` : upstreamVary,
      );
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return res.status(504).json({ error: "bridge_timeout" });
    }
    console.error("[edb] upstream error:", err);
    res.status(502).json({ error: "bridge_unreachable" });
  }
}
