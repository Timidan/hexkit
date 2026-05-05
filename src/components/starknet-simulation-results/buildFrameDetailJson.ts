// Per-frame JSON tree builder for the Starknet trace-row detail
// modal.
//
// The modal is now scoped to the WHOLE frame: clicking the underlined
// `(...)` parameter list on any trace row opens a modal that shows
// every argument of that frame at the top level, each rendered as
// `{value, type}` (value-first key order — JSON.stringify preserves
// object construction order for non-integer keys).
//
// Frame-level metadata (selector, caller, target, classHash, calldata,
// result, events) stays in the CONTRACTS-tab right-rail FrameDetailPane
// — this builder is purely for the per-frame argument modal that
// opens when a user clicks the underlined parameter list of a trace
// row.
//
// Public surface:
//   - `buildArgDetailJson(argType, felts, types, startIdx)` →
//       returns `{ tree, next }` where `tree` is the decoded value
//       node for that single arg (flat at top level) and `next` is
//       the felt-array index after consuming this arg's payload.
//   - `buildAllArgsForFrame(frame, types)` →
//       walks the ABI inputs once, returning a flat object keyed by
//       arg name where each value is a `{ value, type }` JsonTree
//       node. This is the body shape the per-frame modal renders.

import type {
  AbiTypeDef,
  FunctionInvocation,
} from "@/chains/starknet/simulatorTypes";
import { previewForType, splitTupleArgs } from "./decodeFunctionSig";

/** Decoded value tree node. The shape is `{value, type}` so JSON
 *  rendering matches Voyager's key order — `value` first, `type`
 *  second. For composites the `value` field nests further nodes (for
 *  arrays an array of nodes, for structs a `{fieldName: node}` map). */
export interface JsonTree {
  value: string | JsonTree[] | Record<string, JsonTree>;
  type: string;
}

/** Result of decoding a single arg from the felt array. `next` is the
 *  consumer's resume index for sequential param walks. */
export interface ArgDecodeResult {
  tree: JsonTree;
  next: number;
}

/** Recursively decode a Cairo value into a `{value, type}` JsonTree
 *  node. Mirrors `previewForType`'s walk but emits structured objects
 *  with value-first key order. Bails at depth 8 to keep recursive
 *  types from blowing up — same convention as the inline decoder. */
export function buildArgDetailJson(
  ty: string,
  felts: string[],
  types: Record<string, AbiTypeDef>,
  startIdx: number,
  depth = 0,
): ArgDecodeResult {
  if (depth > 8) {
    const v = felts[startIdx] ?? "—";
    // value-first key order (insertion order is preserved).
    return { tree: { value: v, type: ty }, next: startIdx + 1 };
  }
  const norm = ty.replace(/\s+/g, "");

  // Arrays / Spans — recurse into the inner type for each element.
  const arrayMatch = norm.match(/Array::<(.+)>$|Span::<(.+)>$/);
  if (arrayMatch) {
    const inner = arrayMatch[1] ?? arrayMatch[2] ?? "felt";
    let len = 0;
    try {
      len = Number(BigInt(felts[startIdx] ?? "0x0"));
    } catch {
      len = 0;
    }
    const safeLen = Math.min(len, 64);
    const items: JsonTree[] = [];
    let pos = startIdx + 1;
    for (let j = 0; j < safeLen; j++) {
      const r = buildArgDetailJson(inner, felts, types, pos, depth + 1);
      items.push(r.tree);
      pos = r.next;
    }
    return { tree: { value: items, type: ty }, next: pos };
  }

  // Tuples — split top-level args and walk each.
  if (norm.startsWith("(") && norm.endsWith(")")) {
    const inner = splitTupleArgs(norm.slice(1, -1));
    const items: JsonTree[] = [];
    let pos = startIdx;
    for (const t of inner) {
      const r = buildArgDetailJson(t, felts, types, pos, depth + 1);
      items.push(r.tree);
      pos = r.next;
    }
    return { tree: { value: items, type: ty }, next: pos };
  }

  // Structs — emit `{ fieldName: { value, type } }` so the JSON tree
  // shows named fields in declaration order. Field-name iteration
  // follows `structDef.fields[]` so JSON ordering matches the Cairo
  // type definition.
  const structDef = types[ty] ?? types[norm];
  if (structDef && structDef.kind === "struct") {
    const obj: Record<string, JsonTree> = {};
    let pos = startIdx;
    for (const f of structDef.fields) {
      const r = buildArgDetailJson(f.type, felts, types, pos, depth + 1);
      obj[f.name] = r.tree;
      pos = r.next;
    }
    return { tree: { value: obj, type: ty }, next: pos };
  }

  // For primitives / enums / addresses we lean on the existing
  // `previewForType` walker — its `full` form is the verbose
  // representation we want in tree mode. This keeps decoder behaviour
  // (u256 expansion, ContractAddress labelling, bool conversion) in
  // one place across the inline preview and the modal tree.
  const inline = previewForType(ty, felts, startIdx, types, depth);
  return {
    tree: { value: inline.full, type: ty },
    next: inline.next,
  };
}

/** Walk the function ABI inputs against the calldata felts and produce
 *  the flat object the per-frame argument modal renders. Each top-level
 *  key is an arg name; each value is a `{value, type}` JsonTree node.
 *  ABI order is preserved via insertion order — JSON.stringify of the
 *  returned object emits keys in declaration order for non-integer
 *  keys. Returns an empty object when the bridge didn't ship an ABI
 *  for this frame; callers should treat that as "nothing to show" and
 *  skip opening the modal. */
export function buildAllArgsForFrame(
  frame: FunctionInvocation,
  types: Record<string, AbiTypeDef> | undefined,
): Record<string, JsonTree> {
  const out: Record<string, JsonTree> = {};
  const inputs = frame.decodedFunctionAbi?.inputs;
  if (!inputs || inputs.length === 0) return out;
  const felts = frame.calldata ?? [];
  const typesMap = types ?? {};
  let i = 0;
  for (let idx = 0; idx < inputs.length; idx++) {
    const p = inputs[idx];
    const argName = p.name || `arg${idx}`;
    if (i >= felts.length) {
      out[argName] = { value: "(no felt available)", type: p.type };
      continue;
    }
    const r = buildArgDetailJson(p.type, felts, typesMap, i);
    out[argName] = r.tree;
    i = r.next;
  }
  return out;
}
