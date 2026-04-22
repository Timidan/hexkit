/**
 * Eval Snapshot Resolver: resolves evaluation-worthy snapshot IDs, scans
 * for hook snapshots, and waits for live debug sessions.
 */

import type {
  DebugSnapshot,
  SnapshotListItem,
  SourceFile,
  HookSnapshotDetail,
} from '../../types/debug';
import { debugBridgeService } from '../../services/DebugBridgeService';
import {
  enhanceHookSnapshot,
  matchesTraceId,
  findNearestHookSnapshotId,
  isSessionNotFoundError,
  debugLog,
  HOOK_SCAN_CHUNK_SIZE,
} from './debugHelpers';

// ── Constants ──────────────────────────────────────────────────────────

export const EVAL_SESSION_READY_TIMEOUT_MS = 15000;
export const EVAL_SESSION_READY_POLL_MS = 250;
export const EVAL_SNAPSHOT_HINT_CACHE_MAX = 512;
export const EVAL_VARIABLE_HINT_CACHE_MAX = 1024;
/**
 * Total time budget for the entire evaluation function.
 * Must be LESS than the outer withTimeout in ExpressionEvaluator/EvaluateModal (15s)
 * so that evaluateExpressionInternal always returns a definitive error before the
 * outer timeout fires with a vague message.
 */
export const EVAL_TOTAL_BUDGET_MS = 40000;

// ── LRU cache helper ──────────────────────────────────────────────────

export function setLimitedCacheEntry<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  maxEntries: number
) {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  if (cache.size <= maxEntries) {
    return;
  }
  const oldestKey = cache.keys().next().value;
  if (oldestKey) {
    cache.delete(oldestKey);
  }
}

// ── Snapshot ID validation ─────────────────────────────────────────────

export function isValidSnapshotId(snapshotId: number | null, totalSnapshots: number): snapshotId is number {
  if (typeof snapshotId !== 'number' || !Number.isInteger(snapshotId) || snapshotId < 0) {
    return false;
  }
  if (totalSnapshots <= 0) {
    return true;
  }
  return snapshotId < totalSnapshots;
}

// ── Wait for live session readiness ────────────────────────────────────

export interface LiveSessionReadyDeps {
  sessionInvalid: boolean;
  sessionRef: { current: { sessionId: string; totalSnapshots?: number } | null };
  sourceFilesRef: { current: Map<string, SourceFile> };
  snapshotCache: Map<number, DebugSnapshot>;
  setSnapshotCache: (updater: (prev: Map<number, DebugSnapshot>) => Map<number, DebugSnapshot>) => void;
}

