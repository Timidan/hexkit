export type NodeBackend = 'anvil' | 'hardhat' | 'ganache' | 'unknown';

export interface ChainInfo {
  chainId: number;
  blockNumber: number;
  automine: boolean;
  forkUrl?: string;
  forkBlockNumber?: number;
}

export interface AccountInfo {
  address: string;
  balance: bigint;
  nonce: number;
  isImpersonated: boolean;
  label?: string;
}

export interface QuickTrace {
  txHash: string;
  status: 'success' | 'revert';
  revertReason?: string;
  gasUsed: string; // hex string — bigint not serializable in IndexedDB
  calls: CallNode[];
  events: DecodedEvent[];
  storageDiffs: StorageDiff[];
  rawTrace: StructLog[];
}

export interface CallNode {
  type: 'CALL' | 'DELEGATECALL' | 'STATICCALL' | 'CREATE' | 'CREATE2';
  from: string;
  to: string;
  input: string;
  output: string;
  gasUsed: bigint;
  value: bigint;
  depth: number;
  children: CallNode[];
  error?: string;
}

export interface StorageDiff {
  address: string;
  slot: string;
  previousValue: string;
  newValue: string;
  label?: string;
}

export interface DecodedEvent {
  address: string;
  name?: string;
  signature?: string;
  args?: Record<string, unknown>;
  topics: string[];
  data: string;
}

export interface StructLog {
  pc: number;
  op: string;
  gas: number;
  gasCost: number;
  depth: number;
  stack?: string[];
  memory?: string[];
  storage?: Record<string, string>;
}

export interface SpawnConfig {
  type: NodeBackend;
  forkUrl?: string;
  forkBlockNumber?: number;
  chainId?: number;
  accountCount?: number;
  balance?: string;
  port?: number;
}

export interface NamedSnapshot {
  id: string;
  name: string;
  blockNumber: number;
  timestamp: number;
}

export interface DeployedContract {
  name: string;
  address: string;
  abi: unknown[];
  bytecode: string;
  deployTxHash: string;
  deployBlock: number;
  sourceFile?: string;
}

export interface CompilationArtifact {
  contractName: string;
  abi: unknown[];
  bytecode: string;
  deployedBytecode: string;
  sourceMap: string;
  deployedSourceMap: string;
  ast: unknown;
  storageLayout?: unknown;
  sourceFile: string;
  compilerVersion: string;
  contentHash: string;
}

export interface WatchExpression {
  id: string;
  contractAddress: string;
  functionName: string;
  args: unknown[];
  label: string;
  lastValue?: string;
}

/**
 * Error thrown when an operation is not supported on the connected backend.
 * Ganache does not support state surgery, impersonation, or reset.
 */
export class UnsupportedOperationError extends Error {
  constructor(operation: string, backend: NodeBackend) {
    super(`"${operation}" is not supported on ${backend}`);
    this.name = 'UnsupportedOperationError';
  }
}
