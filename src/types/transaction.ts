interface StorageOverride {
  address: string;
  slot: string;
  value: string;
}

export interface TransactionRequest {
  to: string;
  data: string;
  value?: string;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: number;
  type?: number;
  functionName?: string; // Optional function name for display purposes
  // Simulation overrides (supported by EDB)
  blockTag?: string | number; // Block number or tag to fork from
  storageOverrides?: StorageOverride[]; // Storage slot overrides
  // Diamond proxy facet addresses (for fetching facet sources for EDB instrumentation)
  diamondFacetAddresses?: string[];
  // Proxy implementation addresses (for fetching implementation sources for EDB instrumentation)
  proxyImplementationAddresses?: string[];
}

/** Debug session info returned with simulation */
interface DebugSessionInfo {
  sessionId: string;
  rpcPort: number;
  snapshotCount: number;
}

/** Debug level indicates the quality of trace data returned by EDB */
type DebugLevel =
  | 'source-instrumented'  // Full source-level debugging with instrumented bytecode
  | 'opcode-trace'         // Opcode-level trace with call tree (no source maps)
  | 'call-trace'           // Basic call trace from lightweight execution
  | 'eth-call-only';       // Minimal data from eth_call/estimateGas only

export interface SimulationResult {
  mode: 'onchain' | 'local' | 'rpc' | 'edb';
  success: boolean;
  error?: string | null;
  warnings?: string[];
  revertReason?: string | null;
  gasUsed?: string | null;
  gasLimitSuggested?: string | null;
  rawTrace?: { inner?: { inner?: unknown[]; [key: string]: unknown } | unknown[]; [key: string]: unknown } | null;
  // Transaction metadata
  from?: string | null;
  to?: string | null;
  data?: string | null;
  value?: string | null;
  blockNumber?: string | number | null;
  nonce?: number | null;
  functionName?: string | null;
  timestamp?: number | null; // Block timestamp in seconds
  // Gas pricing (EIP-1559 and legacy)
  gasPrice?: string | null; // Legacy gas price or effective gas price
  maxFeePerGas?: string | null; // EIP-1559 max fee
  maxPriorityFeePerGas?: string | null; // EIP-1559 priority fee
  baseFeePerGas?: string | null; // EIP-1559 base fee from block
  effectiveGasPrice?: string | null; // Actual gas price used
  // Transaction type
  type?: number | null; // 0 = Legacy, 1 = EIP-2930, 2 = EIP-1559
  // Debug session - available when simulation uses EDB server
  debugSession?: DebugSessionInfo | null;
  // Chain ID (from EDB simulation)
  chainId?: number | null;
  // Debug level - indicates what quality of trace data is available
  debugLevel?: DebugLevel | null;
  // Contracts involved in the simulation with their verification status
  // Only includes contracts that had code execution (appear in code_address field)
  contracts?: SimulationContract[];
  // ── V2 Trace Schema Fields ──
  // Pre-decoded trace rows from the EDB engine (renderer-first path)
  traceSchemaVersion?: number | null;
  traceLite?: TraceLitePayload | null;
  traceMeta?: TraceMetaPayload | null;
  traceQuality?: TraceQualityPayload | null;
  traceDetailHandle?: TraceDetailHandle | null;
  // ── V3 Rendered Trace (from Rust EDB engine) ──
  // Fully decoded trace rows — when present, frontend skips all TypeScript decode logic
  renderedTrace?: RenderedTrace | null;
}

/** Handle for fetching heavy trace data on demand from the bridge */
interface TraceDetailHandle {
  id: string;
  fields: string[];
  expiresAt: number;
}

/** V2 pre-decoded trace rows from EDB engine */
interface TraceLitePayload {
  version: number;
  rows: TraceLiteRow[];
}

/** Single pre-decoded trace row from EDB engine */
interface TraceLiteRow {
  id: number;
  rowType: 'opcode';
  depth: number;
  parentId: number | null;
  opcode: string;
  opcodeValue: number;
  pc: number;
  gasDelta: string | null;
  gasRemaining: string | null;
  contract: string | null;
  function: string | null;
  frameId: unknown;
  srcRef: {
    file: string | null;
    line: number | null;
    jumpType: string | null;
  } | null;
  entry: {
    traceId: number | null;
    target: string | null;
    codeAddress: string | null;
    callType: string | null;
  };
  storage: {
    read: unknown;
    write: unknown;
  };
  flags: {
    isUnverifiedFrame: boolean;
    srcMapConfidence: 'high' | 'low';
  };
}

/** Source metadata accompanying V2 trace */
interface TraceMetaPayload {
  sourceFiles: Array<{ fileId: number; path: string }>;
  contracts: Array<{ address: string; name: string | null; verified: boolean }>;
}

/** Quality stats for V2 trace */
interface TraceQualityPayload {
  stats: {
    totalRows: number;
    rowsWithSrc: number;
    internalCalls: number;
  };
}

/** V3 rendered trace from Rust EDB engine — fully decoded, zero FE processing needed */
export interface RenderedTrace {
  schemaVersion: number;
  rows: any[];
  sourceTexts: Record<string, string>;
  sourceLines: string[];
  callMeta?: {
    from: string;
    to: string;
    function: string;
    args: string;
    value?: string;
    gasUsed?: string;
  } | null;
  rawEvents: any[];
  implementationToProxy: Record<string, string>;
  quality?: {
    totalRows: number;
    emptyRows: number;
    rowsWithSource: number;
    jumpRows: number;
    entryRows: number;
  } | null;
}

/** Contract involved in simulation with verification status */
export interface SimulationContract {
  address: string;
  name?: string;
  verified: boolean;
  sourceProvider: 'sourcify' | 'etherscan' | 'blockscout' | null;
  fileCount?: number;
}

export interface AssetChange {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  amount: string;
  changeType: 'RECEIVE' | 'SEND' | 'APPROVE';
  rawAmount: string;
  usdValue?: string;
}

