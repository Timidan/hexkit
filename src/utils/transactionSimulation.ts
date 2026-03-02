// Thin barrel re-export — all implementation moved to ./transaction-simulation/
// Preserves existing import paths: import { ... } from '../utils/transactionSimulation'

export {
  // Types
  type SourcifySourceEntry,
  type SourcifyArtifact,
  type SourcifyMetadataResult,
  type BridgeSimulationResponsePayload,
  type BridgeAnalysisOptions,
  type RevertDetails,
  PANIC_CODE_MESSAGES,

  // Artifact fetching
  buildArtifactsFromSourcify,
  fetchBlockscoutMetadata,

  // Revert handling
  ensureHexPrefix,
  parseReasonFromString,
  decodeRevertData,
  extractRevertDetails,
  buildFailureRawTrace,
  findRevertDataInError,
  normalizeErrorArgs,

  // Bridge simulation
  postSimulatorJob,
  trySimulatorBridge,
  replayTransactionWithSimulator,

  // Simulation entry points
  simulateTransaction,
} from './transaction-simulation';
