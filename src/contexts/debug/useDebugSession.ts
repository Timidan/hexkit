/**
 * useDebugSession - Session management hook
 *
 * Handles starting, connecting, ending debug sessions,
 * initializing from trace data, and snapshot loading.
 */

import { useCallback } from 'react';
import type {
  DebugSession,
  DebugSnapshot,
  SnapshotListItem,
  SourceFile,
  StartDebugSessionRequest,
  DebugSessionConnectOptions,
  DebugSessionStartOptions,
  StorageDiffEntry,
  HookSnapshotDetail,
  TraceEntry,
} from '../../types/debug';
import { debugBridgeService } from '../../services/DebugBridgeService';
import {
  collectTraceAddresses,
  enhanceHookSnapshot,
  isSessionNotFoundError,
  debugLog,
} from './debugHelpers';
import type { DebugSharedState, DebugSessionActions } from './types';

const INITIAL_SNAPSHOT_PREFETCH_COUNT = 20;
const MINIMAL_SNAPSHOT_PREFETCH_COUNT = 8;

export function useDebugSession(state: DebugSharedState): DebugSessionActions {
  const {
    session,
    setSession,
    setIsLoading,
    setError,
    setSessionInvalid,
    sessionRef,
    sessionInvalid,
    setCurrentSnapshotId,
    setCurrentSnapshot,
    snapshotCache,
    setSnapshotCache,
    setSnapshotList,
    sourceFilesRef,
    updateSourceFiles,
    setCurrentFile,
    setCurrentLine,
    setEvalHint,
    setBreakpoints,
    setBreakpointHits,
    setWatchExpressions,
    setStorageDiffs,
    traceRowsRef,
  } = state;

  /**
   * Navigate to a snapshot using trace data (for trace-based sessions)
   */
  const goToSnapshotFromTrace = useCallback((
    snapshotItem: SnapshotListItem,
    traceRows: any[]
  ) => {
    const row = traceRows.find((r: any) => r.id === snapshotItem.id);
    if (!row) return;

    // Build DebugSnapshot from trace row.
    // Always classify as 'opcode' — trace rows have source-mapping metadata
    // from PC-to-source resolution, but they are NOT EDB hook snapshots
    // with local variable data. Misclassifying them as 'hook' poisons the
    // hook resolution chain in expression evaluation.
    const snapshot: DebugSnapshot = {
      id: row.id,
      frameId: row.frame_id ? row.frame_id.join('-') : `${row.id}-0`,
      targetAddress: row.entryMeta?.target || row.to || '',
      bytecodeAddress: row.entryMeta?.codeAddress || row.entryMeta?.target || '',
      type: 'opcode',
      detail: {
            pc: row.pc || 0,
            opcode: 0,
            opcodeName: row.name || 'OP',
            gasRemaining: String(row.gasRemaining || '0'),
            stack: row.stack || [],
            memory: row.memory ? '0x' + (Array.isArray(row.memory) ? row.memory.map((b: number) => b.toString(16).padStart(2, '0')).join('') : '') : undefined,
            storageAccess: row.storage_read
              ? { type: 'read' as const, slot: row.storage_read.slot, value: row.storage_read.value }
              : row.storage_write
                ? { type: 'write' as const, slot: row.storage_write.slot, value: row.storage_write.after }
                : undefined,
          },
    };

    setCurrentSnapshotId(row.id);
    setCurrentSnapshot(snapshot);

    // Update source location
    if (row.sourceFile) {
      setCurrentFile(row.sourceFile);
    }
    if (row.line) {
      setCurrentLine(row.line);
    }

    // Extract storage diffs from row
    const diffs: StorageDiffEntry[] = [];
    if (row.storage_write) {
      diffs.push({
        address: row.entryMeta?.target || '',
        contractName: row.contract || row.entryMeta?.codeContractName,
        slot: row.storage_write.slot,
        before: row.storage_write.before || '0x0',
        after: row.storage_write.after || '0x0',
      });
    }
    setStorageDiffs(diffs);

    // Cache the snapshot
    setSnapshotCache(prev => { const next = new Map(prev); next.set(row.id, snapshot); if (next.size > 500) { const sortedKeys = [...next.keys()].sort((a, b) => a - b); sortedKeys.slice(0, next.size - 500).forEach(k => next.delete(k)); } return next; });
  }, []);

  const goToSnapshotInternal = useCallback(async (
    sessionId: string,
    snapshotId: number,
    options?: { includeStorageDiff?: boolean }
  ) => {
    if (sessionInvalid) {
      return;
    }

    const includeStorageDiff = options?.includeStorageDiff !== false;
    setIsLoading(true);

    try {
      let snapshot = snapshotCache.get(snapshotId);

      if (!snapshot) {
        const response = await debugBridgeService.getSnapshot({
          sessionId,
          snapshotId,
        });
        snapshot = response.snapshot;

        setSnapshotCache(prev => { const next = new Map(prev); next.set(snapshotId, snapshot!); if (next.size > 500) { const sortedKeys = [...next.keys()].sort((a, b) => a - b); sortedKeys.slice(0, next.size - 500).forEach(k => next.delete(k)); } return next; });
      }

      const resolvedSnapshot = snapshot ? enhanceHookSnapshot(snapshot, sourceFilesRef.current) : snapshot;

      setCurrentSnapshotId(snapshotId);
      setCurrentSnapshot(resolvedSnapshot || null);
      if (resolvedSnapshot) {
        setSnapshotCache(prev => { const next = new Map(prev); next.set(snapshotId, resolvedSnapshot); if (next.size > 500) { const sortedKeys = [...next.keys()].sort((a, b) => a - b); sortedKeys.slice(0, next.size - 500).forEach(k => next.delete(k)); } return next; });
      }

      // Update source location if hook snapshot
      if (resolvedSnapshot?.type === 'hook') {
        const detail = resolvedSnapshot.detail as HookSnapshotDetail;
        setCurrentFile(detail.filePath);
        setCurrentLine(detail.line);
      }

      if (includeStorageDiff) {
        // Refresh storage diffs when explicitly requested.
        const storageDiffResponse = await debugBridgeService.getStorageDiff({
          sessionId,
          snapshotId,
        });
        setStorageDiffs(storageDiffResponse.diffs);
      } else {
        setStorageDiffs([]);
      }

      // Note: watch expression refresh is handled by the evaluation hook
    } catch (err) {
      if (isSessionNotFoundError(err)) {
        setSessionInvalid(true);
        setError('Debug session expired. Please re-run the simulation to debug again.');
      } else {
        const message = err instanceof Error ? err.message : 'Failed to load snapshot';
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [snapshotCache, sessionInvalid]);

  const mergeSourceFiles = useCallback(
    (base: Map<string, SourceFile>, incoming: Record<string, string>) => {
      const files = new Map<string, SourceFile>(base);
      for (const [path, content] of Object.entries(incoming)) {
        if (!files.has(path)) {
          files.set(path, {
            path,
            content,
            contractName: path.split('/').pop()?.replace('.sol', ''),
          });
        }
      }
      return files;
    },
    []
  );

  const loadSourceFilesFromTrace = useCallback(async (
    sessionId: string,
    traceEntries: TraceEntry[]
  ): Promise<Record<string, string>> => {
    const addresses = collectTraceAddresses(
      traceEntries as unknown as Array<Record<string, unknown>>
    );
    if (addresses.length === 0) {
      return {};
    }
    const sourceResults = await Promise.all(
      addresses.map((address) =>
        debugBridgeService.getSourceCode(sessionId, address)
      )
    );
    const sourceFiles: Record<string, string> = {};
    for (const sourceResult of sourceResults) {
      for (const [path, content] of Object.entries(sourceResult.sources)) {
        if (!(path in sourceFiles)) {
          sourceFiles[path] = content;
        }
      }
    }
    return sourceFiles;
  }, []);

  const connectToSession = useCallback(async (existingSession: {
    sessionId: string;
    rpcPort: number;
    snapshotCount: number;
    chainId: number;
    simulationId: string;
  }, options: DebugSessionConnectOptions = {}) => {
    const hydrate = options.hydrate ?? 'full';
    setIsLoading(true);
    setError(null);
    setSessionInvalid(false);

    try {
      let trace: { entries: TraceEntry[]; rootId: number } = { entries: [], rootId: 0 };
      let files = new Map<string, SourceFile>(sourceFilesRef.current);

      if (hydrate === 'full') {
        const traceResult = await debugBridgeService.getTrace(existingSession.sessionId);
        trace = {
          entries: traceResult.entries || [],
          rootId: traceResult.rootId ?? 0,
        };

        const sourceFileMap = await loadSourceFilesFromTrace(
          existingSession.sessionId,
          trace.entries
        );
        files = mergeSourceFiles(files, sourceFileMap);
      }

      const newSession: DebugSession = {
        sessionId: existingSession.sessionId,
        simulationId: existingSession.simulationId,
        chainId: existingSession.chainId,
        rpcUrl: '',
        totalSnapshots: existingSession.snapshotCount,
        sourceFiles: files,
        trace,
        isActive: true,
        startedAt: Date.now(),
      };

      sessionRef.current = newSession;
      setSession(newSession);
      updateSourceFiles(files);
      setSnapshotCache(new Map());
      setSnapshotList([]);
      setBreakpointHits(new Map());

      const firstFile = Array.from(files.keys())[0];
      if (firstFile) {
        setCurrentFile(firstFile);
      }

      if (existingSession.snapshotCount > 0) {
        const prefetchCount = hydrate === 'minimal'
          ? Math.min(MINIMAL_SNAPSHOT_PREFETCH_COUNT, existingSession.snapshotCount)
          : Math.min(INITIAL_SNAPSHOT_PREFETCH_COUNT, existingSession.snapshotCount);
        const batchResponse = await debugBridgeService.getSnapshotBatch({
          sessionId: existingSession.sessionId,
          startId: 0,
          count: prefetchCount,
        });
        setSnapshotList(batchResponse.snapshots);

        await goToSnapshotInternal(existingSession.sessionId, 0, { includeStorageDiff: false });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect to debug session';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [goToSnapshotInternal, loadSourceFilesFromTrace, mergeSourceFiles, sourceFilesRef]);

  const startSession = useCallback(async (
    request: StartDebugSessionRequest,
    options: DebugSessionStartOptions = {}
  ) => {
    const hydrate = options.hydrate ?? 'full';
    setIsLoading(true);
    setError(null);
    setSessionInvalid(false);

    try {
      const response = await debugBridgeService.startSession(request, {
        includeTrace: hydrate === 'full',
        preferDebugStart: true,
      });
      debugLog('[startSession] EDB returned sourceFiles with', Object.keys(response.sourceFiles).length, 'files:', Object.keys(response.sourceFiles).slice(0, 5));

      let incomingSourceFiles = response.sourceFiles;
      if (hydrate === 'full' && Object.keys(incomingSourceFiles).length === 0 && response.trace?.entries?.length) {
        incomingSourceFiles = await loadSourceFilesFromTrace(response.sessionId, response.trace.entries);
      }
      const files = mergeSourceFiles(sourceFilesRef.current, incomingSourceFiles);
      debugLog('[startSession] After merge, files map has', files.size, 'entries');

      const newSession: DebugSession = {
        sessionId: response.sessionId,
        simulationId: request.simulationId,
        chainId: request.chainId,
        rpcUrl: request.rpcUrl,
        totalSnapshots: response.snapshotCount,
        sourceFiles: files,
        trace: response.trace,
        isActive: true,
        startedAt: Date.now(),
      };

      sessionRef.current = newSession;
      setSession(newSession);
      updateSourceFiles(files);
      setSnapshotCache(new Map());
      setSnapshotList([]);
      setBreakpointHits(new Map());

      const firstFile = Array.from(files.keys())[0];
      if (firstFile) {
        setCurrentFile(firstFile);
      }

      if (response.snapshotCount > 0) {
        const prefetchCount = hydrate === 'minimal'
          ? Math.min(MINIMAL_SNAPSHOT_PREFETCH_COUNT, response.snapshotCount)
          : Math.min(INITIAL_SNAPSHOT_PREFETCH_COUNT, response.snapshotCount);
        const batchResponse = await debugBridgeService.getSnapshotBatch({
          sessionId: response.sessionId,
          startId: 0,
          count: prefetchCount,
        });
        setSnapshotList(batchResponse.snapshots);

        await goToSnapshotInternal(response.sessionId, 0, { includeStorageDiff: false });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start debug session';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [goToSnapshotInternal, loadSourceFilesFromTrace, mergeSourceFiles, sourceFilesRef]);

  const endSession = useCallback(async () => {
    if (!session) return;

    try {
      await debugBridgeService.endSession({ sessionId: session.sessionId });
    } catch (err) {
      console.error('Failed to end debug session:', err);
    }

    setSession(null);
    setCurrentSnapshotId(null);
    setCurrentSnapshot(null);
    setSnapshotCache(new Map());
    setSnapshotList([]);
    updateSourceFiles(new Map());
    setCurrentFile(null);
    setCurrentLine(null);
    setEvalHint(null);
    setBreakpoints([]);
    setBreakpointHits(new Map());
    setWatchExpressions([]);
    setStorageDiffs([]);
    setError(null);
  }, [session]);

  const initFromTraceData = useCallback((params: {
    simulationId: string;
    chainId: number;
    traceRows: any[];
    sourceTexts: Record<string, string>;
    rawTrace?: any;
  }) => {
    const { simulationId, chainId, traceRows, sourceTexts, rawTrace } = params;

    setSessionInvalid(false);
    setError(null);

    const snapshots: SnapshotListItem[] = traceRows.map((row: any) => {
      const isHook = row.sourceFile && row.line;
      return {
        id: row.id,
        type: isHook ? 'hook' as const : 'opcode' as const,
        frameId: row.frame_id ? row.frame_id.join('-') : `${row.id}-0`,
        depth: row.visualDepth ?? row.depth ?? 0,
        pc: row.pc,
        opcodeName: row.name,
        gasRemaining: String(row.gasRemaining || '0'),
        filePath: row.sourceFile || undefined,
        line: row.line,
        functionName: row.fn || row.entryMeta?.function || undefined,
      };
    });

    debugLog('[initFromTraceData] Received sourceTexts with', Object.keys(sourceTexts).length, 'files:', Object.keys(sourceTexts).slice(0, 5));
    const files = new Map<string, SourceFile>();
    for (const [path, content] of Object.entries(sourceTexts)) {
      files.set(path, {
        path,
        content,
        contractName: path.split('/').pop()?.replace('.sol', ''),
      });
    }
    debugLog('[initFromTraceData] Built files map with', files.size, 'entries');

    const traceEntries: Array<{ id: number; depth: number; target: string; targetLabel?: string }> = [];
    const callFrames = rawTrace?.inner?.inner && Array.isArray(rawTrace.inner.inner)
      ? rawTrace.inner.inner
      : rawTrace?.inner && typeof rawTrace.inner === 'object'
        ? (Array.isArray(rawTrace.inner) ? rawTrace.inner : Object.values(rawTrace.inner))
        : [];
    for (const entry of callFrames) {
      if (!entry) continue;
      traceEntries.push({
        id: entry.id ?? 0,
        depth: entry.depth ?? 0,
        target: entry.target || entry.to || '',
        targetLabel: entry.target_label || entry.contractName,
      });
    }

    const newSession: DebugSession = {
      sessionId: `trace-${simulationId}`,
      simulationId,
      chainId,
      rpcUrl: '',
      totalSnapshots: snapshots.length,
      sourceFiles: files,
      trace: {
        entries: traceEntries as unknown as TraceEntry[],
        rootId: 0,
      },
      isActive: true,
      startedAt: Date.now(),
    };

    setSession(newSession);
    updateSourceFiles(files);
    setSnapshotList(snapshots);
    setSnapshotCache(new Map());
    setBreakpointHits(new Map());
    setError(null);

    const firstFile = Array.from(files.keys())[0];
    if (firstFile) {
      setCurrentFile(firstFile);
    }

    traceRowsRef.current = traceRows;

    if (snapshots.length > 0) {
      goToSnapshotFromTrace(snapshots[0], traceRows);
    }
  }, []);

  const isTraceBasedSession = useCallback(() => {
    return session?.sessionId.startsWith('trace-') ?? false;
  }, [session]);

  const loadSnapshotBatch = useCallback(
    async (startId: number, count: number) => {
      if (!session) return;

      if (session.sessionId.startsWith('trace-')) {
        return;
      }

      try {
        const response = await debugBridgeService.getSnapshotBatch({
          sessionId: session.sessionId,
          startId,
          count,
        });

        setSnapshotList(prev => {
          const newList = [...prev];
          for (const snapshot of response.snapshots) {
            if (!newList.find(s => s.id === snapshot.id)) {
              newList.push(snapshot);
            }
          }
          return newList.sort((a, b) => a.id - b.id);
        });
      } catch (err) {
        console.error('Failed to load snapshot batch:', err);
      }
    },
    [session]
  );

  return {
    connectToSession,
    startSession,
    endSession,
    initFromTraceData,
    goToSnapshotFromTrace,
    goToSnapshotInternal,
    isTraceBasedSession,
    loadSnapshotBatch,
  };
}
