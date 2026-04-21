/**
 * useDebugEvaluation - Expression evaluation and watch expressions hook.
 * Snapshot resolution helpers live in ./evalSnapshotResolver.ts.
 */
import React, { useCallback, useRef } from 'react';
import type {
  HookSnapshotDetail,
  WatchExpression,
  EvalResult,
  SolValue,
  DebugSnapshot,
} from '../../types/debug';
import { debugBridgeService } from '../../services/DebugBridgeService';
import { fnForLine, parseFunctions } from '../../utils/traceDecoder/sourceParser';
import {
  generateId,
  parseTraceEntryId,
  normalizeFilePath,
  resolveSourceContent,
  extractMissingVariableName,
  extractSimpleIdentifier,
  isNullishEvalValue,
  hasUnreadFieldsInValue,
  findVariableValueInHook,
  findNearestHookSnapshotId,
  filePathMatches,
  functionNameMatches,
  isSessionNotFoundError,
  createEvalError,
  SOURCE_LINE_TOLERANCE,
} from './debugHelpers';
import {
  deriveScalarStateValueFromTrace,
  deriveStructValueFromTrace,
  fillUnreadFieldsFromStorage,
  matchesSourceLocation,
  findNearestHookSnapshotIdBySource,
  findNearestHookSnapshotIdByFunction,
} from './structStorageDecoding';
import {
  isValidSnapshotId,
  setLimitedCacheEntry,
  waitForLiveSessionReady,
  scanForHookSnapshot,
  resolveEvalSnapshotId,
  EVAL_SNAPSHOT_HINT_CACHE_MAX,
  EVAL_VARIABLE_HINT_CACHE_MAX,
  EVAL_TOTAL_BUDGET_MS,
} from './evalSnapshotResolver';
import type { DebugSharedState, DebugEvaluationActions } from './types';

const NO_HOOK_SNAPSHOTS_ERROR =
  'No source-level debug snapshots exist in this session. The contract may lack debug metadata, or debug mode was not enabled during simulation.';

const hookContextMismatchError = (step: number, traceId: number | null, file: string | null) =>
  `No source-level debug snapshot found near step ${step}. Hook snapshots exist in this session but none match the current execution context (trace frame ${traceId ?? 'unknown'}, file: ${file || 'unknown'}).`;

const SESSION_EXPIRED_ERROR = 'Debug session expired. Please re-run the simulation to debug again.';

function normalizeTraceFrameId(frameId?: Array<string | number> | null): string | null {
  if (!Array.isArray(frameId) || frameId.length === 0) return null;
  return frameId.map((part) => String(part)).join('-');
}

function getTraceRowBytecodeAddress(row: { entryMeta?: { codeAddress?: string; target?: string } | null } | null): string | null {
  const value = row?.entryMeta?.codeAddress || row?.entryMeta?.target || null;
  return value ? value.toLowerCase() : null;
}

function getTraceRowStorageAccess(
  row: {
    storage_read?: { slot?: string; value?: string } | null;
    storage_write?: { slot?: string; after?: string } | null;
  } | null
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

function getOpcodePc(snapshot: DebugSnapshot | null | undefined): number | null {
  if (!snapshot || snapshot.type !== 'opcode') return null;
  const detail = snapshot.detail as { pc?: number };
  return typeof detail.pc === 'number' ? detail.pc : null;
}

function scoreOpcodeSnapshotCandidate(
  traceRow: {
    frame_id?: Array<string | number>;
    pc?: number;
    name?: string;
    stackTop?: string | null;
    stackDepth?: number;
    storage_read?: { slot?: string; value?: string } | null;
    storage_write?: { slot?: string; after?: string } | null;
  },
  snapshot: DebugSnapshot
): number {
  let score = 0;
  const opcodeDetail =
    snapshot.type === 'opcode'
      ? (snapshot.detail as {
          pc?: number;
          opcodeName?: string;
          stack?: string[];
          storageAccess?: { type: 'read' | 'write'; slot: string; value?: string };
        })
      : null;
  const traceFrameId = normalizeTraceFrameId(traceRow.frame_id);
  if (traceFrameId && snapshot.frameId === traceFrameId) {
    score += 100;
  }
  if (snapshot.type === 'opcode' && opcodeDetail?.pc === traceRow.pc) {
    score += 50;
  }
  if (
    snapshot.type === 'opcode' &&
    traceRow.name &&
    opcodeDetail?.opcodeName?.toUpperCase() === traceRow.name.toUpperCase()
  ) {
    score += 25;
  }

  const traceStorageAccess = getTraceRowStorageAccess(traceRow);
  const snapshotStorageAccess =
    snapshot.type === 'opcode' ? opcodeDetail?.storageAccess ?? null : null;
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
      snapshotStorageAccess.value.toLowerCase() === traceStorageAccess.value.toLowerCase()
    ) {
      score += 15;
    }
  }

  if (snapshot.type === 'opcode') {
    const stack = Array.isArray(opcodeDetail?.stack) ? opcodeDetail.stack : [];
    const stackTop = stack.length > 0 ? stack[stack.length - 1] : null;
    if (traceRow.stackTop && stackTop && stackTop.toLowerCase() === traceRow.stackTop.toLowerCase()) {
      score += 10;
    }
    if (typeof traceRow.stackDepth === 'number' && stack.length === traceRow.stackDepth) {
      score += 5;
    }
  }

  return score;
}

