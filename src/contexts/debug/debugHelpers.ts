/**
 * Debug Context Helper Functions
 *
 * Core utility functions for the debug context: logging, ID generation,
 * error handling, snapshot resolution, and source mapping.
 *
 * Solidity struct layout analysis lives in ./solidityStructLayout.ts.
 * Storage-based struct decoding lives in ./structStorageDecoding.ts.
 * This module re-exports everything for backward compatibility.
 */

import type {
  DebugSnapshot,
  SnapshotListItem,
  SourceFile,
  DebugCallFrame,
  HookSnapshotDetail,
  EvalResult,
} from '../../types/debug';
import type { DecodedTraceRow } from '../../utils/traceDecoder';

// ── Re-exports from extracted modules ──────────────────────────────────

export type {
  StructFieldDef,
  StructFieldLayout,
} from './solidityStructLayout';

export {
  stripSolidityComments,
  extractBraceBlock,
  extractParenBlock,
  splitParams,
  findVariableTypeInFunction,
  parseTypeSpec,
  getBaseTypeSize,
  findStructFields,
  buildStructLayout,
  toBigIntValue,
  formatHex,
  decodeScalarValue,
  decodeFieldFromSlot,
  parseStorageRead,
  parseStorageWrite,
} from './solidityStructLayout';

export {
  getSourceLineText,
  deriveStructValueFromTrace,
  computeDynamicArrayDataSlot,
  fillUnreadFieldsFromStorage,
  matchesSourceLocation,
  findNearestHookSnapshotIdBySource,
  findNearestHookSnapshotIdByFunction,
} from './structStorageDecoding';

// ── Gated debug logger ─────────────────────────────────────────────────

const EDB_DEBUG_LOGS = import.meta.env.DEV && typeof localStorage !== 'undefined' && localStorage.getItem('edb:debugLogs') === '1';
export const debugLog = (...args: unknown[]) => { if (EDB_DEBUG_LOGS) console.log(...args); };

// ── Core utilities ─────────────────────────────────────────────────────

/** Generate a cryptographically secure unique ID */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Check if an error indicates the session is no longer valid */
export function isSessionNotFoundError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('session not found') ||
           msg.includes('session does not exist') ||
           msg.includes('invalid session');
  }
  return false;
}

// ── Eval error types ───────────────────────────────────────────────────

export type DebugEvalErrorKind =
  | 'variable_not_visible'
  | 'opcode_only_snapshot'
  | 'debug_not_enabled'
  | 'debug_prep_in_progress'
  | 'session_expired'
  | 'session_not_ready'
  | 'no_active_session'
  | 'generic_eval_error';

export interface DebugEvalError {
  kind: DebugEvalErrorKind;
  message: string;
  variableName?: string;
  snapshotId?: number;
  prepStage?: string;
}

export function createEvalError(
  kind: DebugEvalErrorKind,
  details?: {
    variableName?: string;
    snapshotId?: number;
    prepStage?: string;
    rawError?: string;
  },
): DebugEvalError {
  const messages: Record<DebugEvalErrorKind, string> = {
    variable_not_visible: `Variable '${details?.variableName || '?'}' is not visible at this execution point (step ${details?.snapshotId ?? '?'}). Try stepping to a point where this variable is in scope.`,
    opcode_only_snapshot:
      'Expression evaluation requires source-level debugging. The current snapshot is an opcode-only snapshot with no associated hook data. Step to a different execution point or re-run with verified source code.',
    debug_not_enabled:
      'Expression evaluation is only available when Debug mode is enabled during simulation. Re-simulate with Debug enabled to use this feature.',
    debug_prep_in_progress: `Debug session not ready. Debug preparation is still in progress${details?.prepStage ? ` (stage: ${details.prepStage})` : ''}. Please wait for preparation to complete.`,
    session_expired:
      'Debug session expired. Please re-run the simulation to debug again.',
    session_not_ready:
      'Live debug session is still initializing. Retry in a moment.',
    no_active_session: 'No active debug session.',
    generic_eval_error: details?.rawError || 'Evaluation failed.',
  };

  return {
    kind,
    message: messages[kind],
    variableName: details?.variableName,
    snapshotId: details?.snapshotId,
    prepStage: details?.prepStage,
  };
}

// ── Call stack building ────────────────────────────────────────────────

