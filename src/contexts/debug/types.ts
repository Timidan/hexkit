/**
 * Internal types for debug context hooks.
 * These are used to share state between the composed hooks.
 */

import type { Dispatch, SetStateAction, MutableRefObject } from 'react';
import type {
  DebugSession,
  DebugSnapshot,
  SnapshotListItem,
  SourceFile,
  Breakpoint,
  BreakpointLocation,
  WatchExpression,
  StorageDiffEntry,
  EvalResult,
  StartDebugSessionRequest,
  DebugSessionConnectOptions,
  DebugSessionStartOptions,
} from '../../types/debug';
import type { DecodedTraceRow } from '../../utils/traceDecoder';
import type { parseFunctions } from '../../utils/traceDecoder/sourceParser';

/**
 * Shared state that all debug hooks can read and write to.
 * This is created once in the DebugProvider and passed to each hook.
 */
export interface DebugSharedState {
  // Session
  session: DebugSession | null;
  setSession: Dispatch<SetStateAction<DebugSession | null>>;
  isLoading: boolean;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  sessionInvalid: boolean;
  setSessionInvalid: Dispatch<SetStateAction<boolean>>;
  sessionRef: MutableRefObject<DebugSession | null>;

  // Debug window
  isDebugging: boolean;
  setIsDebugging: Dispatch<SetStateAction<boolean>>;

  // Snapshots
  currentSnapshotId: number | null;
  setCurrentSnapshotId: Dispatch<SetStateAction<number | null>>;
  currentSnapshot: DebugSnapshot | null;
  setCurrentSnapshot: Dispatch<SetStateAction<DebugSnapshot | null>>;
  snapshotCache: Map<number, DebugSnapshot>;
  setSnapshotCache: Dispatch<SetStateAction<Map<number, DebugSnapshot>>>;
  snapshotList: SnapshotListItem[];
  setSnapshotList: Dispatch<SetStateAction<SnapshotListItem[]>>;

  // Source code
  sourceFiles: Map<string, SourceFile>;
  sourceFilesRef: MutableRefObject<Map<string, SourceFile>>;
  updateSourceFiles: (files: Map<string, SourceFile>) => void;
  currentFile: string | null;
  setCurrentFile: Dispatch<SetStateAction<string | null>>;
  currentLine: number | null;
  setCurrentLine: Dispatch<SetStateAction<number | null>>;
  evalHint: { filePath: string | null; line: number | null; functionName?: string | null } | null;
  setEvalHint: Dispatch<SetStateAction<{ filePath: string | null; line: number | null; functionName?: string | null } | null>>;

  // Current executing contract
  currentExecutingAddress: string | null;
  setCurrentExecutingAddress: Dispatch<SetStateAction<string | null>>;

  // Breakpoints
  breakpoints: Breakpoint[];
  setBreakpoints: Dispatch<SetStateAction<Breakpoint[]>>;

  // Watch expressions
  watchExpressions: WatchExpression[];
  setWatchExpressions: Dispatch<SetStateAction<WatchExpression[]>>;

  // Storage
  storageDiffs: StorageDiffEntry[];
  setStorageDiffs: Dispatch<SetStateAction<StorageDiffEntry[]>>;

  // Refs
  functionRangesRef: MutableRefObject<Map<string, ReturnType<typeof parseFunctions>>>;
  decodedTraceRowsRef: MutableRefObject<DecodedTraceRow[] | null>;
  traceRowsRef: MutableRefObject<any[]>;

  // External data
  decodedTraceRows: DecodedTraceRow[] | null;
  rpcFallbackConfig: { rpcUrl: string; contractAddress: string; blockTag: string } | null;
}

/**
 * Return type for useDebugSession hook
 */
export interface DebugSessionActions {
  connectToSession: (existingSession: {
    sessionId: string;
    rpcPort: number;
    snapshotCount: number;
    chainId: number;
    simulationId: string;
  }, options?: DebugSessionConnectOptions) => Promise<void>;
  startSession: (
    request: StartDebugSessionRequest,
    options?: DebugSessionStartOptions
  ) => Promise<void>;
  endSession: () => Promise<void>;
  initFromTraceData: (params: {
    simulationId: string;
    chainId: number;
    traceRows: any[];
    sourceTexts: Record<string, string>;
    rawTrace?: any;
  }) => void;
  goToSnapshotFromTrace: (snapshotItem: SnapshotListItem, traceRows: any[]) => void;
  goToSnapshotInternal: (sessionId: string, snapshotId: number) => Promise<void>;
  isTraceBasedSession: () => boolean;
  loadSnapshotBatch: (startId: number, count: number) => Promise<void>;
}

/**
 * Return type for useDebugNavigation hook
 */
export interface DebugNavigationActions {
  goToSnapshot: (snapshotId: number) => Promise<void>;
  stepNext: () => Promise<void>;
  stepPrev: () => Promise<void>;
  stepNextCall: () => Promise<void>;
  stepPrevCall: () => Promise<void>;
  stepUp: () => Promise<void>;
  stepOver: () => Promise<void>;
  continueToBreakpoint: (direction: 'forward' | 'backward') => Promise<void>;
}

/**
 * Return type for useDebugBreakpoints hook
 */
export interface DebugBreakpointActions {
  addBreakpoint: (location: BreakpointLocation, condition?: string) => void;
  removeBreakpoint: (id: string) => void;
  toggleBreakpoint: (id: string) => void;
  updateBreakpointCondition: (id: string, condition: string) => void;
}

/**
 * Return type for useDebugEvaluation hook
 */
export interface DebugEvaluationActions {
  evaluateExpression: (expression: string) => Promise<EvalResult>;
  addWatchExpression: (expression: string) => void;
  removeWatchExpression: (id: string) => void;
  refreshWatchExpressions: () => Promise<void>;
}

/**
 * Return type for useDebugWindow hook
 */
export interface DebugWindowActions {
  openDebugWindow: () => void;
  openDebugAtSnapshot: (snapshotId: number) => Promise<void>;
  openDebugAtRevert: () => Promise<void>;
  closeDebugWindow: () => void;
}
