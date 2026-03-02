import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = {
  api: { bodyParser: false },
  maxDuration: 300,
};

function getRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  const bridgeUrl = process.env.EDB_BRIDGE_URL;
  const apiKey = process.env.EDB_API_KEY;

  if (!bridgeUrl) {
    return res.status(503).json({ error: "bridge_not_configured" });
  }

  // Extract sub-path: /api/edb/simulate → simulate
  const segments = req.query.path;
  const subPath = Array.isArray(segments) ? segments.join("/") : segments || "";
  const target = `${bridgeUrl.replace(/\/+$/, "")}/${subPath}`;

  // Build upstream headers
  const upstreamHeaders: Record<string, string> = {};
  const ct = req.headers["content-type"];
  if (ct) upstreamHeaders["Content-Type"] = ct;
  const accept = req.headers["accept"];
  if (accept) upstreamHeaders["Accept"] = accept;
  const acceptEncoding = req.headers["accept-encoding"];
  if (acceptEncoding) upstreamHeaders["Accept-Encoding"] = acceptEncoding;
  if (apiKey) upstreamHeaders["X-API-Key"] = apiKey;

  // OPTIONS passthrough (shouldn't normally hit serverless, but just in case)
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    const body =
      req.method !== "GET" && req.method !== "HEAD"
        ? await getRawBody(req)
        : undefined;

    const upstream = await fetch(target, {
      method: req.method || "GET",
      headers: upstreamHeaders,
      body,
    });

    // Detect SSE response
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
        res.end();
      }
      return;
    }

    // Standard response — pipe status + body
    res.status(upstream.status);

    for (const key of ["content-type", "content-encoding", "vary"]) {
      const v = upstream.headers.get(key);
      if (v) res.setHeader(key, v);
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "bridge_unreachable";
    res.status(502).json({ error: "bridge_unreachable", details: message });
  }
}
