/**
 * useDebugNavigation - Step navigation hook
 *
 * Handles step in/out/over, continue to breakpoint, and snapshot navigation.
 */

import { useCallback } from 'react';
import type { SnapshotListItem } from '../../types/debug';
import { debugBridgeService } from '../../services/DebugBridgeService';
import type { DebugSharedState } from './types';
import type { DebugSessionActions } from './types';
import { buildSnapshotItem } from './debugHelpers';

export function useDebugNavigation(
  state: DebugSharedState,
  sessionActions: DebugSessionActions
): {
  goToSnapshot: (snapshotId: number) => Promise<void>;
  stepNext: () => Promise<void>;
  stepPrev: () => Promise<void>;
  stepNextCall: () => Promise<void>;
  stepPrevCall: () => Promise<void>;
  stepUp: () => Promise<void>;
  stepOver: () => Promise<void>;
  continueToBreakpoint: (direction: 'forward' | 'backward') => Promise<void>;
} {
  const {
    session,
    currentSnapshotId,
    snapshotList,
    sessionInvalid,
    breakpoints,
    traceRowsRef,
  } = state;

  const {
    goToSnapshotFromTrace,
    goToSnapshotInternal,
    isTraceBasedSession,
  } = sessionActions;

  const goToSnapshot = useCallback(async (snapshotId: number) => {
    if (!session) return;

    // For trace-based sessions, always use trace data
    if (isTraceBasedSession()) {
      const snapshotItem = snapshotList.find(s => s.id === snapshotId);
      if (snapshotItem) {
        goToSnapshotFromTrace(snapshotItem, traceRowsRef.current);
      }
      return;
    }

    // For keep-alive sessions: prefer trace-based navigation when available.
    // This is faster (no API call), bypasses the sessionInvalid guard, and
    // is consistent with how stepNext/stepPrev already navigate.
    // Handles both positive IDs (opcode rows) and negative IDs (call frame entries).
    const traceRows = traceRowsRef.current;
    if (traceRows && traceRows.length > 0) {
      const traceRow = traceRows.find((r: any) => r.id === snapshotId);
      if (traceRow) {
        goToSnapshotFromTrace(buildSnapshotItem(traceRow), traceRows);
        return;
      }
    }

    // Fallback: use bridge API for snapshots not in trace data
    await goToSnapshotInternal(session.sessionId, snapshotId);
  }, [session, isTraceBasedSession, snapshotList, goToSnapshotFromTrace, goToSnapshotInternal]);

  const stepNext = useCallback(async () => {
    if (!session || currentSnapshotId === null) return;

    const traceRows = traceRowsRef.current;
    const useTraceRows = traceRows && traceRows.length > 0;

    if (useTraceRows) {
      const currentIndex = traceRows.findIndex((r: any) => r.id === currentSnapshotId);
      if (currentIndex >= 0 && currentIndex < traceRows.length - 1) {
        const nextRow = traceRows[currentIndex + 1];
        goToSnapshotFromTrace(buildSnapshotItem(nextRow), traceRows);
        return;
      }
      // Desync: traceRows non-empty but currentSnapshotId not found — fall through
      // to snapshotList-based navigation instead of silently returning.
      if (currentIndex === -1) {
        const snapIndex = snapshotList.findIndex(s => s.id === currentSnapshotId);
        if (snapIndex >= 0 && snapIndex < snapshotList.length - 1) {
          await goToSnapshot(snapshotList[snapIndex + 1].id);
        }
        return;
      }
      return;
    }

    const nextId = currentSnapshotId + 1;
    if (nextId < session.totalSnapshots) {
      await goToSnapshot(nextId);
    }
  }, [session, currentSnapshotId, snapshotList, goToSnapshotFromTrace, goToSnapshot]);

  const stepPrev = useCallback(async () => {
    if (!session || currentSnapshotId === null) return;

    const traceRows = traceRowsRef.current;
    const useTraceRows = traceRows && traceRows.length > 0;

    if (useTraceRows) {
      const currentIndex = traceRows.findIndex((r: any) => r.id === currentSnapshotId);
      if (currentIndex > 0) {
        const prevRow = traceRows[currentIndex - 1];
        goToSnapshotFromTrace(buildSnapshotItem(prevRow), traceRows);
        return;
      }
      // Desync: traceRows non-empty but currentSnapshotId not found — fall through
      if (currentIndex === -1) {
        const snapIndex = snapshotList.findIndex(s => s.id === currentSnapshotId);
        if (snapIndex > 0) {
          await goToSnapshot(snapshotList[snapIndex - 1].id);
        }
        return;
      }
      return;
    }

    const prevId = currentSnapshotId - 1;
    if (prevId >= 0) {
      await goToSnapshot(prevId);
    }
  }, [session, currentSnapshotId, snapshotList, goToSnapshotFromTrace, goToSnapshot]);

  const stepNextCall = useCallback(async () => {
    if (!session || currentSnapshotId === null) return;
    if (sessionInvalid) return;

    if (isTraceBasedSession()) {
      const currentIndex = snapshotList.findIndex(s => s.id === currentSnapshotId);
      if (currentIndex >= 0) {
        for (let i = currentIndex + 1; i < snapshotList.length; i++) {
          const snap = snapshotList[i];
          const row = traceRowsRef.current.find((r: any) => r.id === snap.id);
          if (row && (row.isInternalCall || row.entryMeta?.callType)) {
            goToSnapshotFromTrace(snap, traceRowsRef.current);
            return;
          }
        }
      }
      return;
    }

    const response = await debugBridgeService.navigateCall({
      sessionId: session.sessionId,
      snapshotId: currentSnapshotId,
      direction: 'next',
    });

    if (response.snapshotId !== null) {
      await goToSnapshot(response.snapshotId);
    }
  }, [session, currentSnapshotId, snapshotList, isTraceBasedSession, goToSnapshotFromTrace, goToSnapshot, sessionInvalid]);

  const stepPrevCall = useCallback(async () => {
    if (!session || currentSnapshotId === null) return;
    if (sessionInvalid) return;

    if (isTraceBasedSession()) {
      const currentIndex = snapshotList.findIndex(s => s.id === currentSnapshotId);
      if (currentIndex > 0) {
        for (let i = currentIndex - 1; i >= 0; i--) {
          const snap = snapshotList[i];
          const row = traceRowsRef.current.find((r: any) => r.id === snap.id);
          if (row && (row.isInternalCall || row.entryMeta?.callType)) {
            goToSnapshotFromTrace(snap, traceRowsRef.current);
            return;
          }
        }
      }
      return;
    }

    const response = await debugBridgeService.navigateCall({
      sessionId: session.sessionId,
      snapshotId: currentSnapshotId,
      direction: 'prev',
    });

    if (response.snapshotId !== null) {
      await goToSnapshot(response.snapshotId);
    }
  }, [session, currentSnapshotId, snapshotList, isTraceBasedSession, goToSnapshotFromTrace, goToSnapshot, sessionInvalid]);

  const stepUp = useCallback(async () => {
    if (!session || currentSnapshotId === null) return;
    if (sessionInvalid) return;

    const traceRows = traceRowsRef.current;
    // Prefer traceRows but only if they contain the current snapshot.
    // This prevents silent no-ops when traceRowsRef is stale (desync with snapshotList).
    let useTraceRows = traceRows && traceRows.length > 0;
    let currentIndex: number = -1;
    let dataSource: Array<{ id: number; depth?: number; visualDepth?: number }>;

    if (useTraceRows) {
      currentIndex = traceRows.findIndex((r: any) => r.id === currentSnapshotId);
      if (currentIndex === -1) {
        // traceRows doesn't contain current snapshot — fall back to snapshotList
        useTraceRows = false;
      } else {
        dataSource = traceRows;
      }
    }

    if (!useTraceRows) {
      dataSource = snapshotList;
      currentIndex = snapshotList.findIndex(s => s.id === currentSnapshotId);
    }

    if (currentIndex === -1) {
      console.warn('[stepUp] Current snapshot not found:', currentSnapshotId);
      return;
    }

    const navigateTo = async (row: any) => {
      if (useTraceRows) {
        goToSnapshotFromTrace(buildSnapshotItem(row), traceRows);
      } else {
        // Desync fallback: we're using snapshotList because traceRows didn't contain
        // the current snapshot. Check if the TARGET is in traceRowsRef before calling
        // goToSnapshotFromTrace (which no-ops if the id isn't found in traceRows).
        const currentTraceRows = traceRowsRef.current;
        const targetInTraceRows = currentTraceRows?.find((r: any) => r.id === row.id);
        if (targetInTraceRows) {
          goToSnapshotFromTrace(buildSnapshotItem(targetInTraceRows), currentTraceRows);
        } else if (session && row.id >= 0) {
          // Target not in traceRows either — use bridge API directly
          // Guard: only for positive IDs (bridge APIs don't accept negative synthetic IDs)
          await goToSnapshotInternal(session.sessionId, row.id);
        }
      }
    };

    // Helper: scan forward from startIndex for the first row past the child range.
    // For positive-ID rows: simple `id > childEnd` comparison works.
    // For negative-ID call-entry rows (external calls with synthetic IDs sorted by
    // `firstOpcodeId - 0.5`): use `firstSnapshotId > childEnd` since the row's own
    // `id` is negative and would incorrectly fail the `> childEnd` check.
    const findRowAfterChildEnd = async (startIndex: number, childEnd: number): Promise<boolean> => {
      for (let j = startIndex; j < dataSource!.length; j++) {
        const candidate = dataSource![j] as any;
        if (candidate.id < 0) {
          // Negative-ID entry row — check its firstSnapshotId (first opcode inside the call)
          // If firstSnapshotId > childEnd, this call starts after the parent's body ends
          if (candidate.firstSnapshotId !== undefined && candidate.firstSnapshotId > childEnd) {
            await navigateTo(candidate);
            return true;
          }
          // If no firstSnapshotId, skip — we can't determine if it's past the range
        } else if (candidate.id > childEnd) {
          await navigateTo(candidate);
          return true;
        }
      }
      return false;
    };

    const currentRow = dataSource![currentIndex] as any;
    const currentId = currentRow.id;

    // If currently ON a call entry/internal call with childEndId, step out of it directly.
    // This prevents the negative-ID bug where backward scan's `childEndId >= negativeId`
    // falsely matches grandparent frames.
    if (currentRow.childEndId !== undefined && (currentRow.isInternalCall || currentRow.entryMeta?.callType)) {
      if (await findRowAfterChildEnd(currentIndex + 1, currentRow.childEndId)) return;
      return;
    }

    // Strategy: scan backward to find the parent call whose childEndId >= currentId.
    // This is the function call that "owns" the current row.
    // Guard: only valid when currentId >= 0. Negative-ID rows (call entries without
    // childEndId) would cause `childEnd >= negativeId` to be trivially true for any
    // positive childEnd, falsely matching grandparent or unrelated frames.
    // Those rows fall through to the depth-based fallback below.
    if (currentId >= 0) {
      for (let i = currentIndex - 1; i >= 0; i--) {
        const row = dataSource![i] as any;
        const childEnd = row.childEndId;
        if (childEnd !== undefined && childEnd >= currentId && (row.isInternalCall || row.entryMeta?.callType)) {
          // Found the parent call — navigate to the first row AFTER its childEndId.
          // Start from currentIndex + 1 (all rows before current are inside the body).
          if (await findRowAfterChildEnd(currentIndex + 1, childEnd)) return;
          return;
        }
      }
    }

    // Fallback: depth-based scan (for non-trace or rows without childEndId)
    const currentDepth = (currentRow as any).visualDepth ?? (currentRow as any).depth ?? 0;
    if (currentDepth === 0) {
      return;
    }
    for (let i = currentIndex + 1; i < dataSource!.length; i++) {
      const row = dataSource![i];
      const targetDepth = (row as any).visualDepth ?? (row as any).depth ?? 0;
      if (targetDepth < currentDepth) {
        await navigateTo(row);
        return;
      }
    }
  }, [session, currentSnapshotId, snapshotList, sessionInvalid, goToSnapshot, goToSnapshotFromTrace, goToSnapshotInternal]);

  const stepOver = useCallback(async () => {
    if (!session || currentSnapshotId === null) return;
    if (sessionInvalid) return;

    const traceRows = traceRowsRef.current;
    // Prefer traceRows but only if they contain the current snapshot.
    let useTraceRows = traceRows && traceRows.length > 0;
    let currentIndex: number = -1;
    let dataSource: Array<{ id: number; depth?: number; visualDepth?: number }>;

    if (useTraceRows) {
      currentIndex = traceRows.findIndex((r: any) => r.id === currentSnapshotId);
      if (currentIndex === -1) {
        useTraceRows = false;
      } else {
        dataSource = traceRows;
      }
    }

    if (!useTraceRows) {
      dataSource = snapshotList;
      currentIndex = snapshotList.findIndex(s => s.id === currentSnapshotId);
    }

    if (currentIndex === -1) {
      console.warn('[stepOver] Current snapshot not found:', currentSnapshotId);
      return;
    }

    const currentRow = dataSource![currentIndex] as any;

    const navigateTo = async (row: any) => {
      if (useTraceRows) {
        goToSnapshotFromTrace(buildSnapshotItem(row), traceRows);
      } else {
        // Desync fallback: check if target exists in traceRows before calling
        // goToSnapshotFromTrace (which no-ops if id not found).
        const currentTraceRows = traceRowsRef.current;
        const targetInTraceRows = currentTraceRows?.find((r: any) => r.id === row.id);
        if (targetInTraceRows) {
          goToSnapshotFromTrace(buildSnapshotItem(targetInTraceRows), currentTraceRows);
        } else if (session && row.id >= 0) {
          await goToSnapshotInternal(session.sessionId, row.id);
        }
      }
    };

    // Primary strategy: if current row is a call frame with childEndId, skip the
    // entire function body by finding the first row after childEndId.
    // Guard: only apply to actual call frames (internal calls or external entries)
    // to prevent over-skipping on non-call rows that may have childEndId from
    // other code paths (e.g., TraceVaultService history recomputation).
    const childEnd = currentRow.childEndId;
    const isCallFrame = currentRow.isInternalCall || currentRow.entryMeta?.callType;
    if (childEnd !== undefined && isCallFrame) {
      for (let i = currentIndex + 1; i < dataSource!.length; i++) {
        const row = dataSource![i] as any;
        if (row.id < 0) {
          // Negative-ID entry row: use firstSnapshotId to check if past child range
          if (row.firstSnapshotId !== undefined && row.firstSnapshotId > childEnd) {
            await navigateTo(row);
            return;
          }
        } else if (row.id > childEnd) {
          await navigateTo(row);
          return;
        }
      }
      // No row after childEndId — we're at the end of the trace
      return;
    }

    // Fallback: depth-based scan for rows without childEndId (e.g., opcodes)
    const currentDepth = currentRow.visualDepth ?? currentRow.depth ?? 0;
    for (let i = currentIndex + 1; i < dataSource!.length; i++) {
      const row = dataSource![i];
      const targetDepth = (row as any).visualDepth ?? (row as any).depth ?? 0;
      if (targetDepth <= currentDepth) {
        await navigateTo(row);
        return;
      }
    }

    if (currentIndex < dataSource!.length - 1) {
      await navigateTo(dataSource![currentIndex + 1]);
    }
  }, [session, currentSnapshotId, snapshotList, sessionInvalid, goToSnapshot, goToSnapshotFromTrace, goToSnapshotInternal]);

  const continueToBreakpoint = useCallback(async (direction: 'forward' | 'backward') => {
    if (!session || currentSnapshotId === null || breakpoints.length === 0) return;
    if (sessionInvalid) return;

    const response = await debugBridgeService.getBreakpointHits({
      sessionId: session.sessionId,
      breakpoints: breakpoints
        .filter(bp => bp.enabled)
        .map(bp => ({
          location: bp.location,
          condition: bp.condition,
        })),
    });

    const sortedHits = response.hits.sort((a, b) => a - b);

    if (direction === 'forward') {
      const nextHit = sortedHits.find(id => id > currentSnapshotId);
      if (nextHit !== undefined) {
        await goToSnapshot(nextHit);
      }
    } else {
      const prevHit = [...sortedHits].reverse().find(id => id < currentSnapshotId);
      if (prevHit !== undefined) {
        await goToSnapshot(prevHit);
      }
    }
  }, [session, currentSnapshotId, breakpoints, goToSnapshot, sessionInvalid]);

  return {
    goToSnapshot,
    stepNext,
    stepPrev,
    stepNextCall,
    stepPrevCall,
    stepUp,
    stepOver,
    continueToBreakpoint,
  };
}