export function buildCallStackFromDecodedRows(
  decodedRows: DecodedTraceRow[] | null,
  currentRowId: number | null
): DebugCallFrame[] {
  if (!decodedRows || decodedRows.length === 0 || currentRowId === null) return [];

  const rowById = new Map<number, DecodedTraceRow>();
  for (const row of decodedRows) {
    rowById.set(row.id, row);
  }

  const currentRow = rowById.get(currentRowId);
  if (!currentRow) return [];

  const ancestry: DecodedTraceRow[] = [];
  const visited = new Set<number>();

  let row: DecodedTraceRow | undefined = currentRow;
  while (row && !visited.has(row.id)) {
    visited.add(row.id);
    ancestry.push(row);

    if (row.internalParentId != null) {
      row = rowById.get(row.internalParentId);
      continue;
    }

    if (row.externalParentTraceId != null) {
      row = decodedRows.find(r =>
        r.traceId === row!.externalParentTraceId && r.entryMeta
      );
      continue;
    }

    break;
  }

  return ancestry.reverse().map((r, idx) => ({
    traceId: r.traceId ?? r.id,
    rowId: r.id,
    depth: r.visualDepth ?? r.depth ?? 0,
    address: r.entryMeta?.target || r.entryMeta?.codeAddress || '',
    contractName: r.contract || r.entryMeta?.targetContractName || r.entryMeta?.codeContractName || undefined,
    functionName: r.fn || r.entryMeta?.function || undefined,
    sourcePath: r.sourceFile || r.srcSourceFile || r.destSourceFile || undefined,
    line: r.line ?? r.srcLine ?? r.destLine ?? undefined,
    isCurrentFrame: idx === ancestry.length - 1,
  }));
}

// ── Snapshot depth resolution ──────────────────────────────────────────

export function getSnapshotDepth(
  snapshotList: SnapshotListItem[],
  snapshotId: number,
  trace: { entries?: Array<{ id: number; depth: number }> } | null
): number {
  const snapshot = snapshotList.find(s => s.id === snapshotId);
  if (snapshot?.depth !== undefined) {
    return snapshot.depth;
  }

  if (snapshot?.frameId && trace?.entries) {
    const traceEntryId = parseInt(snapshot.frameId.split('-')[0], 10);
    const entry = trace.entries.find(e => e.id === traceEntryId);
    if (entry) {
      return entry.depth;
    }
  }

  return 0;
}

// ── Source content resolution ──────────────────────────────────────────

export function resolveSourceContent(
  filePath: string,
  sourceFiles: Map<string, SourceFile>
): string | null {
  const direct = sourceFiles.get(filePath);
  if (direct?.content) return direct.content;

  const filename = filePath.split('/').pop();
  if (!filename) {
    debugLog('[resolveSourceContent] No filename from path:', filePath);
    return null;
  }

  for (const [path, file] of sourceFiles.entries()) {
    if (path.endsWith(`/${filename}`) || path === filename || path.endsWith(filename)) {
      return file.content;
    }
  }

  debugLog('[resolveSourceContent] File not found:', filePath, '| Filename:', filename, '| Available keys:', Array.from(sourceFiles.keys()).slice(0, 10));
  return null;
}

export function computeLineColumn(content: string, offset: number): { line: number; column: number } {
  const safeOffset = Math.max(0, Math.min(offset, content.length));
  const prefix = content.slice(0, safeOffset);
  const lines = prefix.split('\n');
  const line = Math.max(1, lines.length);
  const column = (lines[lines.length - 1]?.length ?? 0) + 1;
  return { line, column };
}

export function enhanceHookSnapshot(
  snapshot: DebugSnapshot,
  sourceFiles: Map<string, SourceFile>
): DebugSnapshot {
  if (snapshot.type !== 'hook') return snapshot;

  const detail = snapshot.detail as HookSnapshotDetail;
  if (!detail.filePath || detail.offset == null) {
    return snapshot;
  }

  if (detail.line && detail.column) {
    return snapshot;
  }

  const content = resolveSourceContent(detail.filePath, sourceFiles);
  if (!content) return snapshot;

  const { line, column } = computeLineColumn(content, detail.offset);
  const nextDetail: HookSnapshotDetail = {
    ...detail,
    line: detail.line || line,
    column: detail.column || column,
  };

  return { ...snapshot, detail: nextDetail };
}

// ── Trace ID parsing & matching ────────────────────────────────────────

export function parseTraceEntryId(frameId?: string): number | null {
  if (!frameId) return null;
  const match = frameId.match(/^\s*(\d+)/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
}

export function normalizeTraceAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('0x') || trimmed.length !== 42) return null;
  return trimmed.toLowerCase();
}

