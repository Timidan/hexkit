import * as crypto from "crypto";

export interface GuardConfig {
  allowedOrigins: string[];
  proxySecret: string | undefined;
}

export interface GuardResult {
  ok: boolean;
  status?: number;
  reason?: string;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function isSameOriginOrLocalhost(origin: string, host: string | undefined): boolean {
  if (origin.startsWith("http://localhost:") || origin === "http://localhost") return true;
  if (origin.startsWith("http://127.0.0.1:") || origin === "http://127.0.0.1") return true;
  if (!host) return false;
  return origin === `https://${host}` || origin === `http://${host}`;
}

/**
 * Fail-closed request guard. Allow order:
 *   1. If proxySecret configured, require x-proxy-secret match (timing-safe).
 *   2. Else if Origin absent, allow (same-origin server call / curl).
 *   3. Else allow when origin is in allowedOrigins, is localhost/127.0.0.1,
 *      or equals same-host (http(s)://${host}).
 *   4. Anything else: reject 403. Empty allowedOrigins + external Origin
 *      does NOT open the proxy — previously this was a fail-open bug.
 */
export function checkRequestGuards(
  req: { headers: Record<string, string | string[] | undefined> },
  cfg: GuardConfig,
): GuardResult {
  const h = (name: string): string | undefined => {
    const v = req.headers[name.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
  };

  if (cfg.proxySecret) {
    const sent = h("x-proxy-secret") ?? "";
    return timingSafeEqualStr(sent, cfg.proxySecret)
      ? { ok: true }
      : { ok: false, status: 403, reason: "bad_proxy_secret" };
  }

  const origin = h("origin");
  const host = h("host");

  if (!origin) return { ok: true };

  if (cfg.allowedOrigins.includes(origin)) return { ok: true };
  if (isSameOriginOrLocalhost(origin, host)) return { ok: true };

  return { ok: false, status: 403, reason: "origin_not_allowed" };
}

export function readGuardConfigFromEnv(): GuardConfig {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const proxySecret = process.env.PROXY_SECRET || undefined;
  return { allowedOrigins, proxySecret };
}
