// Starknet wrapper over the shared debugger shells.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bug, Code as CodeIcon } from "@phosphor-icons/react";
import type { editor } from "monaco-editor";

import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

import {
  DebugToolbarShell,
  StackTracePanelShell,
  ExecutionTreeShell,
  SourceViewPanelShell,
  DebugStatePanelShell,
  type ExecutionTreeShellRow,
  type StackFrameRow,
} from "@/components/debug/shells";

import type {
  AbiTypeDef,
  AbiParam,
  FunctionFrame,
  FunctionInvocation,
  SimulationEvent,
  SimulationResult,
  TraceStep,
} from "@/chains/starknet/simulatorTypes";
import { useSierraDebug } from "@/chains/starknet/sierraDebugClient";
import { useCairoSource } from "@/chains/starknet/cairoSourceClient";
import {
  findStatementLocation,
  sourceMapStatementCountMatches,
  useSierraSourceMap,
} from "@/chains/starknet/sierraSourceMapClient";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CAIRO_THEME_NAME, setupCairoMonaco } from "@/lib/monaco";
import { eventName, frameLabel, selectorName, shortHex } from "./decoders";
import { buildDecodedArgs } from "./decodeFunctionSig";
import { chainIdToStarknetNetwork, resolveCairoSourceTarget } from "./CallTreeTab";

export interface DebuggerPaneProps {
  selectedFrame: FunctionInvocation | null;
  simulationResult?: SimulationResult | null;
  invocations?: FunctionInvocation[];
  invocationCallIds?: Map<FunctionInvocation, number>;
  types?: Record<string, AbiTypeDef>;
  onSelectFrame?: (frame: FunctionInvocation) => void;
  traceSteps?: TraceStep[];
  functionFrames?: FunctionFrame[];
  initialStepIndex?: number | null;
  chainId?: string | null;
}

interface StarknetExecutionRow extends ExecutionTreeShellRow {
  kind: "call" | "frame";
  frameId: number | null;
  callId: number | null;
  stepIndexStart: number;
  classHash: string | null;
  invocation?: FunctionInvocation;
}

const EVENT_PREVIEW_LIMIT = 5;
const STORAGE_WRITE_PREVIEW_LIMIT = 10;

function nonEmptyString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeHexValue(value: string | null | undefined): string | null {
  const trimmed = nonEmptyString(value);
  if (!trimmed) return null;
  try {
    return BigInt(trimmed).toString(16);
  } catch {
    return trimmed.toLowerCase();
  }
}

function sameHex(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeHexValue(a);
  const right = normalizeHexValue(b);
  return left !== null && right !== null && left === right;
}

function invocationDisplayName(
  invocation: FunctionInvocation | null | undefined,
): string | null {
  if (!invocation) return null;
  return (
    selectorName(invocation) ||
    shortHex(invocation.entryPointSelector, 8, 6) ||
    null
  );
}

function flattenInvocationTree(
  root: FunctionInvocation | null | undefined,
): FunctionInvocation[] {
  if (!root) return [];
  const out: FunctionInvocation[] = [];
  const visit = (node: FunctionInvocation) => {
    out.push(node);
    for (const child of node.calls || []) visit(child);
  };
  visit(root);
  return out;
}

function buildCallIdToInvocation(
  selectedFrame: FunctionInvocation | null,
  invocations: FunctionInvocation[] | undefined,
  invocationCallIds: Map<FunctionInvocation, number> | undefined,
): Map<number, FunctionInvocation> {
  const out = new Map<number, FunctionInvocation>();
  const candidates =
    invocations && invocations.length > 0
      ? invocations
      : flattenInvocationTree(selectedFrame);

  candidates.forEach((invocation, fallbackIndex) => {
    const explicit = invocationCallIds?.get(invocation);
    const traceCallId = invocation.traceCallId;
    const callId =
      typeof explicit === "number" && Number.isInteger(explicit)
        ? explicit
        : typeof traceCallId === "number" && Number.isInteger(traceCallId)
          ? traceCallId
          : fallbackIndex;
    if (!out.has(callId)) out.set(callId, invocation);
  });

  return out;
}

function buildEntryFrameByCallId(
  frames: FunctionFrame[] | undefined,
): Map<number, FunctionFrame> {
  const out = new Map<number, FunctionFrame>();
  for (const frame of frames ?? []) {
    const current = out.get(frame.callId);
    if (
      !current ||
      frame.stepIndexStart < current.stepIndexStart ||
      (frame.stepIndexStart === current.stepIndexStart && frame.fp <= current.fp)
    ) {
      out.set(frame.callId, frame);
    }
  }
  return out;
}

interface CallStepRange {
  stepIndexStart: number;
  stepIndexEnd: number;
}

function buildCallStepRanges(
  frames: FunctionFrame[] | undefined,
  traceSteps: TraceStep[] | undefined,
): Map<number, CallStepRange> {
  const out = new Map<number, CallStepRange>();
  for (const frame of frames ?? []) {
    const current = out.get(frame.callId);
    if (!current) {
      out.set(frame.callId, {
        stepIndexStart: frame.stepIndexStart,
        stepIndexEnd: frame.stepIndexEnd,
      });
      continue;
    }
    current.stepIndexStart = Math.min(current.stepIndexStart, frame.stepIndexStart);
    current.stepIndexEnd = Math.max(current.stepIndexEnd, frame.stepIndexEnd);
  }

  for (let i = 0; i < (traceSteps?.length ?? 0); i += 1) {
    const step = traceSteps?.[i];
    if (!step) continue;
    const current = out.get(step.callId);
    if (!current) {
      out.set(step.callId, {
        stepIndexStart: i,
        stepIndexEnd: i,
      });
      continue;
    }
    current.stepIndexStart = Math.min(current.stepIndexStart, i);
    current.stepIndexEnd = Math.max(current.stepIndexEnd, i);
  }

  return out;
}

function firstStepForCall(
  traceSteps: TraceStep[] | undefined,
  callId: number | null,
): TraceStep | null {
  if (callId === null) return null;
  return traceSteps?.find((step) => step.callId === callId) ?? null;
}

function invocationStepCount(
  range: CallStepRange | undefined,
  invocation: FunctionInvocation,
): number | null {
  if (range) return range.stepIndexEnd - range.stepIndexStart + 1;
  const resourceSteps = invocation.executionResources?.steps;
  return typeof resourceSteps === "number" && resourceSteps >= 0
    ? resourceSteps
    : null;
}

function debuggerRootInvocations(
  result: SimulationResult | null | undefined,
  selectedFrame: FunctionInvocation | null,
): FunctionInvocation[] {
  if (result?.executeInvocation) return [result.executeInvocation];
  return selectedFrame ? [selectedFrame] : [];
}

export function buildInvocationExecutionRows({
  roots,
  invocationCallIds,
  callStepRanges,
  traceSteps,
  rootClassHash,
}: {
  roots: FunctionInvocation[];
  invocationCallIds: Map<FunctionInvocation, number> | undefined;
  callStepRanges: Map<number, CallStepRange>;
  traceSteps: TraceStep[] | undefined;
  rootClassHash: string | null;
}): StarknetExecutionRow[] {
  const rows: StarknetExecutionRow[] = [];

  const emit = (invocation: FunctionInvocation, depth: number) => {
    const explicit = invocationCallIds?.get(invocation);
    const callId =
      typeof explicit === "number" && Number.isInteger(explicit)
        ? explicit
        : typeof invocation.traceCallId === "number" &&
            Number.isInteger(invocation.traceCallId)
          ? invocation.traceCallId
          : null;
    const range = callId !== null ? callStepRanges.get(callId) : undefined;
    const firstStep = firstStepForCall(traceSteps, callId);
    const classHash =
      nonEmptyString(firstStep?.classHash) ||
      nonEmptyString(invocation.classHash) ||
      rootClassHash;
    const steps = invocationStepCount(range, invocation);
    const contractName =
      frameLabel(invocation) ||
      shortHex(invocation.contractAddress, 8, 4) ||
      undefined;

    rows.push({
      id: callId !== null ? `call-${callId}` : `call-fallback-${rows.length}`,
      kind: "call",
      name:
        invocationDisplayName(invocation) ||
        shortHex(invocation.entryPointSelector, 8, 6) ||
        "unknown",
      depth,
      isFunction: true,
      isRevert: Boolean(invocation.revertReason),
      contractName,
      secondaryChips:
        steps !== null ? [`${steps.toLocaleString()} steps`] : undefined,
      hasChildren: (invocation.calls?.length ?? 0) > 0,
      frameId: null,
      callId,
      stepIndexStart: range?.stepIndexStart ?? 0,
      classHash,
      invocation,
    });

    for (const child of invocation.calls ?? []) {
      emit(child, depth + 1);
    }
  };

  for (const root of roots) emit(root, 0);
  return rows;
}

