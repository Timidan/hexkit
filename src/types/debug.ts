/**
 * EDB Debug API Types
 *
 * Types for integrating with EDB's debug API for source-level debugging,
 * expression evaluation, breakpoints, and storage inspection.
 */

/** Solidity value with type information */
export interface SolValue {
  type: string;      // e.g., "uint256", "address", "mapping(address => uint256)"
  value: string;     // Formatted display value
  rawValue?: string; // Hex representation
  children?: DebugVariable[]; // For structs/arrays/tuples
  /** Internal metadata for filling unread struct fields from storage */
  _meta?: {
    baseSlot: bigint;
    layout: unknown[];
    structName: string;
    unreadCount: number;
  };
}

/** Variable entry (local or state) */
export interface DebugVariable {
  name: string;
  type: string;
  value: string;
  rawValue?: string;
  children?: DebugVariable[]; // For structs/arrays
}

/** Opcode-level snapshot detail */
export interface OpcodeSnapshotDetail {
  pc: number;
  opcode: number;
  opcodeName: string;
  gasRemaining: string;
  stack: string[];
  memory?: string;
  calldata?: string;
  transientStorage?: Record<string, string>;
  storageAccess?: {
    type: 'read' | 'write';
    slot: string;
    value?: string;
  };
}

/** Hook (source-level) snapshot detail */
export interface HookSnapshotDetail {
  fileIndex: number;
  filePath: string;
  offset: number;
  length: number;
  line: number;
  column: number;
  functionName?: string;
  locals: DebugVariable[];
  stateVariables: DebugVariable[];
}

/** Debug snapshot - can be opcode or hook type */
export interface DebugSnapshot {
  id: number;
  frameId: string; // e.g., "0-0" for trace_entry_id and re_entry_count
  targetAddress: string;
  bytecodeAddress: string;
  type: 'opcode' | 'hook';
  detail: OpcodeSnapshotDetail | HookSnapshotDetail;
}

/** Simplified snapshot for list display */
export interface SnapshotListItem {
  id: number;
  type: 'opcode' | 'hook';
  frameId?: string; // For depth calculation (trace_entry_id-reentry_count)
  depth?: number;   // Call depth for step up/over navigation
  // For opcode
  pc?: number;
  opcodeName?: string;
  gasRemaining?: string;
  // For hook
  filePath?: string;
  line?: number;
  functionName?: string;
}

/** Call result status */
type CallResult =
  | { Success: { gas_used: number; output: string } }
  | { Revert: { gas_used: number; output: string } }
  | { Halt: { reason: string; gas_used: number } };

/** Call scheme for CALL-type opcodes */
type CallScheme = 'Call' | 'StaticCall' | 'DelegateCall' | 'CallCode';

/** Create scheme for CREATE-type opcodes */
type CreateScheme = 'Create' | 'Create2';

/** Call type - either a call or a create */
type CallType =
  | { Call: CallScheme }
  | { Create: CreateScheme };

/** Trace entry representing a single call/create */
export interface TraceEntry {
  id: number;
  parentId: number | null;
  depth: number;
  callType: CallType;
  caller: string;
  target: string;
  codeAddress: string;
  input: string;
  value: string;
  result: CallResult;
  events: LogEntry[];
  bytecode?: string;
  targetLabel?: string;
}

/** Log entry (event) */
interface LogEntry {
  address: string;
  topics: string[];
  data: string;
}

/** Complete execution trace */
interface ExecutionTrace {
  entries: TraceEntry[];
  rootId: number;
}

/** Opcode breakpoint location */
interface OpcodeBreakpointLocation {
  type: 'opcode';
  bytecodeAddress: string;
  pc: number;
}

/** Source breakpoint location */
interface SourceBreakpointLocation {
  type: 'source';
  bytecodeAddress: string;
  filePath: string;
  lineNumber: number;
}

/** Breakpoint location - either opcode or source */
export type BreakpointLocation = OpcodeBreakpointLocation | SourceBreakpointLocation;

/** Breakpoint definition */
export interface Breakpoint {
  id: string;
  location: BreakpointLocation;
  condition?: string; // Solidity expression
  enabled: boolean;
  hitCount: number;
}

/** Watch expression */
export interface WatchExpression {
  id: string;
  expression: string;
  currentValue?: SolValue;
  error?: string;
  pinned: boolean;
}