export function collectTraceAddresses(entries: Array<Record<string, unknown>>): string[] {
  const addresses = new Set<string>();

  for (const entry of entries) {
    const record = entry as Record<string, unknown>;
    const candidates = [
      record.codeAddress,
      record.code_address,
      record.bytecode_address,
      record.target,
      record.caller,
    ];

    for (const candidate of candidates) {
      const normalized = normalizeTraceAddress(candidate);
      if (normalized) {
        addresses.add(normalized);
      }
    }
  }

  return Array.from(addresses);
}

export function matchesTraceId(
  frameId: string | undefined,
  traceId: number | null
): boolean {
  if (traceId === null) return true;
  const parsed = parseTraceEntryId(frameId);
  return parsed === traceId;
}

// ── Expression / variable helpers ──────────────────────────────────────

export function extractMissingVariableName(error?: string): string | null {
  if (!error) return null;
  const match = error.match(/name=['"]([^'"]+)['"]/);
  return match ? match[1] : null;
}

export function extractSimpleIdentifier(expression: string): string | null {
  const trimmed = expression.trim();
  if (!trimmed) return null;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed) ? trimmed : null;
}

export function isNullishEvalValue(value: EvalResult['value'] | undefined): boolean {
  if (!value) return true;
  if (value.children && value.children.length > 0) return false;
  const normalized = String(value.value ?? '').trim().toLowerCase();
  return normalized === 'null' || normalized === 'undefined' || normalized === '';
}

export function hasUnreadFieldsInValue(value: EvalResult['value'] | undefined): boolean {
  if (!value) return false;
  if (value.value === 'unread') return true;
  if (value.children) {
    return value.children.some(child => hasUnreadFieldsInValue(child));
  }
  return false;
}

// ── Hook snapshot variable lookup ──────────────────────────────────────

export function findVariableValueInHook(
  detail: HookSnapshotDetail,
  name: string
): EvalResult['value'] | null {
  const local = detail.locals.find((v) => v.name === name);
  if (local) {
    return {
      type: local.type,
      value: local.value,
      rawValue: local.rawValue,
      children: local.children,
    };
  }
  const stateVar = detail.stateVariables.find((v) => v.name === name);
  if (stateVar) {
    return {
      type: stateVar.type,
      value: stateVar.value,
      rawValue: stateVar.rawValue,
      children: stateVar.children,
    };
  }
  return null;
}

export function findNearestHookSnapshotId(
  snapshotList: SnapshotListItem[],
  snapshotCache: Map<number, DebugSnapshot>,
  targetId: number,
  traceId: number | null
): number | null {
  let nearest: number | null = null;
  let minDiff = Number.POSITIVE_INFINITY;

  for (const [id, snapshot] of snapshotCache.entries()) {
    if (snapshot.type !== 'hook') continue;
    if (!matchesTraceId(snapshot.frameId, traceId)) continue;
    const diff = Math.abs(id - targetId);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = id;
    }
  }

  for (const snap of snapshotList) {
    if (snap.type !== 'hook') continue;
    if (!matchesTraceId(snap.frameId, traceId)) continue;
    const diff = Math.abs(snap.id - targetId);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = snap.id;
    }
  }

  return nearest;
}

// ── Constants ──────────────────────────────────────────────────────────

export const HOOK_SCAN_MAX_OFFSET = 300;
export const HOOK_SCAN_CHUNK_SIZE = 25;
export const SOURCE_LINE_TOLERANCE = 1;

// ── File / function name matching ──────────────────────────────────────

export function normalizeFilePath(path: string): string {
  return path.replace(/\\/g, '/').trim();
}

export function filePathMatches(candidate: string, target: string): boolean {
  const normalizedCandidate = normalizeFilePath(candidate);
  const normalizedTarget = normalizeFilePath(target);
  if (!normalizedCandidate || !normalizedTarget) return false;
  if (normalizedCandidate === normalizedTarget) return true;
  if (normalizedCandidate.endsWith(`/${normalizedTarget}`)) return true;
  if (normalizedTarget.endsWith(`/${normalizedCandidate}`)) return true;
  const candidateName = normalizedCandidate.split('/').pop();
  const targetName = normalizedTarget.split('/').pop();
  return !!candidateName && candidateName === targetName;
}

export function normalizeFunctionName(name: string): string {
  const trimmed = name.trim();
  const parts = trimmed.split(/[:.]/);
  return parts[parts.length - 1] || trimmed;
}

export function functionNameMatches(candidate: string | undefined, target: string): boolean {
  if (!candidate) return false;
  return normalizeFunctionName(candidate) === target;
}
