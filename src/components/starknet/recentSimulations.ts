// Newest-first localStorage cache of recently-run sim/trace requests.
// Keeps the page useful across reloads — paste a hash, run a trace,
// reload, and your last few runs are still one click away.
//
// Trace and synthetic simulate share a single bucket so the sidebar can
// render them inline-mixed with relative timestamps; the entry's `kind`
// tells the page which view to restore into.

import type { InvokeFormState } from "./invokeRequestBuilder";

const STORAGE_KEY = "hexkit:starknet-sim:recents:v1";
const MAX_ENTRIES = 12;

export type RecentTrace = {
  id: string;
  kind: "trace";
  txHash: string;
  /** ms since epoch — written when the run finished. */
  ts: number;
};

export type RecentSynthetic = {
  id: string;
  kind: "synthetic";
  /** Snapshot of the form state at submit time. */
  form: InvokeFormState;
  ts: number;
};

export type RecentItem = RecentTrace | RecentSynthetic;

export function loadRecents(): RecentItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecentItem) : [];
  } catch {
    return [];
  }
}

export function saveRecents(items: RecentItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Quota / disabled storage — best-effort, sidebar just resets.
  }
}

/** Push a new entry to the front, deduping by hash (trace) or full
 *  form snapshot (synthetic), then cap at MAX_ENTRIES. */
export function pushRecent(item: RecentItem): RecentItem[] {
  const current = loadRecents();
  const filtered = current.filter((c) => !sameTarget(c, item));
  const next = [item, ...filtered].slice(0, MAX_ENTRIES);
  saveRecents(next);
  return next;
}

export function clearRecents(): RecentItem[] {
  saveRecents([]);
  return [];
}

export function newId(): string {
  // Lightweight monotonic ID — not security-relevant, just a React key.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sameTarget(a: RecentItem, b: RecentItem): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "trace" && b.kind === "trace") {
    return a.txHash.toLowerCase() === b.txHash.toLowerCase();
  }
  if (a.kind === "synthetic" && b.kind === "synthetic") {
    return (
      a.form.senderAddress === b.form.senderAddress &&
      a.form.nonce === b.form.nonce &&
      a.form.calldata === b.form.calldata
    );
  }
  return false;
}

function isRecentItem(value: unknown): value is RecentItem {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || typeof v.ts !== "number") return false;
  if (v.kind === "trace") return typeof v.txHash === "string";
  if (v.kind === "synthetic") return !!v.form && typeof v.form === "object";
  return false;
}
