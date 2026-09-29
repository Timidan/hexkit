import type { DebugSnapshot } from '../../types/debug';

export interface TraceRowScoreInput {
  frame_id?: Array<string | number>;
  pc?: number;
  name?: string;
  stackTop?: string | null;
  stackDepth?: number;
  storage_read?: { slot?: string; value?: string } | null;
  storage_write?: { slot?: string; after?: string } | null;
}

function normalizeTraceFrameId(
  frameId?: Array<string | number> | null
): string | null {
  if (!Array.isArray(frameId) || frameId.length === 0) return null;
  return frameId.map((part) => String(part)).join('-');
}

export function getTraceRowStorageAccess(
  row: Pick<TraceRowScoreInput, 'storage_read' | 'storage_write'> | null
): { type: 'read' | 'write'; slot: string; value?: string } | null {
  if (row?.storage_read?.slot) {
    return {
      type: 'read',
      slot: row.storage_read.slot.toLowerCase(),
      value: row.storage_read.value,
    };
  }
  if (row?.storage_write?.slot) {
    return {
      type: 'write',
      slot: row.storage_write.slot.toLowerCase(),
      value: row.storage_write.after,
    };
  }
  return null;
}

export function scoreOpcodeSnapshotCandidate(
  traceRow: TraceRowScoreInput,
  snapshot: DebugSnapshot
): number {
  let score = 0;
  const opcodeDetail =
    snapshot.type === 'opcode'
      ? (snapshot.detail as {
          pc?: number;
          opcodeName?: string;
          stack?: string[];
          storageAccess?: {
            type: 'read' | 'write';
            slot: string;
            value?: string;
          };
        })
      : null;

  const traceFrameId = normalizeTraceFrameId(traceRow.frame_id);
  if (traceFrameId && snapshot.frameId === traceFrameId) score += 100;
  if (opcodeDetail?.pc === traceRow.pc) score += 50;
  if (
    traceRow.name &&
    opcodeDetail?.opcodeName?.toUpperCase() === traceRow.name.toUpperCase()
  ) {
    score += 25;
  }

  const traceStorageAccess = getTraceRowStorageAccess(traceRow);
  const snapshotStorageAccess = opcodeDetail?.storageAccess ?? null;
  if (
    traceStorageAccess &&
    snapshotStorageAccess &&
    snapshotStorageAccess.type === traceStorageAccess.type &&
    snapshotStorageAccess.slot.toLowerCase() === traceStorageAccess.slot
  ) {
    score += 40;
    if (
      traceStorageAccess.value &&
      snapshotStorageAccess.value &&
      snapshotStorageAccess.value.toLowerCase() ===
        traceStorageAccess.value.toLowerCase()
    ) {
      score += 15;
    }
  }

  const stack = Array.isArray(opcodeDetail?.stack) ? opcodeDetail.stack : [];
  const stackTop = stack.length > 0 ? stack[stack.length - 1] : null;
  if (
    traceRow.stackTop &&
    stackTop &&
    stackTop.toLowerCase() === traceRow.stackTop.toLowerCase()
  ) {
    score += 10;
  }
  if (
    typeof traceRow.stackDepth === 'number' &&
    stack.length === traceRow.stackDepth
  ) {
    score += 5;
  }

  return score;
}