function frameClassHash(
  frame: FunctionFrame,
  traceSteps: TraceStep[] | undefined,
  callIdToInvocation: Map<number, FunctionInvocation>,
  fallbackClassHash: string | null,
): string | null {
  return (
    nonEmptyString(traceSteps?.[frame.stepIndexStart]?.classHash) ||
    nonEmptyString(callIdToInvocation.get(frame.callId)?.classHash) ||
    fallbackClassHash
  );
}

function sierraBreadcrumbLabel(
  frame: FunctionFrame,
  ownLabel: string,
  rawSierraLabels: Map<number, string>,
  frameById: Map<number, FunctionFrame>,
  invocationLabel: string,
): string {
  const parts = [ownLabel];
  let cursor = frame.parentFrameId;
  let safety = 0;
  while (cursor !== null && safety < frameById.size + 1) {
    const parent = frameById.get(cursor);
    if (!parent || parent.callId !== frame.callId) break;
    const parentLabel = rawSierraLabels.get(parent.frameId);
    if (parentLabel) parts.unshift(parentLabel);
    cursor = parent.parentFrameId;
    safety += 1;
  }
  const compactParts =
    parts.length > 3 ? ["...", ...parts.slice(parts.length - 2)] : parts;
  return [invocationLabel, ...compactParts].join(" > ");
}

function decodedPayloadRows(
  params: AbiParam[] | undefined,
  felts: string[],
  types: Record<string, AbiTypeDef> | undefined,
): Array<Record<string, unknown>> {
  if (params && params.length > 0) {
    return buildDecodedArgs(params, felts, types).map((arg, index) => ({
      index,
      name: arg.name,
      type: arg.type,
      value: arg.value,
    }));
  }

  return felts.map((felt, index) => ({
    index,
    name: `felt[${index}]`,
    type: "felt252",
    value: felt,
  }));
}

function eventPreview(event: SimulationEvent, index: number): Record<string, unknown> {
  return {
    index,
    name: eventName(event) ?? "unknown",
    from: shortHex(event.fromAddress, 8, 6),
    keys: event.keys.length,
    dataFelts: event.data.length,
    decodedArgs: event.decoded?.args ?? null,
  };
}

function resourceNumber(
  resources: NonNullable<FunctionInvocation["executionResources"]>,
  key: string,
): number | string | null {
  const raw = (resources as unknown as Record<string, unknown>)[key];
  return typeof raw === "number" || typeof raw === "string" ? raw : null;
}

function buildStateData({
  invocation,
  activeFrame,
  currentStep,
  totalSteps,
  stepCursor,
  activeClassHash,
  result,
  types,
}: {
  invocation: FunctionInvocation | null;
  activeFrame: FunctionFrame | null;
  currentStep: TraceStep | null;
  totalSteps: number;
  stepCursor: number;
  activeClassHash: string | null;
  result: SimulationResult | null | undefined;
  types: Record<string, AbiTypeDef> | undefined;
}): Record<string, unknown> {
  const state: Record<string, unknown> = {};

  if (invocation) {
    const name = invocationDisplayName(invocation) ?? "unknown";
    state["current_call"] = {
      name,
      contract: invocation.contractAddress,
      selector: invocation.entryPointSelector,
      callType: invocation.callType,
      classHash: invocation.classHash ?? activeClassHash,
    };

    state["calldata_decoded"] = {
      totalFelts: invocation.calldata.length,
      abi: invocation.decodedFunctionAbi?.name ?? null,
      values: decodedPayloadRows(
        invocation.decodedFunctionAbi?.inputs,
        invocation.calldata,
        types,
      ),
    };

    state["return_value"] = {
      totalFelts: invocation.result.length,
      values: decodedPayloadRows(
        invocation.decodedFunctionAbi?.outputs,
        invocation.result,
        types,
      ),
    };

    const events = invocation.events || [];
    state["events_emitted"] = {
      total: events.length,
      showing: Math.min(EVENT_PREVIEW_LIMIT, events.length),
      items: events.slice(0, EVENT_PREVIEW_LIMIT).map(eventPreview),
    };

    const storageDiff = result?.stateDiff?.storageDiffs.find((diff) =>
      sameHex(diff.address, invocation.contractAddress),
    );
    const storageEntries = storageDiff?.storageEntries ?? [];
    state["storage_writes"] = {
      contract: invocation.contractAddress,
      total: storageEntries.length,
      showing: Math.min(STORAGE_WRITE_PREVIEW_LIMIT, storageEntries.length),
      slots: storageEntries.slice(0, STORAGE_WRITE_PREVIEW_LIMIT).map((entry) => ({
        slot: entry.key,
        before: entry.before,
        after: entry.value,
      })),
    };

    const resources = invocation.executionResources;
    state["gas_used"] = resources
      ? {
          steps: resources.steps,
          l2Gas: resourceNumber(resources, "l2Gas") ?? resources.gasConsumed,
          sierraGas: resources.gasConsumed,
          memoryHoles: resources.memoryHoles,
          builtins: resources.builtinInstanceCounter,
        }
      : {
          available: false,
          message: "Invocation resources were not included in this trace.",
        };
  } else {
    state["current_call"] = {
      name: "unknown",
      classHash: activeClassHash,
    };
  }

  state["debug_context"] = {
    step: currentStep ? `${stepCursor + 1} / ${totalSteps}` : null,
    activeClassHash,
    frameId: activeFrame?.frameId ?? null,
    frameSteps: activeFrame
      ? `${activeFrame.stepIndexStart + 1} → ${activeFrame.stepIndexEnd + 1}`
      : null,
  };

  return state;
}

/** Parse Sierra textual program to build function entry-point table.
 *  Tries two formats:
 *   1. "F{n}@{stmtIdx}" — explicit entry-point notation (newer bridge output)
 *   2. "F{n}:" section headers with sequential counting of statement lines
 *      (statements are `[libfuncIdx](...)` invocations or `return(...)`)
 *  Returns entries sorted by entryStmt for binary search. */
