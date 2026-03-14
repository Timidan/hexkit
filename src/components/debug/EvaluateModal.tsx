/**
 * Evaluate Expression Modal
 *
 * A modal dialog for evaluating Solidity expressions during debugging.
 * Modal for evaluating Solidity expressions during debug sessions.
 */

import React, { Suspense, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Loader2, AlertCircle, Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useDebug } from '../../contexts/DebugContext';
import { useSimulation } from '../../contexts/SimulationContext';
import { useNetworkConfig } from '../../contexts/NetworkConfigContext';
import { getChainById } from '../../utils/chains';
import { extractInlineArtifacts } from '../../utils/debugArtifacts';
import type { SolValue, DebugVariable } from '../../types/debug';
import { cn } from '../../lib/utils';
import LoadingSpinner from '../shared/LoadingSpinner';
import type { ComplexValueNode } from '../../utils/complexValueBuilder';

const ComplexValueViewer = React.lazy(() => import('../ui/ComplexValueViewer'));

interface EvaluateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface EvalResult {
  type: 'success' | 'error' | 'pending';
  value?: SolValue;
  error?: string;
  note?: string;
}

const LIVE_SESSION_BOOTSTRAP_TIMEOUT_MS = 120000;
const EVALUATION_TIMEOUT_MS = 15000;

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Check if a result has unread fields that need storage access
 */
function hasUnreadFields(value: SolValue | DebugVariable): boolean {
  if (value.value === 'unread') return true;
  if (value.children) {
    return value.children.some(child => hasUnreadFields(child));
  }
  return false;
}

/**
 * Convert a SolValue/DebugVariable to ComplexValueNode format for the tree viewer
 */
function solValueToNode(value: SolValue | DebugVariable, label: string): ComplexValueNode {
  // Check if this is an array type
  const isArray = value.type?.includes('[]') || value.type?.includes('[');

  const children = value.children?.map((child, index) =>
    solValueToNode(child, child.name || `[${index}]`)
  );

  // Determine if this is a struct/object that should show field count
  const hasChildren = children && children.length > 0;

  // For arrays, show the count
  let displayValue: string | undefined;
  if (isArray) {
    const count = children?.length ?? 0;
    displayValue = `[${count}]`;
  } else {
    displayValue = hasChildren ? undefined : value.value;
  }

  return {
    label,
    type: value.type,
    value: displayValue,
    raw: value.rawValue || value.value,
    children,
  };
}

/**
 * Build the root node wrapped in a "result" structure
 */
function buildResultNode(value: SolValue, expressionName: string): ComplexValueNode {
  const resultChild = solValueToNode(value, 'result');

  // Wrap in a root object with { "result": { ... } } structure
  return {
    label: expressionName || 'Evaluation',
    type: 'object',
    children: [resultChild],
  };
}

