// Barrel re-exports for transaction-simulation module
export type {
  SourcifySourceEntry,
  SourcifyArtifact,
  SourcifyMetadataResult,
  BridgeSimulationResponsePayload,
  BridgeAnalysisOptions,
  RevertDetails,
} from './types';

export { PANIC_CODE_MESSAGES } from './types';

export {
  buildArtifactsFromSourcify,
  fetchBlockscoutMetadata,
} from './artifactFetching';

export {
  ensureHexPrefix,
  parseReasonFromString,
  decodeRevertData,
  extractRevertDetails,
  buildFailureRawTrace,
  findRevertDataInError,
  normalizeErrorArgs,
} from './revertHandling';

export {
  postSimulatorJob,
  trySimulatorBridge,
  replayTransactionWithSimulator,
} from './bridgeSimulation';

export {
  simulateTransaction,
} from './simulationEntryPoints';
