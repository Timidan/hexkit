// Canonical type mirrors of the bridge JSON schemas. See
// starknet-sim/crates/bridge/src/http/*.rs for the authoritative shapes and
// tasks/starknet-research/02-simulator-architecture.md for the rationale.

export type BlockIdTag = "latest";
export type BlockId =
  | { tag: BlockIdTag }
  | { blockNumber: number }
  | { blockHash: string };

export type SimulationFlag = "SKIP_VALIDATE" | "SKIP_FEE_CHARGE";

export type StarknetTxVersion = "0x1" | "0x2" | "0x3";

export interface ResourceBounds {
  maxAmount: string;
  maxPricePerUnit: string;
}

export interface InvokeV3 {
  type: "INVOKE";
  version: "0x3";
  senderAddress: string;
  calldata: string[];
  signature: string[];
  nonce: string;
  resourceBounds: {
    l1Gas: ResourceBounds;
    l2Gas: ResourceBounds;
  };
  tip?: string;
  paymasterData?: string[];
  nonceDataAvailabilityMode?: "L1" | "L2";
  feeDataAvailabilityMode?: "L1" | "L2";
}

export type StarknetTx = InvokeV3;

export interface EnrichFlags {
  decodeCalldata?: boolean;
  decodeEvents?: boolean;
  includeStorageReads?: boolean;
}

export interface SimulateRequest {
  blockId: BlockId;
  transactions: StarknetTx[];
  simulationFlags?: SimulationFlag[];
  enrich?: EnrichFlags;
}

export interface ExecutionResources {
  steps: number;
  memoryHoles: number;
  builtinInstanceCounter: Record<string, number>;
  l1Gas: number;
  l1DataGas: number;
  l2Gas: number;
}

export interface FeeEstimate {
  l1GasConsumed: string;
  l1DataGasConsumed: string;
  l2GasConsumed: string;
  overallFee: string;
  unit: "WEI" | "FRI";
}

export interface GasPrice {
  priceInWei: string;
  priceInFri: string;
}

export interface BlockContext {
  blockNumber: number;
  blockHash: string;
  timestamp: number;
  sequencerAddress: string;
  starknetVersion: string;
  l1GasPrice: GasPrice;
  l1DataGasPrice: GasPrice;
}

export interface StateDiff {
  storageDiffs: Array<{
    address: string;
    storageEntries: Array<{ key: string; value: string }>;
  }>;
  nonces: Array<{ contractAddress: string; nonce: string }>;
  deployedContracts: Array<{ address: string; classHash: string }>;
  declaredClasses: Array<{ classHash: string; compiledClassHash: string }>;
  replacedClasses: Array<{ contractAddress: string; classHash: string }>;
}

export interface SimulationEvent {
  fromAddress: string;
  keys: string[];
  data: string[];
  decoded?: { name: string; args: Record<string, string | number | boolean> };
}

export interface L2ToL1Message {
  fromAddress: string;
  toAddress: string;
  payload: string[];
}

export interface FunctionInvocation {
  contractAddress: string;
  entryPointSelector: string;
  calldata: string[];
  callerAddress: string;
  classHash: string;
  entryPointType: "EXTERNAL" | "L1_HANDLER" | "CONSTRUCTOR";
  callType: "CALL" | "DELEGATE" | "LIBRARY_CALL";
  result: string[];
  calls: FunctionInvocation[];
  events: SimulationEvent[];
  messages: L2ToL1Message[];
  executionResources: ExecutionResources;
  decodedEntryPoint?: { name: string };
}

export type SimulationStatus = "SUCCEEDED" | "REVERTED";

export interface SimulationResult {
  status: SimulationStatus;
  transactionHash: string;
  executionResources: ExecutionResources;
  feeEstimate: FeeEstimate;
  validateInvocation: FunctionInvocation | null;
  executeInvocation: FunctionInvocation | null;
  feeTransferInvocation: FunctionInvocation | null;
  stateDiff: StateDiff;
  events: SimulationEvent[];
  messagesToL1: L2ToL1Message[];
  revertReason: string | null;
  revertReasonDecoded: string | null;
}

export interface SimulateResponse {
  simId: string;
  blockContext: BlockContext;
  results: SimulationResult[];
}

export interface HealthResponse {
  status: "ok";
  bridge_version: string;
  git_sha: string;
  bind_addr: string;
}

export interface VersionResponse {
  bridge_version: string;
  bridge_git_sha: string;
  pathfinder_rev: string | null;
  blockifier_rev: string | null;
  starknet_rpc_version: string;
}

export type BridgeErrorCode =
  | "UNAUTHORIZED"
  | "SIMULATION_FAILED"
  | "BLOCK_NOT_FOUND"
  | "TX_NOT_FOUND"
  | "INVALID_TRANSACTION"
  | "STATE_UNAVAILABLE"
  | "NOT_IMPLEMENTED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "PENDING_UNSUPPORTED"
  | "STALE_FORK"
  | "BLOCKIFIER_PANIC";

export interface BridgeErrorBody {
  code: BridgeErrorCode;
  message: string;
}

export interface BridgeErrorEnvelope {
  error: BridgeErrorBody;
}
