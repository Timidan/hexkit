import type { VercelRequest, VercelResponse } from "@vercel/node";
import { hasValidProxySecret } from "../_llm/requireAuth";
import { enforceRateLimit, type RateLimitOptions } from "./rateLimit";

export interface ResolveAllowedOriginOptions {
  envVar?: string;
  allowLocalhost?: boolean;
}

export interface PublicProxyAccessOptions {
  allowedOrigin: string | null;
  rateLimit: RateLimitOptions;
  allowServerSecretBypass?: boolean;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function resolveAllowedProxyOrigin(
  req: VercelRequest,
  options: ResolveAllowedOriginOptions = {},
): string | null {
  const origin = headerValue(req.headers.origin);
  if (!origin) return null;

  const envVar = options.envVar ?? "ALLOWED_ORIGINS";
  const configured = (process.env[envVar] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.includes(origin)) return origin;

  if (options.allowLocalhost !== false) {
    if (
      origin.startsWith("http://localhost:") ||
      origin.startsWith("http://127.0.0.1:")
    ) {
      return origin;
    }
  }

  const host = headerValue(req.headers.host);
  if (host && origin === `https://${host}`) return origin;

  return null;
}

export function enforcePublicProxyAccess(
  req: VercelRequest,
  res: VercelResponse,
  options: PublicProxyAccessOptions,
): boolean {
  if (options.allowServerSecretBypass !== false && hasValidProxySecret(req)) {
    return true;
  }

  const origin = headerValue(req.headers.origin);
  if (origin && !options.allowedOrigin) {
    res.status(403).json({ error: "origin_not_allowed" });
    return false;
  }

  return enforceRateLimit(req, res, options.rateLimit);
}