export async function waitForLiveSessionReady(
  sessionId: string,
  preferredSnapshotId: number | null,
  deps: LiveSessionReadyDeps,
  timeoutMs = EVAL_SESSION_READY_TIMEOUT_MS
): Promise<{ ready: true; snapshotId: number } | { ready: false; error: string }> {
  const deadline = Date.now() + timeoutMs;
  let lastError: string | null = null;

  while (Date.now() < deadline) {
    if (deps.sessionInvalid) {
      return {
        ready: false,
        error: 'Debug session expired. Please re-run the simulation to debug again.',
      };
    }

    const activeSession = deps.sessionRef.current;
    if (!activeSession || activeSession.sessionId !== sessionId) {
      return {
        ready: false,
        error: 'Live debug session is not active yet. Please retry.',
      };
    }

    const totalSnapshots = activeSession.totalSnapshots ?? 0;
    if (totalSnapshots <= 0) {
      lastError = 'Live debug session reported no snapshots yet.';
    } else {
      const candidateIds: number[] = [];
      if (isValidSnapshotId(preferredSnapshotId, totalSnapshots)) {
        candidateIds.push(preferredSnapshotId);
      }
      if (!candidateIds.includes(0)) {
        candidateIds.push(0);
      }

      for (const candidateId of candidateIds) {
        const cachedSnapshot = deps.snapshotCache.get(candidateId);
        if (cachedSnapshot) {
          return { ready: true, snapshotId: candidateId };
        }

        try {
          const response = await debugBridgeService.getSnapshot({
            sessionId,
            snapshotId: candidateId,
          });
          const resolved = enhanceHookSnapshot(response.snapshot, deps.sourceFilesRef.current);
          deps.setSnapshotCache((prev) => {
            const next = new Map(prev);
            next.set(candidateId, resolved);
            if (next.size > 500) {
              const sortedKeys = [...next.keys()].sort((a, b) => a - b);
              sortedKeys.slice(0, next.size - 500).forEach((k) => next.delete(k));
            }
            return next;
          });
          return { ready: true, snapshotId: candidateId };
        } catch (err) {
          if (isSessionNotFoundError(err)) {
            return {
              ready: false,
              error: 'Debug session expired. Please re-run the simulation to debug again.',
            };
          }
          lastError = err instanceof Error ? err.message : 'Snapshot bootstrap failed.';
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, EVAL_SESSION_READY_POLL_MS));
  }

  return {
    ready: false,
    error:
      lastError
        ? `Live debug session is still initializing (${lastError}). Retry in a moment.`
        : 'Live debug session is still initializing. Retry in a moment.',
  };
}

// ── Scan for hook snapshot ─────────────────────────────────────────────

export interface ScanForHookSnapshotDeps {
  sessionInvalid: boolean;
  sessionRef: { current: { totalSnapshots?: number } | null };
  session: { totalSnapshots?: number } | null;
  sourceFilesRef: { current: Map<string, SourceFile> };
  snapshotCache: Map<number, DebugSnapshot>;
  setSnapshotCache: (updater: (prev: Map<number, DebugSnapshot>) => Map<number, DebugSnapshot>) => void;
}

export async function scanForHookSnapshot(
  sessionId: string,
  baseSnapshotId: number,
  traceId: number | null,
  maxOffset: number,
  deps: ScanForHookSnapshotDeps,
  predicate?: (detail: HookSnapshotDetail) => boolean,
  timeoutMs: number = 8000
): Promise<{ snapshotId: number; detail: HookSnapshotDetail } | null> {
  if (deps.sessionInvalid) return null;

  const scanDeadline = Date.now() + timeoutMs;
  const totalSnapshots = deps.sessionRef.current?.totalSnapshots ?? deps.session?.totalSnapshots ?? 0;
  const maxSnapshotId =
    totalSnapshots > 0 ? totalSnapshots - 1 : baseSnapshotId + maxOffset;
  const maxReach = Math.max(baseSnapshotId, maxSnapshotId - baseSnapshotId);
  const effectiveMaxOffset = Math.min(maxOffset, maxReach);
  const seen = new Set<number>();

  const evaluateCandidate = async (
    snapshotId: number
  ): Promise<{ snapshotId: number; detail: HookSnapshotDetail } | null> => {
    if (seen.has(snapshotId)) return null;
    seen.add(snapshotId);

    const cached = deps.snapshotCache.get(snapshotId);
    if (cached) {
      if (cached.type !== 'hook') return null;
      if (!matchesTraceId(cached.frameId, traceId)) {
        return null;
      }
      const detail = cached.detail as HookSnapshotDetail;
      if (predicate && !predicate(detail)) {
        return null;
      }
      return { snapshotId, detail };
    }

    try {
      const response = await debugBridgeService.getSnapshot({
        sessionId,
        snapshotId,
      });
      const resolved = enhanceHookSnapshot(response.snapshot, deps.sourceFilesRef.current);
      deps.setSnapshotCache((prev) => { const next = new Map(prev); next.set(snapshotId, resolved); if (next.size > 500) { const sortedKeys = [...next.keys()].sort((a, b) => a - b); sortedKeys.slice(0, next.size - 500).forEach(k => next.delete(k)); } return next; });
      if (resolved.type !== 'hook') return null;
      if (!matchesTraceId(resolved.frameId, traceId)) {
        return null;
      }
      const detail = resolved.detail as HookSnapshotDetail;
      if (predicate && !predicate(detail)) {
        return null;
      }
      return { snapshotId, detail };
    } catch {
      return null;
    }
  };

  const chunkSize = Math.max(1, Math.min(HOOK_SCAN_CHUNK_SIZE, effectiveMaxOffset || 1));

  for (let offset = 0; offset <= effectiveMaxOffset; offset += chunkSize) {
    if (Date.now() > scanDeadline) {
      debugLog(`[scanForHookSnapshot] Scan deadline exceeded after ${timeoutMs}ms, returning null`);
      return null;
    }
    const endOffset = Math.min(effectiveMaxOffset, offset + chunkSize - 1);
    const candidates: Array<{ id: number; offset: number }> = [];

    for (let candidateOffset = offset; candidateOffset <= endOffset; candidateOffset += 1) {
      if (candidateOffset === 0) {
        candidates.push({ id: baseSnapshotId, offset: candidateOffset });
        continue;
      }

      const prevId = baseSnapshotId - candidateOffset;
      if (prevId >= 0 && prevId <= maxSnapshotId) {
        candidates.push({ id: prevId, offset: candidateOffset });
      }

      const nextId = baseSnapshotId + candidateOffset;
      if (nextId >= 0 && nextId <= maxSnapshotId) {
        candidates.push({ id: nextId, offset: candidateOffset });
      }
    }

    const results = await Promise.all(
      candidates.map(async (candidate) => {
        const match = await evaluateCandidate(candidate.id);
        return match ? { ...match, offset: candidate.offset } : null;
      })
    );

    let bestMatch: { snapshotId: number; detail: HookSnapshotDetail; offset: number } | null = null;
    for (const result of results) {
      if (!result) continue;
      if (
        !bestMatch ||
        result.offset < bestMatch.offset ||
        (result.offset === bestMatch.offset && result.snapshotId < bestMatch.snapshotId)
      ) {
        bestMatch = result;
      }
    }

    if (bestMatch) {
      return { snapshotId: bestMatch.snapshotId, detail: bestMatch.detail };
    }
  }

  return null;
}

// ── Resolve eval snapshot ID ───────────────────────────────────────────

export interface ResolveEvalSnapshotDeps {
  sessionRef: { current: { sessionId: string; totalSnapshots: number } | null };
  sessionInvalid: boolean;
  currentSnapshotId: number | null;
  currentSnapshot: DebugSnapshot | null;
  snapshotCache: Map<number, DebugSnapshot>;
  setSnapshotCache: (updater: (prev: Map<number, DebugSnapshot>) => Map<number, DebugSnapshot>) => void;
  snapshotList: SnapshotListItem[];
  setSnapshotList: (list: SnapshotListItem[]) => void;
  sourceFilesRef: { current: Map<string, SourceFile> };
}

export async function resolveEvalSnapshotId(
  deps: ResolveEvalSnapshotDeps,
  baseSnapshotId?: number | null,
  traceEntrySnapshotRange?: { first: number; nextFirst: number | null } | null,
): Promise<number | null> {
  const effectiveBase = baseSnapshotId ?? deps.currentSnapshotId;
  const activeSession = deps.sessionRef.current;
  if (!activeSession || effectiveBase === null) {
    return null;
  }
  if (deps.sessionInvalid) {
    return null;
  }
  if (activeSession.sessionId.startsWith('trace-')) {
    return null;
  }

  const { parseTraceEntryId } = await import('./debugHelpers');

  const cachedSnapshot = deps.snapshotCache.get(effectiveBase);
  const activeSnapshot =
    cachedSnapshot || (deps.currentSnapshot?.id === effectiveBase ? deps.currentSnapshot : null);
  const listSnapshot = deps.snapshotList.find((snap) => snap.id === effectiveBase);
  const currentFrameId = activeSnapshot?.frameId || listSnapshot?.frameId;
  const currentTraceId = parseTraceEntryId(currentFrameId);

  if (activeSnapshot?.type === 'hook') {
    const cachedCheck = deps.snapshotCache.get(effectiveBase);
    if (cachedCheck?.type === 'hook') {
      return effectiveBase;
    }
  }

  // When we have a targeted trace entry range AND it's far from effectiveBase,
  // skip the local/remote ±50 scan (which would find wrong-context Hooks)
  // and go directly to Phase 0.
  const hasTargetedRange = traceEntrySnapshotRange &&
    traceEntrySnapshotRange.first >= 0 &&
    traceEntrySnapshotRange.first < (activeSession.totalSnapshots ?? 0);
  const targetedRangeIsFar = hasTargetedRange &&
    Math.abs(traceEntrySnapshotRange!.first - effectiveBase) > 100;

  if (!targetedRangeIsFar) {
    // Standard local scan: only when the targeted range is nearby or absent
    const snapshotListById = new Map(deps.snapshotList.map((snap) => [snap.id, snap]));
    const maxLocalOffset = 50;
    for (let offset = 1; offset <= maxLocalOffset; offset += 1) {
      const prevId = effectiveBase - offset;
      const nextId = effectiveBase + offset;

      const prevCached = deps.snapshotCache.get(prevId);
      if (prevCached?.type === 'hook' && matchesTraceId(prevCached.frameId, currentTraceId)) {
        return prevId;
      }
      const nextCached = deps.snapshotCache.get(nextId);
      if (nextCached?.type === 'hook' && matchesTraceId(nextCached.frameId, currentTraceId)) {
        return nextId;
      }

      const prevList = snapshotListById.get(prevId);
      if (prevList?.type === 'hook' && matchesTraceId(prevList.frameId, currentTraceId)) {
        return prevId;
      }
      const nextList = snapshotListById.get(nextId);
      if (nextList?.type === 'hook' && matchesTraceId(nextList.frameId, currentTraceId)) {
        return nextId;
      }
    }

    const maxRemoteOffset = 10;
    const maxSnapshotId = activeSession.totalSnapshots - 1;
    for (let offset = 1; offset <= maxRemoteOffset; offset += 1) {
      const candidates = [effectiveBase - offset, effectiveBase + offset].filter(
        (id) => id >= 0 && id <= maxSnapshotId
      );

      for (const candidateId of candidates) {
        try {
          const response = await debugBridgeService.getSnapshot({
            sessionId: activeSession.sessionId,
            snapshotId: candidateId,
          });
          const resolved = enhanceHookSnapshot(response.snapshot, deps.sourceFilesRef.current);
          deps.setSnapshotCache((prev) => { const next = new Map(prev); next.set(candidateId, resolved); if (next.size > 500) { const sortedKeys = [...next.keys()].sort((a, b) => a - b); sortedKeys.slice(0, next.size - 500).forEach(k => next.delete(k)); } return next; });
          if (resolved.type === 'hook' && matchesTraceId(resolved.frameId, currentTraceId)) {
            return candidateId;
          }
        } catch {
          // Ignore and continue searching
        }
      }
    }

    const nearestFromLoaded = findNearestHookSnapshotId(
      deps.snapshotList,
      deps.snapshotCache,
      effectiveBase,
      currentTraceId
    );
    if (nearestFromLoaded !== null) {
      return nearestFromLoaded;
    }
  }

  if (deps.snapshotList.length < activeSession.totalSnapshots || targetedRangeIsFar) {
    const total = activeSession.totalSnapshots;

    // Phase 0: Trace-entry-targeted scan — if we know the snapshot range for
    // the current call frame, sample it sparsely to find Hook snapshots.
    // Hook snapshots with populated locals tend to cluster in narrow bands,
    // so we first sample ~50 points across the range, then refine around
    // any Hook we find.  This covers ranges of thousands of snapshots in
    // ~2-3 batch RPCs instead of scanning every individual snapshot.
    if (import.meta.env.DEV) console.log('[resolveEvalSnapshotId] Phase 0 check — range:', traceEntrySnapshotRange, 'effectiveBase:', effectiveBase, 'targetedRangeIsFar:', targetedRangeIsFar);
    if (traceEntrySnapshotRange && traceEntrySnapshotRange.first >= 0 && traceEntrySnapshotRange.first < total) {
      const rangeStart = traceEntrySnapshotRange.first;
      const rangeEnd = traceEntrySnapshotRange.nextFirst !== null
        ? Math.min(traceEntrySnapshotRange.nextFirst - 1, total - 1)
        : total - 1;
      const rangeSize = rangeEnd - rangeStart + 1;
      if (import.meta.env.DEV) console.log(`[resolveEvalSnapshotId] Phase 0 — rangeStart=${rangeStart}, rangeEnd=${rangeEnd}, rangeSize=${rangeSize}`);
      const existingIds = new Set(deps.snapshotList.map(s => s.id));
      const mergedList = [...deps.snapshotList];

      const mergeBatch = async (startId: number, count: number) => {
        if (import.meta.env.DEV) console.log(`[resolveEvalSnapshotId] Phase 0 mergeBatch — startId=${startId}, count=${count}`);
        const response = await debugBridgeService.getSnapshotBatch({
          sessionId: activeSession.sessionId,
          startId,
          count: Math.min(count, total - startId),
        });
        if (import.meta.env.DEV) console.log(`[resolveEvalSnapshotId] Phase 0 mergeBatch — fetched ${response.snapshots.length} snapshots`);
        for (const snapshot of response.snapshots) {
          if (!existingIds.has(snapshot.id)) {
            mergedList.push(snapshot);
            existingIds.add(snapshot.id);
          }
        }
      };

      try {
        // Sparse-sample across the range.  Each edb_getSnapshotInfo call goes
        // through a remote proxy (~1-2s RTT) but runs in batches of 25 concurrent.
        // Phase 0 only needs to find ANY Hook snapshot (the caller's source
        // breakpoint strategy handles precise resolution), so 25 samples suffice.
        const SAMPLE_CAP = Math.min(25, rangeSize);
        const step = Math.max(1, Math.ceil(rangeSize / SAMPLE_CAP));
        const sampleIds: number[] = [];
        for (let id = rangeStart; id <= rangeEnd; id += step) {
          sampleIds.push(id);
        }
        if (!sampleIds.includes(rangeEnd)) sampleIds.push(rangeEnd);

        if (import.meta.env.DEV) console.log(`[resolveEvalSnapshotId] Phase 0 — sampling ${sampleIds.length} IDs across [${rangeStart}, ${rangeEnd}] (step=${step})`);

        const sampleResponse = await debugBridgeService.getSnapshotsBySparseIds(
          activeSession.sessionId,
          sampleIds,
        );
        for (const snapshot of sampleResponse.snapshots) {
          if (!existingIds.has(snapshot.id)) {
            mergedList.push(snapshot);
            existingIds.add(snapshot.id);
          }
        }

        mergedList.sort((a, b) => a.id - b.id);
        deps.setSnapshotList(mergedList);

        // Find all Hook snapshots within the trace entry range.
        // Hook snapshots at or very near rangeStart are typically function
        // entry points with empty locals — prefer Hooks further into the range.
        const hookIdsInRange = mergedList
          .filter(s =>
            s.type === 'hook' &&
            s.id >= rangeStart &&
            s.id <= rangeEnd &&
            matchesTraceId(s.frameId, currentTraceId)
          )
          .map(s => s.id)
          .sort((a, b) => a - b);

        if (import.meta.env.DEV) console.log(`[resolveEvalSnapshotId] Phase 0 — merged ${mergedList.length} snapshots, hookIdsInRange: [${hookIdsInRange.join(',')}]`);

        // Prefer Hooks NOT at the entry point (rangeStart ± 5)
        const nonEntryHooks = hookIdsInRange.filter(id => Math.abs(id - rangeStart) > 5);
        const bestCandidates = nonEntryHooks.length > 0 ? nonEntryHooks : hookIdsInRange;
        // Pick the one nearest to effectiveBase
        let nearestFromTargeted: number | null = null;
        if (bestCandidates.length > 0) {
          nearestFromTargeted = bestCandidates.reduce((best, id) =>
            Math.abs(id - effectiveBase) < Math.abs(best - effectiveBase) ? id : best
          );
        }
        if (import.meta.env.DEV) console.log(`[resolveEvalSnapshotId] Phase 0 — nearestFromTargeted=${nearestFromTargeted} (nonEntry: ${nonEntryHooks.length})`);

        // If only entry-point Hooks found and range is large, probe for Hooks
        // with populated locals by calling edb_evaluateExpression('this') at
        // evenly-spaced probe points. This is 1 RPC per probe and is much more
        // reliable than sparse snapshot-info sampling (which misses narrow Hook
        // clusters).  We use 10 probe points for ~10 concurrent RPCs.
        if (nonEntryHooks.length === 0 && hookIdsInRange.length > 0 && rangeSize > 100) {
          const PROBE_COUNT = 10;
          const probeStep = Math.max(1, Math.floor(rangeSize / PROBE_COUNT));
          const probeIds: number[] = [];
          for (let id = rangeStart + probeStep; id <= rangeEnd; id += probeStep) {
            probeIds.push(id);
          }
          if (import.meta.env.DEV) console.log(`[resolveEvalSnapshotId] Phase 0 — eval-probing ${probeIds.length} points in [${rangeStart}, ${rangeEnd}]`);

          try {
            // Probe concurrently — edb_evaluateExpression returns quickly for
            // opcode snapshots (immediate error) and for Hook snapshots with
            // locals (immediate success).
            const probeResults = await Promise.allSettled(
              probeIds.map(async (id) => {
                const result = await debugBridgeService.evaluateExpression({
                  sessionId: activeSession.sessionId,
                  snapshotId: id,
                  expression: 'this',
                });
                return { id, success: result.result.success, isOpcode: result.result.error?.includes('opcode') };
              })
            );
            const hookProbeIds = probeResults
              .filter((r): r is PromiseFulfilledResult<{ id: number; success: boolean; isOpcode: boolean | undefined }> =>
                r.status === 'fulfilled' && r.value.success
              )
              .map(r => r.value.id);

            if (hookProbeIds.length > 0) {
              if (import.meta.env.DEV) console.log(`[resolveEvalSnapshotId] Phase 0 — eval-probe found Hook snapshots at: [${hookProbeIds.join(',')}]`);
              // Pick nearest to effectiveBase
              nearestFromTargeted = hookProbeIds.reduce((best, id) =>
                Math.abs(id - effectiveBase) < Math.abs(best - effectiveBase) ? id : best
              );
            }
          } catch {
            // Probing failed, use what we have
          }
        }

        // Refine around the chosen Hook to find the best nearby one.
        // Skip refinement when the eval-probe already confirmed Hook snapshots
        // — they are verified to support eval and the refine batch (~51 RPCs)
        // would just add latency without improving the result.
        const evalProbeConfirmed = nonEntryHooks.length === 0 && hookIdsInRange.length > 0;
        if (nearestFromTargeted !== null && step > 1 && !evalProbeConfirmed) {
          const REFINE_WINDOW = 25;
          const refineStart = Math.max(rangeStart, nearestFromTargeted - REFINE_WINDOW);
          const refineEnd = Math.min(rangeEnd, nearestFromTargeted + REFINE_WINDOW);
          try {
            await mergeBatch(refineStart, refineEnd - refineStart + 1);
            mergedList.sort((a, b) => a.id - b.id);
            deps.setSnapshotList(mergedList);
            // Re-find within refined data, still preferring non-entry hooks
            const refinedHooks = mergedList
              .filter(s =>
                s.type === 'hook' &&
                s.id >= refineStart &&
                s.id <= refineEnd &&
                matchesTraceId(s.frameId, currentTraceId) &&
                Math.abs(s.id - rangeStart) > 5
              )
              .map(s => s.id);
            if (refinedHooks.length > 0) {
              nearestFromTargeted = refinedHooks.reduce((best, id) =>
                Math.abs(id - effectiveBase) < Math.abs(best - effectiveBase) ? id : best
              );
            }
          } catch {
            // Refinement failed, use the sample result
          }
        }

        if (nearestFromTargeted !== null) {
          if (import.meta.env.DEV) console.log(`[resolveEvalSnapshotId] Phase 0: returning Hook snapshot ${nearestFromTargeted} via trace entry range [${rangeStart}, ${rangeEnd}]`);
          return nearestFromTargeted;
        }
      } catch {
        // Targeted fetch failed, fall through to centered window
      }
    }

    // Phase 1: Centered window scan (handles nearby Hooks)
    const MAX_CENTERED_WINDOW = 50;
    const centeredSize = Math.min(MAX_CENTERED_WINDOW, total);
    let centeredStart = Math.max(0, effectiveBase - Math.floor(centeredSize / 2));
    if (centeredStart + centeredSize > total) centeredStart = Math.max(0, total - centeredSize);
    try {
      const response = await debugBridgeService.getSnapshotBatch({
        sessionId: activeSession.sessionId,
        startId: centeredStart,
        count: Math.min(centeredSize, total - centeredStart),
      });
      const existingIds = new Set(deps.snapshotList.map(s => s.id));
      const mergedList = [...deps.snapshotList];
      for (const snapshot of response.snapshots) {
        if (!existingIds.has(snapshot.id)) {
          mergedList.push(snapshot);
          existingIds.add(snapshot.id);
        }
      }
      mergedList.sort((a, b) => a.id - b.id);
      deps.setSnapshotList(mergedList);
      const nearestFromBatch = findNearestHookSnapshotId(
        mergedList,
        deps.snapshotCache,
        effectiveBase,
        currentTraceId
      );
      if (nearestFromBatch !== null) {
        return nearestFromBatch;
      }
    } catch {
      // Ignore and fall through
    }

    // Phase 2: Sparse sampling — sample ~100 evenly-spaced snapshots across
    // the entire session to find Hook snapshot regions.  When a Hook is found
    // that matches the traceId, fetch a small window around it to find the
    // best candidate.  This covers large gaps (thousands of steps) in just
    // ~100 RPC calls instead of scanning every individual snapshot.
    if (total > MAX_CENTERED_WINDOW) {
      const SAMPLE_COUNT = Math.min(25, total);
      const step = Math.max(1, Math.floor(total / SAMPLE_COUNT));
      const sampleIds: number[] = [];
      for (let id = 0; id < total; id += step) {
        sampleIds.push(id);
      }
      if (sampleIds[sampleIds.length - 1] !== total - 1) {
        sampleIds.push(total - 1);
      }

      try {
        const sampleResponse = await debugBridgeService.getSnapshotsBySparseIds(
          activeSession.sessionId,
          sampleIds,
        );
        const existingIds = new Set(deps.snapshotList.map(s => s.id));
        const mergedList = [...deps.snapshotList];
        for (const snapshot of sampleResponse.snapshots) {
          if (!existingIds.has(snapshot.id)) {
            mergedList.push(snapshot);
            existingIds.add(snapshot.id);
          }
        }
        mergedList.sort((a, b) => a.id - b.id);
        deps.setSnapshotList(mergedList);

        const hookSample = findNearestHookSnapshotId(
          mergedList,
          deps.snapshotCache,
          effectiveBase,
          currentTraceId
        );
        if (hookSample !== null) {
          // Refine — fetch a small window around the Hook sample
          const REFINE_WINDOW = 25;
          const refineStart = Math.max(0, hookSample - REFINE_WINDOW);
          const refineCount = Math.min(REFINE_WINDOW * 2, total - refineStart);
          try {
            const refineResponse = await debugBridgeService.getSnapshotBatch({
              sessionId: activeSession.sessionId,
              startId: refineStart,
              count: refineCount,
            });
            for (const snapshot of refineResponse.snapshots) {
              if (!existingIds.has(snapshot.id)) {
                mergedList.push(snapshot);
                existingIds.add(snapshot.id);
              }
            }
            mergedList.sort((a, b) => a.id - b.id);
            deps.setSnapshotList(mergedList);
          } catch {
            // Refinement fetch failed, use sample result
          }
          const refined = findNearestHookSnapshotId(
            mergedList,
            deps.snapshotCache,
            effectiveBase,
            currentTraceId
          );
          return refined ?? hookSample;
        }
      } catch {
        // Sampling failed, fall through
      }
    }
  }

  if (currentTraceId !== null) {
    const fallback = findNearestHookSnapshotId(
      deps.snapshotList,
      deps.snapshotCache,
      effectiveBase,
      null
    );
    if (fallback !== null) {
      return fallback;
    }
  }

  return null;
}
