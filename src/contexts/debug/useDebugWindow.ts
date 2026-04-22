/**
 * useDebugWindow - Debug window management hook
 *
 * Handles opening/closing the debug window, navigating to specific
 * snapshots or revert points.
 */

import { useCallback, useRef } from 'react';
import { debugBridgeService } from '../../services/DebugBridgeService';
import { isTraceSessionId } from './sessionRef';
import type { DebugSharedState, DebugWindowActions, DebugSessionActions } from './types';

export function useDebugWindow(
  state: DebugSharedState,
  sessionActions: DebugSessionActions
): DebugWindowActions {
  const {
    session,
    currentSnapshotId,
    snapshotList,
    setIsDebugging,
    traceRowsRef,
  } = state;

  const {
    goToSnapshotFromTrace,
    goToSnapshotInternal,
  } = sessionActions;
  const pendingSnapshotRef = useRef<number | null>(null);
  const processingSnapshotRef = useRef(false);

  const openDebugWindow = useCallback(() => {
    setIsDebugging(true);
    if (session && currentSnapshotId === null && session.totalSnapshots > 0) {
      if (isTraceSessionId(session.sessionId) && snapshotList.length > 0) {
        goToSnapshotFromTrace(snapshotList[0], traceRowsRef.current);
      } else if (!isTraceSessionId(session.sessionId)) {
        goToSnapshotInternal(session.sessionId, 0);
      }
    }
  }, [session, currentSnapshotId, snapshotList, goToSnapshotFromTrace, goToSnapshotInternal]);

  const openDebugAtSnapshot = useCallback(async (snapshotId: number) => {
    setIsDebugging(true);
    if (!session) return;

    if (isTraceSessionId(session.sessionId)) {
      const snapshotItem = snapshotList.find(s => s.id === snapshotId);
      if (snapshotItem) {
        goToSnapshotFromTrace(snapshotItem, traceRowsRef.current);
      }
    } else {
      // Coalesce rapid row clicks: while a navigation is in flight, keep only
      // the most recent target snapshot to avoid repeated cold-path loads.
      pendingSnapshotRef.current = snapshotId;
      if (processingSnapshotRef.current) return;

      processingSnapshotRef.current = true;
      try {
        while (pendingSnapshotRef.current !== null) {
          const nextSnapshotId = pendingSnapshotRef.current;
          pendingSnapshotRef.current = null;
          await goToSnapshotInternal(session.sessionId, nextSnapshotId);
        }
      } finally {
        processingSnapshotRef.current = false;
      }
    }
  }, [session, snapshotList, goToSnapshotFromTrace, goToSnapshotInternal]);

  const openDebugAtRevert = useCallback(async () => {
    setIsDebugging(true);
    if (!session) return;

    const isTraceBased = isTraceSessionId(session.sessionId);

    // Search the snapshot list we already have in memory
    let revertSnapshotId: number | null = null;
    for (let i = snapshotList.length - 1; i >= 0; i--) {
      const snap = snapshotList[i];
      if (snap.type === 'opcode' && snap.opcodeName === 'REVERT') {
        revertSnapshotId = snap.id;
        break;
      }
    }

    // If not found, scan the bridge backwards in batches until REVERT is located
    // or the cap is reached. REVERT is usually near the end but can be buried under
    // post-revert cleanup opcodes on large sessions.
    if (!isTraceBased && revertSnapshotId === null) {
      const BATCH = 200;
      const MAX_SCAN = Math.min(session.totalSnapshots, 2000);
      let scanned = 0;
      while (revertSnapshotId === null && scanned < MAX_SCAN) {
        const startId = Math.max(0, session.totalSnapshots - scanned - BATCH);
        const count = Math.min(BATCH, session.totalSnapshots - startId);
        if (count <= 0) break;
        const response = await debugBridgeService.getSnapshotBatch({
          sessionId: session.sessionId,
          startId,
          count,
        });
        for (let i = response.snapshots.length - 1; i >= 0; i--) {
          const snap = response.snapshots[i];
          if (snap.type === 'opcode' && snap.opcodeName === 'REVERT') {
            revertSnapshotId = snap.id;
            break;
          }
        }
        if (startId === 0) break;
        scanned += BATCH;
      }
    }

    if (isTraceBased) {
      const targetId = revertSnapshotId ?? (snapshotList.length > 0 ? snapshotList[snapshotList.length - 1].id : null);
      if (targetId !== null) {
        const snapshotItem = snapshotList.find(s => s.id === targetId);
        if (snapshotItem) {
          goToSnapshotFromTrace(snapshotItem, traceRowsRef.current);
        }
      }
    } else {
      if (revertSnapshotId !== null) {
        await goToSnapshotInternal(session.sessionId, revertSnapshotId);
      } else if (session.totalSnapshots > 0) {
        await goToSnapshotInternal(session.sessionId, session.totalSnapshots - 1);
      }
    }
  }, [session, snapshotList, goToSnapshotFromTrace, goToSnapshotInternal]);

  const closeDebugWindow = useCallback(() => {
    setIsDebugging(false);
  }, []);

  return {
    openDebugWindow,
    openDebugAtSnapshot,
    openDebugAtRevert,
    closeDebugWindow,
  };
}