function parseSierraFnBoundaries(
  text: string,
): Array<{ fnIdx: number; entryStmt: number }> {
  const entries: Array<{ fnIdx: number; entryStmt: number }> = [];

  // Format 1: F{n}@{stmt} explicit entry-point (newer bridge builds)
  const atPattern = /\bF(\d+)@(\d+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = atPattern.exec(text)) !== null) {
    entries.push({ fnIdx: parseInt(m[1], 10), entryStmt: parseInt(m[2], 10) });
  }
  if (entries.length > 0) {
    entries.sort((a, b) => a.entryStmt - b.entryStmt);
    return entries;
  }

  // Format 2: sequential counting of statement lines under F{n}: / F{n}_Bk: headers.
  // Statement lines are: `[libfuncIdx](args) -> (...)` / `{ ... }` or `return(...)`.
  // Global statement index = sequential position across ALL functions.
  let currentFn = -1;
  let stmtCount = 0;
  const fnFirstStmt = new Map<number, number>();

  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t === "") continue;

    // Function header: "F0:" — but NOT a basic-block header like "F0_B7:"
    if (/^F\d+\s*:$/.test(t) && !/^F\d+_B/.test(t)) {
      const mm = t.match(/^F(\d+)/);
      if (mm) {
        currentFn = parseInt(mm[1], 10);
        // Record this function's entry statement index (count before any of its stmts)
        if (!fnFirstStmt.has(currentFn)) fnFirstStmt.set(currentFn, stmtCount);
      }
      continue;
    }
    // Basic-block header (within same function) — skip, don't count
    if (/^F\d+_B\d/.test(t)) continue;

    if (currentFn >= 0) {
      // Libfunc invocation statement: "[N](args) -> ..." or "[N](args) { ... }"
      if (/^\[\d+\]\(/.test(t)) {
        stmtCount++;
        continue;
      }
      // Return statement: "return([vars]);"
      if (/^return\(/.test(t)) {
        stmtCount++;
      }
    }
  }

  for (const [fnIdx, entryStmt] of fnFirstStmt) {
    entries.push({ fnIdx, entryStmt });
  }
  entries.sort((a, b) => a.entryStmt - b.entryStmt);
  return entries;
}

function findSierraFnIdx(
  boundaries: Array<{ fnIdx: number; entryStmt: number }>,
  statementIdx: number,
): number | null {
  if (boundaries.length === 0) return null;
  let lo = 0;
  let hi = boundaries.length - 1;
  let best: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (boundaries[mid].entryStmt <= statementIdx) {
      best = boundaries[mid].fnIdx;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

function findStatementLineMap(source: string): { firstStatementLine: number } {
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\d+\s*->/.test(lines[i])) {
      return { firstStatementLine: i + 1 };
    }
  }
  return { firstStatementLine: 1 };
}

