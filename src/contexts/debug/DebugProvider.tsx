/**
 * Debug Provider — 3-context split (A3).
 *
 * Session state, navigation state, and inspection state are published on
 * three distinct contexts so consumers only rerender when the slice they
 * actually read changes. `useDebug()` still merges all three for backwards
 * compatibility — existing consumers don't need to migrate.
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
import { useLiveRef } from '../../hooks/useLiveRef';

type SessionSlice = Pick<
  DebugContextValue,
  | 'session'
  | 'isLoading'
  | 'error'
  | 'isDebugging'
  | 'startSession'
  | 'connectToSession'
  | 'endSession'
  | 'initFromTraceData'
  | 'loadSnapshotBatch'
  | 'openDebugWindow'
  | 'openDebugAtSnapshot'
  | 'openDebugAtRevert'
  | 'closeDebugWindow'
  | 'debugPrepState'
  | 'startDebugPrep'
  | 'cancelDebugPrep'
>;

type NavigationSlice = Pick<
  DebugContextValue,
  | 'totalSnapshots'
  | 'currentSnapshotId'
  | 'currentSnapshot'
  | 'snapshotCache'
  | 'snapshotList'
  | 'sourceFiles'
  | 'currentFile'
  | 'currentLine'
  | 'currentExecutingAddress'
  | 'callStack'
  | 'goToSnapshot'
  | 'stepNext'
  | 'stepPrev'
  | 'stepNextCall'
  | 'stepPrevCall'
  | 'stepUp'
  | 'stepOver'
  | 'continueToBreakpoint'
  | 'setCurrentFile'
  | 'setCurrentLine'
  | 'setCurrentExecutingAddress'
  | 'setEvalHint'
>;

type InspectionSlice = Pick<
  DebugContextValue,
  | 'breakpoints'
  | 'watchExpressions'
  | 'storageDiffs'
  | 'addBreakpoint'
  | 'removeBreakpoint'
  | 'toggleBreakpoint'
  | 'updateBreakpointCondition'
  | 'evaluateExpression'
  | 'addWatchExpression'
  | 'removeWatchExpression'
  | 'refreshWatchExpressions'
>;

const DebugSessionContext = createContext<SessionSlice | undefined>(undefined);
const DebugNavigationContext = createContext<NavigationSlice | undefined>(undefined);
const DebugInspectionContext = createContext<InspectionSlice | undefined>(undefined);

export const DebugProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { decodedTraceRows, currentSimulation, contractContext } = useSimulation();
  const { resolveRpcUrl } = useNetworkConfig();

  const rpcFallbackConfig = useMemo(() => {
    const chainId = contractContext?.networkId || currentSimulation?.chainId || 1;
    const chain = getChainById(chainId);
    const rpcUrl = chain ? resolveRpcUrl(chain.id, chain.rpcUrl).url : null;
    const contractAddress = contractContext?.address || currentSimulation?.to || null;
    const blockTag = contractContext?.blockOverride || currentSimulation?.blockNumber || 'latest';
    if (!rpcUrl || !contractAddress) return null;
    return { rpcUrl, contractAddress, blockTag: String(blockTag) };
  }, [contractContext, currentSimulation, resolveRpcUrl]);

  const [session, setSession] = useState<DebugSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDebugging, setIsDebugging] = useState(false);

  const [currentSnapshotId, setCurrentSnapshotId] = useState<number | null>(null);
  const [currentSnapshot, setCurrentSnapshot] = useState<DebugSnapshot | null>(null);
  const [snapshotCache, setSnapshotCache] = useState<Map<number, DebugSnapshot>>(new Map());
  const [snapshotList, setSnapshotList] = useState<SnapshotListItem[]>([]);

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

  const [currentExecutingAddress, setCurrentExecutingAddress] = useState<string | null>(null);

  const [breakpoints, setBreakpoints] = useState<Breakpoint[]>([]);

  const [watchExpressions, setWatchExpressions] = useState<WatchExpression[]>([]);
  const [storageDiffs, setStorageDiffs] = useState<StorageDiffEntry[]>([]);

  const [sessionInvalid, setSessionInvalid] = useState(false);

  const sessionRef = useLiveRef(session);
  const functionRangesRef = useRef<Map<string, ReturnType<typeof parseFunctions>>>(new Map());
  const decodedTraceRowsRef = useLiveRef<DecodedTraceRow[] | null>(decodedTraceRows);
  // traceRowsRef is overwritten manually by `initFromTraceData` with a heavier
  // vault-loaded trace than decodedTraceRows. Only resync on decodedTraceRows
  // change so unrelated provider re-renders don't stomp that assignment.
  const traceRowsRef = useRef<any[]>(decodedTraceRows ?? []);
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

  const sessionValue = useMemo<SessionSlice>(
    () => ({
      session,
      isLoading,
      error,
      isDebugging,
      startSession: sessionActions.startSession,
      connectToSession: sessionActions.connectToSession,
      endSession: sessionActions.endSession,
      initFromTraceData: sessionActions.initFromTraceData,
      loadSnapshotBatch: sessionActions.loadSnapshotBatch,
      openDebugWindow: windowActions.openDebugWindow,
      openDebugAtSnapshot: windowActions.openDebugAtSnapshot,
      openDebugAtRevert: windowActions.openDebugAtRevert,
      closeDebugWindow: windowActions.closeDebugWindow,
      debugPrepState: prepActions.debugPrepState,
      startDebugPrep: prepActions.startDebugPrep,
      cancelDebugPrep: prepActions.cancelDebugPrep,
    }),
    [
      session,
      isLoading,
      error,
      isDebugging,
      sessionActions.startSession,
      sessionActions.connectToSession,
      sessionActions.endSession,
      sessionActions.initFromTraceData,
      sessionActions.loadSnapshotBatch,
      windowActions.openDebugWindow,
      windowActions.openDebugAtSnapshot,
      windowActions.openDebugAtRevert,
      windowActions.closeDebugWindow,
      prepActions.debugPrepState,
      prepActions.startDebugPrep,
      prepActions.cancelDebugPrep,
    ]
  );

  const navigationValue = useMemo<NavigationSlice>(
    () => ({
      totalSnapshots,
      currentSnapshotId,
      currentSnapshot,
      snapshotCache,
      snapshotList,
      sourceFiles,
      currentFile,
      currentLine,
      currentExecutingAddress,
      callStack,
      goToSnapshot: navigationActions.goToSnapshot,
      stepNext: navigationActions.stepNext,
      stepPrev: navigationActions.stepPrev,
      stepNextCall: navigationActions.stepNextCall,
      stepPrevCall: navigationActions.stepPrevCall,
      stepUp: navigationActions.stepUp,
      stepOver: navigationActions.stepOver,
      continueToBreakpoint: navigationActions.continueToBreakpoint,
      setCurrentFile,
      setCurrentLine,
      setCurrentExecutingAddress,
      setEvalHint,
    }),
    [
      totalSnapshots,
      currentSnapshotId,
      currentSnapshot,
      snapshotCache,
      snapshotList,
      sourceFiles,
      currentFile,
      currentLine,
      currentExecutingAddress,
      callStack,
      navigationActions.goToSnapshot,
      navigationActions.stepNext,
      navigationActions.stepPrev,
      navigationActions.stepNextCall,
      navigationActions.stepPrevCall,
      navigationActions.stepUp,
      navigationActions.stepOver,
      navigationActions.continueToBreakpoint,
    ]
  );

  const inspectionValue = useMemo<InspectionSlice>(
    () => ({
      breakpoints,
      watchExpressions,
      storageDiffs,
      addBreakpoint: breakpointActions.addBreakpoint,
      removeBreakpoint: breakpointActions.removeBreakpoint,
      toggleBreakpoint: breakpointActions.toggleBreakpoint,
      updateBreakpointCondition: breakpointActions.updateBreakpointCondition,
      evaluateExpression: evaluationActions.evaluateExpression,
      addWatchExpression: evaluationActions.addWatchExpression,
      removeWatchExpression: evaluationActions.removeWatchExpression,
      refreshWatchExpressions: evaluationActions.refreshWatchExpressions,
    }),
    [
      breakpoints,
      watchExpressions,
      storageDiffs,
      breakpointActions.addBreakpoint,
      breakpointActions.removeBreakpoint,
      breakpointActions.toggleBreakpoint,
      breakpointActions.updateBreakpointCondition,
      evaluationActions.evaluateExpression,
      evaluationActions.addWatchExpression,
      evaluationActions.removeWatchExpression,
      evaluationActions.refreshWatchExpressions,
    ]
  );

  return (
    <DebugSessionContext.Provider value={sessionValue}>
      <DebugNavigationContext.Provider value={navigationValue}>
        <DebugInspectionContext.Provider value={inspectionValue}>
          {children}
        </DebugInspectionContext.Provider>
      </DebugNavigationContext.Provider>
    </DebugSessionContext.Provider>
  );
};

export const useDebugSessionContext = (): SessionSlice => {
  const value = useContext(DebugSessionContext);
  if (!value) throw new Error('useDebugSessionContext must be used within DebugProvider');
  return value;
};

export const useDebugNavigationContext = (): NavigationSlice => {
  const value = useContext(DebugNavigationContext);
  if (!value) throw new Error('useDebugNavigationContext must be used within DebugProvider');
  return value;
};

export const useDebugInspectionContext = (): InspectionSlice => {
  const value = useContext(DebugInspectionContext);
  if (!value) throw new Error('useDebugInspectionContext must be used within DebugProvider');
  return value;
};

export const useDebug = (): DebugContextValue => {
  const sessionSlice = useDebugSessionContext();
  const navSlice = useDebugNavigationContext();
  const inspectionSlice = useDebugInspectionContext();
  return { ...sessionSlice, ...navSlice, ...inspectionSlice };
};

export default DebugSessionContext;
