// Re-exports so adapter-routed callers don't reach into
// src/utils/transaction-simulation directly.
export {
  simulateTransaction,
  replayTransactionWithSimulator,
} from "../../utils/transactionSimulation";

export type { SimulationResult } from "../../types/transaction";
