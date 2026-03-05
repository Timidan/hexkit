/**
 * Debug Window Component
 *
 * Full-page overlay for the EDB debugger with IDE-style layout.
 * Layout: Execution Tree (left) | Source Code (center) | State Panel (right)
 * Bottom toolbar for navigation controls.
 */

import React, { useEffect, useMemo } from 'react';
import { X, Bug, Square } from 'lucide-react';
import { Button } from '../ui/button';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '../ui/resizable';
import { useDebug, DebugProvider } from '../../contexts/DebugContext';
import { useSimulation } from '../../contexts/SimulationContext';
import DebugToolbar from './DebugToolbar';
import SourceViewPanel from './SourceViewPanel';
import ExecutionTree from './ExecutionTree';
import DebugStatePanel from './DebugStatePanel';
import { StackTracePanel } from './StackTracePanel';
import UniversalSearchBar from '../UniversalSearchBar';
import { decodeTrace, type DecodedTraceRow } from '../../utils/traceDecoder';
import './DebugWindow.css';

interface DebugWindowProps {
  className?: string;
}

type TraceArg = { name?: string; value?: unknown };

function mapArgsToRecord(args?: TraceArg[] | null): Record<string, unknown> | undefined {
  if (!args || args.length === 0) return undefined;
  const entries = args.map((arg, index) => {
    const key = arg?.name && arg.name.trim().length > 0 ? arg.name : `arg${index}`;
    return [key, arg?.value ?? null] as const;
  });
  return Object.fromEntries(entries);
}

/**
 * Inner debug window that uses the debug context
 */
