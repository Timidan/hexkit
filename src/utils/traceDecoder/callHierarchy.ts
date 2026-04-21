/**
 * Phase 2c: Final row assembly, LOG decoding, internal call hierarchy
 * building (FnCallInfo tracking, call stack walking), and frame anchoring. */

import type { DecodedTraceRow, DecodeTraceContext, FnCallInfo } from './types';
import { parseLogStack, decodeLogWithFallback } from './eventDecoding';
import { validateSourceLineContainsFunctionCall, findCorrectCallLine } from './sourceParser';
import type { AnalysisLocals } from './analysisHelpers';

// ── Row assembly + LOG decoding ────────────────────────────────────────

/**
 * Assemble the final rowsWithJumps array from call frame rows, jump rows,
 * and filtered opcode rows. Also decode LOG opcodes.
 */
export function assembleRowsWithJumps(
  ctx: DecodeTraceContext,
  locals: AnalysisLocals,
  allJumpRows: DecodedTraceRow[]
): DecodedTraceRow[] {
  const { opRows, iface, call } = ctx;
  const { callFrameRows } = locals;

  const significantJumpRows = allJumpRows.filter((jr) => !!jr.destFn);

  const importantOpcodes = new Set([
    "SLOAD", "SSTORE",
    "LOG0", "LOG1", "LOG2", "LOG3", "LOG4",
    "CALL", "CALLCODE", "DELEGATECALL", "STATICCALL",
    "CREATE", "CREATE2", "SELFDESTRUCT",
    "REVERT",
  ]);

  const callTypeOpcodes = new Set(["CALL", "DELEGATECALL", "STATICCALL", "CALLCODE", "CREATE", "CREATE2"]);

  let firstRevertSeen = false;
  const filteredOpRows = opRows.filter((r) => {
    if (callTypeOpcodes.has(r.name)) return false;
    if (!importantOpcodes.has(r.name)) return false;
    if (r.name === "REVERT") {
      if (firstRevertSeen) return false;
      firstRevertSeen = true;
    }
    return true;
  });

  // Build traceId -> first opcode ID map for sorting call frame entries
  const traceIdToFirstOpcodeId = new Map<number, number>();
  for (const r of opRows) {
    const frameId = r.frame_id;
    if (Array.isArray(frameId) && frameId.length >= 1 && r.id !== undefined) {
      const traceId = typeof frameId[0] === 'number' ? frameId[0] : parseInt(String(frameId[0]), 10);
      if (!traceIdToFirstOpcodeId.has(traceId) || r.id < traceIdToFirstOpcodeId.get(traceId)!) {
        traceIdToFirstOpcodeId.set(traceId, r.id);
      }
    }
  }

  const rowsWithJumps = [...callFrameRows, ...significantJumpRows, ...filteredOpRows]
    .sort((a, b) => {
      const getSortKey = (r: DecodedTraceRow): number => {
        if (r.id < 0 && r.traceId !== undefined) {
          const firstOpcodeId = traceIdToFirstOpcodeId.get(r.traceId);
          return firstOpcodeId !== undefined ? firstOpcodeId - 0.5 : r.id;
        }
        return r.id ?? 0;
      };
      return getSortKey(a) - getSortKey(b);
    })
    .filter((r, idx, arr) => idx === 0 || (r.id !== undefined && r.id !== arr[idx - 1].id));

  // Decode LOG opcodes
  rowsWithJumps.forEach((r) => {
    if (r.name?.startsWith("LOG")) {
      const stack = (r as any).stack;
      const memory = (r as any).memory;
      const logInfo = parseLogStack(r.name, stack);
      r.logInfo = logInfo;
      r.decodedLog = decodeLogWithFallback(logInfo, iface, memory, call?.events || []);
    }
  });

  return rowsWithJumps;
}

// ── Internal call hierarchy ────────────────────────────────────────────

/**
 * Build the internal call hierarchy: FnCallInfo records, call stack walking,
 * parent assignment, and frame anchoring for external call frame rows.
 *
 * Mutates ctx.fnCallInfos, ctx.fnCallInfoById, ctx.opIdToInternalParent,
 * and individual rows in rowsWithJumps / callFrameRows.
 */
