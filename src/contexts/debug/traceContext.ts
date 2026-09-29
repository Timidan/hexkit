import type { DecodedTraceRow } from '../../utils/traceDecoder';

export interface TraceDebugContext {
  executingAddress: string | null;
  sourceFile: string | null;
  sourceLine: number | null;
  evalHint: {
    filePath: string | null;
    line: number | null;
    functionName: string | null;
  };
}

const emptyTraceDebugContext = (): TraceDebugContext => ({
  executingAddress: null,
  sourceFile: null,
  sourceLine: null,
  evalHint: { filePath: null, line: null, functionName: null },
});

/** Derive all source/evaluation state associated with one trace selection. */
export function deriveTraceDebugContext(
  rows: readonly DecodedTraceRow[],
  snapshotId: number | null
): TraceDebugContext {
  if (snapshotId === null) return emptyTraceDebugContext();

  const row = rows.find((candidate) => candidate.id === snapshotId);
  if (!row) return emptyTraceDebugContext();

  const executingAddress =
    row.entryMeta?.codeAddress?.toLowerCase() ??
    row.entryMeta?.target?.toLowerCase() ??
    null;

  if (row.isInternalCall) {
    const sourceFile =
      row.srcSourceFile ?? row.sourceFile ?? row.destSourceFile ?? null;
    const sourceLine = row.srcLine ?? row.line ?? row.destLine ?? null;
    return {
      executingAddress,
      sourceFile,
      sourceLine,
      evalHint: {
        filePath: sourceFile,
        line: sourceLine,
        functionName: row.fn ?? null,
      },
    };
  }

  const parent =
    row.internalParentId === undefined || row.internalParentId === null
      ? null
      : rows.find((candidate) => candidate.id === row.internalParentId) ?? null;
  const sourceFile = row.sourceFile ?? null;
  const sourceLine = row.line ?? null;

  if (parent) {
    return {
      executingAddress,
      sourceFile,
      sourceLine,
      evalHint: {
        filePath:
          parent.srcSourceFile ??
          parent.sourceFile ??
          parent.destSourceFile ??
          null,
        line: parent.srcLine ?? parent.line ?? parent.destLine ?? null,
        functionName: parent.fn ?? null,
      },
    };
  }

  return {
    executingAddress,
    sourceFile,
    sourceLine,
    evalHint: {
      filePath: sourceFile,
      line: sourceLine,
      functionName: row.fn ?? null,
    },
  };
}