const DebugWindowInner: React.FC<DebugWindowProps> = React.memo(({ className }) => {
  const {
    session,
    isDebugging,
    isLoading,
    error,
    closeDebugWindow,
    currentSnapshot,
    currentSnapshotId,
    totalSnapshots,
    snapshotList,
    stepNext,
    stepPrev,
    setCurrentExecutingAddress,
    setCurrentFile,
    setCurrentLine,
    setEvalHint,
  } = useDebug();
  const { contractContext, currentSimulation, decodedTraceRows } = useSimulation();

  // Compute position in snapshot list for display (1-indexed)
  const currentPosition = useMemo(() => {
    if (currentSnapshotId === null) return 0;
    const index = snapshotList.findIndex(s => s.id === currentSnapshotId);
    return index >= 0 ? index + 1 : 0;
  }, [currentSnapshotId, snapshotList]);

  // Use decoded trace rows from context
  // Falls back to decoding locally only if context doesn't have rows
  const decodedTrace = useMemo(() => {
    // Prefer rows from context (already filtered by traceDecoder)
    if (decodedTraceRows && decodedTraceRows.length > 0) {
      return { rows: decodedTraceRows };
    }
    // Fallback: decode locally if context doesn't have rows yet
    if (!currentSimulation?.rawTrace) return null;
    try {
      return decodeTrace(currentSimulation.rawTrace as Parameters<typeof decodeTrace>[0]);
    } catch {
      return null;
    }
  }, [decodedTraceRows, currentSimulation]);

  const currentTraceRow = useMemo<DecodedTraceRow | null>(() => {
    if (currentSnapshotId === null || !decodedTrace?.rows) return null;
    return decodedTrace.rows.find((row) => row.id === currentSnapshotId) ?? null;
  }, [currentSnapshotId, decodedTrace?.rows]);

  const currentTraceId = useMemo(() => {
    const frameId = currentSnapshot?.frameId;
    if (!frameId) return null;
    const match = frameId.match(/^\s*(\d+)/);
    if (!match) return null;
    const value = Number.parseInt(match[1], 10);
    return Number.isFinite(value) ? value : null;
  }, [currentSnapshot?.frameId]);

  const currentCallFrameRow = useMemo<DecodedTraceRow | null>(() => {
    if (!decodedTrace?.rows || currentTraceId === null) return null;
    return (
      decodedTrace.rows.find((row) => row.traceId === currentTraceId && row.entryMeta) ?? null
    );
  }, [decodedTrace?.rows, currentTraceId]);

  const currentInternalParentRow = useMemo<DecodedTraceRow | null>(() => {
    if (!decodedTrace?.rows || !currentTraceRow?.internalParentId) return null;
    return decodedTrace.rows.find((row) => row.id === currentTraceRow.internalParentId) ?? null;
  }, [decodedTrace?.rows, currentTraceRow?.internalParentId]);

  const decodedInput = useMemo<Record<string, unknown> | undefined>(() => {
    if (!currentTraceRow && !currentCallFrameRow) return undefined;
    if (currentTraceRow?.jumpArgsDecoded?.length) {
      return mapArgsToRecord(currentTraceRow.jumpArgsDecoded);
    }
    const entryArgs = mapArgsToRecord(currentCallFrameRow?.entryMeta?.args);
    if (entryArgs) {
      return entryArgs;
    }
    const rawInput = currentCallFrameRow?.input;
    if (!rawInput || rawInput === '0x') {
      return undefined;
    }
    return { raw: rawInput };
  }, [currentTraceRow, currentCallFrameRow]);

  const decodedOutput = useMemo<Record<string, unknown> | undefined>(() => {
    if (currentTraceRow?.jumpResult !== undefined && currentTraceRow?.jumpResult !== null) {
      const output: Record<string, unknown> = { result: currentTraceRow.jumpResult };
      if (currentTraceRow.jumpResultSource) {
        output.source = currentTraceRow.jumpResultSource;
      }
      return output;
    }

    const callOutput = currentCallFrameRow?.output;
    if (!callOutput || callOutput === '0x') {
      return undefined;
    }
    return { result: callOutput };
  }, [currentTraceRow, currentCallFrameRow]);

  const simulationContext = useMemo(() => {
    return {
      from: contractContext?.fromAddress || currentSimulation?.from || undefined,
      to: contractContext?.address || currentSimulation?.to || undefined,
      value: contractContext?.ethValue || currentSimulation?.value || undefined,
      calldata: contractContext?.calldata || currentSimulation?.data || undefined,
      decodedInput,
      decodedOutput,
    };
  }, [contractContext, currentSimulation, decodedInput, decodedOutput]);

  // Update current executing address and source file when snapshot changes
  // This is critical for Diamond proxy support - shows which facet's source to display
  useEffect(() => {
    if (currentSnapshotId === null || !decodedTrace?.rows) {
      setCurrentExecutingAddress(null);
      setEvalHint({ filePath: null, line: null, functionName: null });
      return;
    }

    // Find the trace row for the current snapshot
    const row = decodedTrace.rows.find(r => r.id === currentSnapshotId);
    if (!row) return;

    // Update executing address
    if (row.entryMeta?.codeAddress) {
      setCurrentExecutingAddress(row.entryMeta.codeAddress.toLowerCase());
    } else if (row.entryMeta?.target) {
      setCurrentExecutingAddress(row.entryMeta.target.toLowerCase());
    } else {
      setCurrentExecutingAddress(null);
    }

    // Update source file and line
    // For internal calls, prefer the call site (srcLine).
    if (row.isInternalCall) {
      const callSiteFile = row.srcSourceFile || row.sourceFile || row.destSourceFile;
      const callSiteLine = row.srcLine ?? row.line ?? row.destLine;
      if (callSiteFile) {
        setCurrentFile(callSiteFile);
      }
      if (callSiteLine) {
        setCurrentLine(callSiteLine);
      }
      setEvalHint({
        filePath: callSiteFile || null,
        line: callSiteLine ?? null,
        functionName: row.fn || null,
      });
      return;
    }

    if (row.internalParentId && currentInternalParentRow) {
      const parentCallSiteFile =
        currentInternalParentRow.srcSourceFile ||
        currentInternalParentRow.sourceFile ||
        currentInternalParentRow.destSourceFile ||
        null;
      const parentCallSiteLine =
        currentInternalParentRow.srcLine ??
        currentInternalParentRow.line ??
        currentInternalParentRow.destLine ??
        null;
      setEvalHint({
        filePath: parentCallSiteFile,
        line: parentCallSiteLine,
        functionName: currentInternalParentRow.fn || null,
      });
    }

    if (row.sourceFile) {
      setCurrentFile(row.sourceFile);
      if (row.line) {
        setCurrentLine(row.line);
      }
    }
    if (!row.internalParentId || !currentInternalParentRow) {
      setEvalHint({
        filePath: row.sourceFile || null,
        line: row.line ?? null,
        functionName: row.fn || null,
      });
    }
  }, [
    currentSnapshotId,
    decodedTrace,
    currentInternalParentRow,
    setCurrentExecutingAddress,
    setCurrentFile,
    setCurrentLine,
    setEvalHint,
  ]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if no input is focused
      const activeElement = document.activeElement;
      const isInputFocused =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement;

      if (isInputFocused) return;

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          closeDebugWindow();
          break;
        case 'ArrowLeft':
          if (session) {
            e.preventDefault();
            stepPrev();
          }
          break;
        case 'ArrowRight':
          if (session) {
            e.preventDefault();
            stepNext();
          }
          break;
      }
    };

    if (isDebugging) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isDebugging, session, stepNext, stepPrev, closeDebugWindow]);

  // Don't render if not debugging
  if (!isDebugging) {
    return null;
  }

  // Check if simulation has debug session info
  const hasDebugSessionInfo = !!currentSimulation?.debugSession;

  // No active session - show loading, error, or no-session state
  if (!session) {
    return (
      <div className={`debug-window debug-window--loading ${className || ''}`}>
        <div className="debug-window__header">
          <div className="debug-window__title">
            <Bug className="h-5 w-5 text-cyan-400" />
            <span>EDB Debugger</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={closeDebugWindow}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            Close
          </Button>
        </div>
        <div className="debug-window__content debug-window__content--center">
          <div className="text-center text-muted-foreground">
            {isLoading ? (
              <>
                <Bug className="h-12 w-12 mx-auto mb-4 animate-pulse" />
                <p>Connecting to debug session...</p>
              </>
            ) : error ? (
              <>
                <Bug className="h-12 w-12 mx-auto mb-4 text-red-400" />
                <p className="text-red-400 mb-2">Failed to connect</p>
                <p className="text-sm">{error}</p>
              </>
            ) : !hasDebugSessionInfo ? (
              <>
                <Bug className="h-12 w-12 mx-auto mb-4 text-yellow-400" />
                <p className="text-yellow-400 mb-2">No Debug Session Available</p>
                <p className="text-sm max-w-sm mx-auto">
                  This simulation doesn't have debug data. Re-run the simulation with the Debug toggle enabled.
                </p>
              </>
            ) : (
              <>
                <Bug className="h-12 w-12 mx-auto mb-4 animate-pulse" />
                <p>Connecting to debug session...</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`debug-window ${className || ''}`}>
      {/* Header */}
      <div className="debug-window__header">
        <div className="debug-window__title">
          <Bug className="h-5 w-5 text-cyan-400" />
          <span>EDB Debugger</span>
          {contractContext && (
            <span className="debug-window__contract">
              {contractContext.name || contractContext.address?.slice(0, 10) + '...'}
            </span>
          )}
        </div>
        <UniversalSearchBar className="max-w-sm" />
        <div className="debug-window__header-actions">
          <span className="debug-window__snapshot-info">
            Step {currentPosition || '-'} / {totalSnapshots}
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={closeDebugWindow}
            className="gap-2"
          >
            <Square className="h-3 w-3" />
            Stop debugging
          </Button>
        </div>
      </div>

      {/* Main Debug View - IDE-style layout with resizable panels */}
      <div className="debug-window__content">
        <ResizablePanelGroup orientation="horizontal" className="debug-window__main">
          {/* Left Panel - Execution Tree + Stack Trace */}
          <ResizablePanel defaultSize="20%" minSize="15%" maxSize="35%">
            <ResizablePanelGroup orientation="vertical" className="h-full">
              {/* Top - Execution Tree */}
              <ResizablePanel defaultSize="70%" minSize="30%">
                <div className="debug-window__execution">
                  <ExecutionTree
                    className="debug-window__execution-tree"
                    traceRows={decodedTrace?.rows}
                  />
                </div>
              </ResizablePanel>

              <ResizableHandle />

              {/* Bottom - Stack Trace (call ancestry) */}
              <ResizablePanel defaultSize="30%" minSize="15%" maxSize="50%">
                <StackTracePanel className="h-full" />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle />

          {/* Right Area - Source Code + State Panel stacked vertically */}
          <ResizablePanel defaultSize="80%">
            <div className="debug-window__right-area">
              <ResizablePanelGroup orientation="vertical" className="debug-window__vertical-panels">
                {/* Top - Source Code + Toolbar */}
                <ResizablePanel defaultSize="70%" minSize="30%">
                  <div className="debug-window__source-area">
                    <div className="debug-window__source">
                      <SourceViewPanel className="h-full" />
                    </div>
                    {/* Toolbar between source and state panel */}
                    <div className="debug-window__toolbar">
                      <DebugToolbar />
                    </div>
                  </div>
                </ResizablePanel>

                <ResizableHandle />

                {/* Bottom - State/Details Panel */}
                <ResizablePanel defaultSize="30%" minSize="15%" maxSize="50%">
                  <div className="debug-window__state-panel">
                    <DebugStatePanel className="h-full" simulationContext={simulationContext} />
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
});

DebugWindowInner.displayName = 'DebugWindowInner';

/**
 * Main Debug Window component with context provider
 */
export const DebugWindow: React.FC<DebugWindowProps> = React.memo((props) => {
  return (
    <DebugProvider>
      <DebugWindowInner {...props} />
    </DebugProvider>
  );
});

DebugWindow.displayName = 'DebugWindow';

/**
 * Debug Window that uses existing context (no provider wrapper)
 * Use this when DebugProvider is already in the component tree
 */
export const DebugWindowWithContext: React.FC<DebugWindowProps> = React.memo((props) => {
  return <DebugWindowInner {...props} />;
});

DebugWindowWithContext.displayName = 'DebugWindowWithContext';

export default DebugWindow;
