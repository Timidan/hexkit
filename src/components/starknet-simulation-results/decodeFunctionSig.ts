// Pure-string Cairo calldata decoder shared between `CallTreeTab.tsx`
// (the inline-signature row) and `starknetTraceAdapter.ts` (the EDB
// trace-row labels).
//
// Two surfaces, one decoder. The CallTreeTab variant returns a
// {preview, full} pair that's used for hover-tooltips; the trace-row
// adapter only needs a single value-string per arg with a max-width
// budget. Both go through the same `previewForType` walker so we don't
// drift between rendering surfaces.
//
// React-free on purpose: the adapter is plain TS and importing JSX
// would couple it to the renderer.

import type { AbiParam, AbiTypeDef } from "@/chains/starknet/simulatorTypes";
import { TOKEN_META, contractLabel, decodeU256, shortHex } from "./decoders";

/** True when the type is a Cairo scalar that fits on the inline row.
 *  Mirrors the Voyager spec: `felt252`, `u8/u16/u32/u64/u128/u256`,
 *  `bool`, `ContractAddress`, `ClassHash`. Anything else (Array/Span/
 *  struct/enum/tuple) is treated as composite and gets a click target. */
export function isScalarType(
  ty: string,
  types: Record<string, AbiTypeDef> | undefined,
): boolean {
  const norm = ty.replace(/\s+/g, "");
  if (norm.startsWith("(") && norm.endsWith(")")) return false;
  if (/Array::<.+>$|Span::<.+>$/.test(norm)) return false;
  if (norm.endsWith("::u256") || norm === "u256") return true;
  if (norm.endsWith("::bool") || norm === "bool") return true;
  if (
    norm.endsWith("::ContractAddress") ||
    norm.endsWith("::ClassHash") ||
    norm === "ContractAddress" ||
    norm === "ClassHash"
  ) {
    return true;
  }
  if (/(?:^|::)u(?:8|16|32|64|128)$/.test(norm)) return true;
  if (/(?:^|::)felt(?:252)?$/.test(norm)) return true;
  // Bridge-registered struct or enum → composite.
  const def = types?.[ty] ?? types?.[norm];
  if (def) return false;
  // Unknown / unrecognised types fall through as scalars (single felt
  // value) so we don't generate a click target with no decode logic
  // behind it.
  return true;
}

export interface InlinePreview {
  /** Compact one-line preview suitable for inline rendering (truncated
   *  arrays, short addresses, etc). */
  preview: string;
  /** Fully expanded form for hover / detail surfaces. */
  full: string;
  /** Felt index after consuming this type's payload. */
  next: number;
  /** True when the rendered value is an address — callers can apply a
   *  highlight color. */
  isAddress: boolean;
}

/** Recursive Cairo type → felt-array consumer. Mirrors the bridge's
 *  type registry walk in `consumeForType` from CallTreeTab.tsx but
 *  emits plain strings instead of React nodes so this module is
 *  importable from non-React surfaces. Depth + array length capped
 *  to keep recursive types from blowing up. */
