/**
 * StarknetTypedInputs — per-input typed widgets for a Cairo function.
 *
 * Mirrors the EVM `<FunctionParamsSection>` (src/components/simple-grid/layout/
 * FunctionParamsSection.tsx) but dispatches by Cairo type instead of Solidity
 * type. The encoded flat-felt list is computed via starknet.js
 * `CallData.compile(method, valuesObj)` against the resolved class ABI, with a
 * raw-felts fallback per-input for types that `CallData.compile` can't shape
 * (custom structs, enums, tuples).
 *
 * State shape lives in the parent (both `StarknetLiveForm` and
 * `StarknetManualSimForm`) — this component is a controlled view: it takes the
 * selected function definition, the current `paramValues` map, and reports
 * (a) value changes and (b) the encoded calldata string ready to drop into
 * `form.calldata`.
 */
import React, { useEffect, useMemo, useRef } from "react";
import { CallData, byteArray, cairo, num } from "starknet";
import type { Abi } from "starknet";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Button } from "../ui/button";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CairoInputDef {
  name: string;
  type: string;
}

/** Tagged value shape: scalar inputs hold a string, bools hold a boolean,
 *  arrays hold string[] (one entry per element), and rawFelts hold a string
 *  whose meaning is "user pasted a flat felt list for this param". */
export type ParamValue =
  | { kind: "scalar"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "array"; values: string[] }
  | { kind: "rawFelts"; value: string };

export type ParamValueMap = Record<string, ParamValue>;

// ---------------------------------------------------------------------------
// Cairo type classification
// ---------------------------------------------------------------------------

function isFelt252(type: string): boolean {
  return type === "core::felt252" || type === "felt252" || type === "felt";
}

function isContractAddress(type: string): boolean {
  return (
    type === "core::starknet::contract_address::ContractAddress" ||
    type.endsWith("ContractAddress")
  );
}

function isClassHash(type: string): boolean {
  return (
    type === "core::starknet::class_hash::ClassHash" ||
    type.endsWith("ClassHash")
  );
}

function isUnsignedInt(type: string): { width: number } | null {
  const m = type.match(/^core::integer::u(\d+)$/);
  if (m) {
    const w = parseInt(m[1], 10);
    if (w <= 128) return { width: w };
    return null;
  }
  if (type === "core::integer::usize" || type === "usize") return { width: 32 };
  return null;
}

function isU256(type: string): boolean {
  return type === "core::integer::u256";
}

function isSignedInt(type: string): { width: number } | null {
  const m = type.match(/^core::integer::i(\d+)$/);
  if (m) {
    const w = parseInt(m[1], 10);
    if (w <= 128) return { width: w };
  }
  return null;
}

function isBool(type: string): boolean {
  return type === "core::bool" || type === "bool";
}

function isByteArray(type: string): boolean {
  return type === "core::byte_array::ByteArray";
}

/** Returns the inner element type when the input type is `Array<T>` or
 *  `Span<T>`. Otherwise returns null. Tolerates the various spellings the
 *  Cairo compiler emits across ABI versions. */
function getArrayElementType(type: string): string | null {
  const m =
    type.match(/^core::array::Array::<(.+)>$/) ||
    type.match(/^core::array::Span::<(.+)>$/) ||
    type.match(/^Array::<(.+)>$/) ||
    type.match(/^Span::<(.+)>$/);
  return m ? m[1] : null;
}

type WidgetKind =
  | "felt"
  | "address"
  | "classHash"
  | "uint"
  | "u256"
  | "int"
  | "bool"
  | "byteArray"
  | "array"
  | "rawFelts";

export function classifyCairoType(type: string): { kind: WidgetKind; element?: string } {
  if (isFelt252(type)) return { kind: "felt" };
  if (isContractAddress(type)) return { kind: "address" };
  if (isClassHash(type)) return { kind: "classHash" };
  if (isU256(type)) return { kind: "u256" };
  if (isUnsignedInt(type)) return { kind: "uint" };
  if (isSignedInt(type)) return { kind: "int" };
  if (isBool(type)) return { kind: "bool" };
  if (isByteArray(type)) return { kind: "byteArray" };
  const inner = getArrayElementType(type);
  if (inner) {
    const innerKind = classifyCairoType(inner).kind;
    return innerKind === "rawFelts"
      ? { kind: "rawFelts" }
      : { kind: "array", element: inner };
  }
  // Anything else (struct, enum, tuple) → fallback flat-felts textarea.
  return { kind: "rawFelts" };
}

// ---------------------------------------------------------------------------
// Default value factory + helpers
// ---------------------------------------------------------------------------

