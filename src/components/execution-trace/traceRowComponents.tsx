/**
 * Module-scope React components and ABI decode helpers extracted from
 * TraceRowRenderer.tsx to keep each file under 800 lines.
 */

import React from "react";
import { ethers } from "ethers";
import { formatParamValue } from "./traceTypes";
import type { TraceRow } from "./traceTypes";

// ── Module-scope memoized components ────────────────────────────────

export const StoragePointerBadge = React.memo<{ hash: string }>(({ hash }) => (
  <span className="storage-pointer-badge" title={`Storage slot: ${hash}`}>
    storage ptr
  </span>
));
StoragePointerBadge.displayName = "StoragePointerBadge";

export interface HighlightableValueProps {
  value: string | undefined | null;
  className?: string;
  children?: React.ReactNode;
  highlightedValue: string | null;
  normalizeValue: (value: string | undefined | null) => string | null;
  setHighlightedValue: (value: string | null) => void;
}

export const HighlightableValue = React.memo<HighlightableValueProps>(
  ({
    value,
    className,
    children,
    highlightedValue,
    normalizeValue,
    setHighlightedValue,
  }) => {
    const normalized = normalizeValue(value);
    if (!normalized) {
      return <span className={className}>{children ?? value ?? ""}</span>;
    }
    const isHighlighted = highlightedValue === normalized;
    return (
      <span
        className={`${className || ""} highlightable-value${isHighlighted ? " highlighted" : ""}`}
        data-highlight-value={normalized}
        onMouseEnter={() => setHighlightedValue(normalized)}
        onMouseLeave={() => setHighlightedValue(null)}
      >
        {children ?? value}
      </span>
    );
  },
);
HighlightableValue.displayName = "HighlightableValue";

// ── ABI interface builder ───────────────────────────────────────────

/**
 * Build a single ethers.utils.Interface from the contract's ABI plus
 * any Diamond facet ABIs.  This is used both in TraceRowRenderer
 * (for per-row output decoding) and in useTraceState (for IO panel
 * decoding).  Extracted here to share the logic.
 */
