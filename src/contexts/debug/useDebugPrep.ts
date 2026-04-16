/**
 * useDebugPrep — Manages async debug preparation lifecycle with SSE progress.
 *
 * Starts background debug preparation via the bridge, connects an EventSource
 * for real-time stage updates, and auto-connects the debug session when ready.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { debugBridgeService } from '../../services/DebugBridgeService';
import type {
  DebugPrepState,
  PrepareDebugRequest,
  PrepareStageEvent,
  PrepareReadyEvent,
  PrepareFailedEvent,
  PrepareStatusResponse,
} from '../../types/debug';
import type { DebugSharedState, DebugSessionActions } from './types';

const INITIAL_PREP_STATE: DebugPrepState = {
  prepareId: null,
  status: 'idle',
  stage: null,
  progressPct: 0,
  message: null,
  sessionId: null,
  simulationId: null,
  snapshotCount: null,
  sourceFiles: null,
  error: null,
};

const PREP_STATUS_POLL_MS = 1500;

export interface DebugPrepActions {
  debugPrepState: DebugPrepState;
  startDebugPrep: (params: PrepareDebugRequest, simulationId?: string) => void;
  cancelDebugPrep: () => void;
}

export function useDebugPrep(
  shared: DebugSharedState,
  sessionActions: DebugSessionActions,
): DebugPrepActions {
  const [prepState, setPrepState] = useState<DebugPrepState>(INITIAL_PREP_STATE);
  const eventSourceRef = useRef<EventSource | null>(null);
  const prepareIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const readyHandledForPrepareRef = useRef<string | null>(null);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (pollTimerRef.current !== null) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  const stopPrepWatchers = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const cancelDebugPrep = useCallback(() => {
    stopPrepWatchers();
    prepareIdRef.current = null;
    readyHandledForPrepareRef.current = null;
    setPrepState(INITIAL_PREP_STATE);
  }, [stopPrepWatchers]);

  const startDebugPrep = useCallback(
    async (params: PrepareDebugRequest, callerSimulationId?: string) => {
      // Cancel any existing prep
      cancelDebugPrep();

      // Capture the simulationId this prep is for so consumers can detect stale state.
      // Prefer the caller-provided ID (from SimulationContext), fall back to debug session.
      const prepSimulationId = callerSimulationId || shared.session?.simulationId || 'debug-prep';
      const initialSnapshotId =
        typeof shared.currentSnapshotId === 'number' &&
        Number.isInteger(shared.currentSnapshotId) &&
        shared.currentSnapshotId >= 0
          ? shared.currentSnapshotId
          : null;

      const handleReady = (prepareId: string, data: PrepareReadyEvent) => {
        if (prepareIdRef.current !== prepareId) return;

        setPrepState((prev) => ({
          ...prev,
          status: 'ready',
          stage: 'ready',
          progressPct: 100,
          message: 'Debug session ready',
          sessionId: data.sessionId,
          snapshotCount: data.snapshotCount,
          sourceFiles: data.sourceFiles,
        }));

        if (readyHandledForPrepareRef.current === prepareId) {
          stopPrepWatchers();
          return;
        }

        readyHandledForPrepareRef.current = prepareId;
        stopPrepWatchers();

        sessionActions.connectToSession(
          {
            sessionId: data.sessionId,
            rpcPort: 0,
            snapshotCount: data.snapshotCount,
            chainId: params.chainId,
            simulationId: prepSimulationId,
          },
          {
            hydrate: 'full',
            initialSnapshotId,
          },
        ).catch((err) => {
          console.error('[useDebugPrep] auto-connect failed:', err);
          if (prepareIdRef.current === prepareId) {
            setPrepState((prev) => ({
              ...prev,
              error: 'Live session was evicted before connection completed. Click Open Debugger to use trace-based debugging.',
            }));
          }
        });
      };

      const handleFailed = (prepareId: string, error: string) => {
        if (prepareIdRef.current !== prepareId) return;

        setPrepState((prev) => ({
          ...prev,
          status: 'failed',
          error,
          message: `Debug preparation failed: ${error}`,
        }));

        stopPrepWatchers();
      };

      const handleStatusUpdate = (prepareId: string, data: PrepareStageEvent) => {
        if (prepareIdRef.current !== prepareId) return;

        setPrepState((prev) => ({
          ...prev,
          status: 'preparing',
          stage: data.stage,
          progressPct: data.progressPct,
          message: data.message,
        }));
      };

      const applyPolledStatus = (prepareId: string, status: PrepareStatusResponse) => {
        if (prepareIdRef.current !== prepareId) return;

        if (status.status === 'ready' && status.sessionId) {
          handleReady(prepareId, {
            sessionId: status.sessionId,
            snapshotCount: status.snapshotCount || 0,
            sourceFiles: status.sourceFiles || {},
          });
          return;
        }

        if (status.status === 'failed') {
          handleFailed(
            prepareId,
            status.error || status.message || 'Unknown error during debug preparation',
          );
          return;
        }

        if (status.status === 'queued' || status.status === 'preparing') {
          setPrepState((prev) => ({
            ...prev,
            status: status.status,
            stage: status.stage,
            progressPct: status.progressPct,
            message: status.message,
          }));
        }
      };

      const pollPrepareStatus = async (prepareId: string) => {
        if (prepareIdRef.current !== prepareId) return;

        try {
          const status = await debugBridgeService.getPrepareStatus(prepareId);
          applyPolledStatus(prepareId, status);
          if (
            prepareIdRef.current !== prepareId ||
            status.status === 'ready' ||
            status.status === 'failed'
          ) {
            return;
          }
        } catch (err) {
          if (prepareIdRef.current !== prepareId) return;
          console.warn('[useDebugPrep] prepare status poll failed:', err);
        }

        if (prepareIdRef.current !== prepareId) return;
        pollTimerRef.current = window.setTimeout(() => {
          void pollPrepareStatus(prepareId);
        }, PREP_STATUS_POLL_MS);
      };

      setPrepState({
        ...INITIAL_PREP_STATE,
        status: 'queued',
        simulationId: prepSimulationId,
        message: 'Starting debug preparation...',
      });

      try {
        const { prepareId } = await debugBridgeService.prepareDebug(params);
        prepareIdRef.current = prepareId;
        readyHandledForPrepareRef.current = null;

        setPrepState((prev) => ({
          ...prev,
          prepareId,
          status: 'preparing',
          message: 'Connecting to progress stream...',
        }));

        // Connect SSE for real-time progress
        const es = debugBridgeService.connectPrepareEvents(prepareId);
        eventSourceRef.current = es;

        es.addEventListener('stage', (event: MessageEvent) => {
          // Only process events for the current prep
          if (prepareIdRef.current !== prepareId) return;

          try {
            const data: PrepareStageEvent = JSON.parse(event.data);
            handleStatusUpdate(prepareId, data);
          } catch {
            // Ignore parse errors
          }
        });

        es.addEventListener('ready', (event: MessageEvent) => {
          if (prepareIdRef.current !== prepareId) return;

          try {
            const data: PrepareReadyEvent = JSON.parse(event.data);
            handleReady(prepareId, data);
          } catch (err) {
            console.error('[useDebugPrep] failed to parse ready event:', err);
          }
        });

        es.addEventListener('failed', (event: MessageEvent) => {
          if (prepareIdRef.current !== prepareId) return;

          try {
            const data: PrepareFailedEvent = JSON.parse(event.data);
            handleFailed(prepareId, data.error);
          } catch {
            handleFailed(prepareId, 'Unknown error during debug preparation');
          }
        });

        es.onerror = () => {
          if (prepareIdRef.current !== prepareId) return;
          // Keep polling authoritative status even if SSE reconnects poorly.
          if (es.readyState === EventSource.CLOSED) {
            eventSourceRef.current = null;
          }
        };

        void pollPrepareStatus(prepareId);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to start debug preparation';
        setPrepState((prev) => ({
          ...prev,
          status: 'failed',
          error: errorMessage,
          message: errorMessage,
        }));
      }
    },
    [cancelDebugPrep, shared.currentSnapshotId, shared.session, sessionActions],
  );

  return {
    debugPrepState: prepState,
    startDebugPrep,
    cancelDebugPrep,
  };
}
