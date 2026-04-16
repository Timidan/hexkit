/**
 * Pure helper functions for the simulation results page state. */

import type { SimulationCallNode } from "../../utils/simulationArtifacts";
import type { TraceRow } from "./types";

// ---- Internal info row type for history loading -----------------------

export type InternalInfoRow = {
  jumpMarker?: boolean;
  destFn?: string | null;
  isInternalCall?: boolean;
  hasChildren?: boolean;
};

/** Check whether decoded trace rows contain internal call hierarchy info */
export const hasInternalInfo = (rows?: InternalInfoRow[]): boolean =>
  Array.isArray(rows) &&
  rows.some(
    (row) =>
      row?.jumpMarker ||
      row?.destFn ||
      row?.isInternalCall ||
      row?.hasChildren
  );

// ---- Context / result extras ------------------------------------------

export type ContractContextExtras = {
  debugEnabled?: boolean;
  networkId?: number;
  networkName?: string;
  blockOverride?: string | number;
  fromAddress?: string;
  address?: string;
  calldata?: string;
  ethValue?: string;
};

export type SimulationResultExtras = {
  simulationId?: string;
  transactionHash?: string;
  debugEnabled?: boolean;
  chainId?: number;
  networkName?: string;
  forkBlockTag?: string | number;
  rawTrace?: { snapshots?: unknown[] };
  blockNumber?: string | number;
  gasLimit?: string | number;
  gas?: string | number;
};

// ---- Address-to-name map builder --------------------------------------

export function buildAddressToNameMap(
  traceRows: TraceRow[],
  contractContext: any,
): Map<string, string> {
  const isHexAddress = (value: string): boolean =>
    /^0x[a-fA-F0-9]{40}$/.test(value);
  const map = new Map<string, string>();

  traceRows.forEach((row) => {
    const contractName = (row as any).contractName;
    const entryMeta = (row as any).entryMeta;
    const targetContractName =
      typeof entryMeta?.targetContractName === "string"
        ? entryMeta.targetContractName.trim()
        : "";
    const labelCandidate = targetContractName || contractName || "";

    if (
      labelCandidate &&
      labelCandidate !== "0x0" &&
      !isHexAddress(labelCandidate) &&
      !labelCandidate.toLowerCase().startsWith("unknown")
    ) {
      if (entryMeta?.target && isHexAddress(entryMeta.target)) {
        const addr = entryMeta.target.toLowerCase();
        if (!map.has(addr)) map.set(addr, labelCandidate);
      }
      if (
        row.to &&
        isHexAddress(row.to) &&
        entryMeta?.target &&
        row.to.toLowerCase() === entryMeta.target.toLowerCase()
      ) {
        const addr = row.to.toLowerCase();
        if (!map.has(addr)) map.set(addr, labelCandidate);
      }
    }
    if (entryMeta?.callerName && entryMeta?.caller) {
      const addr = entryMeta.caller.toLowerCase();
      if (!map.has(addr) && isHexAddress(entryMeta.caller))
        map.set(addr, entryMeta.callerName);
    }
  });

  if (
    contractContext?.address &&
    contractContext?.name &&
    isHexAddress(contractContext.address) &&
    !isHexAddress(contractContext.name) &&
    !contractContext.name.toLowerCase().startsWith("unknown")
  ) {
    const addr = contractContext.address.toLowerCase();
    if (!map.has(addr)) map.set(addr, contractContext.name);
  }

  return map;
}

// ---- Revert info builder ----------------------------------------------

export interface RevertInfo {
  message: string;
  sourceLineContent: string | null;
  fileName: string | null;
  lineNumber: number | null;
  contractName: string | null;
  callStack: Array<{ fn: string; file: string; line: number }>;
}

export function buildRevertInfo(
  result: any,
  decodedTrace: any,
): RevertInfo | null {
  const errorMsg = result?.error || result?.revertReason || null;
  if (!errorMsg || !decodedTrace?.rows) return null;

  const revertRow = decodedTrace.rows.find((r: any) => r.name === "REVERT");

  let sourceLineContent: string | null = null;
  let foundFileName: string | null = null;
  let foundLineNumber: number | null = null;
  let foundContractName: string | null = null;

  if (decodedTrace.sourceTexts && errorMsg) {
    for (const [filePath, sourceText] of Object.entries(
      decodedTrace.sourceTexts,
    )) {
      if (typeof sourceText !== "string") continue;
      const lines = sourceText.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (
          line.includes(errorMsg) &&
          (line.includes("require") || line.includes("revert"))
        ) {
          sourceLineContent = line.trim();
          foundFileName = filePath.split("/").pop() || filePath;
          foundLineNumber = i + 1;
          foundContractName = foundFileName.replace(".sol", "");
          break;
        }
      }
      if (sourceLineContent) break;
    }
  }

  if (
    !sourceLineContent &&
    revertRow?.line &&
    revertRow?.sourceFile &&
    decodedTrace.sourceTexts
  ) {
    const sourceText = decodedTrace.sourceTexts[revertRow.sourceFile];
    if (sourceText && typeof sourceText === "string") {
      const lines = sourceText.split("\n");
      const lineIdx = revertRow.line - 1;
      if (lineIdx >= 0 && lineIdx < lines.length) {
        sourceLineContent = lines[lineIdx].trim();
        foundFileName =
          revertRow.sourceFile.split("/").pop() || revertRow.sourceFile;
        foundLineNumber = revertRow.line;
        foundContractName =
          revertRow.contract || revertRow.fn?.split(".")[0] || null;
      }
    }
  }

  const callStack: Array<{ fn: string; file: string; line: number }> = [];
  for (const row of decodedTrace.rows as any[]) {
    if (row.entryMeta?.function) {
      const entryFile = row.sourceFile?.split("/").pop() || "";
      callStack.push({
        fn: `${row.entryMeta.contract || row.contract || ""}.${row.entryMeta.function}()`,
        file: entryFile,
        line: row.line || 0,
      });
    }
    if (row.name === "REVERT") break;
  }

  return {
    message: errorMsg,
    sourceLineContent,
    fileName: foundFileName,
    lineNumber: foundLineNumber,
    contractName: foundContractName,
    callStack: callStack.slice(-5),
  };
}

