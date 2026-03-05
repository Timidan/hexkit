import { useMemo } from "react";
import type { SimulationCallNode } from "../../utils/simulationArtifacts";
import type { TraceRow } from "./types";
import { getOpcodeName, snapshotFrameKey } from "./formatters";

interface UseTraceRowsParams {
  callSummaryRow: TraceRow | null;
  snapshots: any[];
  opcodeTrace: any[];
  callFrameMap: Map<string, SimulationCallNode>;
  events: any[];
  storageDiffs: any[];
  decodedTrace: any;
}

export function useTraceRows({
  callSummaryRow,
  snapshots,
  opcodeTrace,
  callFrameMap,
  events,
  storageDiffs,
  decodedTrace,
}: UseTraceRowsParams): TraceRow[] {
  return useMemo<TraceRow[]>(() => {
    const truncateMiddle = (value: string, maxChars = 180): string => {
      if (!value || value.length <= maxChars) return value;
      const keep = Math.max(8, Math.floor((maxChars - 1) / 2));
      return `${value.slice(0, keep)}…${value.slice(-keep)}`;
    };

    const formatJumpArgs = (
      decodedArgs: Array<{ name: string; value: string }> | null | undefined
    ): { preview?: string; full?: string } => {
      if (!decodedArgs || decodedArgs.length === 0) return {};

      const splitTopLevel = (value: string): string[] => {
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
      };

      const compactStructuredValue = (rawValue: string): string => {
        const value = String(rawValue ?? "").trim();
        if (!value) return value;
        const looksArray = value.startsWith("[") && value.endsWith("]");
        const looksObject = value.startsWith("{") && value.endsWith("}");
        const isStructured =
          looksArray ||
          looksObject ||
          value.includes("\n") ||
          (value.includes(",") && (value.includes("[") || value.includes("{")));

        if (!isStructured) {
          return truncateMiddle(value, 120);
        }

        if (looksArray) {
          const inner = value.slice(1, -1).trim();
          if (!inner) return "[]";
          const items = splitTopLevel(inner);
          if (items.length <= 3) {
            return truncateMiddle(value, 90);
          }
          const previewItems = items.slice(0, 3).map((item) => truncateMiddle(item, 24));
          return `[${previewItems.join(", ")}, ... (${items.length})]`;
        }

        if (looksObject) {
          const inner = value.slice(1, -1).trim();
          const entries = inner ? splitTopLevel(inner) : [];
          if (entries.length <= 2) {
            return truncateMiddle(value, 90);
          }
          const previewEntries = entries.slice(0, 2).map((entry) => truncateMiddle(entry, 30));
          return `{${previewEntries.join(", ")}, ... (${entries.length})}`;
        }

        return truncateMiddle(value, 90);
      };

      const full = decodedArgs.map((arg) => `${arg.name}=${arg.value}`).join(", ");
      const preview = decodedArgs
        .map((arg) => `${arg.name}=${compactStructuredValue(String(arg.value))}`)
        .join(", ");
      return {
        preview: truncateMiddle(preview, 220),
        full: full !== preview ? full : undefined,
      };
    };

    const decodedRowsById = new Map<number, any>();
    decodedTrace?.rows?.forEach((row: any) => {
      decodedRowsById.set(row.id, row);
    });

    const snapshotOpcodeEntries = snapshots.filter((snapshot: any) => {
      if (!snapshot) return false;
      if (snapshot.type === "opcode") return true;
      const detail = snapshot.detail ?? snapshot.Detail ?? snapshot;
      return detail?.Opcode !== undefined || detail?.opcode !== undefined;
    });
    const snapshotOpcodeCount = snapshotOpcodeEntries.length;
    const decodedHasOpcodeRows = decodedTrace?.rows?.some(
      (row: any) =>
        typeof row?.id === "number" &&
        row.id >= 0 &&
        (row.name || row.pc !== undefined)
    );

    const shouldUseSnapshotRows =
      snapshotOpcodeCount > 0 && !decodedHasOpcodeRows;

    const shouldUseOpcodeTrace =
      !shouldUseSnapshotRows &&
      opcodeTrace.length > 0 &&
      !decodedHasOpcodeRows;

    if (decodedTrace && decodedTrace.rows.length && !shouldUseSnapshotRows && !shouldUseOpcodeTrace) {
      const transformedRows = decodedTrace.rows.map((r: any, _index: number) => {
        const storageSlot =
          (r.storage_read && r.storage_read.slot) ||
          (r.storage_write && r.storage_write.slot) ||
          (r as any).storage_diff?.slot;
        const storageBefore =
          (r.storage_write && r.storage_write.before) ||
          (r.storage_read && r.storage_read.value) ||
          (r as any).storage_diff?.before;
        const storageAfter =
          (r.storage_write && r.storage_write.after) ||
          (r.storage_read && r.storage_read.value) ||
          (r as any).storage_diff?.after;
        const jumpArgsInfo = formatJumpArgs(r.jumpArgsDecoded);
        const decodedLogString =
          r.decodedLog && r.decodedLog.args
            ? `${r.decodedLog.name}(${r.decodedLog.args
                .map((a: any) => `${a.name}=${a.value}`)
                .join(", ")})`
            : null;
        const contractName = r.contract || undefined;
        const stackValues = Array.isArray((r as any).stack) ? (r as any).stack : undefined;
        const stackDepth =
          stackValues?.length ?? (r as any).stackDepth ?? undefined;
        const stackTop =
          stackValues && stackValues.length > 0
            ? stackValues[stackValues.length - 1]
            : (r as any).stackTop ?? undefined;

        const traceRow: TraceRow = {
          id: `opcode-${r.id}`,
          snapshotId: typeof r.id === "number" ? r.id : undefined,
          stepNumber: typeof r.id === "number" ? r.id : undefined,
          type: "opcode",
          label: r.name,
          opcodeName: r.name,
          opcodeValue: undefined,
          pc: r.pc,
          stackDepth,
          stackTop,
          calldata: decodedLogString || undefined,
          from: r.entryMeta?.caller || undefined,
          to: r.entryMeta?.target || undefined,
          functionName: r.fn || undefined,
          callType: undefined,
          depth: r.depth,
          visualDepth: r.visualDepth,
          isInternalCall: r.isInternalCall,
          isInternalReturn: r.isInternalReturn,
          isLeafCall: r.isLeafCall,
          hasChildren: r.hasChildren,
          childEndId: r.childEndId,
          isError: false,
          gasUsed: r.gasDelta || r.gasUsed,
          gasCum: r.gasCum,
          gasDelta: r.gasDelta || r.gasUsed,
          gasRemaining: typeof r.gasRemaining === 'number' || typeof r.gasRemaining === 'string'
            ? String(r.gasRemaining)
            : undefined,
          input: typeof r.input === "string" ? r.input : undefined,
          output: typeof r.output === "string" ? r.output : undefined,
          returnData:
            typeof r.returnData === "string"
              ? r.returnData
              : typeof r.output === "string"
                ? r.output
                : undefined,
          line: r.line,
          sourceFile: r.sourceFile || null,
          storageSlot,
          storageBefore: storageBefore ?? undefined,
          storageAfter: storageAfter ?? undefined,
          jumpDestFn: r.destFn || undefined,
          jumpArgsDecoded: jumpArgsInfo.preview,
          jumpArgsDecodedFull: jumpArgsInfo.full,
          jumpResult:
            r.jumpResult !== undefined && r.jumpResult !== null
              ? String(r.jumpResult)
              : undefined,
          entry: !!(r as any).entryJumpdest,
          entryMeta: r.entryMeta,
          decodedLog: r.decodedLog || null,
          contractName: contractName,
          frameKey: r.frame_id ? JSON.stringify(r.frame_id) : undefined,
          parentId: r.internalParentId !== undefined ? `opcode-${r.internalParentId}` : undefined,
          internalParentId: r.internalParentId,
          hasNoSourceMaps: r.hasNoSourceMaps ?? (r as any).isUnverifiedContract,
        };
        return traceRow;
      });
      return transformedRows;
    }

    const rows: TraceRow[] = [];

    const storageDiffsBySlot = new Map<string, { before: string; after: string }>();
    storageDiffs.forEach((diff: any) => {
      const slot = (diff.slot || diff.key)?.toLowerCase();
      if (slot) {
        storageDiffsBySlot.set(slot, {
          before: diff.before || '0x0',
          after: diff.after || diff.value || '0x0',
        });
      }
    });

    if (callSummaryRow) {
      rows.push(callSummaryRow);
    }

    const buildSnapshotRow = (
      snapshot: any,
      index: number,
      opcodeDetail: any,
      frameKey: string | undefined,
      callCtx: SimulationCallNode | null | undefined,
      decodedRow: any,
    ): TraceRow | null => {
      if (opcodeDetail) {
        const stackValues = Array.isArray(opcodeDetail.stack)
          ? opcodeDetail.stack
          : [];
        const storageRead = opcodeDetail.storage_read || opcodeDetail.storageRead || null;

        const opcodeName = getOpcodeName(opcodeDetail.opcode);
        let storageSlot: string | undefined;
        let storageAfter: string | undefined;
        let storageBefore: string | undefined;

        if (opcodeName === "SSTORE" && stackValues.length >= 2) {
          storageSlot = stackValues[stackValues.length - 1];
          storageAfter = stackValues[stackValues.length - 2];
          const slotKey = storageSlot?.toLowerCase();
          const storageDiff = slotKey ? storageDiffsBySlot.get(slotKey) : undefined;
          storageBefore = storageDiff?.before;
        } else if (opcodeName === "SLOAD" && stackValues.length >= 1) {
          storageSlot = stackValues[stackValues.length - 1];
          storageAfter = storageRead?.value;
        } else {
          const storageWrite = opcodeDetail.storage_write || opcodeDetail.storageWrite || null;
          storageSlot = storageRead?.slot ?? storageWrite?.slot;
          storageAfter = storageWrite?.value ?? storageRead?.value;
        }

        const jumpArgsInfo = formatJumpArgs(decodedRow?.jumpArgsDecoded);

        const snapshotId = typeof snapshot?.id === "number" ? snapshot.id : index;
        return {
          id: `opcode-${snapshotId}`,
          snapshotId,
          stepNumber: snapshotId,
          type: "opcode",
          label: opcodeName,
          opcodeName: opcodeName,
          opcodeValue: opcodeDetail.opcode,
          pc: opcodeDetail.pc,
          stackDepth: stackValues.length,
          stackTop: stackValues.length
            ? stackValues[stackValues.length - 1]
            : null,
          calldata: opcodeDetail.calldata ?? null,
          from: callCtx?.from,
          to: callCtx?.to,
          functionName: callCtx?.functionName || callCtx?.label || decodedRow?.fn || undefined,
          callType: callCtx?.type,
          depth: decodedRow?.depth ?? callCtx?.depth,
          visualDepth: decodedRow?.visualDepth,
          isInternalCall: decodedRow?.isInternalCall,
          isInternalReturn: decodedRow?.isInternalReturn,
          isLeafCall: decodedRow?.isLeafCall,
          hasChildren: decodedRow?.hasChildren,
          childEndId: decodedRow?.childEndId,
          internalParentId: decodedRow?.internalParentId,
          isError: !!callCtx?.error,
          gasUsed: (opcodeDetail.gas_used ?? opcodeDetail.gasUsed ?? opcodeDetail.gas_cost ?? opcodeDetail.gasCost)?.toString() ?? undefined,
          gasRemaining: opcodeDetail.gas_remaining ?? opcodeDetail.gasRemaining ?? undefined,
          storageSlot,
          storageBefore,
          storageAfter,
          frameKey,
          line: decodedRow?.line,
          sourceFile: decodedRow?.sourceFile || null,
          jumpDestFn: decodedRow?.destFn || decodedRow?.jumpDestFn,
          jumpArgsDecoded: jumpArgsInfo.preview,
          jumpArgsDecodedFull: jumpArgsInfo.full,
          jumpResult:
            decodedRow?.jumpResult !== undefined && decodedRow?.jumpResult !== null
              ? String(decodedRow.jumpResult)
              : undefined,
          entry: !!decodedRow?.entryJumpdest,
          entryMeta: decodedRow?.entryMeta,
          decodedLog: decodedRow?.decodedLog || null,
          contractName: decodedRow?.contract || undefined,
        };
      }

      if (typeof snapshot.opcode !== "number") return null;
      const opcodeName = getOpcodeName(snapshot.opcode);
      const storageRead = snapshot.storageRead ?? snapshot.storage_read ?? null;
      const storageWrite = snapshot.storageWrite ?? snapshot.storage_write ?? null;
      let storageSlot: string | undefined;
      let storageAfter: string | undefined;
      let storageBefore: string | undefined;

      if (storageWrite?.slot) {
        storageSlot = storageWrite.slot;
      } else if (storageRead?.slot) {
        storageSlot = storageRead.slot;
      }

      const slotKey = storageSlot?.toLowerCase();
      const storageDiff = slotKey ? storageDiffsBySlot.get(slotKey) : undefined;
      if (storageDiff) {
        storageBefore = storageDiff.before;
        storageAfter = storageDiff.after;
      } else if (storageWrite) {
        storageBefore = storageWrite.before;
        storageAfter = storageWrite.after;
      } else if (storageRead) {
        storageAfter = storageRead.value;
      }

      const jumpArgsInfo = formatJumpArgs(decodedRow?.jumpArgsDecoded);

      const snapshotId = typeof snapshot?.id === "number" ? snapshot.id : index;
      return {
        id: `opcode-${snapshotId}`,
        snapshotId,
        stepNumber: snapshotId,
        type: "opcode",
        label: opcodeName,
        opcodeName: opcodeName,
        opcodeValue: snapshot.opcode,
        pc: snapshot.pc,
        stackDepth: snapshot.stackDepth ?? 0,
        stackTop: snapshot.stackTop ?? null,
        calldata: snapshot.calldata ?? null,
        from: callCtx?.from,
        to: callCtx?.to ?? snapshot.targetAddress,
        functionName: callCtx?.functionName || callCtx?.label || decodedRow?.fn || undefined,
        callType: callCtx?.type,
        depth: decodedRow?.depth ?? callCtx?.depth,
        visualDepth: decodedRow?.visualDepth,
        isInternalCall: decodedRow?.isInternalCall,
        isInternalReturn: decodedRow?.isInternalReturn,
        isLeafCall: decodedRow?.isLeafCall,
        hasChildren: decodedRow?.hasChildren,
        childEndId: decodedRow?.childEndId,
        internalParentId: decodedRow?.internalParentId,
        isError: !!callCtx?.error,
        gasUsed: snapshot.gasCost !== undefined && snapshot.gasCost !== null
          ? String(snapshot.gasCost)
          : undefined,
        gasRemaining: snapshot.gasRemaining !== undefined && snapshot.gasRemaining !== null
          ? String(snapshot.gasRemaining)
          : undefined,
        storageSlot,
        storageBefore,
        storageAfter,
        frameKey,
        line: decodedRow?.line,
        sourceFile: decodedRow?.sourceFile || null,
        jumpDestFn: decodedRow?.destFn || decodedRow?.jumpDestFn,
        jumpArgsDecoded: jumpArgsInfo.preview,
        jumpArgsDecodedFull: jumpArgsInfo.full,
        jumpResult:
          decodedRow?.jumpResult !== undefined && decodedRow?.jumpResult !== null
            ? String(decodedRow.jumpResult)
            : undefined,
        entry: !!decodedRow?.entryJumpdest,
        entryMeta: decodedRow?.entryMeta,
        decodedLog: decodedRow?.decodedLog || null,
        contractName: decodedRow?.contract || undefined,
      };
    };

    if (shouldUseSnapshotRows) {
      snapshotOpcodeEntries.forEach((snapshot: any, index: number) => {
        const detail = snapshot.detail ?? snapshot.Detail ?? snapshot;
        const opcodeDetail = detail?.Opcode ?? detail?.opcode;
        const frameKey = snapshotFrameKey(snapshot.frameId || snapshot.frame_id);
        const callCtx = frameKey ? callFrameMap.get(frameKey) : null;
        const decodedRow = decodedRowsById.get(snapshot.id ?? index);

        const row = buildSnapshotRow(snapshot, index, opcodeDetail, frameKey, callCtx, decodedRow);
        if (row) rows.push(row);
      });
    } else if (shouldUseOpcodeTrace) {
      opcodeTrace.forEach((entry: any, index: number) => {
        const frameKey = snapshotFrameKey(entry.frame_id || entry.frameId);
        const callCtx = frameKey ? callFrameMap.get(frameKey) : null;
        const opcodeName = getOpcodeName(entry.opcode);
        const decodedRow = decodedRowsById.get(entry.id ?? index);

        const storageRead = entry.storage_read || entry.storageRead || null;
        const storageWrite = entry.storage_write || entry.storageWrite || null;

        let storageSlot: string | undefined;
        let storageAfter: string | undefined;
        let storageBefore: string | undefined;

        if (storageWrite) {
          storageSlot = storageWrite.slot;
          storageBefore = storageWrite.before;
          storageAfter = storageWrite.after;
        } else if (storageRead) {
          storageSlot = storageRead.slot;
          storageAfter = storageRead.value;
        }

        const jumpArgsInfo = formatJumpArgs(decodedRow?.jumpArgsDecoded);

        const snapshotId = typeof entry?.id === "number" ? entry.id : index;
        rows.push({
          id: `opcode-${snapshotId}`,
          snapshotId,
          stepNumber: snapshotId,
          type: "opcode",
          label: opcodeName,
          opcodeName: opcodeName,
          opcodeValue: entry.opcode,
          pc: entry.pc,
          stackDepth: entry.stack_depth ?? entry.stackDepth ?? 0,
          stackTop: entry.stack_top ?? entry.stackTop ?? null,
          calldata: null,
          from: callCtx?.from,
          to: callCtx?.to ?? entry.target_address ?? entry.targetAddress,
          functionName: callCtx?.functionName || callCtx?.label || decodedRow?.fn || undefined,
          callType: callCtx?.type,
          depth: decodedRow?.depth ?? callCtx?.depth,
          visualDepth: decodedRow?.visualDepth,
          isInternalCall: decodedRow?.isInternalCall,
          isInternalReturn: decodedRow?.isInternalReturn,
          isLeafCall: decodedRow?.isLeafCall,
          hasChildren: decodedRow?.hasChildren,
          childEndId: decodedRow?.childEndId,
          internalParentId: decodedRow?.internalParentId,
          isError: !!callCtx?.error,
          gasUsed: (entry.gas_used ?? entry.gasUsed)?.toString() ?? undefined,
          storageSlot,
          storageBefore,
          storageAfter,
          frameKey,
          line: decodedRow?.line,
          sourceFile: decodedRow?.sourceFile || null,
          jumpDestFn: decodedRow?.destFn || decodedRow?.jumpDestFn,
          jumpArgsDecoded: jumpArgsInfo.preview,
          jumpArgsDecodedFull: jumpArgsInfo.full,
          jumpResult:
            decodedRow?.jumpResult !== undefined && decodedRow?.jumpResult !== null
              ? String(decodedRow.jumpResult)
              : undefined,
          entry: !!decodedRow?.entryJumpdest,
          entryMeta: decodedRow?.entryMeta,
          decodedLog: decodedRow?.decodedLog || null,
          contractName: decodedRow?.contract || undefined,
        });
      });
    }

    events.forEach((event: any, index: number) => {
      rows.push({
        id: `event-${index}`,
        type: "event",
        label: "Event",
        eventName: event.name || "Event",
        from: event.address,
        calldata: event.signature ?? undefined,
      });
    });

    storageDiffs.forEach((diff: any, index: number) => {
      rows.push({
        id: `storage-${index}`,
        type: "storage",
        label: "Storage",
        storageSlot: diff.slot || diff.key,
        storageBefore: diff.before ?? null,
        storageAfter: diff.after ?? diff.value ?? null,
      });
    });

    return rows;
  }, [callSummaryRow, snapshots, opcodeTrace, callFrameMap, events, storageDiffs, decodedTrace]);
}