export function defaultParamValue(type: string): ParamValue {
  const { kind } = classifyCairoType(type);
  if (kind === "bool") return { kind: "bool", value: false };
  if (kind === "array") return { kind: "array", values: [] };
  if (kind === "rawFelts") return { kind: "rawFelts", value: "" };
  return { kind: "scalar", value: "" };
}

/** Lazy-initialise the param values for a function. Preserves any existing
 *  values keyed by input name (useful when toggling between Read/Write). */
export function buildInitialParamValues(
  inputs: CairoInputDef[],
  prior?: ParamValueMap,
): ParamValueMap {
  const out: ParamValueMap = {};
  for (const inp of inputs) {
    const existing = prior?.[inp.name];
    out[inp.name] = existing ?? defaultParamValue(inp.type);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Encoding: typed values → flat felt array
// ---------------------------------------------------------------------------

/** Convert a single typed-input ParamValue into a shape that
 *  `CallData.compile` understands for the corresponding Cairo type. Throws
 *  when the value is empty / unparseable so the caller can keep
 *  `form.calldata` blank rather than emitting garbage. */
function paramValueForCalldata(type: string, pv: ParamValue): unknown {
  const { kind, element } = classifyCairoType(type);
  switch (kind) {
    case "felt":
    case "address":
    case "classHash": {
      const v = pv.kind === "scalar" ? pv.value.trim() : "";
      if (!v) throw new Error("empty");
      return v;
    }
    case "uint": {
      const v = pv.kind === "scalar" ? pv.value.trim() : "";
      if (!v) throw new Error("empty");
      // Pass as decimal/hex string — CallData parser handles both.
      return v;
    }
    case "u256": {
      const v = pv.kind === "scalar" ? pv.value.trim() : "";
      if (!v) throw new Error("empty");
      return cairo.uint256(v);
    }
    case "int": {
      const v = pv.kind === "scalar" ? pv.value.trim() : "";
      if (!v) throw new Error("empty");
      // Two's-complement encoding for signed ints. Negative values become
      // (2^N - |v|) which then encodes as a felt string. CallData parser
      // expects a string per parser internals.
      const m = type.match(/^core::integer::i(\d+)$/);
      const width = m ? parseInt(m[1], 10) : 128;
      const big = BigInt(v);
      if (big >= 0n) return big.toString();
      const mod = 1n << BigInt(width);
      return ((big % mod) + mod).toString();
    }
    case "bool": {
      const b = pv.kind === "bool" ? pv.value : false;
      return b;
    }
    case "byteArray": {
      const v = pv.kind === "scalar" ? pv.value : "";
      // ByteArray accepts an empty string ("") fine — emits the zero-length
      // ByteArray representation. So we don't error here.
      return byteArray.byteArrayFromString(v);
    }
    case "array": {
      const values = pv.kind === "array" ? pv.values : [];
      // Recurse: build a JS array of the element-typed values.
      return values.map((s) => {
        const inner = element!;
        const elemPv = defaultParamValue(inner);
        // Reuse scalar/uint/u256/bool encoders by wrapping the user string.
        const innerKind = classifyCairoType(inner).kind;
        if (innerKind === "bool") {
          return paramValueForCalldata(inner, {
            kind: "bool",
            value: s.toLowerCase() === "true" || s === "1",
          });
        }
        if (innerKind === "byteArray") {
          return paramValueForCalldata(inner, { kind: "scalar", value: s });
        }
        if (innerKind === "rawFelts") {
          // Inline raw felts inside an array isn't safe to compile — bail
          // up so the caller falls back to the per-param raw textarea.
          throw new Error(`array<${inner}> requires raw-felts fallback`);
        }
        // Default: use the same scalar pipe as the element type expects.
        // (boolean elements arrive as scalar "0"/"1" strings — the
        // CairoInputClass union doesn't carry a "bool" kind for array
        // elements, so we treat them uniformly via scalar.)
        const synthetic: ParamValue = { kind: "scalar", value: s };
        return paramValueForCalldata(inner, synthetic);
      });
    }
    case "rawFelts":
      // Caller handles this path — see encodeWithFallback below.
      throw new Error(`rawFelts fallback for ${type}`);
  }
}

/** Build the flat felt array for the selected function via starknet.js
 *  `CallData.compile`. Fallback: any input typed as a struct/enum/tuple is
 *  appended verbatim (raw felts the user pasted). */
export function encodeFunctionCalldata(
  abi: Abi,
  functionName: string,
  inputs: CairoInputDef[],
  values: ParamValueMap,
): { ok: true; felts: string[] } | { ok: false; error: string } {
  // Split inputs into "compileable" vs "rawFelts" — we'll compile the
  // compileable subset against a synthetic ABI and then splice in the raw
  // felts at the right positions.
  // For simplicity and correctness, we choose a single all-or-nothing path:
  //   - if any input is rawFelts ⇒ try to compile ONLY the typed inputs as
  //     a partial method and concat the rawFelts.
  //   - else ⇒ full CallData.compile path.
  try {
    // Fast path: all typed.
    const anyRaw = inputs.some(
      (i) => classifyCairoType(i.type).kind === "rawFelts",
    );
    if (!anyRaw) {
      const obj: Record<string, unknown> = {};
      for (const inp of inputs) {
        obj[inp.name] = paramValueForCalldata(inp.type, values[inp.name]);
      }
      const cd = new CallData(abi);
      // starknet.js' `compile` accepts a `{ paramName: value }` object at
      // runtime even though its TypeScript signature insists on `RawArgs`
      // (an array). Cast through unknown so the typed-form path works.
      const felts = cd.compile(
        functionName,
        obj as unknown as Parameters<typeof cd.compile>[1],
      ) as unknown as string[];
      return { ok: true, felts };
    }
    // Mixed path: compile typed inputs only via a synthetic ABI fragment,
    // then for each rawFelts input splice in the user's pasted felts.
    // The ordering matters so we walk the inputs sequentially.
    const out: string[] = [];
    for (const inp of inputs) {
      const klass = classifyCairoType(inp.type);
      if (klass.kind === "rawFelts") {
        const pv = values[inp.name];
        const raw = pv?.kind === "rawFelts" ? pv.value : "";
        const tokens = raw
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        out.push(...tokens);
      } else {
        // Single-input ABI synth so we can reuse CallData's encoding for
        // this one parameter type.
        const synthAbi: Abi = [
          {
            type: "function",
            name: "__synth__",
            inputs: [{ name: inp.name, type: inp.type }],
            outputs: [],
            state_mutability: "view",
          } as unknown as Abi[number],
        ];
        const cd = new CallData(synthAbi);
        const obj: Record<string, unknown> = {};
        obj[inp.name] = paramValueForCalldata(inp.type, values[inp.name]);
        const felts = cd.compile(
          "__synth__",
          obj as unknown as Parameters<typeof cd.compile>[1],
        ) as unknown as string[];
        out.push(...felts);
      }
    }
    return { ok: true, felts: out };
  } catch (err) {
    if (err instanceof Error && err.message === "empty") {
      // Caller treats empty ⇒ "user is mid-edit, don't show an error".
      return { ok: false, error: "" };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Format a felt array back into the textarea-friendly format
 *  (newline-separated 0x… felts) so toggling Function → Raw preserves work. */
export function formatFeltsForTextarea(felts: string[]): string {
  return felts
    .map((f) => {
      // Normalise to 0x-prefixed hex so the existing FELT_HEX validator in
      // invokeRequestBuilder.ts accepts every value.
      if (typeof f !== "string") return String(f);
      if (f.startsWith("0x") || f.startsWith("0X")) return f;
      try {
        return num.toHex(f);
      } catch {
        return f;
      }
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  inputs: CairoInputDef[];
  values: ParamValueMap;
  onChange: (next: ParamValueMap) => void;
  /** Fired whenever the encoded calldata changes (success path). The parent
   *  drops the result into its `form.calldata` so Simulate / Send wire it
   *  through unchanged. Receives an empty string while the user is mid-edit
   *  so previously-encoded felts don't go stale silently. */
  onCalldataChange: (felts: string[]) => void;
  /** Resolved class ABI — required for `CallData.compile` to know struct
   *  layouts. Mirrors EVM's `selectedFunctionObj.inputs` flow. */
  abi: Abi;
  /** Selected function name. */
  functionName: string;
}

export const StarknetTypedInputs: React.FC<Props> = ({
  inputs,
  values,
  onChange,
  onCalldataChange,
  abi,
  functionName,
}) => {
  // Re-encode whenever the typed values, function, or ABI change. We stash
  // the last emitted felts in a ref so we don't churn the parent's state
  // setter on every keystroke when the calldata text didn't actually change.
  const lastEmittedRef = useRef<string>("");
  useEffect(() => {
    const result = encodeFunctionCalldata(abi, functionName, inputs, values);
    const felts = result.ok ? result.felts : [];
    const text = felts.join(",");
    if (text !== lastEmittedRef.current) {
      lastEmittedRef.current = text;
      onCalldataChange(felts);
    }
    // We intentionally re-run on every value change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, inputs, functionName, abi]);

  const setParam = (name: string, next: ParamValue) =>
    onChange({ ...values, [name]: next });

  if (inputs.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground italic">
        This function takes no parameters.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {inputs.map((inp) => {
        const klass = classifyCairoType(inp.type);
        const pv = values[inp.name] ?? defaultParamValue(inp.type);
        return (
          <div key={inp.name} className="space-y-1">
            <Label
              htmlFor={`param-${inp.name}`}
              className="text-[11px] text-muted-foreground flex items-center gap-2"
            >
              <span className="text-foreground font-medium">{inp.name}</span>
              <span className="font-mono text-[10px] text-muted-foreground/80 break-all">
                {inp.type}
              </span>
            </Label>
            {klass.kind === "bool" ? (
              <div className="flex items-center gap-2">
                <Switch
                  id={`param-${inp.name}`}
                  checked={pv.kind === "bool" ? pv.value : false}
                  onCheckedChange={(checked) =>
                    setParam(inp.name, { kind: "bool", value: Boolean(checked) })
                  }
                />
                <span className="text-[10px] text-muted-foreground font-mono">
                  {pv.kind === "bool" && pv.value ? "true (1)" : "false (0)"}
                </span>
              </div>
            ) : klass.kind === "array" ? (
              <ArrayInput
                id={`param-${inp.name}`}
                element={klass.element!}
                values={pv.kind === "array" ? pv.values : []}
                onChange={(next) =>
                  setParam(inp.name, { kind: "array", values: next })
                }
              />
            ) : klass.kind === "rawFelts" ? (
              <Textarea
                id={`param-${inp.name}`}
                placeholder={`Paste flat felt list for ${inp.type} (one per line / comma)`}
                spellCheck={false}
                className="font-mono text-xs h-20"
                value={pv.kind === "rawFelts" ? pv.value : ""}
                onChange={(e) =>
                  setParam(inp.name, { kind: "rawFelts", value: e.target.value })
                }
              />
            ) : (
              <Input
                id={`param-${inp.name}`}
                placeholder={placeholderFor(klass.kind, inp.type)}
                spellCheck={false}
                className="font-mono text-xs"
                value={pv.kind === "scalar" ? pv.value : ""}
                onChange={(e) =>
                  setParam(inp.name, { kind: "scalar", value: e.target.value })
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Array sub-input — repeating element widget
// ---------------------------------------------------------------------------

const ArrayInput: React.FC<{
  id: string;
  element: string;
  values: string[];
  onChange: (next: string[]) => void;
}> = ({ id, element, values, onChange }) => {
  const klass = classifyCairoType(element);
  // Arrays of structs/enums/tuples can't be encoded element-by-element from a
  // string — fall back to one big rawFelts textarea labelled with the type.
  const fallback = klass.kind === "rawFelts";
  const elements = useMemo(() => values, [values]);

  const setAt = (i: number, v: string) => {
    const copy = values.slice();
    copy[i] = v;
    onChange(copy);
  };
  const add = () => onChange([...values, ""]);
  const remove = (i: number) => {
    const copy = values.slice();
    copy.splice(i, 1);
    onChange(copy);
  };

  if (fallback) {
    return (
      <Textarea
        id={id}
        placeholder={`Paste flat felts for Array<${element}> — len + elements`}
        spellCheck={false}
        className="font-mono text-xs h-20"
        value={values.join("\n")}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(/[\s,]+/)
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
      />
    );
  }

  return (
    <div className="space-y-1.5">
      {elements.length === 0 && (
        <p className="text-[10px] text-muted-foreground italic">
          Empty array — click Add to append elements.
        </p>
      )}
      {elements.map((v, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground font-mono w-6 text-right">
            [{i}]
          </span>
          <Input
            id={`${id}-${i}`}
            placeholder={placeholderFor(klass.kind, element)}
            spellCheck={false}
            className="font-mono text-xs"
            value={v}
            onChange={(e) => setAt(i, e.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0 text-xs"
            onClick={() => remove(i)}
            aria-label={`Remove element ${i}`}
          >
            ×
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-[11px]"
        onClick={add}
      >
        + Add element
      </Button>
    </div>
  );
};

function placeholderFor(kind: WidgetKind, type: string): string {
  switch (kind) {
    case "address":
      return "0x… (ContractAddress)";
    case "classHash":
      return "0x… (ClassHash)";
    case "felt":
      return "0x… or decimal felt";
    case "u256":
      return "decimal or 0x… (u256)";
    case "uint":
      return `decimal or 0x… (${type.split("::").pop()})`;
    case "int":
      return `decimal (${type.split("::").pop()})`;
    case "byteArray":
      return "string";
    default:
      return type;
  }
}

export default StarknetTypedInputs;