export function previewForType(
  ty: string,
  felts: string[],
  i: number,
  types: Record<string, AbiTypeDef>,
  depth: number,
): InlinePreview {
  if (depth > 6) {
    const v = felts[i] ?? "—";
    return { preview: "…", full: v, next: i + 1, isAddress: false };
  }
  const norm = ty.replace(/\s+/g, "");

  if (norm.endsWith("::u256") || norm === "u256") {
    const low = felts[i] ?? "0x0";
    const high = felts[i + 1] ?? "0x0";
    const v = decodeU256(low, high);
    const decimal = v.toString();
    return {
      preview: decimal,
      full: `u256(${decimal}) low=${low} high=${high}`,
      next: i + 2,
      isAddress: false,
    };
  }

  if (norm.endsWith("::bool") || norm === "bool") {
    const v = felts[i] ?? "0x0";
    let display = v;
    try {
      display = BigInt(v) === 0n ? "false" : "true";
    } catch {
      /* keep raw */
    }
    return { preview: display, full: display, next: i + 1, isAddress: false };
  }

  if (/(?:^|::)u(?:8|16|32|64|128)$/.test(norm)) {
    const v = felts[i] ?? "0x0";
    let display = v;
    try {
      display = BigInt(v).toString();
    } catch {
      /* keep raw */
    }
    return { preview: display, full: display, next: i + 1, isAddress: false };
  }

  if (/(?:^|::)ByteArray$/.test(norm)) {
    const decoded = decodeByteArray(felts, i);
    return {
      preview: decoded.value,
      full: decoded.value,
      next: decoded.next,
      isAddress: false,
    };
  }

  if (
    norm.endsWith("::ContractAddress") ||
    norm.endsWith("::ClassHash") ||
    norm === "ContractAddress" ||
    norm === "ClassHash"
  ) {
    const v = felts[i] ?? "0x0";
    const label = contractLabel(v);
    const tokSym = TOKEN_META[v]?.symbol ?? null;
    const friendly = label ?? tokSym;
    return {
      preview: friendly ? `${friendly} ${shortHex(v, 6, 4)}` : shortHex(v, 8, 6),
      full: friendly ? `${friendly} (${v})` : v,
      next: i + 1,
      isAddress: true,
    };
  }

  const arrayMatch = norm.match(/Array::<(.+)>$|Span::<(.+)>$/);
  if (arrayMatch) {
    const inner = arrayMatch[1] ?? arrayMatch[2] ?? "felt";
    const len = (() => {
      try {
        return Number(BigInt(felts[i] ?? "0x0"));
      } catch {
        return 0;
      }
    })();
    const safeLen = Math.min(len, 32);
    const items: string[] = [];
    const fullItems: string[] = [];
    let pos = i + 1;
    for (let j = 0; j < safeLen; j++) {
      const r = previewForType(inner, felts, pos, types, depth + 1);
      items.push(r.preview);
      fullItems.push(r.full);
      pos = r.next;
    }
    const previewBody = items.slice(0, 3).join(", ");
    const previewMore = items.length > 3 ? `, +${items.length - 3}` : "";
    return {
      preview: `[${previewBody}${previewMore}]`,
      full: `[${fullItems.join(", ")}] (len=${len})`,
      next: pos,
      isAddress: false,
    };
  }

  if (norm.startsWith("(") && norm.endsWith(")")) {
    const inner = splitTupleArgs(norm.slice(1, -1));
    const parts: string[] = [];
    const fullParts: string[] = [];
    let pos = i;
    for (const t of inner) {
      const r = previewForType(t, felts, pos, types, depth + 1);
      parts.push(r.preview);
      fullParts.push(r.full);
      pos = r.next;
    }
    return {
      preview: `(${parts.join(", ")})`,
      full: `(${fullParts.join(", ")})`,
      next: pos,
      isAddress: false,
    };
  }

  const structDef = types[ty] ?? types[norm];
  if (structDef && structDef.kind === "struct") {
    const previews: string[] = [];
    const fulls: string[] = [];
    let pos = i;
    for (const f of structDef.fields) {
      const r = previewForType(f.type, felts, pos, types, depth + 1);
      previews.push(`${f.name}: ${r.preview}`);
      fulls.push(`${f.name}: ${r.full}`);
      pos = r.next;
    }
    return {
      preview: `{${previews.join(", ")}}`,
      full: `{${fulls.join(", ")}}`,
      next: pos,
      isAddress: false,
    };
  }

  if (structDef && structDef.kind === "enum") {
    const disc = felts[i] ?? "0x0";
    let variantName = `variant ${disc}`;
    try {
      const idx = Number(BigInt(disc));
      if (structDef.variants[idx]) variantName = structDef.variants[idx].name;
    } catch {
      /* keep default */
    }
    return {
      preview: variantName,
      full: `${variantName} (disc=${disc})`,
      next: i + 1,
      isAddress: false,
    };
  }

  // Default felt — single hex value.
  const v = felts[i] ?? "—";
  return {
    preview: v === "—" ? v : shortHex(v, 8, 6),
    full: v,
    next: i + 1,
    isAddress: false,
  };
}

