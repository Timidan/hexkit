// Canonical type mirrors of the bridge JSON schemas. See
// starknet-sim/crates/bridge/src/http/*.rs for the authoritative shapes and
// tasks/starknet-research/02-simulator-architecture.md for the rationale.

import type { StarknetDebugTrace } from "./debug/starknetDebugTypes";
import type {
  StarknetDebugTraceHandle,
  StarknetDebugTraceMeta,
} from "./debug/starknetDebugVault";

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
    l1DataGas: ResourceBounds;
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
  chainId?: string | null;
  l1GasPrice: GasPrice;
  l1DataGasPrice: GasPrice;
  l2GasPrice?: GasPrice | null;
}

export interface StateDiff {
  storageDiffs: Array<{
    address: string;
    storageEntries: Array<{ key: string; before: string; value: string }>;
  }>;
  nonceUpdates: Array<{ contractAddress: string; nonce: string }>;
  classHashUpdates: Array<{ contractAddress: string; classHash: string }>;
  declaredClasses: Array<{ classHash: string; compiledClassHash: string }>;
  summary: {
    contractsTouched: number;
    storageWrites: number;
    nonceUpdates: number;
    classHashUpdates: number;
    declaredClasses?: number;
  };
}

export interface SimulationEvent {
  fromAddress: string;
  keys: string[];
  data: string[];
  decoded?: { name: string; args: Record<string, string | number | boolean> };
  /** Bridge-resolved event signature (name + typed fields). Lets the UI
   *  label `data[0]/data[1]` as `value: u256` etc. instead of "[2 felts]". */
  decodedEventAbi?: AbiEventDecoded | null;
}

export interface L2ToL1Message {
  fromAddress: string;
  toAddress: string;
  payload: string[];
}

export interface InvocationResources {
  /** Cumulative VM steps for this call's subtree (this frame + all inner calls). */
  steps: number;
  memoryHoles: number;
  builtinInstanceCounter: Record<string, number>;
  /** Sierra gas consumed by this call's subtree (0 in CairoSteps-tracked calls). */
  gasConsumed: number;
}

export interface FunctionInvocation {
  contractAddress: string;
  entryPointSelector: string;
  /** Cumulative execution resources for this call's subtree. Present on
   *  local-blockifier responses; absent on pure RPC-trace responses. */
  executionResources?: InvocationResources | null;
  /** Bridge trace sink call index for this entrypoint when trace_steps was
   *  enabled. The sink is postorder for nested calls, so consumers should use
   *  this field over positional pairing when present. */
  traceCallId?: number;
  /** Bridge-resolved function name from the loaded class ABI. Covers
   *  contract-specific entrypoints, not just the std-lib selector table. */
  decodedSelector?: string | null;
  /** Full function signature (name, kind, inputs, outputs). Same source
   *  as decodedSelector but exposes parameter names + Cairo types so the
   *  UI can label calldata felts instead of dumping raw hex. */
  decodedFunctionAbi?: AbiFunctionDecoded | null;
  calldata: string[];
  callerAddress: string;
  classHash: string | null;
  entryPointType: string;
  callType: string;
  /** Present on reverted invocation nodes when the upstream trace can
   *  attribute the revert to this call frame. Older bridge responses
   *  only expose `SimulationResult.revertReason`, so consumers must
   *  treat this as optional and keep a top-level fallback path. */
  revertReason?: string | null;
  result: string[];
  calls: FunctionInvocation[];
  events: SimulationEvent[];
  messages: L2ToL1Message[];
}

export interface AbiParam {
  name: string;
  /** Cairo type string verbatim from the contract ABI, e.g.
   *  `core::starknet::contract_address::ContractAddress`,
   *  `core::array::Array::<core::felt252>`. */
  type: string;
}

export interface AbiFunctionDecoded {
  name: string;
  kind: "Function" | "L1Handler" | "Constructor" | "Event";
  inputs: AbiParam[];
  outputs: AbiParam[];
}

export interface AbiEventDecoded {
  name: string;
  fields: AbiParam[];
}

export type SimulationStatus = "SUCCEEDED" | "REVERTED";

/** Single relocated cairo-vm step captured during execution. One entry per
 *  CASM instruction. `callId` indexes into the flattened ContractCall
 *  sequence so the frontend can map each step back to the parent
 *  FunctionInvocation. */
export interface TraceStep {
  pc: number;
  ap: number;
  fp: number;
  callId: number;
  /** Pre-computed by the bridge for debug-mode traces; maps directly to a
   *  Sierra statement without needing a separate pcToStatement lookup. */
  statementIdx?: number | null;
  /** Class hash of the contract executing this step (debug-mode traces). */
  classHash?: string | null;
}

/** Synthesized FUNCTION frame derived from the raw step trace by walking the
 *  fp ladder. Each frame is a contiguous run of steps with a constant fp,
 *  parented to the caller frame whose fp is the next-lower value on the stack. */
export interface FunctionFrame {
  frameId: number;
  callId: number;
  parentFrameId: number | null;
  fp: number;
  apIn: number;
  apOut: number;
  pcStart: number;
  pcEnd: number;
  stepIndexStart: number;
  stepIndexEnd: number;
}