/** Expression evaluation result */
export interface EvalResult {
  success: boolean;
  value?: SolValue;
  error?: string;
  /** When value was resolved from a different snapshot than the current step */
  note?: string;
}

/** Storage diff entry */
export interface StorageDiffEntry {
  address: string;
  contractName?: string;
  slot: string;
  slotLabel?: string; // e.g., "balances[0x123...]"
  before: string;
  after: string;
}

/** Storage layout entry - describes a state variable's storage location */
export interface StorageLayoutEntry {
  astId: number;
  contract: string;
  label: string;
  offset: number;
  slot: string;
  type: string; // e.g., "t_uint256", "t_address", "t_struct_MyStruct"
}

/** Storage type definition - describes how a type is stored */
export interface StorageTypeDefinition {
  encoding: string; // "inplace", "mapping", "dynamic_array", etc.
  label: string;    // Human-readable type name
  numberOfBytes: string;
  key?: string;     // For mappings
  value?: string;   // For mappings
  members?: StorageLayoutEntry[]; // For structs
}

/** Storage layout response from edb_getStorageLayout */
export interface StorageLayoutResponse {
  storage: StorageLayoutEntry[];
  types: Record<string, StorageTypeDefinition>;
}

/** How a slot was discovered */
export type SlotSource = 'layout' | 'trace' | 'manual' | 'rpc_scan' | 'rpc_proof' | 'proxy' | 'namespace';

/** Evidence for a single storage slot */
export interface SlotEvidence {
  address: string;
  slot: string;             // 32-byte hex
  blockTag?: string | number;
  snapshotId?: number;
  source: SlotSource;
  value?: string;           // current value
  before?: string;          // diff info when available
  after?: string;
  traceId?: number;
  meta?: Record<string, unknown>;
}

/** A single decoded field within a storage slot */
export interface DecodedSlotField {
  label: string;
  typeLabel: string;
  decoded: string;
  offset: number;    // byte offset from LSB (right side)
  size: number;      // bytes this field occupies
}

/** Classification of a storage entry's structure */
export type StorageKind = 'mapping' | 'dynamic_array' | 'leaf';

/** A resolved storage slot with label and confidence */
export interface ResolvedSlot {
  address: string;
  slot: string;
  label?: string;           // e.g. balances[0xabc...]
  typeLabel?: string;       // e.g. mapping(address => uint256)
  decodeKind: 'exact' | 'derived' | 'proxy_slot' | 'namespace_root' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  provenance: SlotSource[];
  value?: string;
  before?: string;
  after?: string;
  /** Decoded human-readable field values for display */
  decodedFields?: DecodedSlotField[];
  /** Whether multiple variables are packed into this slot */
  isPacked?: boolean;
  /** Structural kind for driving UI actions (Inspect vs History) */
  kind?: StorageKind;
  /** Layout entry type ID (e.g. "t_mapping(t_address,t_uint256)") for discovery */
  layoutTypeId?: string;
  /** Layout entry base slot (decimal string) for computing derived slots */
  layoutSlot?: string;
  /** Layout variable name (from compiler output) */
  layoutLabel?: string;
}

/** A segment in the path navigation breadcrumb */
export interface PathSegment {
  label: string;
  variable: string;
  baseSlot: string;
  /** For mapping drill-down: key type ID from layout (e.g. "t_address") */
  keyTypeId?: string;
  /** Optional selected key for current segment */
  key?: string;
  /** Slot kind: determines whether to use mapping or array slot computation */
  slotKind?: 'mapping' | 'dynamic_array' | 'leaf';
  /** Resolved human-readable value type label (e.g. "address", "uint256") for type-aware decoding */
  valueTypeLabel?: string;
}

/** A discovered mapping key with its derived slot and value */
export interface DiscoveredMappingKey {
  key: string;
  keyType: string;
  derivedSlot: string;
  value: string | null;
  variable: string;
  baseSlot: string;
  source: string;
  sourceLabel: string;
  sources: string[];
  sourceLabels: string[];
  evidenceCount: number;
}


/** Detected RPC capabilities for storage inspection */
export interface RpcCapabilities {
  hasDebugStorageRangeAt: boolean;
  hasEthGetProof: boolean;
  hasEdbGetStorageLayout: boolean;
  checked: boolean;
}