function decodeByteArray(
  felts: string[],
  startIdx: number,
): { value: string; next: number } {
  const readLen = (idx: number): number => {
    try {
      const n = Number(BigInt(felts[idx] ?? "0x0"));
      return Number.isFinite(n) && n > 0 ? Math.min(n, 4096) : 0;
    } catch {
      return 0;
    }
  };
  const dataLen = readLen(startIdx);
  let pos = startIdx + 1;
  const chunks: number[] = [];
  for (let i = 0; i < dataLen; i += 1) {
    chunks.push(...feltToBytes(felts[pos], 31));
    pos += 1;
  }
  const pendingLen = readLen(pos + 1);
  chunks.push(...feltToBytes(felts[pos], pendingLen));
  pos += 2;

  try {
    return {
      value: JSON.stringify(new TextDecoder().decode(new Uint8Array(chunks))),
      next: pos,
    };
  } catch {
    return {
      value: `ByteArray(${felts.slice(startIdx, pos).join(", ")})`,
      next: pos,
    };
  }
}

function feltToBytes(felt: string | undefined, byteLen: number): number[] {
  if (byteLen <= 0) return [];
  const hex = (felt ?? "0x0").replace(/^0x/i, "");
  const padded = hex.padStart(byteLen * 2, "0").slice(-byteLen * 2);
  const out: number[] = [];
  for (let i = 0; i < padded.length; i += 2) {
    out.push(parseInt(padded.slice(i, i + 2), 16));
  }
  return out;
}

/** Last `::`-separated segment of a Cairo type, with generics
 *  collapsed to a short form — used for compact inline labels. */
export function lastTypeSeg(ty: string): string {
  const stripped = ty.replace(/\s+/g, "");
  const arr = stripped.match(/Array::<(.+)>$|Span::<(.+)>$/);
  if (arr) {
    const inner = arr[1] ?? arr[2] ?? "felt";
    const innerSeg = inner.split("::").slice(-1)[0] ?? inner;
    return `Array<${innerSeg.replace(/[<>]/g, "")}>`;
  }
  return stripped.split("::").slice(-1)[0] ?? stripped;
}

/** Split a Cairo tuple's inner args by top-level commas, respecting
 *  nested `<...>` / `(...)` so `(felt, Array::<u256>, (a, b))` splits
 *  into 3 components. */
export function splitTupleArgs(inner: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "<" || c === "(") depth++;
    else if (c === ">" || c === ")") depth--;
    else if (c === "," && depth === 0) {
      out.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (start < inner.length) out.push(inner.slice(start).trim());
  return out.filter(Boolean);
}

/** Truncate a preview string at a budget while balancing nested brackets
 *  / parens / braces. Without this, raw `slice()` produces output like
 *  `[{ to: 0x20… ) (arg0:` because the closing punctuation got lopped
 *  off. Append `…` then close any unmatched openers in reverse order. */
export function balancedTruncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = s.slice(0, max - 1);
  const stack: string[] = [];
  const closers: Record<string, string> = { "[": "]", "(": ")", "{": "}", "<": ">" };
  for (const ch of head) {
    if (ch === "[" || ch === "(" || ch === "{" || ch === "<") {
      stack.push(closers[ch]);
    } else if (ch === "]" || ch === ")" || ch === "}" || ch === ">") {
      if (stack.length > 0 && stack[stack.length - 1] === ch) stack.pop();
    }
  }
  let tail = "…";
  while (stack.length > 0) tail += stack.pop();
  return head + tail;
}

/** Default per-arg value-width budget for the trace-row signature. The
 *  EDB row is one line; values longer than this collapse to a balanced
 *  truncation so the row stays scannable. */
export const TRACE_ROW_VALUE_MAX = 24;

/** Build the full decoded signature string for a Starknet frame. The
 *  result is shaped:
 *
 *      <fnName>(<arg1>: <arg1Type> = <arg1Value>, …)
 *
 *  with each `<argNValue>` truncated to `TRACE_ROW_VALUE_MAX` chars
 *  (balanced-bracket aware so `[{ to: …}]` never gets cut to
 *  `[{ to: 0x20…`).
 *
 *  Composite args (Array, Span, struct, enum, tuple) collapse to a
 *  literal `{…}` placeholder so the row stays scannable; clicking
 *  anywhere on the parenthesised parameter list opens a frame-scoped
 *  modal that renders the full decoded payload (see
 *  `TraceClickWrapper` in `StarknetSimulationResults.tsx`). The walk
 *  through `previewForType` is still needed for composites because it
 *  advances the felt cursor past their payload.
 *
 *  When `inputs` is empty but there are felts, we still emit
 *  `fnName(0x… +N more)` so opaque frames don't render with naked
 *  parens. */
