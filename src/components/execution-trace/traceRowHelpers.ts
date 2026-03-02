/**
 * Pure formatting helpers and source-resolution logic extracted from
 * TraceRowRenderer.tsx to keep individual files under 800 lines.
 *
 * Every export is a plain function (no React / hooks) so it can be
 * imported by any module in the execution-trace directory.
 */

// ── Formatting helpers ──────────────────────────────────────────────

/** Split a string by top-level commas (respecting brackets). */
export function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of value) {
    if (ch === "[" || ch === "{" || ch === "(") depth += 1;
    if (ch === "]" || ch === "}" || ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Produce a compact preview of arrays / objects / long strings. */
export function compactPreviewValue(rawValue: string): string {
  const value = String(rawValue ?? "").trim();
  if (!value) return value;
  const looksArray = value.startsWith("[") && value.endsWith("]");
  const looksObject = value.startsWith("{") && value.endsWith("}");

  if (looksArray) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return "[]";
    const items = splitTopLevel(inner);
    if (items.length > 3) {
      const previewItems = items
        .slice(0, 3)
        .map((item) => (item.length > 30 ? `${item.slice(0, 30)}\u2026` : item));
      return `[${previewItems.join(", ")}, ... (${items.length})]`;
    }
    return value.length > 120 ? `${value.slice(0, 80)}\u2026${value.slice(-20)}` : value;
  }

  if (looksObject) {
    const inner = value.slice(1, -1).trim();
    const entries = inner ? splitTopLevel(inner) : [];
    if (entries.length > 2) {
      const previewEntries = entries
        .slice(0, 2)
        .map((entry) => (entry.length > 34 ? `${entry.slice(0, 34)}\u2026` : entry));
      return `{${previewEntries.join(", ")}, ... (${entries.length})}`;
    }
    return value.length > 120 ? `${value.slice(0, 80)}\u2026${value.slice(-20)}` : value;
  }

  return value.length > 140 ? `${value.slice(0, 90)}\u2026${value.slice(-30)}` : value;
}

/** Decide whether a value is complex enough to warrant an expand button. */
export function shouldExpandValue(rawValue: string): boolean {
  const value = String(rawValue ?? "").trim();
  if (!value) return false;
  if (value.length > 120) return true;
  if (value.includes("\n")) return true;
  const looksArray = value.startsWith("[") && value.endsWith("]");
  const looksObject = value.startsWith("{") && value.endsWith("}");
  if (!(looksArray || looksObject)) return false;
  const commaCount = (value.match(/,/g) || []).length;
  return value.length > 40 || commaCount > 2;
}

/** Decide popover vs. modal for a large value. */
export function getDetailMode(value: string): "popover" | "modal" {
  const commaCount = (value.match(/,/g) || []).length;
  const lineCount = value.split("\n").length;
  if (value.length > 1800 || commaCount > 24 || lineCount > 8) {
    return "modal";
  }
  return "popover";
}

/** Check whether an event has enough args to warrant expansion. */
export function isEventExpandable(
  args: Array<{ name: string | number; value: string }>,
  previewLimit = 2,
  charLimit = 20,
): boolean {
  if (args.length > previewLimit) return true;
  return args.some(
    (arg) => String(arg.value).length > charLimit || String(arg.value).includes("\n"),
  );
}

// ── Opcode CSS class ────────────────────────────────────────────────

/** Return a CSS class for opcode-level colour coding. */
export function getOpcodeClass(opName?: string): string {
  if (!opName) return "";
  const upper = opName.toUpperCase();
  if (upper === "SLOAD") return "op-sload";
  if (upper === "SSTORE") return "op-sstore";
  if (upper.startsWith("LOG")) return "op-log";
  if (upper === "JUMP" || upper === "JUMPI" || upper === "JUMPDEST") return "op-jump";
  if (upper === "CALL") return "op-call";
  if (upper === "STATICCALL") return "op-staticcall";
  if (upper === "DELEGATECALL") return "op-delegatecall";
  if (upper === "CALLCODE") return "op-callcode";
  if (upper === "CREATE") return "op-create";
  if (upper === "CREATE2") return "op-create2";
  if (upper === "RETURN") return "op-return";
  if (upper === "REVERT") return "op-revert";
  if (upper === "STOP") return "op-stop";
  if (upper === "SELFDESTRUCT") return "op-selfdestruct";
  if (upper === "MLOAD" || upper === "MSTORE" || upper === "MSTORE8") return "op-memory";
  if (upper === "SHA3" || upper === "KECCAK256") return "op-hash";
  return "";
}

// ── Source resolution ───────────────────────────────────────────────

/**
 * Build a source-content resolver that maps a `sourceFile` name to
 * the full source text from the `sourceTexts` dictionary.  Handles
 * normalised-path matching, suffix matching, and filename-only
 * matching.  Returns a cached lookup closure.
 */
export function buildSourceResolver(
  sourceTexts: Record<string, string> | undefined,
): (sourceFile?: string | null) => string | null {
  if (!sourceTexts) {
    return (_sourceFile?: string | null): string | null => null;
  }

  const normalizePath = (value: string): string =>
    String(value || "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\.\/+/, "")
      .replace(/^\/+/, "");

  const keys = Object.keys(sourceTexts);
  const normalizedToOriginal = new Map<string, string>();
  const filenameToKeys = new Map<string, string[]>();

  for (const key of keys) {
    const normalizedKey = normalizePath(key);
    if (!normalizedToOriginal.has(normalizedKey)) {
      normalizedToOriginal.set(normalizedKey, key);
    }
    const filename = normalizedKey.split("/").pop() || normalizedKey;
    const existing = filenameToKeys.get(filename) || [];
    existing.push(key);
    filenameToKeys.set(filename, existing);
  }

  const cache = new Map<string, string | null>();

  return (sourceFile?: string | null): string | null => {
    if (!sourceFile) return null;
    const cached = cache.get(sourceFile);
    if (cached !== undefined) return cached;

    // 1) Exact key match.
    const exact = sourceTexts[sourceFile];
    if (exact) {
      cache.set(sourceFile, exact);
      return exact;
    }

    const normalizedSource = normalizePath(sourceFile);

    // 2) Exact normalized-path match.
    const normalizedExactKey = normalizedToOriginal.get(normalizedSource);
    if (normalizedExactKey) {
      const resolved = sourceTexts[normalizedExactKey] || null;
      cache.set(sourceFile, resolved);
      return resolved;
    }

    // 3) Unique suffix/path overlap match.
    const suffixMatches: string[] = [];
    for (const [normalizedKey, originalKey] of normalizedToOriginal.entries()) {
      if (
        normalizedKey.endsWith(`/${normalizedSource}`) ||
        normalizedSource.endsWith(`/${normalizedKey}`)
      ) {
        suffixMatches.push(originalKey);
      }
    }
    if (suffixMatches.length === 1) {
      const resolved = sourceTexts[suffixMatches[0]] || null;
      cache.set(sourceFile, resolved);
      return resolved;
    }

    // 4) Unique filename-only match.
    const filename = normalizedSource.split("/").pop() || normalizedSource;
    const filenameMatches = filenameToKeys.get(filename) || [];
    if (filenameMatches.length === 1) {
      const resolved = sourceTexts[filenameMatches[0]] || null;
      cache.set(sourceFile, resolved);
      return resolved;
    }

    cache.set(sourceFile, null);
    return null;
  };
}

// ── Snapshot ID resolution ──────────────────────────────────────────

import type { TraceRow } from "./traceTypes";

/** Extract a numeric snapshot ID from a TraceRow. */
export function resolveRowSnapshotId(row: TraceRow): number | null {
  if (typeof row.snapshotId === "number" && Number.isFinite(row.snapshotId)) {
    return row.snapshotId;
  }
  if (typeof row.stepNumber === "number" && Number.isFinite(row.stepNumber)) {
    return row.stepNumber;
  }
  if (typeof row.id === "string") {
    const match = row.id.match(/^(?:opcode-|snapshot-)?(\d+)$/);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}
