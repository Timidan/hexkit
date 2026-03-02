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

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const cancelDebugPrep = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    prepareIdRef.current = null;
    setPrepState(INITIAL_PREP_STATE);
  }, []);

  const startDebugPrep = useCallback(
    async (params: PrepareDebugRequest, callerSimulationId?: string) => {
      // Cancel any existing prep
      cancelDebugPrep();

      // Capture the simulationId this prep is for so consumers can detect stale state.
      // Prefer the caller-provided ID (from SimulationContext), fall back to debug session.
      const prepSimulationId = callerSimulationId || shared.session?.simulationId || 'debug-prep';

      setPrepState({
        ...INITIAL_PREP_STATE,
        status: 'queued',
        simulationId: prepSimulationId,
        message: 'Starting debug preparation...',
      });

      try {
        const { prepareId } = await debugBridgeService.prepareDebug(params);
        prepareIdRef.current = prepareId;

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
            setPrepState((prev) => ({
              ...prev,
              status: 'preparing',
              stage: data.stage,
              progressPct: data.progressPct,
              message: data.message,
            }));
          } catch {
            // Ignore parse errors
          }
        });

        es.addEventListener('ready', (event: MessageEvent) => {
          if (prepareIdRef.current !== prepareId) return;

          try {
            const data: PrepareReadyEvent = JSON.parse(event.data);
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

            // Auto-connect the debug session
            const chainId = params.chainId;
            const simulationId = prepSimulationId;

            sessionActions.connectToSession(
              {
                sessionId: data.sessionId,
                rpcPort: 0, // Port is managed by bridge, not needed for FE
                snapshotCount: data.snapshotCount,
                chainId,
                simulationId,
              },
              { hydrate: 'full' },
            ).catch((err) => {
              console.error('[useDebugPrep] auto-connect failed:', err);
            });
          } catch (err) {
            console.error('[useDebugPrep] failed to parse ready event:', err);
          }

          // Close EventSource
          es.close();
          eventSourceRef.current = null;
        });

        es.addEventListener('failed', (event: MessageEvent) => {
          if (prepareIdRef.current !== prepareId) return;

          try {
            const data: PrepareFailedEvent = JSON.parse(event.data);
            setPrepState((prev) => ({
              ...prev,
              status: 'failed',
              error: data.error,
              message: `Debug preparation failed: ${data.error}`,
            }));
          } catch {
            setPrepState((prev) => ({
              ...prev,
              status: 'failed',
              error: 'Unknown error during debug preparation',
            }));
          }

          es.close();
          eventSourceRef.current = null;
        });

        es.onerror = () => {
          if (prepareIdRef.current !== prepareId) return;

          // EventSource will auto-reconnect for transient errors.
          // Only mark as failed if the connection is truly dead.
          if (es.readyState === EventSource.CLOSED) {
            setPrepState((prev) => {
              // Don't overwrite terminal states
              if (prev.status === 'ready' || prev.status === 'failed') return prev;
              return {
                ...prev,
                status: 'failed',
                error: 'Lost connection to debug preparation stream',
              };
            });
            eventSourceRef.current = null;
          }
        };
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
    [cancelDebugPrep, shared.session, sessionActions],
  );

  return {
    debugPrepState: prepState,
    startDebugPrep,
    cancelDebugPrep,
  };
}