// ---- Trace diagnostics builder ----------------------------------------

export interface TraceDiagnostics {
  hasRawTrace: boolean;
  rowsCount: number;
  hasSnapshots: boolean;
  hasSourceLines: boolean;
  hasSourceMaps: boolean;
  hasAbi: boolean;
  isDecoding: boolean;
  artifactWarning: string | null;
}

export function buildTraceDiagnostics(
  decodedTrace: any,
  enrichedTraceRowCount: number,
  result: any,
  isTraceDecoding: boolean,
  snapshotOpcodeCount: number,
  opcodeTraceLength: number,
): TraceDiagnostics {
  const hasSourceLines =
    decodedTrace?.sourceLines && decodedTrace.sourceLines.length > 0;
  const hasSourceMaps =
    decodedTrace?.rows?.some((r: any) => typeof r.line === "number") || false;
  const hasAbi =
    decodedTrace?.rows?.some((r: any) => r.decodedLog?.source === "abi") ||
    false;
  const hasTraceRows = !!(decodedTrace?.rows && decodedTrace.rows.length > 0);
  const hasSnapshotRows = snapshotOpcodeCount > 0 || opcodeTraceLength > 0;

  return {
    hasRawTrace: !!result?.rawTrace || hasTraceRows || hasSnapshotRows,
    rowsCount: enrichedTraceRowCount,
    hasSnapshots: hasTraceRows || hasSnapshotRows,
    hasSourceLines: !!hasSourceLines,
    hasSourceMaps,
    hasAbi,
    isDecoding: isTraceDecoding,
    artifactWarning:
      !hasSourceMaps && !hasSourceLines
        ? "No source maps found in this trace, so line-by-line source debugging is not supported."
        : null,
  };
}

// ---- Enriched trace row builder ---------------------------------------

export function buildEnrichedTraceRows(traceRows: TraceRow[]): TraceRow[] {
  const parseSnapshotIdFromRowId = (rowId: string): number | null => {
    if (!rowId) return null;
    const match = rowId.match(/^(?:opcode-|snapshot-)?(\d+)$/);
    if (!match) return null;
    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return traceRows.map((row) => {
    const resolvedSnapshotId =
      typeof row.snapshotId === "number"
        ? row.snapshotId
        : typeof row.stepNumber === "number"
          ? row.stepNumber
          : parseSnapshotIdFromRowId(row.id) ?? undefined;

    return {
      ...row,
      snapshotId: resolvedSnapshotId,
      stepNumber:
        typeof row.stepNumber === "number"
          ? row.stepNumber
          : resolvedSnapshotId,
      input: row.input ?? row.calldata ?? undefined,
      output: row.output ?? row.stackTop ?? undefined,
      returnData: row.returnData ?? row.stackTop ?? undefined,
      jumpDestFn: (row as any).destFn || row.jumpDestFn,
    };
  });
}

// ---- Call summary row builder -----------------------------------------

export function buildCallSummaryRow(
  callTree: SimulationCallNode[],
  resultData: string | undefined,
  rawReturnData: string | null | undefined,
): TraceRow | null {
  if (!callTree || callTree.length === 0) return null;
  const root = callTree[0];
  const inputData = root.input || resultData || "0x";
  const outputData = root.output || rawReturnData || null;
  return {
    id: root.frameKey ? `call-${root.frameKey}` : "call-root",
    type: "call" as const,
    label: "Call",
    from: root.from,
    to: root.to,
    functionName: root.functionName || root.label || undefined,
    callType: root.type,
    depth: root.depth ?? 0,
    isError: !!root.error,
    frameKey: root.frameKey,
    input: inputData,
    returnData: outputData,
    gasUsed: root.gasUsed?.toString() ?? undefined,
  };
}