/** Debug call frame */
export interface DebugCallFrame {
  traceId: number;
  rowId: number; // Decoded trace row ID (used for navigation)
  depth: number;
  address: string;
  contractName?: string;
  functionName?: string;
  sourcePath?: string;
  line?: number;
  isCurrentFrame: boolean;
}

/** Source file */
export interface SourceFile {
  path: string;
  content: string;
  contractName?: string;
}

/** Debug session state */
export interface DebugSession {
  sessionId: string;
  simulationId: string;
  chainId: number;
  rpcUrl: string;
  totalSnapshots: number;
  sourceFiles: Map<string, SourceFile>;
  trace: ExecutionTrace;
  isActive: boolean;
  startedAt: number;
}

type DebugSessionHydrationMode = 'full' | 'minimal';

export interface DebugSessionConnectOptions {
  hydrate?: DebugSessionHydrationMode;
}

export interface DebugSessionStartOptions {
  hydrate?: DebugSessionHydrationMode;
}

/** Start debug session request */
export interface StartDebugSessionRequest {
  simulationId: string;
  rpcUrl: string;
  chainId: number;
  blockTag?: string;
  traceDetailHandleId?: string;
  /** Optional on-chain tx hash for replay-based debug sessions */
  txHash?: string;
  transaction: {
    from: string;
    to?: string;
    data: string;
    value?: string;
    gas?: string;
    gasPrice?: string;
  };
  artifacts?: Record<string, unknown> | unknown[];
}

/** Start debug session response */
export interface StartDebugSessionResponse {
  sessionId: string;
  snapshotCount: number;
  sourceFiles: Record<string, string>;
  trace: {
    entries: TraceEntry[];
    rootId: number;
  };
}

/** Get snapshot request */
export interface GetSnapshotRequest {
  sessionId: string;
  snapshotId: number;
}

/** Get snapshot response */
export interface GetSnapshotResponse {
  snapshot: DebugSnapshot;
}

/** Get snapshot batch request */
export interface GetSnapshotBatchRequest {
  sessionId: string;
  startId: number;
  count: number;
}

/** Get snapshot batch response */
export interface GetSnapshotBatchResponse {
  snapshots: SnapshotListItem[];
  hasMore: boolean;
}

/** Evaluate expression request */
export interface EvalExpressionRequest {
  sessionId: string;
  snapshotId: number;
  expression: string;
}

/** Evaluate expression response */
export interface EvalExpressionResponse {
  result: EvalResult;
}

/** Get storage diff request */
export interface GetStorageDiffRequest {
  sessionId: string;
  snapshotId: number;
}

/** Get storage diff response */
export interface GetStorageDiffResponse {
  diffs: StorageDiffEntry[];
}

/** Get breakpoint hits request */
export interface GetBreakpointHitsRequest {
  sessionId: string;
  breakpoints: Array<{
    location: BreakpointLocation;
    condition?: string;
  }>;
}

/** Get breakpoint hits response */
export interface GetBreakpointHitsResponse {
  hits: number[]; // Snapshot IDs where breakpoints hit
}

/** Navigate to call request */
export interface NavigateCallRequest {
  sessionId: string;
  snapshotId: number;
  direction: 'next' | 'prev';
}

/** Navigate to call response */
export interface NavigateCallResponse {
  snapshotId: number | null;
}

/** End debug session request */
export interface EndDebugSessionRequest {
  sessionId: string;
}

/** End debug session response */
export interface EndDebugSessionResponse {
  success: boolean;
}

/** Debug context value interface */
export interface DebugContextValue {
  // Session state
  session: DebugSession | null;
  isLoading: boolean;
  error: string | null;

  // Debug window state
  isDebugging: boolean;

  // Snapshot navigation
  totalSnapshots: number;
  currentSnapshotId: number | null;
  currentSnapshot: DebugSnapshot | null;
  snapshotCache: Map<number, DebugSnapshot>;
  snapshotList: SnapshotListItem[];

  // Source code
  sourceFiles: Map<string, SourceFile>;
  currentFile: string | null;
  currentLine: number | null;

  // Current executing contract (for Diamond proxy support)
  currentExecutingAddress: string | null;

  // Breakpoints
  breakpoints: Breakpoint[];
  breakpointHits: Map<string, number[]>;

