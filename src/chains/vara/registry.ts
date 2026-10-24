import type { Hex } from "./model";

/** The Vara agents registry, where each registered program declares its handle, interface URL and the file's SHA-256.
 *  Reached through /api/vara-agents (Vite proxy locally, a Vercel rewrite in production): it sends no CORS header on replies. */
export const AGENTS_REGISTRY = "/api/vara-agents";
const MAX_IDL_BYTES = 512 * 1024;
type Entry = { handle: string | null; idlUrl: string | null; idlHash: string | null };
const entries = new Map<string, Promise<Entry | null>>();
const idls = new Map<string, Promise<string | null>>();

/** Session cache that forgets failures, so the next lookup asks again. */
function remember<T>(cache: Map<string, Promise<T | null>>, key: string, load: () => Promise<T | null>): Promise<T | null> {
  if (!cache.has(key)) {
    const pending = load().catch(() => null);
    cache.set(key, pending);
    void pending.then((v) => { if (v === null) cache.delete(key); });
  }
  return cache.get(key)!;
}

/** The registry row for a program, or null when it is not registered or the registry is unreachable. */
export function registryEntry(programId: Hex): Promise<Entry | null> {
  const id = programId.toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(id)) return Promise.resolve(null);
  return remember(entries, id, async () => {
    const res = await fetch(AGENTS_REGISTRY, {
      method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ query: `{ allApplications(condition: { id: "${id}" }) { nodes { handle idlUrl idlHash } } }` }),
    });
    if (!res.ok) return null;
    const row = (await res.json())?.data?.allApplications?.nodes?.[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    const text = (v: unknown) => (typeof v === "string" && v ? v : null);
    return { handle: text(row.handle), idlUrl: text(row.idlUrl), idlHash: text(row.idlHash) };
  });
}

/** A registered program's declared IDL, returned only when the downloaded bytes match the declared hash.
 *  Anything else (not registered, unreachable, too large, hash differs) is null and the caller falls back. */
export function registryIdl(programId: Hex): Promise<string | null> {
  return remember(idls, programId.toLowerCase(), async () => {
    const entry = await registryEntry(programId);
    if (!entry?.idlUrl?.startsWith("https://") || !entry.idlHash) return null;
    const file = await fetch(entry.idlUrl, { signal: AbortSignal.timeout(10_000) });
    if (!file.ok || Number(file.headers.get("content-length") ?? 0) > MAX_IDL_BYTES) return null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > MAX_IDL_BYTES) return null;
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const hex = `0x${Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")}`;
    return hex === entry.idlHash.toLowerCase() ? new TextDecoder().decode(bytes) : null;
  });
}
