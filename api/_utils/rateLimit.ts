import type { VercelRequest, VercelResponse } from "@vercel/node";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  bucket: string;
  limit: number;
  windowMs: number;
  key?: string;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();
const MAX_KEYS_PER_BUCKET = 5_000;

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function requestClientKey(req: VercelRequest): string {
  const forwardedFor = firstHeaderValue(req.headers["x-forwarded-for"]);
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = firstHeaderValue(req.headers["x-real-ip"]);
  if (realIp?.trim()) return realIp.trim();

  return req.socket?.remoteAddress ?? "unknown";
}

export function enforceRateLimit(
  req: VercelRequest,
  res: VercelResponse,
  options: RateLimitOptions,
): boolean {
  const now = Date.now();
  const key = options.key ?? requestClientKey(req);
  const store = stores.get(options.bucket) ?? new Map<string, RateLimitEntry>();
  stores.set(options.bucket, store);
  pruneExpiredEntries(store, now);

  const current = store.get(key);
  const entry =
    current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + options.windowMs };

  entry.count += 1;
  store.set(key, entry);

  const remaining = Math.max(0, options.limit - entry.count);
  const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

  res.setHeader("X-RateLimit-Limit", String(options.limit));
  res.setHeader("X-RateLimit-Remaining", String(remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

  if (entry.count <= options.limit) return true;

  res.setHeader("Retry-After", String(retryAfter));
  res.status(429).json({ error: "rate_limited" });
  return false;
}

function pruneExpiredEntries(
  store: Map<string, RateLimitEntry>,
  now: number,
): void {
  if (store.size <= MAX_KEYS_PER_BUCKET) return;

  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }

  if (store.size <= MAX_KEYS_PER_BUCKET) return;

  const overflow = store.size - MAX_KEYS_PER_BUCKET;
  let removed = 0;
  for (const key of store.keys()) {
    store.delete(key);
    removed += 1;
    if (removed >= overflow) return;
  }
}