export interface SimulationResult {
  status: SimulationStatus;
  executionResources: ExecutionResources;
  feeEstimate: FeeEstimate;
  validateInvocation: FunctionInvocation | null;
  executeInvocation: FunctionInvocation | null;
  feeTransferInvocation: FunctionInvocation | null;
  stateDiff: StateDiff | null;
  revertReason: string | null;
  revertReasonDecoded: string | null;
  /** Present when the request used `?trace_steps=1`. The default
   *  trace path skips this — keeps the upstream `traceTransaction`
   *  branch (~600 ms) unchanged. */
  traceSteps?: TraceStep[];
  /** Present when the request used `?trace_steps=1`. Computed in the
   *  bridge by walking the per-call fp ladder; see
   *  `crates/bridge/src/exec/frames.rs::synthesize_function_frames`. */
  functionFrames?: FunctionFrame[];
  /** Canonical offline Starknet debugger artifact. Present when Debug was
   *  enabled for simulation or local replay captured VM trace data. */
  debugTrace?: StarknetDebugTrace;
  debugTraceHandle?: StarknetDebugTraceHandle;
  debugTraceMeta?: StarknetDebugTraceMeta;
  debugTraceError?: string;
  stateDiffSource?: "starknet_traceTransaction" | "local_replay" | string;
  traceStepsSource?: "starknet_traceTransaction" | "local_replay" | string;
  stateDiffWarning?: string;
  traceStepsWarning?: string;
}

export interface SimulateResponse {
  simId: string;
  blockContext: BlockContext;
  chainId?: string | null;
  results: SimulationResult[];
  /** Bridge-emitted Cairo struct / enum registry, keyed by fully
   *  qualified type name (e.g. `core::starknet::account::Call`). The
   *  UI walks this when recursively decoding composite calldata
   *  (arrays of structs, structs that nest other structs, etc). */
  types?: Record<string, AbiTypeDef>;
  /** Raw RPC tx body (only present on /trace responses). Fields are
   *  the verbatim Starknet RPC v0.10 layout: nonce, version, tip,
   *  signature, calldata, resource_bounds, paymaster_data, etc. */
  txBody?: TxBody;
  /** Raw RPC receipt (only present on /trace responses). Carries
   *  finality_status / execution_status, actual_fee, messages_sent,
   *  block_number, block_hash. */
  txReceipt?: TxReceipt;
  source?: "starknet_traceTransaction" | "local_replay" | string;
  warning?: string;
  /** Source of the state diff currently attached to `results[0]`.
   *  Landed tx traces usually start from `starknet_traceTransaction`,
   *  then hydrate state/debug data with a background local replay. */
  stateDiffSource?: "starknet_traceTransaction" | "local_replay" | string;
  traceStepsSource?: "starknet_traceTransaction" | "local_replay" | string;
  stateDiffWarning?: string;
}

export interface TxBody {
  type?: string;
  version?: string;
  transaction_hash?: string;
  sender_address?: string;
  nonce?: string;
  tip?: string;
  signature?: string[];
  calldata?: string[];
  paymaster_data?: string[];
  account_deployment_data?: string[];
  nonce_data_availability_mode?: string;
  fee_data_availability_mode?: string;
  resource_bounds?: Record<
    string,
    { max_amount: string; max_price_per_unit: string }
  >;
}

export interface TxReceipt {
  type?: string;
  transaction_hash?: string;
  block_number?: number;
  block_hash?: string;
  execution_status?: string;
  finality_status?: string;
  actual_fee?: { amount: string; unit: string };
  events?: unknown[];
  messages_sent?: unknown[];
  execution_resources?: unknown;
}

export type AbiTypeDef =
  | { kind: "struct"; fields: AbiParam[] }
  | { kind: "enum"; variants: AbiParam[] };

export type SimulatePrepareStatusValue =
  | "queued"
  | "preparing"
  | "ready"
  | "failed";

export interface SimulatePrepareStartResponse {
  prepareId: string;
}

export interface SimulatePrepareStatus {
  prepareId: string;
  status: SimulatePrepareStatusValue;
  stage: string;
  progressPct: number;
  message: string;
  createdAtMs?: number;
  updatedAtMs?: number;
  error?: string | null;
}

/** `/estimate-fee` envelope. The bridge runs simulate with
 *  SKIP_FEE_CHARGE and emits only the fee + execution-resources
 *  block per tx (no call tree, no events) — see
 *  starknet-sim/crates/bridge/src/http/estimate_fee.rs and
 *  trace_map::map_fee_only. */
export interface EstimateFeeResponse {
  blockContext: BlockContext;
  estimates: Array<{
    feeEstimate: FeeEstimate;
    executionResources: ExecutionResources;
  }>;
}

export interface HealthResponse {
  status: "ok";
  bridge_version: string;
  git_sha: string;
  bind_addr: string;
  rpc_configured?: boolean;
  chain_id?: string | null;
  spec_version?: string | null;
  fork_head?: {
    block_number: number;
    block_hash: string;
    parent_hash: string;
    timestamp: number;
    sequencer_address: string;
    starknet_version: string;
    l1_gas_price?: { price_in_wei: string; price_in_fri: string } | null;
    l1_data_gas_price?: { price_in_wei: string; price_in_fri: string } | null;
    l2_gas_price?: { price_in_wei: string; price_in_fri: string } | null;
  } | null;
  rpc_latency_ms?: number | null;
  rpc_error?: string | null;
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
