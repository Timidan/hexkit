import * as crypto from "crypto";

type Headers = Record<string, string | string[] | undefined>;

function getHeader(headers: Headers, name: string): string | undefined {
  const v = headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function hasValidProxySecret(req: { headers: Headers }): boolean {
  const secret = process.env.PROXY_SECRET;
  if (!secret) return false;
  const sent = getHeader(req.headers, "x-proxy-secret");
  if (!sent) return false;
  return timingSafeEqualStr(sent, secret);
}

export interface ServerKeyAuthResult {
  ok: boolean;
  status?: number;
  body?: { error: string };
}

export function authorizeServerKeyUse(
  req: { headers: Headers },
): ServerKeyAuthResult {
  if (!process.env.PROXY_SECRET) {
    return {
      ok: false,
      status: 503,
      body: { error: "server_key_not_authorized" },
    };
  }
  if (!hasValidProxySecret(req)) {
    return {
      ok: false,
      status: 403,
      body: { error: "forbidden" },
    };
  }
  return { ok: true };
}
