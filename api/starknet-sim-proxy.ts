import type { VercelRequest, VercelResponse } from "@vercel/node";

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

function applyCors(req: VercelRequest, res: VercelResponse) {
  const origin =
    typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  const host =
    typeof req.headers.host === "string" ? req.headers.host : undefined;
  const allowed = resolveAllowedOrigin(origin, host);
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
  applyCors(req, res);

  const bridgeUrl = process.env.STARKNET_SIM_BRIDGE_URL;
  const apiKey = process.env.STARKNET_SIM_API_KEY;

  if (!bridgeUrl || !apiKey) {
    return res.status(503).json({ error: "bridge_not_configured" });
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const reqOrigin =
    typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  const reqHost =
    typeof req.headers.host === "string" ? req.headers.host : undefined;
  if (reqOrigin && !resolveAllowedOrigin(reqOrigin, reqHost)) {
    return res.status(403).json({ error: "origin_required" });
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

  const target = `${bridgeUrl.replace(/\/+$/, "")}/${subPath}`;

  const upstreamHeaders: Record<string, string> = {
    "X-API-Key": apiKey,
  };
  const ct = req.headers["content-type"];
  if (ct) upstreamHeaders["Content-Type"] = Array.isArray(ct) ? ct[0] : ct;
  const accept = req.headers["accept"];
  if (accept) upstreamHeaders["Accept"] = Array.isArray(accept) ? accept[0] : accept;
  const acceptEncoding = req.headers["accept-encoding"];
  if (acceptEncoding)
    upstreamHeaders["Accept-Encoding"] = Array.isArray(acceptEncoding)
      ? acceptEncoding[0]
      : acceptEncoding;

  try {
    const rawBody =
      req.method !== "GET" && req.method !== "HEAD"
        ? await getRawBody(req)
        : undefined;

    // SSE path (Sprint 3 step-through) — no hard timeout, abort on client disconnect
    const isSSE = /^step\/[^/]+\/events$/.test(subPath);
    const controller = new AbortController();

    if (isSSE) {
      req.on("close", () => controller.abort());
    } else {
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      req.on("close", () => clearTimeout(timer));
    }

    const upstream = await fetch(target, {
      method: req.method || "GET",
      headers: upstreamHeaders,
      body: rawBody,
      signal: controller.signal,
      redirect: "error",
    });

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

    res.status(upstream.status);

    const upstreamContentType = upstream.headers.get("content-type");
    if (upstreamContentType) res.setHeader("content-type", upstreamContentType);
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
    if (err instanceof Error && err.message === "body_too_large") {
      return res.status(413).json({ error: "body_too_large" });
    }
    if (err instanceof Error && err.name === "AbortError") {
      return res.status(504).json({ error: "bridge_timeout" });
    }
    console.error("[starknet-sim] upstream error:", err);
    res.status(502).json({ error: "bridge_unreachable" });
  }
}
