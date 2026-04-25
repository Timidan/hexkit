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
  l1GasPrice: GasPrice;
  l1DataGasPrice: GasPrice;
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

export interface FunctionInvocation {
  contractAddress: string;
  entryPointSelector: string;
  /** Sprint 4 ABI decoder — bridge resolves selector → function name from
   *  the loaded class's ABI (covers contract-specific entrypoints, not just
   *  the std-lib KNOWN_SELECTORS table). Null when the class wasn't loaded
   *  during execution (revert paths, predecessor frames). */
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
}

export interface SimulateResponse {
  simId: string;
  blockContext: BlockContext;
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
  resource_bounds?: Record<string, { max_amount: string; max_price_per_unit: string }>;
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