export const EvaluateModal: React.FC<EvaluateModalProps> = React.memo(({
  open,
  onOpenChange,
}) => {
  const {
    evaluateExpression,
    session,
    startSession,
    connectToSession,
    debugPrepState,
    currentSnapshotId,
  } = useDebug();
  const { currentSimulation, contractContext, simulationId } = useSimulation();
  const { resolveRpcUrl } = useNetworkConfig();
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState<EvalResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isStartingLive, setIsStartingLive] = useState(false);
  const [startLiveError, setStartLiveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check if in trace mode (no eval support).
  // Use `=== true` so that a null session doesn't default to trace mode —
  // that case is handled by `!session` in shouldEnsureLiveSession instead.
  const isTraceMode = session?.sessionId?.startsWith('trace-') === true;
  const chainId = currentSimulation?.chainId || contractContext?.networkId || 1;
  const chain = getChainById(chainId);
  const rpcUrl = chain ? resolveRpcUrl(chain.id, chain.rpcUrl).url : null;
  const liveFrom =
    currentSimulation?.from ||
    contractContext?.fromAddress ||
    '0x0000000000000000000000000000000000000000';
  const liveTo = currentSimulation?.to || contractContext?.address || '';
  const liveData = currentSimulation?.data || contractContext?.calldata || '0x';
  const liveValue = currentSimulation?.value || contractContext?.ethValue || '0x0';
  const liveBlockTag =
    currentSimulation?.blockNumber !== undefined && currentSimulation?.blockNumber !== null
      ? String(currentSimulation.blockNumber)
      : contractContext?.blockOverride || 'latest';
  const hasLiveSessionData =
    !!rpcUrl &&
    !!liveFrom &&
    !!liveTo &&
    !!liveData;
  const expectedSimulationId =
    simulationId || (currentSimulation as any)?.simulationId || null;
  const prepStateForCurrentSimulation = useMemo(() => {
    if (!debugPrepState) return null;
    if (!expectedSimulationId) return debugPrepState;
    return debugPrepState.simulationId === expectedSimulationId ? debugPrepState : null;
  }, [debugPrepState, expectedSimulationId]);
  const isPrepInFlightForCurrentSimulation =
    prepStateForCurrentSimulation?.status === 'queued' ||
    prepStateForCurrentSimulation?.status === 'preparing';
  const initialLiveSnapshotId =
    typeof currentSnapshotId === 'number' &&
    Number.isInteger(currentSnapshotId) &&
    currentSnapshotId >= 0
      ? currentSnapshotId
      : null;

  // Focus input when modal opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Clear result when expression changes
  useEffect(() => {
    setResult(null);
  }, [expression]);

  const ensureLiveSession = useCallback(async (force = false): Promise<boolean> => {
    const currentDebugSession = currentSimulation?.debugSession;
    const prepSessionId =
      prepStateForCurrentSimulation?.status === 'ready' &&
      prepStateForCurrentSimulation.sessionId
        ? prepStateForCurrentSimulation.sessionId
        : null;
    const prepFailureMessage =
      prepStateForCurrentSimulation?.status === 'failed'
        ? (prepStateForCurrentSimulation.error || prepStateForCurrentSimulation.message || 'Debug preparation failed')
        : null;
    const targetSessionId =
      currentDebugSession?.sessionId || prepSessionId || null;
    const hasValidCurrentLiveSession =
      !!session &&
      !session.sessionId.startsWith('trace-') &&
      (!targetSessionId || session.sessionId === targetSessionId) &&
      (!expectedSimulationId || session.simulationId === expectedSimulationId);

    if (!force && hasValidCurrentLiveSession) {
      return true;
    }

    if (prepFailureMessage && !targetSessionId) {
      const message =
        `Debug preparation failed for this simulation: ${prepFailureMessage}. ` +
        'Re-simulate with Debug enabled after fixing backend instrumentation errors.';
      setStartLiveError(message);
      setResult({ type: 'error', error: message });
      return false;
    }

    if (!force && isPrepInFlightForCurrentSimulation) {
      const prepMessage =
        prepStateForCurrentSimulation?.message ||
        'Debug session is still preparing in the background.';
      setResult({
        type: 'pending',
        note: `${prepMessage} Evaluate becomes available once preparation finishes.`,
      });
      return false;
    }

    if (!force && targetSessionId) {
      try {
        await withTimeout(
          connectToSession({
            sessionId: targetSessionId,
            rpcPort: currentDebugSession?.rpcPort || 0,
            snapshotCount: currentDebugSession?.snapshotCount ?? prepStateForCurrentSimulation?.snapshotCount ?? 0,
            chainId,
            simulationId: expectedSimulationId || `debug-${Date.now()}`,
          }, {
            hydrate: 'minimal',
            initialSnapshotId: initialLiveSnapshotId,
          }),
          LIVE_SESSION_BOOTSTRAP_TIMEOUT_MS,
          `Connecting to existing live debug session timed out after ${Math.round(
            LIVE_SESSION_BOOTSTRAP_TIMEOUT_MS / 1000
          )}s.`
        );
        return true;
      } catch {
        // Fall back to starting a fresh live session below.
      }
    }

    if (!hasLiveSessionData || !rpcUrl) {
      const message = 'Missing RPC or transaction data to start a live debug session.';
      setStartLiveError(message);
      setResult({ type: 'error', error: message });
      return false;
    }

    setIsStartingLive(true);
    setStartLiveError(null);
    try {
      const inlineArtifacts = extractInlineArtifacts(currentSimulation?.rawTrace);
      await withTimeout(
        startSession({
          simulationId: simulationId || `debug-${Date.now()}`,
          rpcUrl,
          chainId,
          traceDetailHandleId: currentSimulation?.traceDetailHandle?.id,
          blockTag: liveBlockTag,
          transaction: {
            from: liveFrom,
            to: liveTo,
            data: liveData,
            value: liveValue,
          },
          ...(inlineArtifacts ? { artifacts: inlineArtifacts } : {}),
        }, {
          hydrate: 'minimal',
          initialSnapshotId: initialLiveSnapshotId,
        }),
        LIVE_SESSION_BOOTSTRAP_TIMEOUT_MS,
        `Live debug session startup timed out after ${Math.round(
          LIVE_SESSION_BOOTSTRAP_TIMEOUT_MS / 1000
        )}s. Retry Evaluate once the simulation is fully ready.`
      );
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start live debug session';
      setStartLiveError(message);
      setResult({ type: 'error', error: message });
      return false;
    } finally {
      setIsStartingLive(false);
    }
  }, [
    hasLiveSessionData,
    rpcUrl,
    startSession,
    simulationId,
    chainId,
    liveBlockTag,
    liveData,
    liveFrom,
    liveTo,
    liveValue,
    connectToSession,
    currentSimulation,
    session,
    expectedSimulationId,
    prepStateForCurrentSimulation,
    isPrepInFlightForCurrentSimulation,
    initialLiveSnapshotId,
  ]);

  const handleEvaluate = useCallback(async () => {
    const expressionText = expression.trim();
    if (!expressionText) return;

    // Fast-fail: debug mode was explicitly disabled AND no session exists
    if ((contractContext as any)?.debugEnabled === false && !session) {
      setResult({
        type: 'error',
        error: 'Expression evaluation is only available when Debug mode is enabled during simulation. Re-simulate with Debug enabled to use this feature.',
      });
      return;
    }

    const shouldEnsureLiveSession =
      isTraceMode ||
      !session ||
      !!(
        currentSimulation?.debugSession?.sessionId &&
        session?.sessionId !== currentSimulation.debugSession.sessionId
      );

    if (shouldEnsureLiveSession) {
      const ready = await ensureLiveSession();
      if (!ready) return;
    }

    setIsEvaluating(true);
    setResult({ type: 'pending' });

    try {
      // Try evaluation first - trace mode can derive structs from trace data
      let evalResult = await withTimeout(
        evaluateExpression(expressionText),
        EVALUATION_TIMEOUT_MS,
        `Expression evaluation timed out after ${Math.round(
          EVALUATION_TIMEOUT_MS / 1000
        )}s. Retry Evaluate or re-open debugger to refresh session state.`
      );

      const evalErrorLower = evalResult.error?.toLowerCase() ?? '';
      const needsLiveSession =
        !evalResult.success &&
        (evalResult.error?.includes('source-level snapshot') ||
          evalResult.error?.includes('Debug session expired') ||
          evalResult.error?.includes('No active debug session') ||
          evalResult.error?.includes('live debug session') ||
          evalErrorLower.includes('opcode snapshots') ||
          evalResult.error?.toLowerCase().includes('session not found') ||
          evalResult.error?.includes('initializing'));

      // Only try to start a live session if evaluation explicitly requires it
      if (needsLiveSession) {
        const restarted = await ensureLiveSession(true);
        if (restarted) {
          evalResult = await withTimeout(
            evaluateExpression(expressionText),
            EVALUATION_TIMEOUT_MS,
            `Expression evaluation timed out after ${Math.round(
              EVALUATION_TIMEOUT_MS / 1000
            )}s even after session restart. Retry Evaluate in a few seconds.`
          );
        }
      }

      // Check if result has unread fields that need storage access
      // If so, start a live session to fill them properly
      if (evalResult.success && evalResult.value && hasUnreadFields(evalResult.value)) {
        // debugLog: Result has unread fields, starting live session to fill them
        const restarted = await ensureLiveSession();
        if (restarted) {
          // Re-evaluate with live session - this will call fillUnreadFieldsFromStorage
          const liveResult = await withTimeout(
            evaluateExpression(expressionText),
            EVALUATION_TIMEOUT_MS,
            `Expression evaluation timed out while hydrating unread fields after ${Math.round(
              EVALUATION_TIMEOUT_MS / 1000
            )}s. Retry Evaluate.`
          );
          if (liveResult.success && liveResult.value) {
            evalResult = liveResult;
          }
        }
      }

      if (evalResult.success && evalResult.value) {
        setResult({
          type: 'success',
          value: evalResult.value,
          note: evalResult.note,
        });
      } else {
        setResult({
          type: 'error',
          error: evalResult.error || 'Evaluation failed',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Evaluation failed';
      setResult({
        type: 'error',
        error: message,
      });
    } finally {
      setIsEvaluating(false);
    }
  }, [
    expression,
    session,
    isTraceMode,
    ensureLiveSession,
    evaluateExpression,
    currentSimulation?.debugSession?.sessionId,
    contractContext,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEvaluate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] !max-w-[900px] sm:!max-w-[900px] z-[150] max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Evaluate</DialogTitle>
          <DialogDescription className="sr-only">
            Evaluate Solidity expressions at the current debug snapshot
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {/* Expression Input */}
          <div className="space-y-2 flex-shrink-0">
            <label className="text-sm font-medium">Expression</label>
            <Input
              ref={inputRef}
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter expression to evaluate"
              className="font-mono text-sm"
              disabled={isEvaluating || isStartingLive}
            />
          </div>

          {/* Result Section */}
          <div className="flex flex-col flex-1 min-h-0 space-y-2">
            <label className="text-sm font-medium flex-shrink-0">Result</label>
            <div
              className={cn(
                'rounded-lg border bg-muted/30 min-h-[180px] max-h-[45vh] overflow-auto',
                result?.type === 'error' && 'border-destructive/50'
              )}
            >
              <div className="p-4">
                  {isStartingLive ? (
                    <div className="text-sm text-muted-foreground space-y-2">
                      <p className="text-amber-500">Starting live debug session...</p>
                      <p>Evaluation will resume automatically once the session is ready.</p>
                    </div>
                  ) : result === null ? (
                    <div className="text-sm text-muted-foreground space-y-3">
                      <p>
                        Evaluate expressions during a debugging session to obtain
                        additional details about the program state or test various
                        scenarios like:
                      </p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>Evaluate local and global variables, including structs and enums</li>
                        <li>Evaluate state variables, including dynamic arrays and mappings</li>
                        <li>Evaluate complex expressions</li>
                        <li>Evaluate functions</li>
                      </ul>
                      <p className="text-xs mt-4 opacity-75">
                        All expressions are evaluated in the scope of the current trace point.
                      </p>
                    </div>
                  ) : result.type === 'pending' ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {result.note || 'Evaluating...'}
                    </div>
                  ) : result.type === 'error' ? (
                    <div className="space-y-2">
                      <div className="flex items-start gap-2 text-destructive">
                        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <div className="text-sm font-medium">Evaluation Error</div>
                      </div>
                      <pre className="text-sm text-destructive/80 whitespace-pre-wrap font-mono bg-destructive/10 rounded p-3">
                        {result.error}
                      </pre>
                    </div>
                  ) : (
                    <div className="eval-result-tree">
                      {result.note && (
                        <div className="flex items-center gap-1.5 text-xs text-amber-400/70 italic px-1 py-1">
                          <Info className="h-3 w-3 flex-shrink-0" />
                          {result.note}
                        </div>
                      )}
                      {result.value && (
                        <Suspense fallback={<LoadingSpinner size="sm" />}>
                          <ComplexValueViewer
                            node={buildResultNode(result.value, expression.trim())}
                            options={{
                              collapse: {
                                root: false,
                                depth: 3,
                                arrayItems: 10,
                                objectKeys: 12,
                              },
                              previewItems: 4,
                            }}
                            showControls={true}
                          />
                        </Suspense>
                      )}
                    </div>
                  )}
                </div>
            </div>
            {startLiveError && (
              <div className="text-xs text-red-400">{startLiveError}</div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-2 mt-4 flex-shrink-0 pt-2 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleEvaluate}
            disabled={!expression.trim() || isEvaluating || isStartingLive || isPrepInFlightForCurrentSimulation}
          >
            {isEvaluating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Evaluating...
              </>
            ) : isPrepInFlightForCurrentSimulation ? (
              'Preparing Debug...'
            ) : (
              'Evaluate'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});

EvaluateModal.displayName = 'EvaluateModal';

export default EvaluateModal;
