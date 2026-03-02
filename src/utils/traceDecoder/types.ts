/**
 * Type definitions for trace decoding
 */

export type RawTrace = any;

export interface DecodedTraceRow {
  id: number;
  traceId?: number; // Original trace ID for call frame entries (id is negative to avoid conflicts)
  kind: "opcode";
  name: string;
  pc: number;
  input?: string;
  output?: string;
  gasUsed?: string; // Per-opcode gas cost from EDB
  gasDelta: string;
  gasCum?: string;
  gasRemaining: string | number;
  frame_id?: (string | number)[]; // Frame hierarchy from EDB
  depth?: number; // External call depth derived from frame_id
  visualDepth?: number; // Combined external + internal function depth for hierarchy visualization
  internalParentId?: number; // Parent internal call id for hierarchy grouping
  isInternalCall?: boolean; // True if this row represents an internal function call (JUMP with destFn)
  isInternalReturn?: boolean; // True if this row represents return from internal function
  isLeafCall?: boolean; // True if this internal call has no nested calls (leaf function - show return inline)
  hasChildren?: boolean; // True if this internal call contains nested calls (parent frame - collapsible)
  childEndId?: number; // The opcode ID where this function's children end (for rail calculation)
  firstSnapshotId?: number; // For call frame entries: links to internal function context
  externalParentTraceId?: number | null; // From EDB parent_id: explicit external call parent
  isConfirmedCall?: boolean; // True if this call was confirmed via source map jump type 'i'
  isUnverifiedContract?: boolean; // True if this call is to a contract without source code
  line?: number;
  sourceFile?: string | null;
  fn?: string | null;
  contract?: string | null;
  stack?: string[];
  memory?: number[];
  stackDepth?: number;
  stackTop?: string | null;
  storage_read?: any;
  storage_write?: any;
  storage_diff?: any;
  jumpMarker?: boolean;
  destPc?: number | null;
  destFn?: string | null;
  destSourceFile?: string | null; // For JUMPs: file where destination function is defined
  destLine?: number | null; // For JUMPs: line number in destination file
  srcSourceFile?: string | null; // For JUMPs: file where the JUMP instruction is (caller side)
  srcLine?: number | null; // For JUMPs: line number where the JUMP happens (caller side)
  jumpArgs?: (string | number)[];
  jumpArgsDecoded?: { name: string; value: string }[] | null;
  jumpArgsOrigin?: string | null;
  jumpArgsTruncated?: boolean;
  jumpResult?: string | number;
  jumpResultSource?: string;
  entryJumpdest?: boolean;
  entryMeta?: {
    caller?: string;
    target?: string;
    // For DELEGATECALL: codeAddress is the contract whose code is being executed
    codeAddress?: string;
    codeContractName?: string;
    // For DELEGATECALL: targetContractName is the proxy/storage context
    targetContractName?: string;
    // Call type: "CALL", "DELEGATECALL", "STATICCALL", etc.
    callType?: string;
    selector?: string;
    function?: string;
    args?: { name: string; value: string }[];
    outputs?: Array<{
      name: string;
      type: string;
      components?: Array<{
        name: string;
        type: string;
        components?: any[];
      }>;
    }>;
    value?: string | number;
  };
  logInfo?: {
    offset: string | number;
    size: string | number;
    topics: any[];
  } | null;
  decodedLog?: {
    name: string;
    args: { name: string | number; value: string }[];
    source: string;
    truncated?: boolean;
  } | null;
  eventFallback?: any;
}

// PC info including line number, file name, and jump type from source map
// Note: line and file may be undefined when the source map has an invalid file index,
// but jumpType is always preserved for internal function call detection
export interface PcInfo {
  line?: number; // May be undefined for compiler-generated code
  file?: string; // Source file name (e.g., 'Uni.sol', 'SafeMath.sol')
  jumpType?: 'i' | 'o' | '-' | ''; // i=into function, o=out of function, -=regular
}

export interface RawEventLog {
  address: string;
  topics: string[];
  data: string;
}

export interface CallMeta {
  gas_used?: string | number;
  gasUsed?: string | number;
  caller?: string;
  target?: string;
  code_address?: string;
  value?: string | number;
  input?: string;
  output?: string;
  result?: any;
  rawEvents?: RawEventLog[];
  function?: string;
}

export interface FunctionRange {
  name: string;
  start: number;
  end: number;
}

export interface FunctionSignature {
  inputs: { name: string; type: string }[];
  outputs: { name: string; type: string }[];
  visibility?: string;
}

/**
 * Internal function call tracking info used during decodeTrace hierarchy analysis.
 */
export interface FnCallInfo {
  rowIndex: number;
  startFn: string;
  callerFn: string | null;
  startId: number;
  endId: number;
  hasNestedCalls: boolean;
  hasChildOpcodes: boolean;
  isConfirmedCall: boolean;
  hasSideEffects: boolean;
  hasStorageRead: boolean;
  isRecursive: boolean;
  callDepth: number;
  frameTraceId: number;
  sourceFile?: string | null;
  destLine?: number | null;
  srcSourceFile?: string | null;
  srcLine?: number | null;
  hasSrcMapMismatch: boolean;
}

/**
 * Shared context passed between decodeTrace phases.
 * Contains all intermediate state accumulated during trace decoding.
 */
export interface DecodeTraceContext {
  // Raw data
  raw: RawTrace;
  callFrames: any[];
  call: any;
  snaps: any[];
  traceEntries: any[];

  // Source data
  sourceTexts: Record<string, string>;
  sourceLines: string[];
  allArtifactSources: Record<string, any>;

  // Function ranges
  fnRanges: FunctionRange[];
  fnSignatures: Record<string, any>;
  fnRangesPerFile: Map<string, FunctionRange[]>;
  modifierRangesPerFile: Map<string, FunctionRange[]>;
  fnSignaturesPerFile: Map<string, Record<string, any>>;

  // ABI
  iface: any; // ethers.utils.Interface | null
  combinedAbi: any[];

  // PC maps
  pcMapFull: Map<number, PcInfo> | null;
  pcMapFiltered: Map<number, number> | null;
  pcMapsPerContract: Map<string, Map<number, PcInfo>>;
  pcMapsFilteredPerContract: Map<string, Map<number, number>>;

  // Trace ID maps
  traceIdToDepth: Map<number, number>;
  traceIdToParentId: Map<number, number | null>;
  traceIdToCodeAddr: Map<number, string>;
  traceIdToTarget: Map<number, string>;
  childrenByParentId: Map<number, number[]>;
  storageDiffsBySlot: Map<string, { before: string; after: string }>;

  // Addresses
  primaryAddr: string | null;
  hasAnyArtifacts: boolean;
  unverifiedTraceIds: Set<number>;

  // Contract maps (multi-contract)
  codeAddrToContractName: Map<string, string>;
  codeAddrToInterface: Map<string, any>; // ethers.utils.Interface
  codeAddrToFnRanges: Map<string, FunctionRange[]>;
  codeAddrToFnSignatures: Map<string, Record<string, any>>;

  // Opcode rows
  opRows: DecodedTraceRow[];
  callFrameRows: DecodedTraceRow[];
  rowsWithJumps: DecodedTraceRow[];

  // Internal call hierarchy
  fnCallInfos: FnCallInfo[];
  fnCallInfoById: Map<number, FnCallInfo>;
  opIdToInternalParent: Map<number, number | undefined>;

  // Results
  callMeta?: CallMeta;
  rawEvents: RawEventLog[];
  implementationToProxy: Map<string, string>;
}