export function buildCallHierarchy(
  ctx: DecodeTraceContext,
  locals: AnalysisLocals,
  rowsWithJumps: DecodedTraceRow[]
): void {
  const { opRows, sourceTexts, traceIdToParentId, fnSignatures } = ctx;
  const { callFrameRows, fnForPc, jumpTypeForPc } = locals;

  const jumpOpcodes = new Set(["JUMP", "JUMPI"]);
  const externalCallOpcodes = new Set(["CALL", "STATICCALL", "DELEGATECALL", "CALLCODE", "CREATE", "CREATE2"]);
  const returnOpcodes = new Set(["RETURN", "REVERT", "STOP"]);

  const opRowIndexById = new Map<number, number>();
  opRows.forEach((r, idx) => {
    if (r.id !== undefined) opRowIndexById.set(r.id, idx);
  });

  const idToFn = new Map<number, string | null>();
  opRows.forEach(r => {
    if (r.id !== undefined) idToFn.set(r.id, r.fn || null);
  });

  const idToJumpType = new Map<number, string>();
  opRows.forEach(r => {
    if (jumpOpcodes.has(r.name) && r.id !== undefined) {
      const jt = jumpTypeForPc(r.pc, r.frame_id);
      if (jt) idToJumpType.set(r.id, jt);
    }
  });

  const fnCallInfos: FnCallInfo[] = [];
  const fnCallInfoById = new Map<number, FnCallInfo>();

  // Build map from frame_id to external entry function name
  const frameIdToEntryFn = new Map<number, string>();
  for (const cfr of callFrameRows) {
    const frameId = cfr.frame_id;
    const entryFn = cfr.entryMeta?.function || cfr.fn;
    if (Array.isArray(frameId) && frameId.length >= 1 && entryFn) {
      const traceId = typeof frameId[0] === 'number' ? frameId[0] : parseInt(String(frameId[0]), 10);
      if (!isNaN(traceId)) {
        const cleanFn = entryFn.includes('.') ? entryFn.split('.').pop() || entryFn : entryFn;
        frameIdToEntryFn.set(traceId, cleanFn);
      }
    }
  }

  for (let i = 0; i < rowsWithJumps.length; i++) {
    const row = rowsWithJumps[i];
    const isInternalCall = row.jumpMarker && row.destFn && !externalCallOpcodes.has(row.name);

    if (isInternalCall && row.destFn) {
      row.isInternalCall = true;
      const callerFn = row.fn || fnForPc(row.pc, row.frame_id) || idToFn.get(row.id) || null;
      const targetFn = row.destFn;
      const isRecursive = callerFn !== null && callerFn === targetFn;

      let frameTraceId = 0;
      const frameId = row.frame_id;
      if (Array.isArray(frameId) && frameId.length >= 1) {
        frameTraceId = typeof frameId[0] === 'number' ? frameId[0] : parseInt(String(frameId[0]), 10);
      }

      const destFile = row.destSourceFile || row.sourceFile;
      const destLine = row.destLine ?? null;
      const srcFile = row.srcSourceFile ?? null;
      const srcLineVal = row.srcLine ?? null;

      const srcLineContainsCall = validateSourceLineContainsFunctionCall(sourceTexts, srcFile, srcLineVal, targetFn);

      const info: FnCallInfo = {
        rowIndex: i,
        startFn: targetFn,
        callerFn,
        startId: row.id,
        endId: row.id,
        hasNestedCalls: false,
        hasChildOpcodes: false,
        isConfirmedCall: row.isConfirmedCall === true,
        hasSideEffects: false,
        hasStorageRead: false,
        isRecursive,
        callDepth: 0,
        frameTraceId,
        sourceFile: destFile,
        destLine,
        srcSourceFile: srcFile,
        srcLine: srcLineVal,
        hasSrcMapMismatch: !srcLineContainsCall,
      };
      fnCallInfos.push(info);
      fnCallInfoById.set(row.id, info);
    }
  }

  // Walk opRows to mark nested calls using an internal call stack
  const sideEffectOpcodes = new Set(["SSTORE", "LOG0", "LOG1", "LOG2", "LOG3", "LOG4"]);
  const internalCallStack: number[] = [];
  let lastFnInCallScan: string | null = null;
  const opIdToInternalParent = new Map<number, number | undefined>();

  const closeOpenCalls = (endId: number, frameTraceId: number) => {
    const toRemove: number[] = [];
    for (let i = internalCallStack.length - 1; i >= 0; i--) {
      const openId = internalCallStack[i];
      const info = fnCallInfoById.get(openId);
      if (info && info.frameTraceId === frameTraceId) {
        info.endId = endId;
        toRemove.push(i);
      }
    }
    for (const idx of toRemove) {
      internalCallStack.splice(idx, 1);
    }
  };

  for (const opRow of opRows) {
    if (opRow.id === undefined) continue;
    const opFn = opRow.fn || idToFn.get(opRow.id) || null;
    const opJumpType = idToJumpType.get(opRow.id);

    if (lastFnInCallScan && opFn && lastFnInCallScan !== opFn && internalCallStack.length > 0) {
      let returnIndex = -1;
      for (let stackIndex = internalCallStack.length - 1; stackIndex >= 0; stackIndex--) {
        const info = fnCallInfoById.get(internalCallStack[stackIndex]);
        if (info?.startFn === opFn) { returnIndex = stackIndex; break; }
      }

      if (returnIndex >= 0 && returnIndex < internalCallStack.length - 1) {
        for (let popIndex = internalCallStack.length - 1; popIndex > returnIndex; popIndex--) {
          const info = fnCallInfoById.get(internalCallStack[popIndex]);
          if (info) info.endId = opRow.id;
        }
        internalCallStack.length = returnIndex + 1;
      } else if (returnIndex < 0) {
        let opFrameTraceId = 0;
        const opFrameId = opRow.frame_id;
        if (Array.isArray(opFrameId) && opFrameId.length >= 1) {
          opFrameTraceId = typeof opFrameId[0] === 'number' ? opFrameId[0] : parseInt(String(opFrameId[0]), 10);
        }
        const externalEntryFnRaw = frameIdToEntryFn.get(opFrameTraceId);
        const externalEntryFn = externalEntryFnRaw?.includes('(')
          ? externalEntryFnRaw.split('(')[0] : externalEntryFnRaw;

        if (externalEntryFn && opFn === externalEntryFn) {
          while (internalCallStack.length > 0) {
            const topId = internalCallStack[internalCallStack.length - 1];
            const info = fnCallInfoById.get(topId);
            if (info) info.endId = opRow.id;
            internalCallStack.pop();
          }
        } else {
          let callerIndex = -1;
          for (let stackIndex = internalCallStack.length - 1; stackIndex >= 0; stackIndex--) {
            const info = fnCallInfoById.get(internalCallStack[stackIndex]);
            if (info?.callerFn === opFn) { callerIndex = stackIndex; break; }
          }
          if (callerIndex >= 0) {
            for (let popIndex = internalCallStack.length - 1; popIndex >= callerIndex; popIndex--) {
              const info = fnCallInfoById.get(internalCallStack[popIndex]);
              if (info) info.endId = opRow.id;
            }
            internalCallStack.length = callerIndex;
          }
        }
      }
    }

    const callInfo = fnCallInfoById.get(opRow.id);
    if (callInfo) {
      const callerFnForPop = callInfo.callerFn;
      const isContractOrLibraryName = callerFnForPop && (
        /Diamond|Facet|Lib[A-Z]|Storage|Contract|ERC\d+|IERC|Interface/i.test(callerFnForPop) ||
        (callerFnForPop.length > 0 && callerFnForPop[0] === callerFnForPop[0].toUpperCase() && /^[A-Z]/.test(callerFnForPop))
      );

      const thisFrameTraceId = callInfo.frameTraceId;
      const topOfStackFrameTraceId = internalCallStack.length > 0
        ? fnCallInfoById.get(internalCallStack[internalCallStack.length - 1])?.frameTraceId
        : undefined;
      const sameFrame = thisFrameTraceId !== undefined && thisFrameTraceId === topOfStackFrameTraceId;
      const shouldAutoPop = !isContractOrLibraryName && !sameFrame;

      if (shouldAutoPop) {
        while (internalCallStack.length > 0) {
          const topId = internalCallStack[internalCallStack.length - 1];
          const topInfo = fnCallInfoById.get(topId);
          if (topInfo && callerFnForPop && callerFnForPop !== topInfo.startFn) {
            topInfo.endId = opRow.id;
            internalCallStack.pop();
          } else {
            break;
          }
        }
      }

      const actualCurrentParent = internalCallStack.length > 0
        ? internalCallStack[internalCallStack.length - 1] : undefined;
      opIdToInternalParent.set(opRow.id, actualCurrentParent);

      if (actualCurrentParent !== undefined) {
        const parentInfo = fnCallInfoById.get(actualCurrentParent);
        if (parentInfo) parentInfo.hasNestedCalls = true;
      }
      callInfo.callDepth = internalCallStack.length + 1;
      internalCallStack.push(opRow.id);
    } else {
      const currentParent = internalCallStack.length > 0
        ? internalCallStack[internalCallStack.length - 1] : undefined;
      opIdToInternalParent.set(opRow.id, currentParent);

      if (currentParent !== undefined) {
        const parentInfo = fnCallInfoById.get(currentParent);
        if (parentInfo && !parentInfo.hasChildOpcodes) parentInfo.hasChildOpcodes = true;
      }

      if (currentParent !== undefined && opRow.name && externalCallOpcodes.has(opRow.name)) {
        const parentInfo = fnCallInfoById.get(currentParent);
        if (parentInfo && !parentInfo.hasNestedCalls) parentInfo.hasNestedCalls = true;
      }

      if (currentParent !== undefined && opRow.name && sideEffectOpcodes.has(opRow.name)) {
        const parentInfo = fnCallInfoById.get(currentParent);
        if (parentInfo && !parentInfo.hasSideEffects) parentInfo.hasSideEffects = true;
      }

      if (currentParent !== undefined && opRow.name === 'SLOAD') {
        const parentInfo = fnCallInfoById.get(currentParent);
        if (parentInfo && !parentInfo.hasStorageRead) parentInfo.hasStorageRead = true;
      }
    }

    if (returnOpcodes.has(opRow.name)) {
      let opFrameTraceId = 0;
      const opFrameId = opRow.frame_id;
      if (Array.isArray(opFrameId) && opFrameId.length >= 1) {
        opFrameTraceId = typeof opFrameId[0] === 'number' ? opFrameId[0] : parseInt(String(opFrameId[0]), 10);
      }
      closeOpenCalls(opRow.id, opFrameTraceId);
    } else if (opRow.name && jumpOpcodes.has(opRow.name) && opJumpType === 'o') {
      const topId = internalCallStack[internalCallStack.length - 1];
      const topInfo = topId !== undefined ? fnCallInfoById.get(topId) : undefined;
      if (topInfo && opFn && topInfo.startFn === opFn) {
        topInfo.endId = opRow.id;
        internalCallStack.pop();
      }
    }

    lastFnInCallScan = opFn;
  }

  // ── Frame anchoring ──────────────────────────────────────────────────

  const toTraceId = (value: any): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.length > 0) {
      const parsed = parseInt(value, 10);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return undefined;
  };

  const traceIdFromFrameId = (frameId: any): number | undefined => {
    if (!Array.isArray(frameId) || frameId.length < 1) return undefined;
    return toTraceId(frameId[0]);
  };

  const callEntryOpcodes = new Set(["CALL", "DELEGATECALL", "STATICCALL", "CALLCODE", "CREATE", "CREATE2"]);

  for (const callFrameRow of callFrameRows) {
    const frameTraceId = traceIdFromFrameId(callFrameRow.frame_id);
    const parentTraceId = frameTraceId !== undefined
      ? (toTraceId(callFrameRow.externalParentTraceId) ?? toTraceId(traceIdToParentId.get(frameTraceId)))
      : undefined;
    let callOpcodeId: number | undefined;

    if (callFrameRow.firstSnapshotId !== undefined && callFrameRow.firstSnapshotId > 0) {
      for (let searchId = callFrameRow.firstSnapshotId - 1; searchId >= 0; searchId--) {
        if (opIdToInternalParent.has(searchId)) {
          callOpcodeId = searchId;
          break;
        }
      }
    }

    // Fallback when firstSnapshotId is missing
    if (callOpcodeId === undefined && frameTraceId !== undefined) {
      let firstOpcodeIdInFrame: number | undefined;
      for (const opRow of opRows) {
        if (opRow.id === undefined) continue;
        const opTraceId = traceIdFromFrameId(opRow.frame_id);
        if (opTraceId !== frameTraceId) continue;
        if (firstOpcodeIdInFrame === undefined || opRow.id < firstOpcodeIdInFrame) {
          firstOpcodeIdInFrame = opRow.id;
        }
      }

      const expectedCallOpcode = (callFrameRow.entryMeta?.callType || callFrameRow.name || "").toUpperCase();

      if (firstOpcodeIdInFrame !== undefined && parentTraceId !== undefined) {
        let bestSpecific: number | undefined;
        let bestGeneric: number | undefined;
        let bestParentMapped: number | undefined;
        for (const opRow of opRows) {
          if (opRow.id === undefined || opRow.id >= firstOpcodeIdInFrame) continue;
          const opTraceId = traceIdFromFrameId(opRow.frame_id);
          if (opTraceId !== parentTraceId) continue;
          if (opRow.line !== undefined) {
            if (bestParentMapped === undefined || opRow.id > bestParentMapped) {
              bestParentMapped = opRow.id;
            }
          }
          if (!callEntryOpcodes.has(opRow.name)) continue;

          if (opRow.name === expectedCallOpcode) {
            if (bestSpecific === undefined || opRow.id > bestSpecific) bestSpecific = opRow.id;
          }
          if (bestGeneric === undefined || opRow.id > bestGeneric) bestGeneric = opRow.id;
        }

        callOpcodeId = bestSpecific ?? bestGeneric ?? bestParentMapped;
      }
    }

    const internalParent = callOpcodeId !== undefined ? opIdToInternalParent.get(callOpcodeId) : undefined;
    if (internalParent !== undefined) {
      callFrameRow.internalParentId = internalParent;
      const parentInfo = fnCallInfoById.get(internalParent);
      if (parentInfo && !parentInfo.hasNestedCalls) parentInfo.hasNestedCalls = true;
    }

    if (callOpcodeId !== undefined && parentTraceId !== undefined) {
      const callOpRow = opRows.find(r => r.id === callOpcodeId);
      let sourceAnchorRow: DecodedTraceRow | undefined;
      if (callOpRow && callOpRow.line !== undefined) {
        sourceAnchorRow = callOpRow;
      } else if (callOpcodeId !== undefined) {
        for (const opRow of opRows) {
          if (opRow.id === undefined || opRow.line === undefined) continue;
          if (opRow.id >= callOpcodeId) continue;
          const opTraceId = traceIdFromFrameId(opRow.frame_id);
          if (opTraceId !== parentTraceId) continue;
          if (!sourceAnchorRow || (sourceAnchorRow.id !== undefined && opRow.id > sourceAnchorRow.id)) {
            sourceAnchorRow = opRow;
          }
        }
      }

      if (sourceAnchorRow && sourceAnchorRow.line !== undefined) {
        callFrameRow.sourceFile = sourceAnchorRow.sourceFile;
        callFrameRow.fn = sourceAnchorRow.fn || callFrameRow.fn;

        const calledFunction = callFrameRow.entryMeta?.function;
        if (calledFunction && sourceAnchorRow.sourceFile) {
          const fnNameMatch = calledFunction.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
          const fnNameStr = fnNameMatch ? fnNameMatch[1] : null;
          if (fnNameStr) {
            const correctedLine = findCorrectCallLine(
              sourceTexts,
              sourceAnchorRow.sourceFile,
              sourceAnchorRow.line,
              fnNameStr,
            );
            callFrameRow.line = correctedLine ?? sourceAnchorRow.line;
          } else {
            callFrameRow.line = sourceAnchorRow.line;
          }
        } else {
          callFrameRow.line = sourceAnchorRow.line;
        }
      }
    }

    // Last resort: anchor to the first mapped opcode in the frame
    if (callFrameRow.line === undefined && frameTraceId !== undefined && parentTraceId !== undefined) {
      const firstMappedOp = opRows.find((r) => {
        if (r.id === undefined || r.line === undefined) return false;
        return traceIdFromFrameId(r.frame_id) === frameTraceId;
      });
      if (firstMappedOp && firstMappedOp.line !== undefined) {
        callFrameRow.line = firstMappedOp.line;
        callFrameRow.sourceFile = callFrameRow.sourceFile || firstMappedOp.sourceFile;
        callFrameRow.fn = callFrameRow.fn || firstMappedOp.fn;
      }
    }
  }

  // ── Finalize leaf/parent flags ───────────────────────────────────────

  for (const info of fnCallInfos) {
    const row = rowsWithJumps[info.rowIndex];
    if (info.hasNestedCalls || info.hasChildOpcodes) {
      row.hasChildren = true;
      row.isLeafCall = false;
      row.childEndId = info.endId;
    } else {
      row.isLeafCall = true;
      row.hasChildren = false;
    }
  }

  // Store in context
  ctx.fnCallInfos = fnCallInfos;
  ctx.fnCallInfoById = fnCallInfoById;
  ctx.opIdToInternalParent = opIdToInternalParent;
}
