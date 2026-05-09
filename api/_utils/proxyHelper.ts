import type { VercelRequest, VercelResponse } from "@vercel/node";

export interface CorsHeadersOptions {
  allowedOrigin?: string | null;
  allowMethods?: string;
  allowHeaders?: string;
  maxAge?: string;
  varyOrigin?: boolean;
}

export function applyCorsHeaders(
  res: VercelResponse,
  options: CorsHeadersOptions,
): void {
  if (options.allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", options.allowedOrigin);
    if (options.varyOrigin) {
      res.setHeader("Vary", "Origin");
    }
  }
  if (options.allowMethods) {
    res.setHeader("Access-Control-Allow-Methods", options.allowMethods);
  }
  if (options.allowHeaders) {
    res.setHeader("Access-Control-Allow-Headers", options.allowHeaders);
  }
  if (options.maxAge) {
    res.setHeader("Access-Control-Max-Age", options.maxAge);
  }
}

export function handleCorsPreflight(
  req: VercelRequest,
  res: VercelResponse,
  cors?: CorsHeadersOptions | (() => CorsHeadersOptions | undefined),
): boolean {
  if (req.method !== "OPTIONS") return false;
  const options = typeof cors === "function" ? cors() : cors;
  if (options) applyCorsHeaders(res, options);
  res.status(204).end();
  return true;
}

export function readRawBody(
  req: VercelRequest,
  maxBodyBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBodyBytes) {
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

export interface ProxyAbortOptions {
  timeoutMs?: number;
  abortOnClose?: boolean;
}

export function createProxyAbortSignal(
  req: VercelRequest,
  options: ProxyAbortOptions,
): AbortSignal {
  const controller = new AbortController();

  if (options.abortOnClose) {
    req.on("close", () => controller.abort());
  }

  if (typeof options.timeoutMs === "number") {
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    req.on("close", () => clearTimeout(timer));
  }

  return controller.signal;
}

export function fetchUpstream(
  req: VercelRequest,
  input: string | URL,
  init: RequestInit,
  abort?: ProxyAbortOptions,
): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: abort ? createProxyAbortSignal(req, abort) : init.signal,
  });
}

export async function sendTextUpstreamResponse(
  res: VercelResponse,
  upstream: Response,
  headers?: Record<string, string>,
): Promise<void> {
  if (headers) {
    for (const [name, value] of Object.entries(headers)) {
      res.setHeader(name, value);
    }
  }

  const body = await upstream.text();
  res.status(upstream.status).send(body);
}

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const DEFAULT_BUFFERED_HEADER_NAMES = ["content-type", "vary"];

export interface BufferedUpstreamResponseOptions {
  headerNames?: Iterable<string>;
}

export async function sendBufferedUpstreamResponse(
  res: VercelResponse,
  upstream: Response,
  options: BufferedUpstreamResponseOptions = {},
): Promise<void> {
  res.status(upstream.status);

  for (const name of options.headerNames ?? DEFAULT_BUFFERED_HEADER_NAMES) {
    const lowerName = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lowerName)) continue;

    const value = upstream.headers.get(name);
    if (!value) continue;

    if (lowerName === "vary") {
      const existing = res.getHeader("Vary");
      res.setHeader("Vary", existing ? `${existing}, ${value}` : value);
    } else {
      res.setHeader(lowerName, value);
    }
  }

  const buf = Buffer.from(await upstream.arrayBuffer());
  res.send(buf);
}

export async function streamSseResponse(
  res: VercelResponse,
  upstream: Response,
): Promise<boolean> {
  const contentType = upstream.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream") || !upstream.body) {
    return false;
  }

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
    // Client disconnected or upstream closed.
  } finally {
    reader.cancel().catch(() => {});
    res.end();
  }

  return true;
}

export interface JsonProxyError {
  status: number;
  body: { error: string };
}

export interface ProxyErrorOptions {
  logLabel: string;
  upstream: JsonProxyError;
  timeout?: JsonProxyError;
  bodyTooLarge?: JsonProxyError;
}

export function sendProxyError(
  res: VercelResponse,
  err: unknown,
  options: ProxyErrorOptions,
): VercelResponse {
  if (
    options.bodyTooLarge &&
    err instanceof Error &&
    err.message === "body_too_large"
  ) {
    return res
      .status(options.bodyTooLarge.status)
      .json(options.bodyTooLarge.body);
  }

  if (options.timeout && err instanceof Error && err.name === "AbortError") {
    return res.status(options.timeout.status).json(options.timeout.body);
  }

  console.error(`[${options.logLabel}] upstream error:`, err);
  return res.status(options.upstream.status).json(options.upstream.body);
}
