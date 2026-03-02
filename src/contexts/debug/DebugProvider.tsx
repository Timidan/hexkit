/**
 * Debug Provider Component
 *
 * Composes all debug hooks and provides the unified DebugContext.
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type {
  DebugContextValue,
  DebugSession,
  DebugSnapshot,
  SnapshotListItem,
  SourceFile,
  Breakpoint,
  WatchExpression,
  StorageDiffEntry,
} from '../../types/debug';
import { useSimulation } from '../SimulationContext';
import { useNetworkConfig } from '../NetworkConfigContext';
import { getChainById } from '../../utils/chains';
import { buildCallStackFromDecodedRows } from './debugHelpers';
import { useDebugSession } from './useDebugSession';
import { useDebugNavigation } from './useDebugNavigation';
import { useDebugBreakpoints } from './useDebugBreakpoints';
import { useDebugEvaluation } from './useDebugEvaluation';
import { useDebugWindow } from './useDebugWindow';
import { useDebugPrep } from './useDebugPrep';
import type { DebugSharedState } from './types';
import type { DecodedTraceRow } from '../../utils/traceDecoder';
import type { parseFunctions } from '../../utils/traceDecoder/sourceParser';

const DebugContext = createContext<DebugContextValue | undefined>(undefined);

export const DebugProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { decodedTraceRows, currentSimulation, contractContext } = useSimulation();
  const { resolveRpcUrl } = useNetworkConfig();

  // Compute RPC URL for storage fallback based on current chain
  const rpcFallbackConfig = useMemo(() => {
    const chainId = contractContext?.networkId || currentSimulation?.chainId || 1;
    const chain = getChainById(chainId);
    const rpcUrl = chain ? resolveRpcUrl(chain.id, chain.rpcUrl).url : null;
    const contractAddress = contractContext?.address || currentSimulation?.to || null;
    const blockTag = contractContext?.blockOverride || currentSimulation?.blockNumber || 'latest';
    if (!rpcUrl || !contractAddress) return null;
    return { rpcUrl, contractAddress, blockTag: String(blockTag) };
  }, [contractContext, currentSimulation, resolveRpcUrl]);

  // Session state
  const [session, setSession] = useState<DebugSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debug window state
  const [isDebugging, setIsDebugging] = useState(false);

  // Snapshot state
  const [currentSnapshotId, setCurrentSnapshotId] = useState<number | null>(null);
  const [currentSnapshot, setCurrentSnapshot] = useState<DebugSnapshot | null>(null);
  const [snapshotCache, setSnapshotCache] = useState<Map<number, DebugSnapshot>>(new Map());
  const [snapshotList, setSnapshotList] = useState<SnapshotListItem[]>([]);

  // Source code state
  const [sourceFiles, setSourceFiles] = useState<Map<string, SourceFile>>(new Map());
  const sourceFilesRef = useRef<Map<string, SourceFile>>(new Map());
  const updateSourceFiles = useCallback((files: Map<string, SourceFile>) => {
    sourceFilesRef.current = files;
    setSourceFiles(files);
  }, []);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [currentLine, setCurrentLine] = useState<number | null>(null);
  const [evalHint, setEvalHint] = useState<{
    filePath: string | null;
    line: number | null;
    functionName?: string | null;
  } | null>(null);

  // Current executing contract (for Diamond proxy support)
  const [currentExecutingAddress, setCurrentExecutingAddress] = useState<string | null>(null);

  // Breakpoints
  const [breakpoints, setBreakpoints] = useState<Breakpoint[]>([]);
  const [breakpointHits, setBreakpointHits] = useState<Map<string, number[]>>(new Map());

  // Watch expressions
  const [watchExpressions, setWatchExpressions] = useState<WatchExpression[]>([]);

  // Storage
  const [storageDiffs, setStorageDiffs] = useState<StorageDiffEntry[]>([]);

  // Session validity
  const [sessionInvalid, setSessionInvalid] = useState(false);

  // Refs for stable callbacks
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const functionRangesRef = useRef<Map<string, ReturnType<typeof parseFunctions>>>(new Map());
  const decodedTraceRowsRef = useRef<DecodedTraceRow[] | null>(null);
  const traceRowsRef = useRef<any[]>([]);

  useEffect(() => {
    decodedTraceRowsRef.current = decodedTraceRows;
  }, [decodedTraceRows]);

  // Keep traceRowsRef in sync whenever decodedTraceRows changes.
  // Clearing stale refs prevents navigation/eval from using rows from a previous session.
  useEffect(() => {
    traceRowsRef.current = decodedTraceRows ?? [];
  }, [decodedTraceRows]);

  const sharedState: DebugSharedState = {
    session,
    setSession,
    isLoading,
    setIsLoading,
    error,
    setError,
    sessionInvalid,
    setSessionInvalid,
    sessionRef,
    isDebugging,
    setIsDebugging,
    currentSnapshotId,
    setCurrentSnapshotId,
    currentSnapshot,
    setCurrentSnapshot,
    snapshotCache,
    setSnapshotCache,
    snapshotList,
    setSnapshotList,
    sourceFiles,
    sourceFilesRef,
    updateSourceFiles,
    currentFile,
    setCurrentFile,
    currentLine,
    setCurrentLine,
    evalHint,
    setEvalHint,
    currentExecutingAddress,
    setCurrentExecutingAddress,
    breakpoints,
    setBreakpoints,
    breakpointHits,
    setBreakpointHits,
    watchExpressions,
    setWatchExpressions,
    storageDiffs,
    setStorageDiffs,
    functionRangesRef,
    decodedTraceRowsRef,
    traceRowsRef,
    decodedTraceRows,
    rpcFallbackConfig,
  };

  const sessionActions = useDebugSession(sharedState);
  const navigationActions = useDebugNavigation(sharedState, sessionActions);
  const breakpointActions = useDebugBreakpoints(sharedState);
  const evaluationActions = useDebugEvaluation(sharedState);
  const windowActions = useDebugWindow(sharedState, sessionActions);
  const prepActions = useDebugPrep(sharedState, sessionActions);

  const totalSnapshots = session?.totalSnapshots ?? 0;

  const callStack = useMemo(
    () => buildCallStackFromDecodedRows(decodedTraceRows, currentSnapshotId),
    [decodedTraceRows, currentSnapshotId]
  );

  const contextValue: DebugContextValue = useMemo(
    () => ({
      // Session state
      session,
      isLoading,
      error,

      // Debug window state
      isDebugging,

      // Snapshot navigation
      totalSnapshots,
      currentSnapshotId,
      currentSnapshot,
      snapshotCache,
      snapshotList,

      // Source code
      sourceFiles,
      currentFile,
      currentLine,

      // Current executing contract
      currentExecutingAddress,

      // Breakpoints
      breakpoints,
      breakpointHits,

      // Watch expressions
      watchExpressions,

      // Call stack
      callStack,

      // Storage
      storageDiffs,

      // Session actions
      startSession: sessionActions.startSession,
      connectToSession: sessionActions.connectToSession,
      endSession: sessionActions.endSession,
      initFromTraceData: sessionActions.initFromTraceData,
      loadSnapshotBatch: sessionActions.loadSnapshotBatch,

      // Navigation actions
      goToSnapshot: navigationActions.goToSnapshot,
      stepNext: navigationActions.stepNext,
      stepPrev: navigationActions.stepPrev,
      stepNextCall: navigationActions.stepNextCall,
      stepPrevCall: navigationActions.stepPrevCall,
      stepUp: navigationActions.stepUp,
      stepOver: navigationActions.stepOver,
      continueToBreakpoint: navigationActions.continueToBreakpoint,

      // Breakpoint actions
      addBreakpoint: breakpointActions.addBreakpoint,
      removeBreakpoint: breakpointActions.removeBreakpoint,
      toggleBreakpoint: breakpointActions.toggleBreakpoint,
      updateBreakpointCondition: breakpointActions.updateBreakpointCondition,

      // Evaluation actions
      evaluateExpression: evaluationActions.evaluateExpression,
      addWatchExpression: evaluationActions.addWatchExpression,
      removeWatchExpression: evaluationActions.removeWatchExpression,
      refreshWatchExpressions: evaluationActions.refreshWatchExpressions,

      // Debug window actions
      openDebugWindow: windowActions.openDebugWindow,
      openDebugAtSnapshot: windowActions.openDebugAtSnapshot,
      openDebugAtRevert: windowActions.openDebugAtRevert,
      closeDebugWindow: windowActions.closeDebugWindow,

      // Async debug preparation
      debugPrepState: prepActions.debugPrepState,
      startDebugPrep: prepActions.startDebugPrep,
      cancelDebugPrep: prepActions.cancelDebugPrep,

      // Setters
      setCurrentFile,
      setCurrentLine,
      setCurrentExecutingAddress,
      setEvalHint,
    }),
    [
      session,
      isLoading,
      error,
      isDebugging,
      totalSnapshots,
      currentSnapshotId,
      currentSnapshot,
      snapshotCache,
      snapshotList,
      sourceFiles,
      currentFile,
      currentLine,
      currentExecutingAddress,
      breakpoints,
      breakpointHits,
      watchExpressions,
      callStack,
      storageDiffs,
      sessionActions.startSession,
      sessionActions.connectToSession,
      sessionActions.endSession,
      sessionActions.initFromTraceData,
      sessionActions.loadSnapshotBatch,
      navigationActions.goToSnapshot,
      navigationActions.stepNext,
      navigationActions.stepPrev,
      navigationActions.stepNextCall,
      navigationActions.stepPrevCall,
      navigationActions.stepUp,
      navigationActions.stepOver,
      navigationActions.continueToBreakpoint,
      breakpointActions.addBreakpoint,
      breakpointActions.removeBreakpoint,
      breakpointActions.toggleBreakpoint,
      breakpointActions.updateBreakpointCondition,
      evaluationActions.evaluateExpression,
      evaluationActions.addWatchExpression,
      evaluationActions.removeWatchExpression,
      evaluationActions.refreshWatchExpressions,
      windowActions.openDebugWindow,
      windowActions.openDebugAtSnapshot,
      windowActions.openDebugAtRevert,
      windowActions.closeDebugWindow,
      prepActions.debugPrepState,
      prepActions.startDebugPrep,
      prepActions.cancelDebugPrep,
      setEvalHint,
    ]
  );

  return <DebugContext.Provider value={contextValue}>{children}</DebugContext.Provider>;
};

export const useDebug = (): DebugContextValue => {
  const context = useContext(DebugContext);
  if (!context) {
    throw new Error('useDebug must be used within DebugProvider');
  }
  return context;
};

export default DebugContext;