export function useDebugEvaluation(state: DebugSharedState): DebugEvaluationActions {
  const {
    session,
    sessionRef,
    sessionInvalid,
    setSessionInvalid,
    currentSnapshotId,
    currentSnapshot,
    snapshotCache,
    setSnapshotCache,
    snapshotList,
    setSnapshotList,
    sourceFiles,
    sourceFilesRef,
    currentFile,
    currentLine,
    evalHint,
    functionRangesRef,
    decodedTraceRowsRef,
    watchExpressions,
    setWatchExpressions,
    rpcFallbackConfig,
  } = state;
  const evalSnapshotHintCacheRef = useRef<Map<string, number>>(new Map());
  const variableHintCacheRef = useRef<
    Map<string, { snapshotId: number; value: SolValue | null } | null>
  >(new Map());
  const traceToLiveSnapshotCacheRef = useRef<Map<string, number>>(new Map());

  // Cache breakpoint hits per (bytecodeAddress, file, lineRange) so subsequent
  // evals at the same execution-tree position skip the ~6s RPC entirely.
  const breakpointHitsCacheRef = useRef<Map<string, number[]>>(new Map());

  // Dedup lock: prevent concurrent evaluations of the same expression at the
  // same snapshot.  Without this, React StrictMode double-renders and other
  // React lifecycle quirks cause 2-3 simultaneous eval calls that overwhelm
  // the bridge with 3× the RPC load.
  const evalInflightRef = useRef<Map<string, Promise<EvalResult>>>(new Map());

  // ── Wrapped resolver callbacks (delegate to extracted pure functions) ──

  const waitForLiveSessionReadyCb = useCallback(
    async (sessionId: string, preferredSnapshotId: number | null, timeoutMs?: number) =>
      waitForLiveSessionReady(sessionId, preferredSnapshotId, {
        sessionInvalid,
        sessionRef,
        sourceFilesRef,
        snapshotCache,
        setSnapshotCache,
      }, timeoutMs),
    [sessionInvalid, snapshotCache]
  );

  const getFunctionNameForLocation = useCallback(
    (filePath: string, line: number): string | null => {
      const content = resolveSourceContent(filePath, sourceFilesRef.current);
      if (!content) return null;
      const cacheKey = normalizeFilePath(filePath);
      let ranges = functionRangesRef.current.get(cacheKey);
      if (!ranges) {
        ranges = parseFunctions(content);
        functionRangesRef.current.set(cacheKey, ranges);
      }
      return fnForLine(ranges, line);
    },
    []
  );

  const resolveEvalSnapshotIdCb = useCallback(async (
    baseSnapshotId = currentSnapshotId,
    traceEntrySnapshotRange?: { first: number; nextFirst: number | null } | null,
  ): Promise<number | null> => {
    return resolveEvalSnapshotId({
      sessionRef,
      sessionInvalid,
      currentSnapshotId: baseSnapshotId ?? null,
      currentSnapshot,
      snapshotCache,
      setSnapshotCache,
      snapshotList,
      setSnapshotList,
      sourceFilesRef,
    }, baseSnapshotId, traceEntrySnapshotRange);
  }, [
    currentSnapshotId,
    currentSnapshot,
    snapshotCache,
    snapshotList,
    sessionInvalid,
    sourceFiles,
  ]);

  const scanForHookSnapshotCb = useCallback(
    async (
      sessionId: string,
      baseSnapshotId: number,
      traceId: number | null,
      maxOffset: number,
      predicate?: (detail: HookSnapshotDetail) => boolean,
      timeoutMs: number = 8000
    ) => scanForHookSnapshot(
      sessionId,
      baseSnapshotId,
      traceId,
      maxOffset,
      {
        sessionInvalid,
        sessionRef,
        session,
        sourceFilesRef,
        snapshotCache,
        setSnapshotCache,
      },
      predicate,
      timeoutMs
    ),
    [session, sessionInvalid, snapshotCache, sourceFiles]
  );

  const resolveLiveSnapshotFromTraceRowCb = useCallback(
    async (
      sessionId: string,
      traceStepId: number
    ): Promise<{ snapshotId: number; snapshot: DebugSnapshot } | null> => {
      const traceRow = decodedTraceRowsRef.current?.find((row) => row.id === traceStepId) ?? null;
      const bytecodeAddress = getTraceRowBytecodeAddress(traceRow);
      if (!traceRow || !bytecodeAddress || typeof traceRow.pc !== 'number') {
        return null;
      }

      const cacheKey = `${sessionId}:${traceStepId}:${bytecodeAddress}:${traceRow.pc}`;
      const cachedSnapshotId = traceToLiveSnapshotCacheRef.current.get(cacheKey);
      if (typeof cachedSnapshotId === 'number') {
        const cachedSnapshot = snapshotCache.get(cachedSnapshotId);
        if (cachedSnapshot) {
          return { snapshotId: cachedSnapshotId, snapshot: cachedSnapshot };
        }
      }

      const breakpointHits = await debugBridgeService.getBreakpointHits({
        sessionId,
        breakpoints: [
          {
            location: {
              type: 'opcode',
              bytecodeAddress,
              pc: traceRow.pc,
            },
          },
        ],
      });

      const candidateIds = breakpointHits.hits.filter((id) => Number.isInteger(id) && id >= 0);
      if (candidateIds.length === 0) {
        return null;
      }

      let bestMatch:
        | { snapshotId: number; snapshot: DebugSnapshot; score: number }
        | null = null;

      for (const candidateId of candidateIds.slice(0, 16)) {
        try {
          const response = await debugBridgeService.getSnapshot({
            sessionId,
            snapshotId: candidateId,
          });
          const candidateSnapshot = response.snapshot;
          const score = scoreOpcodeSnapshotCandidate(traceRow, candidateSnapshot);

          if (!bestMatch || score > bestMatch.score) {
            bestMatch = {
              snapshotId: candidateId,
              snapshot: candidateSnapshot,
              score,
            };
          }
        } catch {
          // Ignore candidate fetch errors and continue scoring remaining hits.
        }
      }

      if (!bestMatch) {
        return null;
      }

      traceToLiveSnapshotCacheRef.current.set(cacheKey, bestMatch.snapshotId);
      setSnapshotCache((prev) => {
        const next = new Map(prev);
        next.set(bestMatch!.snapshotId, bestMatch!.snapshot);
        if (next.size > 500) {
          const sortedKeys = [...next.keys()].sort((a, b) => a - b);
          sortedKeys.slice(0, next.size - 500).forEach((key) => next.delete(key));
        }
        return next;
      });

      return { snapshotId: bestMatch.snapshotId, snapshot: bestMatch.snapshot };
    },
    [decodedTraceRowsRef, snapshotCache, setSnapshotCache]
  );

  // ── Core expression evaluation ───────────────────────────────────────

  const evaluateExpressionInternalImpl = useCallback(
    async (expression: string): Promise<EvalResult> => {
      const activeSession = sessionRef.current;
      if (!activeSession) {
        return { success: false, error: 'No active debug session' };
      }
      if (sessionInvalid) {
        return {
          success: false,
          error: SESSION_EXPIRED_ERROR,
        };
      }
      const totalSnapshots = activeSession.totalSnapshots ?? session?.totalSnapshots ?? 0;
      const isTraceSession = activeSession.sessionId.startsWith('trace-');
      const traceRows = decodedTraceRowsRef.current;
      const traceSnapshotExists = (snapshotId: number | null | undefined): snapshotId is number =>
        typeof snapshotId === 'number' &&
        Number.isInteger(snapshotId) &&
        snapshotId >= 0 &&
        (
          snapshotList.some((snap) => snap.id === snapshotId) ||
          Boolean(traceRows?.some((row) => row.id === snapshotId))
        );

      let baseSnapshotId: number | null = isTraceSession
        ? (
            traceSnapshotExists(currentSnapshotId)
              ? currentSnapshotId
              : traceRows?.[0]?.id ?? snapshotList[0]?.id ?? null
          )
        : isValidSnapshotId(currentSnapshotId, totalSnapshots)
          ? currentSnapshotId
          : totalSnapshots > 0
            ? 0
            : null;

      if (!isTraceSession) {
        const readiness = await waitForLiveSessionReadyCb(
          activeSession.sessionId,
          baseSnapshotId
        );
        if (!readiness.ready) {
          return { success: false, error: readiness.error };
        }
        baseSnapshotId = readiness.snapshotId;
      }

      const hasValidBaseSnapshotId = isTraceSession
        ? traceSnapshotExists(baseSnapshotId)
        : isValidSnapshotId(baseSnapshotId, totalSnapshots);

      if (!hasValidBaseSnapshotId || baseSnapshotId === null) {
        return {
          success: false,
          error: 'Could not resolve a valid debug snapshot. Retry after the session finishes initializing.',
        };
      }
      let resolvedBaseSnapshotId: number = baseSnapshotId;

      const expressionText = expression.trim();
      if (!expressionText) {
        return { success: false, error: 'Expression cannot be empty.' };
      }

      const evalDeadline = Date.now() + EVAL_TOTAL_BUDGET_MS;
      const remainingBudget = () => Math.max(500, evalDeadline - Date.now());
      const budgetExhausted = () => Date.now() >= evalDeadline;
      let liveSnapshotRemapNote: string | null = null;

      const withLiveSnapshotRemapNote = (result: EvalResult): EvalResult => {
        if (!result.success || !liveSnapshotRemapNote) {
          return result;
        }
        if (!result.note) {
          return { ...result, note: liveSnapshotRemapNote };
        }
        if (result.note.includes(liveSnapshotRemapNote)) {
          return result;
        }
        return { ...result, note: `${liveSnapshotRemapNote}. ${result.note}` };
      };

      // For trace sessions, try to derive value from trace data first
      if (isTraceSession) {
        const simpleName = extractSimpleIdentifier(expressionText);
        if (simpleName) {
          const preferSourceFile = evalHint?.filePath || currentFile;
          const preferFunctionName = evalHint?.functionName || null;

          if (traceRows && traceRows.length > 0) {
            const scalarValue = deriveScalarStateValueFromTrace({
              variableName: simpleName,
              snapshotId: resolvedBaseSnapshotId,
              traceRows,
              sourceFiles: sourceFilesRef.current,
            });
            if (scalarValue) {
              return {
                success: true,
                value: scalarValue,
                note: `Value derived from trace storage data at step ${resolvedBaseSnapshotId}`,
              };
            }

            const derived = deriveStructValueFromTrace({
              variableName: simpleName,
              snapshotId: resolvedBaseSnapshotId,
              traceRows,
              sourceFiles: sourceFilesRef.current,
              preferSourceFile,
              preferFunctionName,
            });
            if (derived) {
              return { success: true, value: derived };
            }
          }
        }
        return {
          success: false,
          error: 'Expression evaluation requires a live debug session. Re-run simulation with "Debug" mode enabled.',
        };
      }

      let remappedBaseSnapshot = snapshotCache.get(resolvedBaseSnapshotId) ?? null;
      const traceRowAtBase =
        decodedTraceRowsRef.current?.find((row) => row.id === resolvedBaseSnapshotId) ?? null;
      const liveSnapshotAtBase =
        currentSnapshot?.id === resolvedBaseSnapshotId ? currentSnapshot : remappedBaseSnapshot;
      const traceBytecodeAddress = getTraceRowBytecodeAddress(traceRowAtBase);
      const liveBytecodeAddress = liveSnapshotAtBase?.bytecodeAddress?.toLowerCase() ?? null;
      const liveOpcodePc = getOpcodePc(liveSnapshotAtBase);
      const liveSnapshotMatchesTraceExecutionPoint =
        !traceRowAtBase ||
        !traceBytecodeAddress ||
        typeof traceRowAtBase.pc !== 'number' ||
        (liveBytecodeAddress === traceBytecodeAddress && liveOpcodePc === traceRowAtBase.pc);

      if (!liveSnapshotMatchesTraceExecutionPoint && !budgetExhausted()) {
        const resolvedLiveSnapshot = await resolveLiveSnapshotFromTraceRowCb(
          activeSession.sessionId,
          resolvedBaseSnapshotId
        );
        if (
          resolvedLiveSnapshot &&
          isValidSnapshotId(resolvedLiveSnapshot.snapshotId, totalSnapshots)
        ) {
          const traceStepId = resolvedBaseSnapshotId;
          resolvedBaseSnapshotId = resolvedLiveSnapshot.snapshotId;
          remappedBaseSnapshot = resolvedLiveSnapshot.snapshot;
          liveSnapshotRemapNote =
            `Value resolved from live step ${resolvedLiveSnapshot.snapshotId} for trace step ${traceStepId}`;
        }
      }

      const cachedSnapshot = remappedBaseSnapshot || snapshotCache.get(resolvedBaseSnapshotId);
      const activeSnapshot =
        cachedSnapshot || (currentSnapshot?.id === resolvedBaseSnapshotId ? currentSnapshot : null);
      const listSnapshot = snapshotList.find((snap) => snap.id === resolvedBaseSnapshotId);
      const currentFrameId = activeSnapshot?.frameId || listSnapshot?.frameId;
      const currentTraceId = parseTraceEntryId(currentFrameId);
      const preferSourceFile =
        evalHint?.filePath && !evalHint.filePath.startsWith('trace://')
          ? evalHint.filePath
          : currentFile && !currentFile.startsWith('trace://')
            ? currentFile
            : null;
      const preferSourceLine = evalHint?.line ?? currentLine ?? null;
      const preferFunctionName =
        evalHint?.functionName ??
        (preferSourceFile && preferSourceLine !== null
          ? getFunctionNameForLocation(preferSourceFile, preferSourceLine)
          : null);
      const simpleName = extractSimpleIdentifier(expressionText);

      try {
        const targetedScanOffset = totalSnapshots;
        const hasLoadedHookSnapshot =
          activeSnapshot?.type === 'hook' ||
          snapshotList.some((snap) => snap.type === 'hook') ||
          Array.from(snapshotCache.values()).some((snap) => snap.type === 'hook');
        let evalSnapshotId: number | null = null;
        const evalContextKey = [
          activeSession.sessionId,
          resolvedBaseSnapshotId,
          currentTraceId ?? 'na',
          preferSourceFile || '',
          preferSourceLine ?? 'na',
          preferFunctionName || '',
        ].join('|');
        const directResponse = await debugBridgeService.evaluateExpression({
          sessionId: activeSession.sessionId,
          snapshotId: resolvedBaseSnapshotId,
          expression: expressionText,
        });
        if (directResponse.result.success) {
          if (!isNullishEvalValue(directResponse.result.value) || !simpleName) {
            if (hasUnreadFieldsInValue(directResponse.result.value)) {
              const filled = await fillUnreadFieldsFromStorage(
                directResponse.result.value as SolValue,
                activeSession.sessionId,
                resolvedBaseSnapshotId,
                rpcFallbackConfig ?? undefined
              );
              return withLiveSnapshotRemapNote({ success: true, value: filled });
            }
            return withLiveSnapshotRemapNote(directResponse.result);
          }
        } else {
          const directErrorText = directResponse.result.error;
          if (isSessionNotFoundError(new Error(directErrorText || ''))) {
            setSessionInvalid(true);
            return {
              success: false,
              error: SESSION_EXPIRED_ERROR,
            };
          }
          const isOpcodeSnapshotError = Boolean(directErrorText?.includes('opcode snapshot'));
          const shouldTryHookResolution =
            isOpcodeSnapshotError ||
            Boolean(extractMissingVariableName(directErrorText));
          if (!shouldTryHookResolution) {
            return directResponse.result;
          }
        }

        const cachedEvalSnapshotId = evalSnapshotHintCacheRef.current.get(evalContextKey);
        if (
          typeof cachedEvalSnapshotId === 'number' &&
          isValidSnapshotId(cachedEvalSnapshotId, totalSnapshots)
        ) {
          const cachedListSnap = snapshotList.find(s => s.id === cachedEvalSnapshotId);
          const cachedCacheSnap = snapshotCache.get(cachedEvalSnapshotId);
          const cachedStillHook = cachedListSnap?.type === 'hook' || cachedCacheSnap?.type === 'hook';
          if (cachedStillHook) {
            evalSnapshotId = cachedEvalSnapshotId;
          } else {
            evalSnapshotHintCacheRef.current.delete(evalContextKey);
          }
        }
        // Look up the trace entry's snapshot range for targeted scanning.
        // When available, this lets us jump directly to the correct region
        // of the session instead of scanning outward from the current step.
        //
        // We check multiple sources for the trace entry:
        //   1. currentTraceId — from the live snapshot's frameId
        //   2. traceRowAtBase?.traceId — from the decoded trace row
        //   3. Source-file matching — find an entry row whose source matches
        //      preferSourceFile (handles the common case where the user is
        //      viewing _verifySignatures in Verifier.sol but the live snapshot
        //      is in the calling contract's frame)
        let traceEntrySnapshotRange: { first: number; nextFirst: number | null } | null = null;
        let traceEntryBytecodeAddress: string | null = null;
        if (decodedTraceRowsRef.current) {
          // Only use call frame entries from the bridge trace data (negative IDs,
          // created by analysisHelpers.ts) — their firstSnapshotId is a live
          // session snapshot ID.  WASM-decoded entries (positive IDs) use a
          // different numbering that doesn't map to live session snapshots.
          const allEntryRows = decodedTraceRowsRef.current.filter(
            (row) => row.entryMeta && typeof row.firstSnapshotId === 'number'
              && row.id < 0
          );

          const buildRange = (entryRow: typeof allEntryRows[0]): { first: number; nextFirst: number | null } => {
            let nextFirst: number | null = null;
            const later = allEntryRows.filter(
              r => r.firstSnapshotId! > entryRow.firstSnapshotId!
            );
            if (later.length > 0) {
              nextFirst = Math.min(...later.map(r => r.firstSnapshotId!));
            }
            return { first: entryRow.firstSnapshotId!, nextFirst };
          };

          // Find the target traceId — prefer the source-file match
          let targetTraceId: number | null = null;

          if (preferSourceFile) {
            const sourceFileName = preferSourceFile.split('/').pop()?.toLowerCase() || '';
            const sourceMatch = allEntryRows.find(r => {
              const contractName = r.entryMeta?.targetContractName || r.entryMeta?.codeContractName || '';
              if (contractName && sourceFileName.includes(contractName.toLowerCase())) return true;
              const entrySource = r.sourceFile || r.destSourceFile || '';
              if (entrySource && filePathMatches(entrySource, preferSourceFile)) return true;
              return false;
            });
            if (sourceMatch?.traceId !== undefined) {
              targetTraceId = sourceMatch.traceId;
              traceEntryBytecodeAddress = (
                sourceMatch.entryMeta?.codeAddress ||
                sourceMatch.entryMeta?.target ||
                null
              )?.toLowerCase() ?? null;
            }
          }

          // Fallback: use currentTraceId or traceRowAtBase's traceId
          if (targetTraceId === null) {
            targetTraceId = traceRowAtBase?.traceId ?? currentTraceId;
            // Also try to get bytecodeAddress from the fallback entry
            if (traceEntryBytecodeAddress === null && targetTraceId !== null) {
              const fallbackEntry = allEntryRows.find(r => r.traceId === targetTraceId);
              if (fallbackEntry?.entryMeta) {
                traceEntryBytecodeAddress = (
                  fallbackEntry.entryMeta.codeAddress ||
                  fallbackEntry.entryMeta.target ||
                  null
                )?.toLowerCase() ?? null;
              }
            }
          }

          // Fetch the raw trace data from the bridge to get accurate
          // first_snapshot_id values (decoded trace rows remap these IDs).
          if (targetTraceId !== null) {
            try {
              const rawTrace = await debugBridgeService.getTrace(activeSession.sessionId);
              const rawEntries = (rawTrace as any)?.inner ?? rawTrace?.entries ?? [];
              const rawEntry = rawEntries.find((e: any) => e.id === targetTraceId);
              const rawFsi = rawEntry?.first_snapshot_id ?? rawEntry?.firstSnapshotId;
              if (typeof rawFsi === 'number' && rawFsi >= 0) {
                // Find next entry's first_snapshot_id for range boundary
                let nextFsi: number | null = null;
                for (const e of rawEntries) {
                  const fsi = e.first_snapshot_id ?? e.firstSnapshotId;
                  if (typeof fsi === 'number' && fsi > rawFsi) {
                    if (nextFsi === null || fsi < nextFsi) nextFsi = fsi;
                  }
                }
                traceEntrySnapshotRange = { first: rawFsi, nextFirst: nextFsi };
              }
            } catch {
              // If trace fetch fails, fall back to decoded row data
              const match = allEntryRows.find(r => r.traceId === targetTraceId);
              if (match) {
                traceEntrySnapshotRange = buildRange(match);
              }
            }
          }
        }

        if (import.meta.env.DEV) {
          console.log('[eval] traceEntrySnapshotRange:', traceEntrySnapshotRange, 'preferSourceFile:', preferSourceFile, 'currentTraceId:', currentTraceId, 'traceRowAtBase?.traceId:', traceRowAtBase?.traceId);
          if (decodedTraceRowsRef.current) {
            const entryRows = decodedTraceRowsRef.current.filter(r => r.entryMeta && typeof r.firstSnapshotId === 'number');
            console.log('[eval] Entry rows with firstSnapshotId:', JSON.stringify(entryRows.map(r => ({ id: r.id, traceId: r.traceId, fsi: r.firstSnapshotId, cn: r.entryMeta?.targetContractName || r.contract, sf: r.sourceFile?.split('/').pop() }))));
          }
        }

        // ── Shared helper: fetch breakpoint hits, eval at candidates ──
        // Used by the fast path (before Phase 0) and Strategy 1 (inside
        // needsRangeProbe) to avoid ~160 lines of duplicated logic.
        const ENTRY_POINT_SKIP = 5; // Skip first N snapshots in range (opcode-only entry prologue)
        const BP_CACHE_MAX = 50;
        const evalAtBreakpointHits = async (opts: {
          sessionId: string;
          bytecodeAddress: string;
          filePath: string;
          lineNumber: number;
          lineRadius: number;
          rangeStart: number;
          rangeEnd: number;
          baseSnapshotId: number;
          expression: string;
          bpCacheKey: string;
          bpCache: Map<string, number[]>;
          notePrefix: string;
          logPrefix: string;
        }): Promise<{ snapshotId: number; result: EvalResult } | null> => {
          const {
            sessionId, bytecodeAddress, filePath, lineNumber, lineRadius,
            rangeStart, rangeEnd, baseSnapshotId, expression,
            bpCacheKey, bpCache, notePrefix, logPrefix,
          } = opts;
          let bpHits: number[];

          const cachedHits = bpCache.get(bpCacheKey);
          if (cachedHits) {
            bpHits = cachedHits;
            if (import.meta.env.DEV) console.log(`[eval] ${logPrefix}: using cached breakpoint hits`);
          } else {
            try {
              const breakpoints: Array<{ location: { type: 'source'; bytecodeAddress: string; filePath: string; lineNumber: number } }> = [];
              for (let line = Math.max(1, lineNumber - lineRadius); line <= lineNumber + lineRadius; line++) {
                breakpoints.push({
                  location: { type: 'source', bytecodeAddress, filePath, lineNumber: line },
                });
              }
              if (import.meta.env.DEV) console.log(`[eval] ${logPrefix}: source breakpoint probe ${breakpoints.length} lines around L${lineNumber} in ${filePath}`);
              const bpResponse = await debugBridgeService.getBreakpointHits({ sessionId, breakpoints });
              // Evict oldest entry if cache is full
              if (bpCache.size >= BP_CACHE_MAX) {
                const firstKey = bpCache.keys().next().value;
                if (firstKey !== undefined) bpCache.delete(firstKey);
              }
              bpCache.set(bpCacheKey, bpResponse.hits);
              bpHits = bpResponse.hits;
            } catch {
              if (import.meta.env.DEV) console.log(`[eval] ${logPrefix}: source breakpoint probe failed`);
              return null;
            }
          }

          const hitsInRange = bpHits.filter(id => id > rangeStart + ENTRY_POINT_SKIP && id <= rangeEnd);
          if (import.meta.env.DEV) console.log(`[eval] ${logPrefix}: hits in range [${rangeStart}, ${rangeEnd}]: [${hitsInRange.slice(0, 20).join(',')}] (${hitsInRange.length} total)`);
          if (hitsInRange.length === 0) return null;

          // Sort by distance to baseSnapshotId, try closest first.
          // Evaluate in small concurrent batches (5) for a balance between
          // latency (parallel) and wasted RPCs (sequential).
          const sorted = [...hitsInRange].sort((a, b) => Math.abs(a - baseSnapshotId) - Math.abs(b - baseSnapshotId));
          const candidates = sorted.slice(0, 10);
          const BATCH_SIZE = 5;
          for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
            if (budgetExhausted()) break;
            const batch = candidates.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(
              batch.map(async (id) => {
                const r = await debugBridgeService.evaluateExpression({ sessionId, snapshotId: id, expression });
                return { id, result: r.result };
              })
            );
            for (const er of results) {
              if (er.status !== 'fulfilled') continue;
              const { id, result: evalRes } = er.value;
              // Check for session expiration
              if (!evalRes.success && isSessionNotFoundError(new Error(evalRes.error || ''))) {
                setSessionInvalid(true);
                return { snapshotId: id, result: { success: false, error: SESSION_EXPIRED_ERROR } };
              }
              if (evalRes.success && !isNullishEvalValue(evalRes.value)) {
                if (import.meta.env.DEV) console.log(`[eval] ${logPrefix}: SUCCESS at snapshot ${id}`);
                if (hasUnreadFieldsInValue(evalRes.value)) {
                  const filled = await fillUnreadFieldsFromStorage(
                    evalRes.value as SolValue, sessionId, id, rpcFallbackConfig ?? undefined
                  );
                  return {
                    snapshotId: id,
                    result: withLiveSnapshotRemapNote({
                      success: true, value: filled,
                      note: `Value resolved from step ${id} (${notePrefix} near step ${baseSnapshotId})`,
                    }),
                  };
                }
                return {
                  snapshotId: id,
                  result: withLiveSnapshotRemapNote({
                    ...evalRes,
                    note: `Value resolved from step ${id} (${notePrefix} near step ${baseSnapshotId})`,
                  }),
                };
              }
            }
          }
          return null;
        };

        // ── Fast path: source breakpoints BEFORE Phase 0 ──
        // When we have bytecodeAddress + source location + snapshot range, fire
        // source breakpoints first (~6s) and eval at the closest hits (~2s).
        // This skips Phase 0 entirely (~13-15s), cutting total eval time from
        // ~28s to ~10s in the common case.
        let fastPathResult: EvalResult | null = null;
        if (
          evalSnapshotId === null &&
          traceEntryBytecodeAddress &&
          preferSourceFile &&
          preferSourceLine !== null &&
          traceEntrySnapshotRange &&
          !budgetExhausted()
        ) {
          const rangeStart = traceEntrySnapshotRange.first;
          const rangeEnd = traceEntrySnapshotRange.nextFirst !== null
            ? Math.min(traceEntrySnapshotRange.nextFirst - 1, totalSnapshots - 1)
            : totalSnapshots - 1;

          const LINE_RADIUS = 20;
          // Include sessionId in cache key so hits don't leak across sessions
          const bpCacheKey = `${activeSession.sessionId}|${traceEntryBytecodeAddress}|${preferSourceFile}|${preferSourceLine}|${LINE_RADIUS}`;

          const bpResult = await evalAtBreakpointHits({
            sessionId: activeSession.sessionId,
            bytecodeAddress: traceEntryBytecodeAddress,
            filePath: preferSourceFile,
            lineNumber: preferSourceLine,
            lineRadius: LINE_RADIUS,
            rangeStart,
            rangeEnd,
            baseSnapshotId: resolvedBaseSnapshotId,
            expression: expressionText,
            bpCacheKey,
            bpCache: breakpointHitsCacheRef.current,
            notePrefix: 'fast-path source breakpoint',
            logPrefix: 'Fast path',
          });
          if (bpResult) {
            evalSnapshotId = bpResult.snapshotId;
            fastPathResult = bpResult.result;
            setLimitedCacheEntry(
              evalSnapshotHintCacheRef.current,
              evalContextKey,
              evalSnapshotId,
              EVAL_SNAPSHOT_HINT_CACHE_MAX
            );
          } else if (import.meta.env.DEV) {
            console.log(`[eval] Fast path: no successful eval in range [${rangeStart}, ${rangeEnd}], falling through`);
          }
        }

        // If fast path already produced a result, return it immediately
        if (fastPathResult) {
          return fastPathResult;
        }

        // Pre-populate the snapshot list via batch fetching FIRST — this is
        // much cheaper than scanning individual snapshots (one round trip per
        // batch of 25 vs one per snapshot).  Once the snapshot list is loaded,
        // the in-memory findNearest* helpers can locate Hook snapshots without
        // any additional network calls.
        if (evalSnapshotId === null && !budgetExhausted()) {
          evalSnapshotId = await resolveEvalSnapshotIdCb(resolvedBaseSnapshotId, traceEntrySnapshotRange);
        }

        if (evalSnapshotId === null && preferSourceFile) {
            evalSnapshotId = findNearestHookSnapshotIdBySource(
              snapshotList, snapshotCache, resolvedBaseSnapshotId, currentTraceId,
              preferSourceFile, preferSourceLine, SOURCE_LINE_TOLERANCE
            );

          if (evalSnapshotId === null && preferSourceLine !== null && !budgetExhausted()) {
            const sourceMatch = await scanForHookSnapshotCb(
              activeSession.sessionId, resolvedBaseSnapshotId, currentTraceId, targetedScanOffset,
              (detail) => matchesSourceLocation(detail, preferSourceFile, preferSourceLine, SOURCE_LINE_TOLERANCE),
              remainingBudget()
            );
            if (sourceMatch) evalSnapshotId = sourceMatch.snapshotId;
          }

          if (evalSnapshotId === null && preferFunctionName) {
            evalSnapshotId = findNearestHookSnapshotIdByFunction(
              snapshotList, snapshotCache, resolvedBaseSnapshotId, currentTraceId,
              preferSourceFile, preferFunctionName
            );
          }

          if (evalSnapshotId === null && preferFunctionName && !budgetExhausted()) {
            const functionMatch = await scanForHookSnapshotCb(
              activeSession.sessionId, resolvedBaseSnapshotId, currentTraceId, targetedScanOffset,
              (detail) =>
                matchesSourceLocation(detail, preferSourceFile, null, SOURCE_LINE_TOLERANCE) &&
                functionNameMatches(detail.functionName, preferFunctionName),
              remainingBudget()
            );
            if (functionMatch) evalSnapshotId = functionMatch.snapshotId;
          }

          if (evalSnapshotId === null) {
            evalSnapshotId = findNearestHookSnapshotIdBySource(
              snapshotList, snapshotCache, resolvedBaseSnapshotId, currentTraceId,
              preferSourceFile, null, SOURCE_LINE_TOLERANCE
            );
          }

          if (evalSnapshotId === null && !budgetExhausted()) {
            const sourceMatch = await scanForHookSnapshotCb(
              activeSession.sessionId, resolvedBaseSnapshotId, currentTraceId, targetedScanOffset,
              (detail) => matchesSourceLocation(detail, preferSourceFile, null, SOURCE_LINE_TOLERANCE),
              remainingBudget()
            );
            if (sourceMatch) evalSnapshotId = sourceMatch.snapshotId;
          }
        }

        if (evalSnapshotId === null && !budgetExhausted()) {
          const fallback = await scanForHookSnapshotCb(
            activeSession.sessionId, resolvedBaseSnapshotId, currentTraceId, targetedScanOffset,
            undefined, remainingBudget()
          );
          if (fallback) evalSnapshotId = fallback.snapshotId;
        }
        if (evalSnapshotId === null && currentTraceId !== null && !budgetExhausted()) {
          const broadFallback = await scanForHookSnapshotCb(
            activeSession.sessionId, resolvedBaseSnapshotId, null, targetedScanOffset,
            undefined, remainingBudget()
          );
          if (broadFallback) evalSnapshotId = broadFallback.snapshotId;
        }

        if (evalSnapshotId === null) {
          if (!hasLoadedHookSnapshot) {
            return {
              success: false,
              error: NO_HOOK_SNAPSHOTS_ERROR,
            };
          }
          return {
            success: false,
            error: hookContextMismatchError(resolvedBaseSnapshotId, currentTraceId, preferSourceFile),
          };
        }
        if (!isValidSnapshotId(evalSnapshotId, totalSnapshots)) {
          return {
            success: false,
            error: 'Could not resolve a valid snapshot for expression evaluation.',
          };
        }

        // === Retry loop for type-mismatch resilience ===
        const MAX_HOOK_VERIFY_RETRIES = 5;
        const badHookIds = new Set<number>();
        const workingList = [...snapshotList];
        const workingCache = new Map(snapshotCache);
        for (let verifyAttempt = 0; verifyAttempt < MAX_HOOK_VERIFY_RETRIES; verifyAttempt++) {
          if (evalSnapshotId === null || budgetExhausted()) break;
          const verifyResponse = await debugBridgeService.evaluateExpression({
            sessionId: activeSession.sessionId,
            snapshotId: evalSnapshotId,
            expression: 'this',
          });
          if (verifyResponse.result.success || !verifyResponse.result.error?.includes('opcode snapshot')) {
            break;
          }
          badHookIds.add(evalSnapshotId);
          const correctedId = evalSnapshotId;
          const listIdx = workingList.findIndex(s => s.id === correctedId);
          if (listIdx >= 0) workingList[listIdx] = { ...workingList[listIdx], type: 'opcode' as const };
          const cachedSnap = workingCache.get(correctedId);
          if (cachedSnap) workingCache.set(correctedId, { ...cachedSnap, type: 'opcode' as const });
          setSnapshotList(prev => prev.map(s =>
            s.id === correctedId ? { ...s, type: 'opcode' as const } : s
          ));
          setSnapshotCache(prev => {
            const snap = prev.get(correctedId);
            if (!snap) return prev;
            const next = new Map(prev);
            next.set(correctedId, { ...snap, type: 'opcode' as const });
            return next;
          });
          evalSnapshotId = null;
          if (preferSourceFile) {
            evalSnapshotId = findNearestHookSnapshotIdBySource(
              workingList, workingCache, resolvedBaseSnapshotId, currentTraceId,
              preferSourceFile, preferSourceLine, SOURCE_LINE_TOLERANCE
            );
            if (evalSnapshotId === null) {
              evalSnapshotId = findNearestHookSnapshotIdBySource(
                workingList, workingCache, resolvedBaseSnapshotId, currentTraceId,
                preferSourceFile, null, SOURCE_LINE_TOLERANCE
              );
            }
            if (evalSnapshotId === null && preferFunctionName) {
              evalSnapshotId = findNearestHookSnapshotIdByFunction(
                workingList, workingCache, resolvedBaseSnapshotId, currentTraceId,
                preferSourceFile, preferFunctionName
              );
            }
          }
          if (evalSnapshotId === null && !budgetExhausted()) {
            const fallbackScan = await scanForHookSnapshotCb(
              activeSession.sessionId, resolvedBaseSnapshotId, currentTraceId, targetedScanOffset,
              undefined, remainingBudget()
            );
            evalSnapshotId = fallbackScan?.snapshotId ?? null;
          }
          if (evalSnapshotId !== null && badHookIds.has(evalSnapshotId)) {
            evalSnapshotId = null;
          }
        }
        if (evalSnapshotId === null) {
          if (!hasLoadedHookSnapshot) {
            return {
              success: false,
              error: NO_HOOK_SNAPSHOTS_ERROR,
            };
          }
          return {
            success: false,
            error: hookContextMismatchError(resolvedBaseSnapshotId, currentTraceId, preferSourceFile),
          };
        }
        setLimitedCacheEntry(
          evalSnapshotHintCacheRef.current,
          evalContextKey,
          evalSnapshotId,
          EVAL_SNAPSHOT_HINT_CACHE_MAX
        );

        const findVariableMatch = async (variableName: string, baseId: number) => {
          const variableCacheKey = `${evalContextKey}|${variableName}`;
          const cachedVariableHint = variableHintCacheRef.current.get(variableCacheKey);
          if (cachedVariableHint) return cachedVariableHint;

          const hasVariable = (detail: HookSnapshotDetail) => !!findVariableValueInHook(detail, variableName);
          const preferredScope = (detail: HookSnapshotDetail) => {
            if (!hasVariable(detail)) return false;
            if (preferSourceFile && !filePathMatches(detail.filePath, preferSourceFile)) return false;
            if (preferFunctionName && !functionNameMatches(detail.functionName, preferFunctionName)) return false;
            return true;
          };

          if ((preferSourceFile || preferFunctionName) && !budgetExhausted()) {
            const preferredMatch = await scanForHookSnapshotCb(
              activeSession.sessionId, baseId, currentTraceId, targetedScanOffset,
              preferredScope, remainingBudget()
            );
            if (preferredMatch) {
              const match = { snapshotId: preferredMatch.snapshotId, value: findVariableValueInHook(preferredMatch.detail, variableName) };
              setLimitedCacheEntry(variableHintCacheRef.current, variableCacheKey, match, EVAL_VARIABLE_HINT_CACHE_MAX);
              return match;
            }
          }

          let variableMatch = !budgetExhausted() ? await scanForHookSnapshotCb(
            activeSession.sessionId, baseId, currentTraceId, targetedScanOffset,
            hasVariable, remainingBudget()
          ) : null;
          if (!variableMatch && currentTraceId !== null && !budgetExhausted()) {
            variableMatch = await scanForHookSnapshotCb(
              activeSession.sessionId, baseId, null, targetedScanOffset,
              hasVariable, remainingBudget()
            );
          }
          if (variableMatch) {
            const match = { snapshotId: variableMatch.snapshotId, value: findVariableValueInHook(variableMatch.detail, variableName) };
            setLimitedCacheEntry(variableHintCacheRef.current, variableCacheKey, match, EVAL_VARIABLE_HINT_CACHE_MAX);
            return match;
          }

          return null;
        };

        let simpleNameHint: Awaited<ReturnType<typeof findVariableMatch>> | null = null;
        const getSimpleNameHint = async () => {
          if (!simpleName) return null;
          if (simpleNameHint) return simpleNameHint;
          simpleNameHint = await findVariableMatch(simpleName, evalSnapshotId);
          return simpleNameHint;
        };

        const deriveTraceFallback = () => {
          if (!simpleName) return null;
          const traceRows = decodedTraceRowsRef.current;
          if (!traceRows || traceRows.length === 0) return null;
          const scalarValue = deriveScalarStateValueFromTrace({
            variableName: simpleName,
            snapshotId: resolvedBaseSnapshotId,
            traceRows,
            sourceFiles,
          });
          if (scalarValue) {
            return scalarValue;
          }
          return deriveStructValueFromTrace({
            variableName: simpleName,
            snapshotId: resolvedBaseSnapshotId,
            traceRows,
            sourceFiles,
            preferSourceFile,
            preferFunctionName,
          });
        };

        let response = await debugBridgeService.evaluateExpression({
          sessionId: activeSession.sessionId,
          snapshotId: evalSnapshotId,
          expression: expressionText,
        });

        if (import.meta.env.DEV) console.log(`[eval] Initial eval at snapshot ${evalSnapshotId} for '${expressionText}':`, response.result.success ? `success=${JSON.stringify(response.result.value)?.substring(0, 100)}` : `error=${response.result.error?.substring(0, 100)}`);

        // If eval succeeded but returned nullish for a simple variable, or failed
        // with "variable not visible" or "opcode snapshot", and we have a trace
        // entry range, try to find the right Hook snapshot and evaluate there.
        //
        // Strategy 1 (source breakpoints): Use edb_getBreakpointHits with source
        // breakpoints at nearby lines — this is ONE RPC round that directly returns
        // snapshot IDs where each source line is hit, bypassing the need for sparse
        // sampling entirely.
        //
        // Strategy 2 (blind probe fallback): If source breakpoints fail (e.g. wrong
        // file path format), probe the expression at evenly-spaced points.
        const needsRangeProbe =
          traceEntrySnapshotRange &&
          !budgetExhausted() &&
          simpleName &&
          (
            (response.result.success && isNullishEvalValue(response.result.value)) ||
            (!response.result.success && extractMissingVariableName(response.result.error)) ||
            (!response.result.success && response.result.error?.includes('opcode snapshot'))
          );
        if (needsRangeProbe && traceEntrySnapshotRange) {
          const rangeStart = traceEntrySnapshotRange.first;
          const rangeEnd = traceEntrySnapshotRange.nextFirst !== null
            ? Math.min(traceEntrySnapshotRange.nextFirst - 1, totalSnapshots - 1)
            : totalSnapshots - 1;
          const rangeSize = rangeEnd - rangeStart + 1;

          // --- Strategy 1: Source breakpoint hits (uses cache from fast path) ---
          if (traceEntryBytecodeAddress && preferSourceFile && preferSourceLine !== null && !budgetExhausted()) {
            const LINE_RADIUS = 20;
            const bpCacheKey = `${activeSession.sessionId}|${traceEntryBytecodeAddress}|${preferSourceFile}|${preferSourceLine}|${LINE_RADIUS}`;
            const s1Result = await evalAtBreakpointHits({
              sessionId: activeSession.sessionId,
              bytecodeAddress: traceEntryBytecodeAddress,
              filePath: preferSourceFile,
              lineNumber: preferSourceLine,
              lineRadius: LINE_RADIUS,
              rangeStart,
              rangeEnd,
              baseSnapshotId: resolvedBaseSnapshotId,
              expression: expressionText,
              bpCacheKey,
              bpCache: breakpointHitsCacheRef.current,
              notePrefix: 'source breakpoint match',
              logPrefix: 'Strategy 1',
            });
            if (s1Result) {
              setLimitedCacheEntry(
                evalSnapshotHintCacheRef.current,
                evalContextKey,
                s1Result.snapshotId,
                EVAL_SNAPSHOT_HINT_CACHE_MAX
              );
              return s1Result.result;
            }
          }

          // --- Strategy 2: Blind eval probe fallback ---
          // Evaluate the actual expression at evenly-spaced points within the range.
          // Use 200 probes (step ≈ 20) which is dense enough to hit clusters down
          // to ~20 IDs wide. For 7-wide clusters this may still miss, but combined
          // with Strategy 1 it provides good coverage.
          if (!budgetExhausted()) {
            const PROBE_COUNT = 200;
            const probeStep = Math.max(1, Math.floor(rangeSize / PROBE_COUNT));
            const probeIds: number[] = [];
            // Start from rangeStart + probeStep to skip entry point
            for (let id = rangeStart + probeStep; id <= rangeEnd; id += probeStep) {
              probeIds.push(id);
            }
            if (import.meta.env.DEV) console.log(`[eval] Blind range probe: ${probeIds.length} points in [${rangeStart}, ${rangeEnd}] step=${probeStep} for '${expressionText}'`);

            // Batch concurrent eval calls to avoid overwhelming the bridge
            const EVAL_CONCURRENCY = 25;
            for (let i = 0; i < probeIds.length; i += EVAL_CONCURRENCY) {
              if (budgetExhausted()) break;
              const batch = probeIds.slice(i, i + EVAL_CONCURRENCY);
              const probeResults = await Promise.allSettled(
                batch.map(async (id) => {
                  const r = await debugBridgeService.evaluateExpression({
                    sessionId: activeSession.sessionId,
                    snapshotId: id,
                    expression: expressionText,
                  });
                  return { id, result: r.result };
                })
              );
              for (const pr of probeResults) {
                if (pr.status !== 'fulfilled') continue;
                const { id, result: probeResult } = pr.value;
                if (probeResult.success && !isNullishEvalValue(probeResult.value)) {
                  if (import.meta.env.DEV) console.log(`[eval] Blind probe hit at snapshot ${id}`);
                  if (hasUnreadFieldsInValue(probeResult.value)) {
                    const filled = await fillUnreadFieldsFromStorage(
                      probeResult.value as SolValue, activeSession.sessionId, id, rpcFallbackConfig ?? undefined
                    );
                    return withLiveSnapshotRemapNote({
                      success: true,
                      value: filled,
                      note: `Value resolved from step ${id} (nearest source-level snapshot to current step ${resolvedBaseSnapshotId})`,
                    });
                  }
                  return withLiveSnapshotRemapNote({
                    ...probeResult,
                    note: `Value resolved from step ${id} (nearest source-level snapshot to current step ${resolvedBaseSnapshotId})`,
                  });
                }
              }
            }
          }
        }

        if (response.result.success && isNullishEvalValue(response.result.value) && simpleName) {
          const variableMatch = await getSimpleNameHint();
          if (variableMatch?.value && !isNullishEvalValue(variableMatch.value)) {
            return withLiveSnapshotRemapNote({ success: true, value: variableMatch.value });
          }
          let traceFallback = deriveTraceFallback();
          if (traceFallback) {
            const meta = (traceFallback as { _meta?: { unreadCount: number } })._meta;
            if (meta?.unreadCount && meta.unreadCount > 0) {
              const finalSnapshotId = totalSnapshots > 0 ? totalSnapshots - 1 : evalSnapshotId;
              traceFallback = await fillUnreadFieldsFromStorage(
                traceFallback, activeSession.sessionId, finalSnapshotId, rpcFallbackConfig ?? undefined
              );
            }
            return withLiveSnapshotRemapNote({ success: true, value: traceFallback });
          }
        }

        if (response.result.success) {
          const resultHasUnread = hasUnreadFieldsInValue(response.result.value);
          if (resultHasUnread) {
            const filled = await fillUnreadFieldsFromStorage(
              response.result.value as SolValue, activeSession.sessionId,
              evalSnapshotId, rpcFallbackConfig ?? undefined
            );
            return withLiveSnapshotRemapNote({ success: true, value: filled });
          }
          return withLiveSnapshotRemapNote(response.result);
        }

        const errorText = response.result.error;
        if (isSessionNotFoundError(new Error(errorText || ''))) {
          setSessionInvalid(true);
          return {
            success: false,
            error: SESSION_EXPIRED_ERROR,
          };
        }
        if (errorText?.includes('opcode snapshot')) {
          const fallback = !budgetExhausted() ? await scanForHookSnapshotCb(
            activeSession.sessionId, evalSnapshotId, currentTraceId, targetedScanOffset,
            undefined, remainingBudget()
          ) : null;
          if (fallback && fallback.snapshotId !== evalSnapshotId) {
            response = await debugBridgeService.evaluateExpression({
              sessionId: activeSession.sessionId,
              snapshotId: fallback.snapshotId,
              expression: expressionText,
            });
            if (response.result.success) {
              return {
                ...response.result,
                note: `Value resolved from step ${fallback.snapshotId} (nearest source-level snapshot to current step ${resolvedBaseSnapshotId})`,
              };
            }
          }

          if (simpleName && !budgetExhausted()) {
            const variableMatch = await findVariableMatch(simpleName, resolvedBaseSnapshotId);

            if (variableMatch?.value && !isNullishEvalValue(variableMatch.value)) {
              return {
                success: true,
                value: variableMatch.value,
                note: `Value resolved from step ${variableMatch.snapshotId} (nearest source-level snapshot to current step ${resolvedBaseSnapshotId})`,
              };
            }
          }

          const opcodeTraceFallback = deriveTraceFallback();
          if (opcodeTraceFallback) {
            return withLiveSnapshotRemapNote({
              success: true,
              value: opcodeTraceFallback,
              note: `Value derived from trace data (current step ${resolvedBaseSnapshotId} is an opcode-only snapshot)`,
            });
          }

          return {
            success: false,
            error: createEvalError('opcode_only_snapshot', { snapshotId: evalSnapshotId }).message,
          };
        }

        const missingName = extractMissingVariableName(errorText);
        if (missingName) {
          const variableMatch = await findVariableMatch(missingName, evalSnapshotId);
          if (variableMatch) {
            response = await debugBridgeService.evaluateExpression({
              sessionId: activeSession.sessionId,
              snapshotId: variableMatch.snapshotId,
              expression: expressionText,
            });
            if (response.result.success) return withLiveSnapshotRemapNote(response.result);

            if (expressionText === missingName) {
              const directValue = variableMatch.value;
              if (directValue && !isNullishEvalValue(directValue)) {
                return withLiveSnapshotRemapNote({ success: true, value: directValue });
              }
            }
          }
        }

        let traceFallback = deriveTraceFallback();
        if (traceFallback) {
          const meta = (traceFallback as { _meta?: { unreadCount: number } })._meta;
          if (meta?.unreadCount && meta.unreadCount > 0) {
            const finalSnapshotId = totalSnapshots > 0 ? totalSnapshots - 1 : evalSnapshotId;
            traceFallback = await fillUnreadFieldsFromStorage(
              traceFallback, activeSession.sessionId, finalSnapshotId, rpcFallbackConfig ?? undefined
            );
          }
          return withLiveSnapshotRemapNote({ success: true, value: traceFallback });
        }

        if (missingName) {
          return {
            success: false,
            error: createEvalError('variable_not_visible', {
              variableName: missingName,
              snapshotId: resolvedBaseSnapshotId,
            }).message,
          };
        }

        return withLiveSnapshotRemapNote(response.result);
      } catch (err) {
        if (isSessionNotFoundError(err)) {
          setSessionInvalid(true);
          return {
            success: false,
            error: SESSION_EXPIRED_ERROR,
          };
        }
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Evaluation failed',
        };
      }
    },
    [
      currentSnapshotId,
      currentSnapshot,
      currentFile,
      currentLine,
      evalHint,
      getFunctionNameForLocation,
      sessionInvalid,
      sourceFiles,
      snapshotCache,
      snapshotList,
      resolveEvalSnapshotIdCb,
      resolveLiveSnapshotFromTraceRowCb,
      scanForHookSnapshotCb,
      waitForLiveSessionReadyCb,
      rpcFallbackConfig,
      setSessionInvalid,
    ]
  );

  // Dedup wrapper: if the same expression is already being evaluated at the
  // same snapshot, return the in-flight promise instead of starting a new eval.
  const evaluateExpressionInternal = useCallback(
    (expression: string): Promise<EvalResult> => {
      const dedupKey = `${expression}|${currentSnapshotId}`;
      const inflight = evalInflightRef.current.get(dedupKey);
      if (inflight) {
        if (import.meta.env.DEV) console.log(`[eval] Dedup: reusing in-flight eval for '${expression}' at snapshot ${currentSnapshotId}`);
        return inflight;
      }
      const promise = evaluateExpressionInternalImpl(expression).finally(() => {
        evalInflightRef.current.delete(dedupKey);
      });
      evalInflightRef.current.set(dedupKey, promise);
      return promise;
    },
    [evaluateExpressionInternalImpl, currentSnapshotId]
  );

  // ── Watch expression management ──────────────────────────────────────

  const addWatchExpression = useCallback((expression: string) => {
    const newWatch: WatchExpression = {
      id: generateId(),
      expression,
      pinned: false,
    };

    setWatchExpressions(prev => [...prev, newWatch]);

    if (sessionRef.current && currentSnapshotId !== null && !sessionInvalid) {
      const updateWatch = (update: Partial<WatchExpression>) =>
        setWatchExpressions(prev => prev.map(w => w.id === newWatch.id ? { ...w, ...update } : w));
      evaluateExpressionInternal(expression)
        .then((result) => updateWatch({ currentValue: result.success ? result.value : undefined, error: result.error }))
        .catch(err => updateWatch({ error: err instanceof Error ? err.message : 'Evaluation failed' }));
    }
  }, [currentSnapshotId, sessionInvalid, evaluateExpressionInternal]);

  const removeWatchExpression = useCallback((id: string) => {
    setWatchExpressions(prev => prev.filter(w => w.id !== id));
  }, []);

  const watchExpressionsRef = useRef(watchExpressions);
  watchExpressionsRef.current = watchExpressions;

  const refreshWatchExpressionsInternal = useCallback(async () => {
    if (sessionInvalid) return;
    const currentWatches = watchExpressionsRef.current;
    if (currentWatches.length === 0) return;
    const results = await Promise.all(
      currentWatches.map(async watch => {
        try {
          const r = await evaluateExpressionInternal(watch.expression);
          return { id: watch.id, currentValue: r.success ? r.value : undefined, error: r.error };
        } catch (err) {
          return { id: watch.id, error: err instanceof Error ? err.message : 'Evaluation failed' };
        }
      })
    );
    const resultMap = new Map(results.map(r => [r.id, r]));
    setWatchExpressions(prev => prev.map(w => {
      const update = resultMap.get(w.id);
      return update ? { ...w, currentValue: update.currentValue, error: update.error } : w;
    }));
  }, [sessionInvalid, evaluateExpressionInternal]);

  const refreshWatchExpressions = useCallback(async () => {
    if (!session || currentSnapshotId === null) return;
    await refreshWatchExpressionsInternal();
  }, [session, currentSnapshotId, refreshWatchExpressionsInternal]);

  const evaluateExpression = useCallback(
    (expression: string): Promise<EvalResult> => evaluateExpressionInternal(expression),
    [evaluateExpressionInternal]
  );

  // Auto-refresh watch expressions on snapshot change (debounced)
  React.useEffect(() => {
    if (!session || currentSnapshotId === null || sessionInvalid || watchExpressionsRef.current.length === 0) return;
    const timer = setTimeout(() => refreshWatchExpressionsInternal(), 150);
    return () => clearTimeout(timer);
  }, [session?.sessionId, currentSnapshotId]);

  return {
    evaluateExpression,
    addWatchExpression,
    removeWatchExpression,
    refreshWatchExpressions,
    resolveEvalSnapshotId: resolveEvalSnapshotIdCb,
    scanForHookSnapshot: scanForHookSnapshotCb,
  };
}
