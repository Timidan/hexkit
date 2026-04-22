/**
 * Phase 3: Finalize trace decoding - external call childEndId computation,
 * gas calculation, event extraction, leaf filtering, final assembly.
 * Lines ~3814-4501 of original traceDecoder.ts
 */

import type { DecodedTraceRow, CallMeta, RawEventLog, DecodeTraceContext } from './types';
import { getStaticGasCost } from './opcodes';
import { getCallFrames } from './stackDecoding';

export function phaseFinalize(ctx: DecodeTraceContext): {
  rows: DecodedTraceRow[];
  sourceLines: string[];
  sourceTexts: Record<string, string>;
  callMeta?: CallMeta;
  rawEvents?: RawEventLog[];
  implementationToProxy?: Map<string, string>;
} {
  const { raw, call, opRows, callFrameRows, rowsWithJumps, fnCallInfos, fnCallInfoById,
          opIdToInternalParent, traceIdToDepth, traceIdToCodeAddr, traceIdToParentId,
          sourceTexts, sourceLines, iface, fnSignatures } = ctx;

  const externalCallOpcodes = new Set(["CALL", "STATICCALL", "DELEGATECALL", "CALLCODE", "CREATE", "CREATE2"]);
  const returnOpcodes = new Set(["RETURN", "REVERT", "STOP"]);

  // Build index for quick lookup
  const opRowIndexById = new Map<number, number>();
  opRows.forEach((r, idx) => {
    if (r.id !== undefined) opRowIndexById.set(r.id, idx);
  });

  // ==========================================================================
  // EXTERNAL CALL ENTRY + CALL OPCODE childEndId — STACK-BASED O(n)
  // ==========================================================================
  // Replaces two O(n²) forward-scan loops with a single-pass stack approach.
  // Each entry/call-opcode is pushed onto a stack; as we advance through rows
  // we track the most recent valid row id. When a row "closes" a stack frame
  // (lower traceId, same-traceId re-entry, or shallower depth), we pop and
  // assign childEndId from the tracked id.
  const getTraceId = (row: DecodedTraceRow): number | undefined => {
    const frameId = row.frame_id;
    if (Array.isArray(frameId) && frameId.length >= 1) {
      const traceId = typeof frameId[0] === 'number' ? frameId[0] : parseInt(String(frameId[0]), 10);
      return isNaN(traceId) ? undefined : traceId;
    }
    return row.traceId;
  };

  interface ChildRangeFrame {
    rowIdx: number;
    traceId: number | undefined;
    depth: number;
    lastValidId: number;           // most recent valid child id seen
    foundChild: boolean;
  }

  const childStack: ChildRangeFrame[] = [];

  // Helper: does `row` close `frame`?
  // A frame is closed when we encounter:
  //   1. A row with lower traceId (we've moved to an earlier/parent frame)
  //   2. A re-entry into the same traceId (same-frame re-entry)
  //   3. A sibling entry at the same depth but with a DIFFERENT traceId
  //      (this is the critical case Codex flagged — sibling with higher traceId
  //       was incorrectly treated as a child)
  const closesFrame = (
    row: DecodedTraceRow,
    rowTraceId: number | undefined,
    rowDepth: number,
    isEntry: boolean,
    frame: ChildRangeFrame,
  ): boolean => {
    if (frame.traceId !== undefined && rowTraceId !== undefined) {
      if (rowTraceId < frame.traceId) return true;
      if (rowTraceId === frame.traceId && isEntry) return true;
      // Sibling entry: same depth, different traceId → closes this frame
      if (isEntry && rowDepth <= frame.depth && rowTraceId !== frame.traceId) return true;
      return false;
    }
    // Depth-based fallback
    if (rowDepth < frame.depth) return true;
    if (rowDepth === frame.depth && isEntry) return true;
    return false;
  };

  // Helper: is `row` a child of `frame`? (for call-opcode "rail" entries)
  const isChildOfCallFrame = (
    rowTraceId: number | undefined,
    rowDepth: number,
    frame: ChildRangeFrame,
  ): boolean => {
    if (frame.traceId !== undefined && rowTraceId !== undefined) {
      return rowTraceId > frame.traceId;
    }
    return rowDepth > frame.depth;
  };

  const finalizeFrame = (frame: ChildRangeFrame) => {
    const row = rowsWithJumps[frame.rowIdx];
    if (frame.foundChild) {
      row.hasChildren = true;
      row.isLeafCall = false;
      row.childEndId = frame.lastValidId;
    } else {
      row.hasChildren = false;
      row.isLeafCall = true;
    }
  };

  for (let i = 0; i < rowsWithJumps.length; i++) {
    const row = rowsWithJumps[i];
    const rowTraceId = getTraceId(row);
    const rowDepth = row.depth ?? 0;
    const isEntry = !!row.entryMeta;
    const hasValidId = row.id !== undefined && row.id >= 0;

    // Pop frames that are closed by this row
    while (childStack.length > 0) {
      const top = childStack[childStack.length - 1];
      if (!closesFrame(row, rowTraceId, rowDepth, isEntry, top)) break;
      childStack.pop();
      finalizeFrame(top);
    }

    // Update lastValidId for all open frames where this row is a child
    if (hasValidId) {
      for (let s = childStack.length - 1; s >= 0; s--) {
        const frame = childStack[s];
        // For entry frames: any row within range is a child (already past close check)
        // For call-opcode frames: only rows with higher traceId/depth
        if (frame.traceId !== undefined || !externalCallOpcodes.has(rowsWithJumps[frame.rowIdx].name) ||
            isChildOfCallFrame(rowTraceId, rowDepth, frame)) {
          frame.lastValidId = row.id;
          frame.foundChild = true;
        }
      }
    }

    // Push new frame for entry rows
    if (isEntry) {
      childStack.push({
        rowIdx: i, traceId: rowTraceId, depth: rowDepth,
        lastValidId: row.id, foundChild: false,
      });
    }
    // Push new frame for external call opcodes without entryMeta (rail detection)
    else if (externalCallOpcodes.has(row.name) && !row.hasChildren) {
      childStack.push({
        rowIdx: i, traceId: rowTraceId, depth: rowDepth,
        lastValidId: row.id, foundChild: false,
      });
    }
  }

  // Flush remaining frames
  while (childStack.length > 0) {
    finalizeFrame(childStack.pop()!);
  }

  // ==========================================================================
  // JUMP GAS CALCULATION
  // ==========================================================================
  for (const info of fnCallInfos) {
    const row = rowsWithJumps[info.rowIndex];
    if (!row || row.id < 0) continue;

    const startIdx = opRowIndexById.get(info.startId);
    let endIdx = opRowIndexById.get(info.endId);

    if (startIdx === undefined) continue;

    if (endIdx === undefined || endIdx <= startIdx) {
      const startDepth = opRows[startIdx].visualDepth ?? opRows[startIdx].depth ?? 0;
      endIdx = startIdx;
      for (let i = startIdx + 1; i < opRows.length; i++) {
        const checkDepth = opRows[i].visualDepth ?? opRows[i].depth ?? 0;
        if (checkDepth <= startDepth) { endIdx = i - 1; break; }
        endIdx = i;
      }
    }

    let totalFunctionGas = 0n;
    for (let i = startIdx + 1; i <= endIdx; i++) {
      try { totalFunctionGas += BigInt(opRows[i].gasDelta || "0"); } catch {}
    }

    row.gasDelta = totalFunctionGas.toString();
  }

  // ==========================================================================
  // CALL FRAME GAS CALCULATION
  // ==========================================================================
  const traceIdToTotalGas = new Map<number, bigint>();
  for (const opRow of opRows) {
    const frameId = opRow.frame_id;
    if (!Array.isArray(frameId) || frameId.length < 1) continue;
    const traceId = typeof frameId[0] === 'number' ? frameId[0] : parseInt(String(frameId[0]), 10);
    if (isNaN(traceId)) continue;
    const currentGas = traceIdToTotalGas.get(traceId) ?? 0n;
    try { traceIdToTotalGas.set(traceId, currentGas + BigInt(opRow.gasDelta || "0")); } catch {}
  }

  for (const callFrameRow of callFrameRows) {
    if (callFrameRow.traceId === undefined) continue;
    const totalGas = traceIdToTotalGas.get(callFrameRow.traceId);
    const existingGas = callFrameRow.gasDelta;
    const hasValidExistingGas = existingGas && existingGas !== "0" && existingGas !== "";

    if (totalGas !== undefined && totalGas > 0n && !hasValidExistingGas) {
      if (totalGas > 1_000_000_000n) {
        const staticCost = getStaticGasCost(callFrameRow.name).toString();
        callFrameRow.gasDelta = staticCost;
        callFrameRow.gasUsed = staticCost;
        continue;
      }
      if (totalGas < 0n) {
        const staticCost = getStaticGasCost(callFrameRow.name).toString();
        callFrameRow.gasDelta = staticCost;
        callFrameRow.gasUsed = staticCost;
        continue;
      }
      callFrameRow.gasDelta = totalGas.toString();
      callFrameRow.gasUsed = totalGas.toString();
    } else if (!hasValidExistingGas) {
      const staticCost = getStaticGasCost(callFrameRow.name).toString();
      if (staticCost !== "0") {
        callFrameRow.gasDelta = staticCost;
        callFrameRow.gasUsed = staticCost;
      }
    }
  }

  // ==========================================================================
  // THIRD PASS: Compute visualDepth and internal parent hierarchy
  // ==========================================================================
  const internalDepthById = new Map<number, number>();

  for (const row of rowsWithJumps) {
    if (row.id === undefined) continue;
    const externalDepth = row.depth ?? 0;
    const parentInternalId = row.internalParentId ?? opIdToInternalParent.get(row.id);
    row.internalParentId = parentInternalId;

    const isInternalEntry = row.isInternalCall === true;

    if (isInternalEntry) {
      const parentDepth = parentInternalId ? (internalDepthById.get(parentInternalId) ?? 0) : 0;
      internalDepthById.set(row.id, parentDepth + 1);
      row.visualDepth = externalDepth + parentDepth + 1;
    } else if (parentInternalId !== undefined) {
      const parentInfo = fnCallInfoById.get(parentInternalId);
      const parentIsLeaf = parentInfo && !parentInfo.hasNestedCalls && !parentInfo.hasChildOpcodes;
      const parentDepth = internalDepthById.get(parentInternalId) ?? 0;

      let effectiveExternalDepth = externalDepth;
      if (row.entryMeta && row.externalParentTraceId != null) {
        const parentExternalDepth = traceIdToDepth.get(row.externalParentTraceId);
        if (parentExternalDepth !== undefined) effectiveExternalDepth = parentExternalDepth;
      }

      if (parentIsLeaf) {
        row.visualDepth = effectiveExternalDepth + parentDepth;
      } else {
        row.visualDepth = effectiveExternalDepth + parentDepth + 1;
      }
    } else {
      if (row.entryMeta) {
        row.visualDepth = externalDepth;
      } else {
        row.visualDepth = externalDepth + 1;
      }
    }

    if (returnOpcodes.has(row.name) && parentInternalId !== undefined) {
      row.isInternalReturn = true;
    }
  }

  // Calculate total gas used
  let calculatedGasUsed: string | number | undefined;
  if (rowsWithJumps.length > 0) {
    const lastRowWithGas = [...rowsWithJumps].reverse().find(r => r.gasCum);
    if (lastRowWithGas?.gasCum) calculatedGasUsed = lastRowWithGas.gasCum;
  }

  // ==========================================================================
  // DIAMOND/PROXY PATTERN AUTO-DETECTION
  // ==========================================================================
  const rawEvents: RawEventLog[] = [];
  const allCallsForEvents = getCallFrames(raw);
  const mainEntryTarget = call?.target?.toLowerCase() || "";

  const isDiamondPattern = allCallsForEvents.some((c: any) => {
    const callType = c.call_type?.Call || c.call_type || "";
    const callTypeStr = typeof callType === "string" ? callType : "";
    const target = (c.target || "").toLowerCase();
    return callTypeStr.toLowerCase().includes("delegate") && target === mainEntryTarget;
  });

  const implementationToProxy = new Map<string, string>();

  if (isDiamondPattern && mainEntryTarget) {
    const delegateFacets = new Set<string>();
    for (const callEntry of allCallsForEvents) {
      const codeAddr = (callEntry.code_address || "").toLowerCase();
      const callType = callEntry.call_type?.Call || callEntry.call_type || "";
      const callTypeStr = typeof callType === "string" ? callType : "";
      if (callTypeStr.toLowerCase().includes("delegate") && codeAddr && codeAddr !== mainEntryTarget) {
        delegateFacets.add(codeAddr);
        implementationToProxy.set(codeAddr, mainEntryTarget);
      }
    }

    for (const callEntry of allCallsForEvents) {
      const target = (callEntry.target || "").toLowerCase();
      const codeAddr = (callEntry.code_address || "").toLowerCase();
      const callType = callEntry.call_type?.Call || callEntry.call_type || "";
      const callTypeStr = typeof callType === "string" ? callType : "";
      if (target === mainEntryTarget || implementationToProxy.has(target)) continue;
      if (callTypeStr.toLowerCase().includes("delegate")) continue;
      if (target && target === codeAddr) {
        if (delegateFacets.has(target)) {
          implementationToProxy.set(target, mainEntryTarget);
        }
      }
    }
  }

  // Extract events from call entries
  const extractEventsFromCall = (callEntry: any) => {
    if (!callEntry?.events || !Array.isArray(callEntry.events)) return;
    let emitterAddress = callEntry.target || callEntry.code_address || "";
    const normalized = emitterAddress.toLowerCase();
    if (implementationToProxy.has(normalized)) {
      emitterAddress = implementationToProxy.get(normalized)!;
    }
    for (const evt of callEntry.events) {
      if (evt.topics && evt.data) {
        rawEvents.push({
          address: emitterAddress,
          topics: Array.isArray(evt.topics) ? evt.topics : [],
          data: evt.data || "0x",
        });
      }
    }
  };

  for (const callEntry of allCallsForEvents) {
    extractEventsFromCall(callEntry);
  }

  // ==========================================================================
  // FALLBACK: Extract events from LOG opcodes
  // ==========================================================================
  if (rowsWithJumps && Array.isArray(rowsWithJumps)) {
    const existingEventSigs = new Set<string>();
    rawEvents.forEach(evt => {
      const sig = `${(evt.topics[0] || '').toLowerCase()}_${evt.address.toLowerCase()}`;
      existingEventSigs.add(sig);
    });

    rowsWithJumps.forEach((r: any) => {
      if (!r.name?.startsWith("LOG") || !r.logInfo) return;
      let emitterAddress = r.targetAddress || r.bytecodeAddress || call?.target || call?.code_address || "";
      const normalizedEmitter = emitterAddress.toLowerCase();
      if (implementationToProxy.has(normalizedEmitter)) {
        emitterAddress = implementationToProxy.get(normalizedEmitter)!;
      }

      const topics = (r.logInfo.topics || []).map((t: any) => {
        const hex = String(t).replace(/^0x/, "");
        return "0x" + hex.padStart(64, "0");
      });
      if (!topics.length) return;

      const eventSig = `${topics[0].toLowerCase()}_${emitterAddress.toLowerCase()}`;
      if (existingEventSigs.has(eventSig)) return;

      let data = "0x";
      const memory = r.memory;
      if (memory && Array.isArray(memory) && r.logInfo.offset !== undefined && r.logInfo.size !== undefined) {
        const off = Number(BigInt(r.logInfo.offset || 0));
        const len = Number(BigInt(r.logInfo.size || 0));
        const start = Math.max(0, off);
        const end = Math.min(memory.length, start + len);
        if (end > start) {
          const slice = memory.slice(start, end);
          data = "0x" + slice.map((b: any) => {
            const n = Number(b) & 0xff;
            return n.toString(16).padStart(2, "0");
          }).join("");
        }
      }

      rawEvents.push({ address: emitterAddress, topics, data });
      existingEventSigs.add(eventSig);
    });
  }
  // Events from LOG opcodes added silently (was debug logging)

  const callMeta: CallMeta | undefined = call ? {
    gas_used: call.gas_used ?? call.gasUsed ?? calculatedGasUsed,
    gasUsed: call.gas_used ?? call.gasUsed ?? calculatedGasUsed,
    caller: call.caller,
    target: call.target ?? call.code_address,
    code_address: call.code_address,
    value: call.value,
    input: call.input,
    output: call.output ?? call.result?.output,
    result: call.result,
    rawEvents: rawEvents.length > 0 ? rawEvents : undefined,
  } : undefined;

  // ==========================================================================
  // SMART LEAF CALL FILTERING
  // ==========================================================================
  const fnStats = new Map<string, { callers: Set<string>; minDepth: number; maxDepth: number }>();
  for (const info of fnCallInfos) {
    const fnName = info.startFn || 'unknown';
    if (!fnStats.has(fnName)) {
      fnStats.set(fnName, { callers: new Set(), minDepth: info.callDepth, maxDepth: info.callDepth });
    }
    const stats = fnStats.get(fnName)!;
    if (info.callerFn) stats.callers.add(info.callerFn);
    stats.minDepth = Math.min(stats.minDepth, info.callDepth);
    stats.maxDepth = Math.max(stats.maxDepth, info.callDepth);
  }

  const meaningfulInternalCallIds = new Set<number>();

  for (const info of fnCallInfos) {
    const fnName = info.startFn || 'unknown';
    const stats = fnStats.get(fnName);
    const uniqueCallerCount = stats?.callers.size ?? 0;
    const depthVariance = stats ? (stats.maxDepth - stats.minDepth) : 0;
    const isInfrastructureFn = uniqueCallerCount >= 3 && depthVariance <= 1;

    const hasConfirmingEvidence = info.hasNestedCalls || info.isRecursive ||
                                  info.hasSideEffects || info.hasStorageRead;

    if (info.hasSrcMapMismatch && !hasConfirmingEvidence) {
      continue;
    }

    const shouldKeep = (info.isConfirmedCall && !info.hasSrcMapMismatch) ||
                       hasConfirmingEvidence ||
                       info.hasChildOpcodes ||
                       isInfrastructureFn;

    if (shouldKeep) {
      meaningfulInternalCallIds.add(info.startId);
    }
  }

  const finalRows = rowsWithJumps.filter(r => {
    if (!r.isInternalCall) return true;
    return meaningfulInternalCallIds.has(r.id);
  });

  return { rows: finalRows, sourceLines, sourceTexts, callMeta, rawEvents, implementationToProxy };
}