  // Watch expressions
  watchExpressions: WatchExpression[];

  // Call stack
  callStack: DebugCallFrame[];

  // Storage
  storageDiffs: StorageDiffEntry[];

  // Actions
  startSession: (
    request: StartDebugSessionRequest,
    options?: DebugSessionStartOptions
  ) => Promise<void>;
  connectToSession: (existingSession: {
    sessionId: string;
    rpcPort: number;
    snapshotCount: number;
    chainId: number;
    simulationId: string;
  }, options?: DebugSessionConnectOptions) => Promise<void>;
  endSession: () => Promise<void>;
  goToSnapshot: (id: number) => Promise<void>;
  stepNext: () => Promise<void>;
  stepPrev: () => Promise<void>;
  stepNextCall: () => Promise<void>;
  stepPrevCall: () => Promise<void>;
  stepUp: () => Promise<void>;    // Exit current function, return to caller
  stepOver: () => Promise<void>;  // Execute next statement, skip internal calls
  continueToBreakpoint: (direction: 'forward' | 'backward') => Promise<void>;
  addBreakpoint: (location: BreakpointLocation, condition?: string) => void;
  removeBreakpoint: (id: string) => void;
  toggleBreakpoint: (id: string) => void;
  updateBreakpointCondition: (id: string, condition: string) => void;
  addWatchExpression: (expression: string) => void;
  removeWatchExpression: (id: string) => void;
  evaluateExpression: (expression: string) => Promise<EvalResult>;
  refreshWatchExpressions: () => Promise<void>;
  loadSnapshotBatch: (startId: number, count: number) => Promise<void>;
  setCurrentFile: (filePath: string) => void;
  setCurrentLine: (line: number | null) => void;
  setCurrentExecutingAddress: (address: string | null) => void;
  setEvalHint: (hint: { filePath: string | null; line: number | null; functionName?: string | null }) => void;

  // Debug window actions
  openDebugWindow: () => void;
  openDebugAtSnapshot: (snapshotId: number) => Promise<void>;
  openDebugAtRevert: () => Promise<void>;
  closeDebugWindow: () => void;

  // Async debug preparation
  debugPrepState: DebugPrepState;
  startDebugPrep: (params: PrepareDebugRequest, simulationId?: string) => void;
  cancelDebugPrep: () => void;

  // Initialize from trace data (no live session required)
  initFromTraceData: (params: {
    simulationId: string;
    chainId: number;
    traceRows: any[]; // DecodedTraceRow[]
    sourceTexts: Record<string, string>;
    rawTrace?: any;
  }) => void;
}

/** Request to start async debug preparation */
export interface PrepareDebugRequest {
  rpcUrl: string;
  chainId: number;
  blockTag?: string;
  transaction?: {
    from: string;
    to?: string;
    data?: string;
    value?: string;
    gas?: string;
    gasPrice?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  };
  txHash?: string;
  artifacts?: unknown[];
  artifacts_inline?: Record<string, unknown>;
}

/** Debug preparation status */
export type DebugPrepStatus = 'idle' | 'queued' | 'preparing' | 'ready' | 'failed';

/** Debug preparation state tracked in context */
export interface DebugPrepState {
  prepareId: string | null;
  status: DebugPrepStatus;
  stage: string | null;
  progressPct: number;
  message: string | null;
  sessionId: string | null;
  /** The simulationId this prep was started for — used to detect stale prep state */
  simulationId: string | null;
  snapshotCount: number | null;
  sourceFiles: Record<string, unknown> | null;
  error: string | null;
}

/** SSE stage event data */
export interface PrepareStageEvent {
  stage: string;
  progressPct: number;
  message: string;
  currentStep?: number;
  totalSteps?: number;
}

/** SSE ready event data */
export interface PrepareReadyEvent {
  sessionId: string;
  snapshotCount: number;
  sourceFiles: Record<string, unknown>;
}

/** SSE failed event data */
export interface PrepareFailedEvent {
  error: string;
}

/** Polling response from bridge */
export interface PrepareStatusResponse {
  prepareId: string;
  status: DebugPrepStatus;
  stage: string | null;
  progressPct: number;
  message: string | null;
  sessionId: string | null;
  snapshotCount: number | null;
  sourceFiles: Record<string, unknown> | null;
  error: string | null;
}

