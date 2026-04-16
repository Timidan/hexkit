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
export const EVAL_TOTAL_BUDGET_MS = 12000;

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

  const maxRemoteOffset = 25;
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

  if (deps.snapshotList.length < activeSession.totalSnapshots) {
    const MAX_SCAN_WINDOW = 200;
    const total = activeSession.totalSnapshots;
    const windowSize = Math.min(MAX_SCAN_WINDOW, total);
    let startId = Math.max(0, effectiveBase - Math.floor(windowSize / 2));
    if (startId + windowSize > total) startId = Math.max(0, total - windowSize);
    const count = Math.min(windowSize, total - startId);
    try {
      const response = await debugBridgeService.getSnapshotBatch({
        sessionId: activeSession.sessionId,
        startId,
        count,
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