export function buildDecodedSignature(
  fnName: string,
  inputs: AbiParam[],
  felts: string[],
  types: Record<string, AbiTypeDef> | undefined,
  valueMax: number = TRACE_ROW_VALUE_MAX,
): string {
  const typesMap = types ?? {};
  if (inputs.length === 0) {
    if (felts.length === 0) return `${fnName}()`;
    const head = felts.slice(0, 2).map((f) => shortHex(f, 6, 4)).join(", ");
    const extra = felts.length > 2 ? `, +${felts.length - 2} more` : "";
    return `${fnName}(${head}${extra})`;
  }
  const parts: string[] = [];
  let i = 0;
  for (let idx = 0; idx < inputs.length; idx++) {
    const p = inputs[idx];
    const argName = p.name || `arg${idx}`;
    const typeSeg = lastTypeSeg(p.type);
    if (i >= felts.length) {
      parts.push(`${argName}: ${typeSeg} = (no felt available)`);
      continue;
    }
    // Render the actual abridged value for both scalars AND composites.
    // Composites get a much larger truncation budget so users see real
    // content (e.g. `{mid_price: 0x8ec…, vol_fee_bps: 0x5, …}`) instead
    // of a useless `{…}`. `balancedTruncate` keeps brackets matched
    // mid-truncation so a partial struct never escapes its container.
    const r = previewForType(p.type, felts, i, typesMap, 0);
    const isComposite = !isScalarType(p.type, typesMap);
    const budget = isComposite ? Math.max(80, valueMax * 3) : valueMax;
    const value = balancedTruncate(r.preview, budget);
    parts.push(`${argName}: ${typeSeg} = ${value}`);
    i = r.next;
  }
  return `${fnName}(${parts.join(", ")})`;
}

/** Structured per-input record for clipboard / programmatic consumers.
 *  Mirrors what `buildDecodedSignature` emits as an inline string but
 *  keeps name / type / value as separate fields so the JSON payload
 *  stays parseable downstream. The `value` is the *full* `previewForType`
 *  expansion (no balanced truncation) since clipboard sinks don't have
 *  a one-line width budget. */
export interface DecodedArg {
  name: string;
  type: string;
  value: string;
}

/** Walks the same path as `buildDecodedSignature` but emits structured
 *  triples instead of joining them into a one-line signature. Used by
 *  the I/O panel COPY action so pasting into a JSON validator yields
 *  `{ args: [{ name, type, value }, …] }` rather than a flat string
 *  blob. The felt cursor advances identically so this walks safely
 *  across composite types. */
export function buildDecodedArgs(
  inputs: AbiParam[],
  felts: string[],
  types: Record<string, AbiTypeDef> | undefined,
): DecodedArg[] {
  const typesMap = types ?? {};
  const out: DecodedArg[] = [];
  let i = 0;
  for (let idx = 0; idx < inputs.length; idx++) {
    const p = inputs[idx];
    const argName = p.name || `arg${idx}`;
    if (i >= felts.length) {
      out.push({ name: argName, type: p.type, value: "(no felt available)" });
      continue;
    }
    const r = previewForType(p.type, felts, i, typesMap, 0);
    out.push({ name: argName, type: p.type, value: r.full });
    i = r.next;
  }
  return out;
}

/** Fallback when the bridge didn't ship a decoded ABI. Emits a generic
 *  `unknown(<short>)(arg0=0x…, +N more)` summary so the row carries
 *  some signal instead of an opaque hex blob. */
export function buildRawFeltSummary(
  fnLabel: string,
  felts: string[],
  valueMax: number = TRACE_ROW_VALUE_MAX,
): string {
  if (felts.length === 0) return `${fnLabel}()`;
  const head = felts.slice(0, 2).map((f) => shortHex(f, 6, 4)).join(", ");
  const extra = felts.length > 2 ? `, +${felts.length - 2} more` : "";
  const body = balancedTruncate(`${head}${extra}`, valueMax * 2);
  return `${fnLabel}(${body})`;
}