export function buildDecodeInterface(
  contractContext: { abi?: unknown; diamondFacets?: Array<{ abi?: unknown }> } | null | undefined,
): ethers.utils.Interface | null {
  const functionBySignature = new Map<string, { item: any; score: number }>();

  const toAbiArray = (abiLike: unknown): any[] => {
    if (!abiLike) return [];
    if (Array.isArray(abiLike)) return abiLike;
    if (typeof abiLike === "string") {
      try {
        const parsed = JSON.parse(abiLike);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const countTupleComponents = (components: any[] | undefined): number => {
    if (!Array.isArray(components) || components.length === 0) return 0;
    return components.reduce((acc: number, component: any) => {
      const nested = countTupleComponents(component?.components);
      return acc + 1 + nested;
    }, 0);
  };

  const scoreFunctionItem = (item: any): number => {
    const outputs = Array.isArray(item?.outputs) ? item.outputs : [];
    return outputs.reduce(
      (score: number, output: { type?: string; components?: unknown[] }) => {
        const outputType = String(output?.type || "");
        if (outputType.startsWith("tuple")) {
          const componentCount = countTupleComponents(
            output?.components as any[] | undefined,
          );
          if (componentCount > 0) {
            return score + 20 + componentCount;
          }
          return score + 2;
        }
        return score + 6;
      },
      outputs.length as number,
    );
  };

  const addFunctionItem = (item: any) => {
    if (!item || item.type !== "function" || !item.name) return;
    const inputTypes = Array.isArray(item.inputs)
      ? item.inputs.map((input: any) => input?.type || "").join(",")
      : "";
    const signature = `${item.name}(${inputTypes})`;
    const nextScore = scoreFunctionItem(item);
    const existing = functionBySignature.get(signature);
    if (!existing || nextScore >= existing.score) {
      functionBySignature.set(signature, { item, score: nextScore });
    }
  };

  const addFunctionItems = (abiLike: unknown) => {
    const abiArray = toAbiArray(abiLike);
    for (const item of abiArray) {
      addFunctionItem(item);
    }
  };

  addFunctionItems(contractContext?.abi);
  if (contractContext?.diamondFacets) {
    for (const facet of contractContext.diamondFacets) {
      addFunctionItems(facet.abi);
    }
  }

  const normalizedAbiItems = Array.from(functionBySignature.values()).map(
    (entry) => entry.item,
  );
  if (normalizedAbiItems.length === 0) return null;
  try {
    return new ethers.utils.Interface(normalizedAbiItems);
  } catch {
    return null;
  }
}

// ── Per-row output decoder ──────────────────────────────────────────

/**
 * Decode the return data of a single trace row using an optional
 * ethers Interface built from the contract ABI.
 */
export function decodeOutputForRowFn(
  row: TraceRow,
  decodeInterface: ethers.utils.Interface | null,
  selectedFunction?: string | null,
): string | null {
  const rowOutput = row.returnData || row.output;
  if (!rowOutput || rowOutput === "0x") return null;

  const hasOpaqueTupleOutputs = (
    outputs: any[] | undefined | null,
  ): boolean => {
    if (!Array.isArray(outputs) || outputs.length === 0) return false;
    return outputs.some((output: any) => {
      const outputType = String(output?.type || "");
      if (!outputType.startsWith("tuple")) return false;
      return (
        !Array.isArray(output?.components) || output.components.length === 0
      );
    });
  };

  const decodeWithOutputDefs = (): string | null => {
    const outputDefs = row.entryMeta?.outputs;
    if (!Array.isArray(outputDefs) || outputDefs.length === 0) return null;
    try {
      const outputTypes = outputDefs.map((out: any) =>
        out && typeof out === "object" ? out : String(out),
      );
      const decodedValues = ethers.utils.defaultAbiCoder.decode(
        outputTypes,
        rowOutput,
      );
      return outputDefs
        .map((out: any, idx: number) =>
          formatParamValue(decodedValues[idx], out.type, out.components),
        )
        .join(", ");
    } catch {
      return null;
    }
  };

  if (!decodeInterface) {
    return decodeWithOutputDefs() || rowOutput;
  }

  let functionFragment: any = null;

  if (row.input && row.input.length >= 10) {
    try {
      const parsed = decodeInterface.parseTransaction({ data: row.input });
      functionFragment = parsed.functionFragment;
    } catch {
      // Try fallback strategies below.
    }
  }

  if (!functionFragment && row.entryMeta?.selector) {
    const selector = String(row.entryMeta.selector).toLowerCase();
    try {
      for (const fragment of Object.values(decodeInterface.functions)) {
        if (decodeInterface.getSighash(fragment).toLowerCase() === selector) {
          functionFragment = fragment;
          break;
        }
      }
    } catch {
      // Continue fallback.
    }
  }

  if (!functionFragment) {
    const namedFn =
      row.entryMeta?.function || row.functionName || selectedFunction;
    if (namedFn) {
      try {
        const named = String(namedFn);
        if (named.includes("(")) {
          functionFragment = decodeInterface.getFunction(named);
        } else {
          const candidates = Object.values(decodeInterface.functions).filter(
            (fragment: any) => fragment.name === named,
          );
          if (candidates.length === 1) {
            functionFragment = candidates[0];
          }
        }
      } catch {
        // Leave unresolved.
      }
    }
  }

  if (!functionFragment) {
    return decodeWithOutputDefs() || rowOutput;
  }

  try {
    const decodedValues = decodeInterface.decodeFunctionResult(
      functionFragment,
      rowOutput,
    );
    if (!functionFragment.outputs || functionFragment.outputs.length === 0) {
      return "no return value";
    }
    const formatted = functionFragment.outputs
      .map((output: any, idx: number) =>
        formatParamValue(decodedValues[idx], output.type, output.components),
      )
      .join(", ");
    if (hasOpaqueTupleOutputs(functionFragment.outputs)) {
      const fallback = decodeWithOutputDefs();
      if (fallback && fallback !== formatted) {
        return fallback;
      }
    }
    return formatted;
  } catch {
    return decodeWithOutputDefs() || rowOutput;
  }
}
