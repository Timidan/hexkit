/**
 * V3 Rendered Trace Consumer
 *
 * Thin adapter that converts the Rust-produced RenderedTrace JSON (camelCase)
 * into the existing DecodedTraceRow[] format the UI expects.
 *
 * This replaces the entire 3-phase TypeScript decode pipeline when the
 * Rust EDB engine provides schema version 3 rendered trace output.
 */

import type { DecodedTraceRow } from "./types";
import type { RenderedTrace } from "../../types/transaction";

interface ConsumedTrace {
  rows: DecodedTraceRow[];
  sourceTexts: Record<string, string>;
  sourceLines: string[];
  rawEvents: any[];
  callMeta?: any;
  implementationToProxy: Map<string, string>;
}

/**
 * Convert a V3 RenderedTrace from the Rust EDB engine into the format
 * expected by the frontend UI components (DecodedTraceRow[]).
 *
 * The mapping is mostly 1:1 since the Rust schema was designed to match
 * the TS DecodedTraceRow. Only a few fields need renaming.
 */
export function consumeRenderedTrace(rendered: RenderedTrace): ConsumedTrace {
  // Filter out bare CREATE/CREATE2 opcode rows — these are covered by
  // synthetic entry rows with entryMeta. Keeps the rich entry row, drops
  // the redundant raw opcode row.
  const callTypeOpcodes = new Set(["CREATE", "CREATE2"]);
  const rows: DecodedTraceRow[] = rendered.rows
    .map(adaptRow)
    .filter(row => !(callTypeOpcodes.has(row.name) && !row.entryMeta));

  // Convert implementationToProxy from plain object to Map
  const implToProxy = new Map<string, string>();
  if (rendered.implementationToProxy) {
    for (const [impl, proxy] of Object.entries(rendered.implementationToProxy)) {
      implToProxy.set(impl, proxy);
    }
  }

  return {
    rows,
    sourceTexts: rendered.sourceTexts || {},
    sourceLines: rendered.sourceLines || [],
    rawEvents: rendered.rawEvents || [],
    callMeta: rendered.callMeta || undefined,
    implementationToProxy: implToProxy,
  };
}

/**
 * Adapt a single Rust RenderedTraceRow to the TS DecodedTraceRow format.
 *
 * Key differences handled:
 * - `frameId` → `frame_id` (TS uses snake_case for this field)
 * - `storageRead` → `storage_read`
 * - `storageWrite` → `storage_write`
 * - `functionName` → `fn`
 * - `kind: "entry"` → `kind: "opcode"` (TS uses "opcode" for all rows)
 */
function adaptRow(row: any): DecodedTraceRow {
  return {
    id: row.id,
    traceId: row.traceId,
    kind: "opcode", // TS always uses "opcode" even for entry rows
    name: row.name,
    pc: row.pc,
    input: row.input,
    output: row.output,
    gasUsed: row.gasUsed,
    gasDelta: row.gasDelta ?? "0",
    gasCum: row.gasCum,
    gasRemaining: row.gasRemaining ?? "0",
    frame_id: row.frameId,
    depth: row.depth,
    visualDepth: row.visualDepth,
    internalParentId: row.internalParentId,
    isInternalCall: row.isInternalCall,
    isInternalReturn: row.isInternalReturn,
    isLeafCall: row.isLeafCall,
    hasChildren: row.hasChildren,
    childEndId: row.childEndId,
    firstSnapshotId: row.firstSnapshotId,
    externalParentTraceId: row.externalParentTraceId,
    isConfirmedCall: row.isConfirmedCall,
    isUnverifiedContract: row.isUnverifiedContract,
    line: row.line,
    sourceFile: row.sourceFile,
    fn: row.fn, // Rust uses #[serde(rename = "fn")] so JSON key is "fn"
    contract: row.contract,
    stackDepth: row.stackDepth,
    stackTop: row.stackTop,
    storage_read: row.storageRead, // Rust camelCase → TS snake_case
    storage_write: row.storageWrite,
    jumpMarker: row.jumpMarker,
    destPc: row.destPc,
    destFn: row.destFn,
    destSourceFile: row.destSourceFile,
    destLine: row.destLine,
    srcSourceFile: row.srcSourceFile,
    srcLine: row.srcLine,
    jumpArgsDecoded: row.jumpArgsDecoded,
    jumpArgsOrigin: row.jumpArgsOrigin,
    jumpArgsTruncated: row.jumpArgsTruncated,
    jumpResult: row.jumpResult,
    jumpResultSource: row.jumpResultSource,
    entryJumpdest: row.entryJumpdest,
    entryMeta: row.entryMeta,
    logInfo: row.logInfo,
    decodedLog: row.decodedLog,
    eventFallback: row.eventFallback,
  };
}
