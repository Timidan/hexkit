import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = {
  api: { bodyParser: false },
  maxDuration: 60,
};

// Vercel caps both request and response bodies at 4.5 MB, regardless of bodyParser.
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 50_000; // Leaves room around the bridge's 45-second run limit.
const SIZE_ERROR = "Scenario exceeds the hosted simulator's 4 MiB JSON limit (including hex-encoded WASM and IDL). Use smaller inputs or export JSON and run it with a local HexKit runtime.";
const DEFAULT_ALLOWED_ORIGINS = new Set([
  "http://localhost:5173", "http://127.0.0.1:5173",
  "http://localhost:5174", "http://127.0.0.1:5174",
  "http://localhost:4173", "http://127.0.0.1:4173",
]);

function resolveAllowedOrigin(origin: string | undefined, host?: string): string | null {
  if (!origin) return null;
  if (DEFAULT_ALLOWED_ORIGINS.has(origin) || (host && origin === `https://${host}`)) return origin;
  return process.env.VARA_SIMULATOR_CORS_ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).includes(origin) ? origin : null;
}

function getRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        // Drain without destroying the socket so the caller receives the 413.
        chunks.length = 0;
        reject(new Error("body_too_large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
    req.on("aborted", () => reject(new Error("request_aborted")));
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  const host = typeof req.headers.host === "string" ? req.headers.host : undefined;
  const allowed = resolveAllowedOrigin(origin, host);
  if (origin && !allowed) return res.status(403).json({ error: "Origin is not allowed" });
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", allowed);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
    res.setHeader("Access-Control-Max-Age", "600");
  }
  if (req.method === "OPTIONS") return res.status(204).end();

  const bridgeUrl = process.env.VARA_SIMULATOR_BRIDGE_URL;
  const apiKey = process.env.VARA_SIMULATOR_API_KEY;
  if (!bridgeUrl || !apiKey) return res.status(503).json({ error: "Hosted simulator is not configured" });

  // Only these two bridge endpoints are exposed; no arbitrary paths or query forwarding.
  const subPath = req.query?.path;
  if (subPath !== "health" && subPath !== "run") return res.status(404).json({ error: "Not found" });
  if (req.method !== (subPath === "health" ? "GET" : "POST")) return res.status(405).json({ error: "Method not allowed" });
  if (subPath === "run" && !req.headers["content-type"]?.startsWith("application/json")) return res.status(415).json({ error: "Use application/json" });
  if (Number(req.headers["content-length"]) > MAX_BODY_BYTES) return res.status(413).json({ error: SIZE_ERROR });

  const controller = new AbortController();
  const disconnected = () => { if (!res.writableEnded) controller.abort(); };
  res.on("close", disconnected);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const body = subPath === "run" ? await getRawBody(req) : undefined;
    timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const upstream = await fetch(`${bridgeUrl.replace(/\/+$/, "")}/${subPath}`, {
      method: req.method,
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json", "Accept": "application/json" },
      body,
      signal: controller.signal,
      redirect: "error", // Never send the key to a redirect destination.
    });
    const output = Buffer.from(await upstream.arrayBuffer());
    if (output.length > MAX_BODY_BYTES) return res.status(502).json({ error: "Scenario report exceeds the hosted simulator's 4 MiB response limit. Use fewer steps or run it with a local HexKit runtime." });
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    return res.status(upstream.status).send(output);
  } catch (error) {
    if (error instanceof Error && error.message === "body_too_large") return res.status(413).json({ error: SIZE_ERROR });
    if (controller.signal.aborted) return res.status(504).json({ error: "Hosted simulator timed out. Try again or use a local runtime." });
    return res.status(502).json({ error: "Hosted simulator is unreachable. Try again later." });
  } finally {
    clearTimeout(timer);
    res.off("close", disconnected);
  }
}