function findStatementForPc(
  table: ReadonlyArray<{ pc: number; statementIdx: number }>,
  pc: number,
): number | null {
  if (table.length === 0) return null;
  let lo = 0;
  let hi = table.length - 1;
  let best: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const midPc = table[mid].pc;
    if (midPc <= pc) {
      best = table[mid].statementIdx;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

interface SourceMapDiagnostic {
  reason: string;
  summary: string;
  detail: string;
}

function normalizeSourceMapReason(reason: string | null | undefined): string {
  return (reason || "unknown").trim().toLowerCase();
}

function buildSourceMapDiagnostic({
  sourceMap,
  error,
}: {
  sourceMap: ReturnType<typeof useSierraSourceMap>["data"];
  error: string | null;
}): SourceMapDiagnostic {
  if (error) {
    return {
      reason: "request_failed",
      summary: "Exact step map request failed",
      detail:
        "Verified Cairo source remains available; the debugger is using entry-point highlighting for Cairo mode.",
    };
  }

  if (sourceMap?.available === false) {
    const reason = normalizeSourceMapReason(sourceMap.reason);
    if (reason === "build_failed") {
      return {
        reason,
        summary: "Exact step map build failed",
        detail:
          "Verified Cairo source remains available; the bridge could not rebuild this package with Scarb, so Cairo mode uses entry-point highlighting.",
      };
    }
    if (reason === "build_timeout") {
      return {
        reason,
        summary: "Exact step map build timed out",
        detail:
          "Verified Cairo source remains available; exact per-step highlighting will resume when the source-map build completes successfully.",
      };
    }
    if (reason === "unsupported_compiler") {
      return {
        reason,
        summary: "Exact step map compiler unsupported",
        detail:
          "Verified Cairo source remains available; install the matching Cairo/Scarb toolchain on the bridge to enable per-step mapping.",
      };
    }
    if (reason === "scarb_not_found") {
      return {
        reason,
        summary: "Exact step map toolchain missing",
        detail:
          "Verified Cairo source remains available; the bridge needs the matching Scarb binary to build per-step source maps.",
      };
    }
    return {
      reason,
      summary: "Exact step map unavailable",
      detail:
        "Verified Cairo source remains available; Cairo mode is using entry-point highlighting until an exact source map is available.",
    };
  }

  if (sourceMap?.available === true) {
    return {
      reason: "statement_count_mismatch",
      summary: "Exact step map mismatch",
      detail:
        "Verified Cairo source remains available; the source-map statement count does not match the active Sierra program, so Cairo mode uses entry-point highlighting.",
    };
  }

  return {
    reason: "not_returned",
    summary: "Exact step map not returned",
    detail:
      "Verified Cairo source remains available; Cairo mode is using entry-point highlighting while the exact source map is missing.",
  };
}

function buildFrameCallStack(
  frames: FunctionFrame[],
  currentFrameId: number | null,
): FunctionFrame[] {
  if (currentFrameId === null) return [];
  const byId = new Map(frames.map((f) => [f.frameId, f]));
  const path: FunctionFrame[] = [];
  let cursor: number | null = currentFrameId;
  let safety = 0;
  while (cursor !== null && safety < frames.length + 1) {
    const frame = byId.get(cursor);
    if (!frame) break;
    path.unshift(frame);
    cursor = frame.parentFrameId;
    safety += 1;
  }
  return path;
}

function findActiveFrame(
  frames: FunctionFrame[],
  stepIndex: number,
  callId: number,
): FunctionFrame | null {
  let best: FunctionFrame | null = null;
  for (const f of frames) {
    if (f.callId !== callId) continue;
    if (stepIndex < f.stepIndexStart || stepIndex > f.stepIndexEnd) continue;
    if (!best || f.fp > best.fp) best = f;
  }
  return best;
}

function framesToExecutionRows(
  frames: FunctionFrame[],
  nameMap?: Map<number, string>,
  frameClassHashes?: Map<number, string | null>,
  rootClassHash?: string | null,
): StarknetExecutionRow[] {
  if (frames.length === 0) return [];

  const byId = new Map(frames.map((f) => [f.frameId, f]));
  const depthCache = new Map<number, number>();
  const childCount = new Map<number, number>();
  for (const f of frames) {
    if (f.parentFrameId !== null) {
      childCount.set(f.parentFrameId, (childCount.get(f.parentFrameId) ?? 0) + 1);
    }
  }

  function depthOf(frameId: number): number {
    const cached = depthCache.get(frameId);
    if (cached !== undefined) return cached;
    const frame = byId.get(frameId);
    if (!frame || frame.parentFrameId === null) {
      depthCache.set(frameId, 0);
      return 0;
    }
    const d = 1 + depthOf(frame.parentFrameId);
    depthCache.set(frameId, d);
    return d;
  }

  return frames
    .slice()
    .sort((a, b) => a.stepIndexStart - b.stepIndexStart)
    .map((f) => {
      const classHash = frameClassHashes?.get(f.frameId) ?? null;
      const crossesClass =
        Boolean(classHash) &&
        Boolean(rootClassHash) &&
        !sameHex(classHash, rootClassHash);
      return {
        id: `frame-${f.frameId}`,
        kind: "frame",
        name: nameMap?.get(f.frameId) ?? `fn @ pc:0x${f.pcStart.toString(16)}`,
        depth: depthOf(f.frameId),
        isFunction: true,
        contractName: `${f.stepIndexEnd - f.stepIndexStart + 1} steps`,
        secondaryChips: crossesClass ? [`class ${shortHex(classHash, 8, 4)}`] : undefined,
        hasChildren: (childCount.get(f.frameId) ?? 0) > 0,
        frameId: f.frameId,
        callId: f.callId,
        stepIndexStart: f.stepIndexStart,
        classHash,
      };
    });
}

/** Composite leaf-suppression filter (Codex recommendation).
 *  - Always keeps root frames and all non-leaf frames (preserves tree shape).
 *  - Keeps leaves whose step span exceeds an adaptive threshold derived from
 *    the 60th-percentile of leaf spans, clamped [8, 32], min 16.
 *  - Always pins `pinnedIds` (active frame + its ancestors) so the current
 *    position is never hidden.
 *  - `fullTrace` bypasses all filtering. */
function filterMeaningfulFrames(
  frames: FunctionFrame[],
  pinnedIds: Set<number>,
  fullTrace: boolean,
): FunctionFrame[] {
  if (fullTrace || frames.length === 0) return frames;

  const frameById = new Map(frames.map((f) => [f.frameId, f]));
  const childCount = new Map<number, number>();
  for (const f of frames) {
    if (f.parentFrameId !== null) {
      childCount.set(f.parentFrameId, (childCount.get(f.parentFrameId) ?? 0) + 1);
    }
  }

  const leafSpans = frames
    .filter((f) => (childCount.get(f.frameId) ?? 0) === 0)
    .map((f) => f.stepIndexEnd - f.stepIndexStart)
    .sort((a, b) => a - b);

  let threshold = 16;
  if (leafSpans.length > 0) {
    const p60 = leafSpans[Math.floor(leafSpans.length * 0.6)];
    threshold = Math.max(16, Math.min(32, p60 ?? 16));
  }

  return frames.filter((f) => {
    if (pinnedIds.has(f.frameId)) return true;
    if (f.parentFrameId === null) return true;

    // Collapse same-pc recursive chains: a frame whose parent has the same pcStart is a
    // recursive intermediate — keep only the recursion root (first entry, different-pc parent).
    const parent = frameById.get(f.parentFrameId);
    if (parent && parent.pcStart === f.pcStart) return false;

    if ((childCount.get(f.frameId) ?? 0) > 0) return true; // non-leaf — keep
    return (f.stepIndexEnd - f.stepIndexStart) >= threshold; // significant leaf
  });
}

export function DebuggerPane({
  selectedFrame,
  simulationResult,
  invocations,
  invocationCallIds,
  types,
  onSelectFrame,
  traceSteps,
  functionFrames,
  initialStepIndex,
  chainId,
}: DebuggerPaneProps) {
  const rootClassHash = selectedFrame?.classHash ?? null;
  const debugNetwork = debugNetworkFromChainId(chainId);
  const sourceNetwork = chainIdToStarknetNetwork(chainId);

  const hasTrace = !!traceSteps && traceSteps.length > 0;
  const totalSteps = traceSteps?.length ?? 0;

  const [stepCursor, setStepCursor] = useState<number>(0);

  const callIdToInvocation = useMemo(
    () => buildCallIdToInvocation(selectedFrame, invocations, invocationCallIds),
    [selectedFrame, invocations, invocationCallIds],
  );

  const entryFrameByCallId = useMemo(
    () => buildEntryFrameByCallId(functionFrames),
    [functionFrames],
  );

  const callStepRanges = useMemo(
    () => buildCallStepRanges(functionFrames, traceSteps),
    [functionFrames, traceSteps],
  );

  const selectedFrameCallId = useMemo(() => {
    if (!selectedFrame) return null;
    const explicit = invocationCallIds?.get(selectedFrame);
    if (typeof explicit === "number" && Number.isInteger(explicit)) return explicit;
    return typeof selectedFrame.traceCallId === "number" &&
      Number.isInteger(selectedFrame.traceCallId)
      ? selectedFrame.traceCallId
      : null;
  }, [selectedFrame, invocationCallIds]);

  const selectedEntryStepIndex = useMemo(() => {
    if (selectedFrameCallId === null) return null;
    return entryFrameByCallId.get(selectedFrameCallId)?.stepIndexStart ?? null;
  }, [entryFrameByCallId, selectedFrameCallId]);

  useEffect(() => {
    const requestedStep = initialStepIndex ?? selectedEntryStepIndex ?? 0;
    setStepCursor(
      Math.max(0, Math.min(requestedStep, Math.max(0, totalSteps - 1))),
    );
  }, [traceSteps, initialStepIndex, selectedEntryStepIndex, totalSteps]);

  const currentStep = hasTrace
    ? (traceSteps?.[Math.min(stepCursor, totalSteps - 1)] ?? null)
    : null;

  const activeInvocation =
    (currentStep ? callIdToInvocation.get(currentStep.callId) : undefined) ??
    selectedFrame;
  const activeClassHash =
    nonEmptyString(currentStep?.classHash) ??
    nonEmptyString(activeInvocation?.classHash) ??
    rootClassHash;

  const sierra = useSierraDebug(activeClassHash, debugNetwork);
  const cairoSourceQuery = useCairoSource(activeClassHash, sourceNetwork);
  const sourceMap = useSierraSourceMap(activeClassHash, sourceNetwork);

  const activeFrame = useMemo<FunctionFrame | null>(() => {
    if (!currentStep || !functionFrames) return null;
    return findActiveFrame(functionFrames, stepCursor, currentStep.callId);
  }, [currentStep, functionFrames, stepCursor]);

  const callStack = useMemo<FunctionFrame[]>(() => {
    if (!activeFrame || !functionFrames) return [];
    return buildFrameCallStack(functionFrames, activeFrame.frameId);
  }, [activeFrame, functionFrames]);

  const [fullTrace, setFullTrace] = useState(false);

  const pinnedFrameIds = useMemo<Set<number>>(() => {
    const ids = new Set<number>();
    if (activeFrame) ids.add(activeFrame.frameId);
    for (const f of callStack) ids.add(f.frameId);
    return ids;
  }, [activeFrame, callStack]);

  const visibleFrames = useMemo(
    () => (functionFrames ? filterMeaningfulFrames(functionFrames, pinnedFrameIds, fullTrace) : []),
    [functionFrames, pinnedFrameIds, fullTrace],
  );

  const handleStackFrameClick = useCallback(
    (frame: StackFrameRow) => {
      const target = callStack.find((f) => f.frameId === frame.id);
      if (target) setStepCursor(target.stepIndexStart);
    },
    [callStack],
  );

  const activeStatementIdx = useMemo<number | null>(() => {
    if (!currentStep) return null;
    // Prefer the statementIdx pre-computed by the bridge (debug-mode traces).
    if (typeof currentStep.statementIdx === "number") return currentStep.statementIdx;
    // Fall back to binary search in the pcToStatement table.
    const table = sierra.data?.pcToStatement;
    if (!table || table.length === 0) return null;
    return findStatementForPc(table, currentStep.pc);
  }, [sierra.data, currentStep]);

  const sierraText = sierra.data?.sierra?.text ?? "";
  const statementLineMap = useMemo(
    () =>
      sierraText
        ? findStatementLineMap(sierraText)
        : { firstStatementLine: 1 },
    [sierraText],
  );

  const activeLine = useMemo<number | null>(() => {
    if (activeStatementIdx === null) return null;
    return statementLineMap.firstStatementLine + activeStatementIdx;
  }, [activeStatementIdx, statementLineMap]);

  const revertTargets = useMemo(() => {
    const targets: Array<{
      frameId: number;
      stepIndexStart: number;
      invocation: FunctionInvocation;
    }> = [];
    const seenCallIds = new Set<number>();
    for (const frame of functionFrames ?? []) {
      const invocation = callIdToInvocation.get(frame.callId);
      if (!invocation?.revertReason) continue;
      if (seenCallIds.has(frame.callId)) continue;
      const entry = entryFrameByCallId.get(frame.callId) ?? frame;
      targets.push({
        frameId: entry.frameId,
        stepIndexStart: entry.stepIndexStart,
        invocation,
      });
      seenCallIds.add(frame.callId);
    }

    if (targets.length === 0 && simulationResult?.revertReason) {
      const lastStep = traceSteps?.[traceSteps.length - 1];
      const callId = lastStep?.callId;
      const entry = callId !== undefined ? entryFrameByCallId.get(callId) : null;
      const invocation = callId !== undefined ? callIdToInvocation.get(callId) : null;
      if (entry && invocation) {
        targets.push({
          frameId: entry.frameId,
          stepIndexStart: entry.stepIndexStart,
          invocation,
        });
      }
    }

    return targets.sort((a, b) => a.stepIndexStart - b.stepIndexStart);
  }, [
    callIdToInvocation,
    entryFrameByCallId,
    functionFrames,
    simulationResult?.revertReason,
    traceSteps,
  ]);

  const handlePrev = useCallback(() => {
    setStepCursor((s) => Math.max(0, s - 1));
  }, []);
  const handleNext = useCallback(() => {
    setStepCursor((s) => Math.min(Math.max(0, totalSteps - 1), s + 1));
  }, [totalSteps]);
  const handleStepOver = useCallback(() => {
    if (!activeFrame || !traceSteps || totalSteps === 0) {
      handleNext();
      return;
    }
    const max = totalSteps - 1;
    let next = Math.min(stepCursor + 1, max);
    while (next <= max) {
      const step = traceSteps[next];
      if (!step || step.fp <= activeFrame.fp) {
        setStepCursor(next);
        return;
      }
      next += 1;
    }
    setStepCursor(Math.min(activeFrame.stepIndexEnd + 1, max));
  }, [activeFrame, handleNext, stepCursor, totalSteps, traceSteps]);
  const handleStepOut = useCallback(() => {
    if (!activeFrame || activeFrame.parentFrameId === null || totalSteps === 0) {
      return;
    }
    setStepCursor(Math.min(activeFrame.stepIndexEnd + 1, totalSteps - 1));
  }, [activeFrame, totalSteps]);
  const handleJumpToRevert = useCallback(() => {
    if (revertTargets.length === 0) return;
    const next =
      revertTargets.find((target) => target.stepIndexStart > stepCursor) ??
      revertTargets[0];
    setStepCursor(next.stepIndexStart);
  }, [revertTargets, stepCursor]);

  const canStepOver = hasTrace && stepCursor < totalSteps - 1 && !!activeFrame;
  const canStepOut =
    hasTrace &&
    !!activeFrame &&
    activeFrame.parentFrameId !== null &&
    activeFrame.stepIndexEnd < totalSteps - 1;

  useEffect(() => {
    if (!hasTrace) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.closest(".monaco-editor"))
      ) {
        return;
      }
      if (e.key === "n" || e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "b" || e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key.toLowerCase() === "o") {
        e.preventDefault();
        handleStepOver();
      } else if (e.key.toLowerCase() === "u") {
        e.preventDefault();
        handleStepOut();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasTrace, handlePrev, handleNext, handleStepOver, handleStepOut]);

  const activeRevertReason =
    nonEmptyString(activeInvocation?.revertReason) ??
    (activeInvocation === selectedFrame
      ? nonEmptyString(simulationResult?.revertReasonDecoded) ??
        nonEmptyString(simulationResult?.revertReason)
      : null);

  const stateData = useMemo(
    () =>
      buildStateData({
        invocation: activeInvocation ?? null,
        activeFrame,
        currentStep,
        totalSteps,
        stepCursor,
        activeClassHash,
        result: simulationResult,
        types,
      }),
    [
      activeInvocation,
      activeFrame,
      activeClassHash,
      currentStep,
      simulationResult,
      stepCursor,
      totalSteps,
      types,
    ],
  );

  const cairoVerified =
    !!cairoSourceQuery.data?.verified &&
    (cairoSourceQuery.data?.files?.length ?? 0) > 0;

  const sourceMapUsable = sourceMapStatementCountMatches(
    sourceMap.data,
    sierra.data?.sierra?.statementCount,
  );

  const frameClassHashes = useMemo(() => {
    const map = new Map<number, string | null>();
    for (const frame of functionFrames ?? []) {
      map.set(
        frame.frameId,
        frameClassHash(frame, traceSteps, callIdToInvocation, rootClassHash),
      );
    }
    return map;
  }, [callIdToInvocation, functionFrames, rootClassHash, traceSteps]);

  // Resolve human-readable names for each function frame.
  // Priority: Cairo fn name (source map) → invocation selector → Sierra F{n} breadcrumb → pc fallback.
  const frameNameMap = useMemo(() => {
    const map = new Map<number, string>();
    const rawSierraLabels = new Map<number, string>();
    const steps = traceSteps;
    const files = cairoSourceQuery.data?.files;
    const table = sierra.data?.pcToStatement;
    const boundaries = sierra.data?.sierra?.text
      ? parseSierraFnBoundaries(sierra.data.sierra.text)
      : null;
    const frameById = new Map((functionFrames ?? []).map((f) => [f.frameId, f]));
    const smData = sourceMapStatementCountMatches(
      sourceMap.data,
      sierra.data?.sierra?.statementCount,
    )
      ? sourceMap.data
      : null;
    const activeClass = normalizeHexValue(activeClassHash);

    for (const frame of functionFrames ?? []) {
      const classHash = frameClassHashes.get(frame.frameId);
      const matchesActiveClass =
        activeClass !== null && normalizeHexValue(classHash) === activeClass;
      if (!matchesActiveClass || !boundaries || boundaries.length === 0) continue;

      const step = steps?.[frame.stepIndexStart];
      const stmtIdx =
        typeof step?.statementIdx === "number"
          ? step.statementIdx
          : step && table && table.length > 0
            ? findStatementForPc(table, step.pc)
            : null;
      if (stmtIdx === null) continue;
      const fnIdx = findSierraFnIdx(boundaries, stmtIdx);
      if (fnIdx !== null) rawSierraLabels.set(frame.frameId, `F${fnIdx}`);
    }

    for (const frame of functionFrames ?? []) {
      const classHash = frameClassHashes.get(frame.frameId);
      const matchesActiveClass =
        activeClass !== null && normalizeHexValue(classHash) === activeClass;
      const step = steps?.[frame.stepIndexStart];

      // Resolve statementIdx: embedded (debug traces) first, then pcToStatement lookup
      let stmtIdx: number | null = null;
      if (step) {
        stmtIdx =
          typeof step.statementIdx === "number"
            ? step.statementIdx
            : table && table.length > 0
              ? findStatementForPc(table, step.pc)
              : null;
      }

      // Priority 1: Cairo function name via source map (most precise)
      if (matchesActiveClass && smData && files?.length && stmtIdx !== null) {
        const loc = findStatementLocation(smData.statementToSource, stmtIdx);
        if (loc) {
          const file = files.find((f) => f.path === loc.file);
          if (file) {
            const lines = file.content.split("\n");
            for (let i = Math.min(loc.lineStart - 1, lines.length - 1); i >= 0; i--) {
              const m = lines[i]?.match(/(?:^|\s)fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[(<]/);
              if (m?.[1]) {
                map.set(frame.frameId, m[1]);
                break;
              }
            }
            if (map.has(frame.frameId)) continue;
          }
        }
      }

      // Priority 2: invocation entry frame → selector name (e.g. "__execute__", "transfer").
      const entryFrame = entryFrameByCallId.get(frame.callId);
      if (entryFrame?.frameId === frame.frameId) {
        const sel = invocationDisplayName(callIdToInvocation.get(frame.callId));
        if (sel) {
          map.set(frame.frameId, sel);
          continue;
        }
      }

      // Priority 3: Sierra F{n} label from parsed function boundaries.
      const rawSierraLabel = rawSierraLabels.get(frame.frameId);
      if (rawSierraLabel) {
        const invocationLabel = invocationDisplayName(
          callIdToInvocation.get(frame.callId),
        );
        map.set(
          frame.frameId,
          !sourceMapUsable && invocationLabel
            ? sierraBreadcrumbLabel(
                frame,
                rawSierraLabel,
                rawSierraLabels,
                frameById,
                invocationLabel,
              )
            : rawSierraLabel,
        );
        continue;
      }
      // No label → framesToExecutionRows falls back to "fn @ pc:0x..."
    }
    return map;
  }, [
    activeClassHash,
    cairoSourceQuery.data?.files,
    callIdToInvocation,
    entryFrameByCallId,
    frameClassHashes,
    functionFrames,
    sierra.data,
    sourceMap.data,
    sourceMapUsable,
    traceSteps,
  ]);

  const executionRows = useMemo<StarknetExecutionRow[]>(
    () => {
      if (fullTrace) {
        return framesToExecutionRows(
          visibleFrames,
          frameNameMap,
          frameClassHashes,
          rootClassHash,
        );
      }
      return buildInvocationExecutionRows({
        roots: debuggerRootInvocations(simulationResult, selectedFrame),
        invocationCallIds,
        callStepRanges,
        traceSteps,
        rootClassHash,
      });
    },
    [
      callStepRanges,
      frameClassHashes,
      frameNameMap,
      fullTrace,
      invocationCallIds,
      rootClassHash,
      selectedFrame,
      simulationResult,
      traceSteps,
      visibleFrames,
    ],
  );

  const selectedExecutionRowId = useMemo<string | null>(() => {
    if (fullTrace) {
      if (!activeFrame) return null;
      return `frame-${activeFrame.frameId}`;
    }
    const activeCallId =
      (currentStep ? currentStep.callId : null) ?? selectedFrameCallId;
    return activeCallId !== null ? `call-${activeCallId}` : null;
  }, [activeFrame, currentStep, fullTrace, selectedFrameCallId]);

  const stackFrames = useMemo<StackFrameRow[]>(() => {
    if (!callStack.length) return [];
    return callStack.map((f, i) => ({
      id: f.frameId,
      functionName: frameNameMap.get(f.frameId) ?? `fn @ pc:0x${f.pcStart.toString(16)}`,
      secondary: `${f.stepIndexEnd - f.stepIndexStart + 1} steps · fp=${f.fp}`,
      isCurrent: i === callStack.length - 1,
    }));
  }, [callStack, frameNameMap]);

  // Refs so the click handler always sees the latest data without closing over
  // lexical bindings that can trigger TDZ errors during HMR re-evaluation.
  const sierraRef = useRef(sierra);
  sierraRef.current = sierra;
  const sourceMapRef = useRef(sourceMap);
  sourceMapRef.current = sourceMap;
  const activeClassHashRef = useRef(activeClassHash);
  activeClassHashRef.current = activeClassHash;
  const traceStepsRef = useRef(traceSteps);
  traceStepsRef.current = traceSteps;
  const functionFramesRef = useRef(functionFrames);
  functionFramesRef.current = functionFrames;

  const handleExecutionRowSelect = useCallback(
    (row: StarknetExecutionRow) => {
      if (row.kind === "call") {
        if (row.invocation) onSelectFrame?.(row.invocation);
        setStepCursor(row.stepIndexStart);
        return;
      }

      const table = sierraRef.current.data?.pcToStatement;
      const smData = sourceMapRef.current.data;
      const steps = traceStepsRef.current;
      const frames = functionFramesRef.current;

      // Scan forward from the frame's start to find the first step that resolves
      // through both pc→statement and statement→cairo-source. The first step of a
      // frame frequently has no source-map entry (compiler preamble / jump targets).
      if (
        table &&
        table.length > 0 &&
        smData &&
        steps &&
        row.frameId !== null &&
        row.frameId > 0 &&
        sameHex(row.classHash, activeClassHashRef.current)
      ) {
        const frame = frames?.find((f) => f.frameId === row.frameId);
        const endIdx = Math.min(
          frame?.stepIndexEnd ?? row.stepIndexStart,
          steps.length - 1,
        );
        for (let i = row.stepIndexStart; i <= endIdx; i++) {
          const step = steps[i];
          if (!step) break;
          const stmtIdx = findStatementForPc(table, step.pc);
          if (stmtIdx !== null) {
            const loc = findStatementLocation(smData.statementToSource, stmtIdx);
            if (loc) {
              setStepCursor(i);
              return;
            }
          }
        }
      }

      setStepCursor(row.stepIndexStart);
    },
    [onSelectFrame],
  );

  const frameEntryTarget = useMemo(() => {
    if (!cairoVerified || !cairoSourceQuery.data) return null;
    const fnName = activeInvocation ? selectorName(activeInvocation) : null;
    return resolveCairoSourceTarget(cairoSourceQuery.data, fnName);
  }, [activeInvocation, cairoVerified, cairoSourceQuery.data]);

  const perStepCairoLocation = useMemo(() => {
    const smData = sourceMapStatementCountMatches(
      sourceMap.data,
      sierra.data?.sierra?.statementCount,
    )
      ? sourceMap.data
      : null;
    if (!smData) return null;
    if (activeStatementIdx === null) return null;
    return findStatementLocation(
      smData.statementToSource,
      activeStatementIdx,
    );
  }, [sourceMap.data, sierra.data?.sierra?.statementCount, activeStatementIdx]);

  const cairoTarget = useMemo<{
    file: { path: string; content: string };
    line: number;
    functionFound: boolean;
  } | null>(() => {
    if (perStepCairoLocation && cairoSourceQuery.data) {
      const file = cairoSourceQuery.data.files.find(
        (f) => f.path === perStepCairoLocation.file,
      );
      if (file) {
        return {
          file,
          line: perStepCairoLocation.lineStart,
          functionFound: true,
        };
      }
    }
    return frameEntryTarget;
  }, [perStepCairoLocation, cairoSourceQuery.data, frameEntryTarget]);

  type SourceMode = "cairo" | "sierra";
  const [sourceModeOverride, setSourceModeOverride] =
    useState<SourceMode | null>(null);
  const [selectedCairoPath, setSelectedCairoPath] = useState<string | null>(null);
  useEffect(() => {
    setSourceModeOverride(null);
    setSelectedCairoPath(null);
  }, [activeClassHash]);

  const sourceMode: SourceMode =
    sourceModeOverride ?? (cairoVerified ? "cairo" : "sierra");

  const sourceMapDiagnostic = useMemo(() => {
    if (!cairoVerified || sourceMap.loading || sourceMapUsable) return null;
    return buildSourceMapDiagnostic({
      sourceMap: sourceMap.data,
      error: sourceMap.error,
    });
  }, [cairoVerified, sourceMap.data, sourceMap.error, sourceMap.loading, sourceMapUsable]);

  const cairoFiles = cairoSourceQuery.data?.files ?? [];
  const activeCairoPath = useMemo(() => {
    if (selectedCairoPath && cairoFiles.some((f) => f.path === selectedCairoPath)) {
      return selectedCairoPath;
    }
    return cairoTarget?.file.path ?? cairoFiles[0]?.path ?? null;
  }, [selectedCairoPath, cairoFiles, cairoTarget]);
  const currentCairoFile = useMemo(
    () => cairoFiles.find((f) => f.path === activeCairoPath) ?? null,
    [activeCairoPath, cairoFiles],
  );
  const cairoHighlightLine =
    activeCairoPath === cairoTarget?.file.path ? (cairoTarget?.line ?? null) : null;

  const handleCairoMonacoReady = useCallback(
    (_ed: editor.IStandaloneCodeEditor, monaco: typeof import("monaco-editor")) => {
      setupCairoMonaco(monaco);
    },
    [],
  );

  if (!selectedFrame || !activeClassHash) {
    return <DebuggerEmptyState />;
  }

  const sierraHeader = (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs text-muted-foreground">
        {shortHex(activeClassHash, 10, 6)}
      </span>
      <CopyButton value={activeClassHash} className="h-4 w-4" iconSize={10} />
      {sierra.data?.isCairo1 === false && (
        <Badge variant="outline" size="sm" className="font-mono">
          Cairo 0
        </Badge>
      )}
      {sierra.data?.sierra?.statementCount != null && (
        <Badge variant="secondary" className="text-xs font-mono">
          {sierra.data.sierra.statementCount.toLocaleString()} stmts
        </Badge>
      )}
      {sierra.loading && (
        <Badge variant="outline" className="text-xs animate-pulse">
          loading
        </Badge>
      )}
      {sierra.error && (
        <Badge variant="destructive" className="text-xs" title={sierra.error}>
          error
        </Badge>
      )}
    </div>
  );

  const sierraEmptyState = sierra.error ? (
    <SierraErrorState message={sierra.error} />
  ) : !sierra.data?.sierra ? (
    <SierraUnavailableState isCairo1={sierra.data?.isCairo1 ?? false} />
  ) : null;

  const editorOptions: editor.IStandaloneEditorConstructionOptions = {
    readOnly: true,
    domReadOnly: true,
    minimap: { enabled: false },
    folding: false,
    largeFileOptimizations: true,
    glyphMargin: false,
    lineNumbers: "on",
    scrollBeyondLastLine: false,
    automaticLayout: true,
    wordWrap: "off",
    fontSize: 12,
    fontFamily: "'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace",
    renderLineHighlight: "none",
    scrollbar: {
      vertical: "visible",
      horizontal: "visible",
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10,
    },
    padding: { top: 6 },
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className="starknet-debugger-pane debug-window__content flex flex-col"
        data-testid="debugger-pane"
      >
        <ResizablePanelGroup orientation="horizontal" className="debug-window__main">
          <ResizablePanel defaultSize="20%" minSize="15%" maxSize="35%">
            <ResizablePanelGroup orientation="vertical" className="h-full">
              <ResizablePanel defaultSize="60%" minSize="30%">
                <ExecutionTreeShell<StarknetExecutionRow>
                  className="debug-window__execution-tree"
                  rows={executionRows}
                  selectedRowId={selectedExecutionRowId}
                  onSelect={handleExecutionRowSelect}
                  emptyMessage={
                    fullTrace
                      ? "Re-run with trace_steps=1 to see VM frames"
                      : "No Starknet invocation trace available"
                  }
                  filterToolbar={
                    functionFrames && functionFrames.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setFullTrace((v) => !v)}
                        style={{ fontSize: 11, opacity: 0.7, background: "none", border: "none", cursor: "pointer", color: "inherit", padding: "2px 6px" }}
                      >
                        {fullTrace ? "Summarized" : "Full Trace"}
                      </button>
                    ) : null
                  }
                />
              </ResizablePanel>

              <ResizableHandle />

              <ResizablePanel defaultSize="40%" minSize="15%" maxSize="60%">
                <StackTracePanelShell
                  className="h-full"
                  frames={stackFrames}
                  onFrameClick={handleStackFrameClick}
                  emptyMessage={
                    hasTrace
                      ? "No active call stack"
                      : "Trace required to render the call stack"
                  }
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize="80%">
            <div className="debug-window__right-area">
              <ResizablePanelGroup
                orientation="vertical"
                className="debug-window__vertical-panels"
              >
                <ResizablePanel defaultSize="70%" minSize="30%">
                  <div className="debug-window__source-area">
                    <div className="debug-window__source">
                      <DebuggerSourceModeBar
                        mode={sourceMode}
                        onChange={setSourceModeOverride}
                        cairoAvailable={cairoVerified}
                        cairoLoading={cairoSourceQuery.loading}
                        cairoError={cairoSourceQuery.error}
                        sierraStatementCount={
                          sierra.data?.sierra?.statementCount ?? null
                        }
                        sierraIsCairo1={sierra.data?.isCairo1 ?? null}
                        classHash={activeClassHash}
                        sourceMapAvailable={
                          sourceMapUsable ? true : sourceMap.data ? false : null
                        }
                        sourceMapLoading={sourceMap.loading}
                      />
                      {sourceMode === "sierra" ? (
                        <div style={{ flex: 1, minHeight: 0 }}>
                          <SourceViewPanelShell
                            className="h-full"
                            title="Sierra"
                            headerSlot={sierraHeader}
                            source={
                              sierra.data?.sierra
                                ? { content: sierraText, language: "plaintext" }
                                : null
                            }
                            currentLine={activeLine}
                            loading={sierra.loading ? <SierraLoadingState /> : false}
                            error={sierraEmptyState}
                            editorOptions={editorOptions}
                          />
                        </div>
                      ) : (
                        <div style={{ flex: 1, minHeight: 0 }}>
                          <SourceViewPanelShell
                            className="h-full"
                            title="Source Code"
                            headerSlot={
                              <>
                                {cairoFiles.length > 1 ? (
                                  <Select
                                    value={activeCairoPath ?? ""}
                                    onValueChange={setSelectedCairoPath}
                                  >
                                    <SelectTrigger className="h-7 text-xs w-[200px]">
                                      <SelectValue placeholder="Select file" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {cairoFiles.map((f) => (
                                        <SelectItem
                                          key={f.path}
                                          value={f.path}
                                          className="text-xs"
                                        >
                                          {f.path.split("/").pop() || f.path}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : cairoFiles.length === 1 ? (
                                  <Badge variant="secondary" className="text-xs font-normal">
                                    {cairoFiles[0].path.split("/").pop() || cairoFiles[0].path}
                                  </Badge>
                                ) : null}
                                {cairoHighlightLine != null && (
                                  <Badge variant="outline" className="text-xs font-mono">
                                    Line {cairoHighlightLine}
                                  </Badge>
                                )}
                                {cairoVerified && (
                                  <Badge variant="outline" className="text-[10px] uppercase">
                                    Voyager · verified
                                  </Badge>
                                )}
                              </>
                            }
                            source={
                              currentCairoFile
                                ? { content: currentCairoFile.content, language: "cairo" }
                                : null
                            }
                            currentLine={cairoHighlightLine}
                            loading={cairoSourceQuery.loading}
                            error={
                              cairoSourceQuery.error ? (
                                <div className="flex items-center justify-center h-full text-xs text-destructive p-4">
                                  Failed to fetch Cairo source: {cairoSourceQuery.error}
                                </div>
                              ) : undefined
                            }
                            emptyState={
                              <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
                                <div className="text-sm">
                                  {cairoSourceQuery.data && !cairoSourceQuery.data.verified
                                    ? "This class isn't verified on Voyager."
                                    : "Cairo source unavailable"}
                                </div>
                                <div className="text-xs text-muted-foreground max-w-sm leading-relaxed">
                                  {cairoSourceQuery.data && !cairoSourceQuery.data.verified
                                    ? "Verified Cairo source isn't available for this class hash. You can still view the Sierra textual form."
                                    : "No Cairo source files were found for this class."}
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSourceModeOverride("sierra")}
                                >
                                  View Sierra instead
                                </Button>
                              </div>
                            }
                            theme={CAIRO_THEME_NAME}
                            onMonacoReady={handleCairoMonacoReady}
                            editorOptions={{
                              ...editorOptions,
                              wordWrap: "on",
                              fontSize: 13,
                            }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="debug-window__toolbar">
                      <DebugToolbarShell
                        isActive={hasTrace}
                        isLoading={false}
                        stepLabel={hasTrace ? stepCursor + 1 : "-"}
                        totalSteps={hasTrace ? totalSteps : null}
                        canStepPrev={hasTrace && stepCursor > 0}
                        canStepNext={hasTrace && stepCursor < totalSteps - 1}
                        onStepPrev={handlePrev}
                        onStepNext={handleNext}
                        onStepOver={handleStepOver}
                        canStepOver={canStepOver}
                        onStepOut={handleStepOut}
                        canStepOut={canStepOut}
                        onJumpToRevert={handleJumpToRevert}
                        canJumpToRevert={revertTargets.length > 0}
                        revertButtonLabel={
                          revertTargets.length > 1 ? "Next Revert" : "→ Revert"
                        }
                        runtimeLabel="Cairo VM"
                        runtimeIcon={<Bug size={14} className="text-cyan-400" />}
                        keyboardHints={
                          <>
                            <span>b / ← prev</span>
                            <span>n / → next</span>
                            <span>o over</span>
                            <span>u out</span>
                          </>
                        }
                      />
                    </div>
                  </div>
                </ResizablePanel>

                <ResizableHandle />

                <ResizablePanel defaultSize="30%" minSize="15%" maxSize="50%">
                  <div className="debug-window__state-panel">
                    <DebugStatePanelShell
                      className="h-full"
                      state={stateData}
                      criticalAlert={
                        activeRevertReason
                          ? {
                              title: "Revert reason",
                              message: activeRevertReason,
                            }
                          : null
                      }
                      emptyMessage="Select a frame to inspect"
                    />
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>

        <div className="starknet-debugger-statusbar">
          {sourceMode === "cairo" ? (
            sourceMapUsable ? (
              "Cairo source highlights the exact statement. Step to navigate line-by-line."
            ) : sourceMapDiagnostic ? (
              <>
                {sourceMapDiagnostic.detail}{" "}
                <span className="font-mono">
                  {sourceMapDiagnostic.reason}
                </span>
              </>
            ) : (
              "Cairo source is displayed with entry-point highlighting."
            )
          ) : (
            "Sierra source highlights at per-CASM-instruction granularity via the bridge's pcToStatement table."
          )}{" "}
          <span className="font-mono">trace_steps=1</span> capture is required
          for stepping.
        </div>
      </div>
    </TooltipProvider>
  );
}

function DebuggerSourceModeBar({
  mode,
  onChange,
  cairoAvailable,
  cairoLoading,
  cairoError,
  sierraStatementCount,
  sierraIsCairo1,
  classHash,
  sourceMapAvailable,
  sourceMapLoading,
}: {
  mode: "cairo" | "sierra";
  onChange: (next: "cairo" | "sierra") => void;
  cairoAvailable: boolean;
  cairoLoading: boolean;
  cairoError: string | null;
  sierraStatementCount: number | null;
  sierraIsCairo1: boolean | null;
  classHash: string;
  sourceMapAvailable: boolean | null;
  sourceMapLoading: boolean;
}) {
  const cairoLabel = cairoLoading
    ? "loading"
    : cairoError
      ? "error"
      : cairoAvailable
        ? "verified"
        : "unverified";

  const sourceMapChip =
    mode === "cairo" && cairoAvailable
      ? sourceMapLoading
        ? { text: "step map · loading", color: "var(--sim-text-muted, #6b6b7b)" }
        : sourceMapAvailable === true
          ? { text: "step map · exact", color: "#22c55e" }
          : { text: "step map · fallback", color: "#f59e0b" }
      : null;
  const sierraLabel =
    sierraStatementCount != null
      ? `${sierraStatementCount.toLocaleString()} statements`
      : sierraIsCairo1 === false
        ? "Cairo 0"
        : null;

  const tabClass = (active: boolean) =>
    "px-2.5 py-1 text-[11px] font-medium border-b-2 transition-colors " +
    (active
      ? "border-cyan-400 text-foreground"
      : "border-transparent text-muted-foreground hover:text-foreground");

  return (
    <div
      className="flex items-center justify-between gap-3 px-3 border-b text-[11px]"
      style={{
        background: "var(--sim-bg, #0a0a0c)",
        borderColor: "var(--sim-border, rgba(255,255,255,0.08))",
      }}
    >
      <div className="flex items-center" data-testid="debugger-source-mode-tabs">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={tabClass(mode === "cairo")}
          onClick={() => onChange("cairo")}
          data-testid="debugger-source-mode-cairo"
          title={
            sourceMapChip
              ? `Cairo source — ${cairoLabel}. ${sourceMapChip.text}.`
              : "Cairo source — verified via Voyager"
          }
        >
          Cairo
          <span
            className="ml-1.5 text-[9px] uppercase tracking-wider"
            style={{ color: "var(--sim-text-muted, #6b6b7b)" }}
          >
            · {cairoLabel}
          </span>
          {sourceMapChip && (
            <span
              className="ml-1.5 text-[9px] uppercase tracking-wider"
              style={{ color: sourceMapChip.color }}
            >
              · {sourceMapChip.text}
            </span>
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={tabClass(mode === "sierra")}
          onClick={() => onChange("sierra")}
          data-testid="debugger-source-mode-sierra"
          title="Sierra textual program — canonical per-CASM source"
        >
          Sierra
          {sierraLabel && (
            <span
              className="ml-1.5 text-[9px] uppercase tracking-wider"
              style={{ color: "var(--sim-text-muted, #6b6b7b)" }}
            >
              · {sierraLabel}
            </span>
          )}
        </Button>
      </div>
      <div
        className="flex items-center gap-1.5 font-mono text-[10px]"
        style={{ color: "var(--sim-text-muted, #6b6b7b)" }}
      >
        <span>class</span>
        <span className="text-foreground/80">{shortHex(classHash, 8, 4)}</span>
        <CopyButton value={classHash} className="h-4 w-4" iconSize={10} />
      </div>
    </div>
  );
}

function debugNetworkFromChainId(
  chainId: string | null | undefined,
): "mainnet" | "sepolia" {
  const lower = (chainId || "").toLowerCase();
  return lower === "0x534e5f5345504f4c4941" ||
    lower === "0x534e5f494e544547524154494f4e5f5345504f4c4941"
    ? "sepolia"
    : "mainnet";
}

function SierraLoadingState() {
  return (
    <div
      className="h-full w-full flex items-center justify-center text-xs"
      style={{ color: "var(--sim-text-muted, #6b6b7b)" }}
    >
      Loading Sierra source…
    </div>
  );
}

function SierraErrorState({ message }: { message: string }) {
  return (
    <div className="h-full w-full p-4 flex flex-col items-center justify-center gap-2">
      <Bug size={28} className="opacity-40" />
      <div className="text-xs" style={{ color: "var(--sim-error, #ef4444)" }}>
        Failed to load Sierra source
      </div>
      <div
        className="text-[11px] font-mono max-w-md text-center break-all"
        style={{ color: "var(--sim-text-muted, #6b6b7b)" }}
      >
        {message}
      </div>
    </div>
  );
}

function SierraUnavailableState({ isCairo1 }: { isCairo1: boolean }) {
  return (
    <div className="h-full w-full p-4 flex flex-col items-center justify-center gap-2 text-center">
      <CodeIcon size={28} className="opacity-40" />
      <div className="text-xs" style={{ color: "var(--sim-text, #e5e5e5)" }}>
        Sierra source unavailable
      </div>
      <div
        className="text-[11px] max-w-md"
        style={{ color: "var(--sim-text-muted, #6b6b7b)" }}
      >
        {isCairo1
          ? "The bridge returned no Sierra payload for this class."
          : "This is a Cairo 0 class — Cairo 0 contracts compile to a different VM and have no Sierra program."}
      </div>
    </div>
  );
}

function DebuggerEmptyState() {
  return (
    <div
      className="starknet-debugger-pane flex flex-col items-center justify-center text-center p-10 gap-3"
      data-testid="debugger-empty-state"
      style={{
        background: "var(--sim-bg, #0a0a0c)",
        color: "var(--sim-text-muted, #6b6b7b)",
        border: "1px solid var(--sim-border, rgba(255,255,255,0.08))",
        borderRadius: 6,
        minHeight: 360,
      }}
    >
      <Bug size={36} className="opacity-50" />
      <div className="text-sm" style={{ color: "var(--sim-text, #e5e5e5)" }}>
        Select a frame in the Contracts tab to debug
      </div>
      <div className="text-[11px] max-w-sm">
        The debugger reads the Sierra textual program from the selected
        frame's class hash. Pick any frame in the call tree, then come back
        here.
      </div>
    </div>
  );
}
