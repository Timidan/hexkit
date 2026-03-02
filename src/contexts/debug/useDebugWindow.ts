/**
 * useDebugWindow - Debug window management hook
 *
 * Handles opening/closing the debug window, navigating to specific
 * snapshots or revert points.
 */

import { useCallback, useRef } from 'react';
import { debugBridgeService } from '../../services/DebugBridgeService';
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
      if (session.sessionId.startsWith('trace-') && snapshotList.length > 0) {
        goToSnapshotFromTrace(snapshotList[0], traceRowsRef.current);
      } else if (!session.sessionId.startsWith('trace-')) {
        goToSnapshotInternal(session.sessionId, 0);
      }
    }
  }, [session, currentSnapshotId, snapshotList, goToSnapshotFromTrace, goToSnapshotInternal]);

  const openDebugAtSnapshot = useCallback(async (snapshotId: number) => {
    setIsDebugging(true);
    if (!session) return;

    if (session.sessionId.startsWith('trace-')) {
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

    const isTraceBased = session.sessionId.startsWith('trace-');

    // Search the snapshot list we already have in memory
    let revertSnapshotId: number | null = null;
    for (let i = snapshotList.length - 1; i >= 0; i--) {
      const snap = snapshotList[i];
      if (snap.type === 'opcode' && snap.opcodeName === 'REVERT') {
        revertSnapshotId = snap.id;
        break;
      }
    }

    // If not found and more snapshots exist, fetch directly from the bridge
    // (avoids stale closure issue with loadSnapshotBatch + scanning snapshotList)
    if (!isTraceBased && revertSnapshotId === null) {
      // Fetch last 100 snapshots where REVERT is most likely to be
      const startId = Math.max(0, session.totalSnapshots - 100);
      const response = await debugBridgeService.getSnapshotBatch({
        sessionId: session.sessionId,
        startId,
        count: Math.min(100, session.totalSnapshots),
      });

      for (let i = response.snapshots.length - 1; i >= 0; i--) {
        const snap = response.snapshots[i];
        if (snap.type === 'opcode' && snap.opcodeName === 'REVERT') {
          revertSnapshotId = snap.id;
          break;
        }
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
