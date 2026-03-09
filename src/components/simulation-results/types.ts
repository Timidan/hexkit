import type { SimulationResult } from "../../types/transaction";

export interface SimulationResultsPageProps {
  result?: SimulationResult;
  onReSimulate?: () => void;
}

export type SimulatorTab = "summary" | "contracts" | "events" | "assets" | "state" | "gas" | "debug";
export type TraceRowType = "call" | "opcode" | "event" | "storage";

/**
 * Unified TraceRow interface -- single source of truth used by both
 * simulation-results and execution-trace subsystems.
 */
export interface TraceRow {
  id: string;
  type: TraceRowType;
  label?: string;
  opcodeName?: string;
  opcodeValue?: number;
  pc?: number;
  stackDepth?: number;
  stackTop?: string | null;
  calldata?: string | null;
  from?: string;
  to?: string;
  functionName?: string;
  callType?: string;
  value?: string;
  depth?: number;
  visualDepth?: number;
  isInternalCall?: boolean;
  isInternalReturn?: boolean;
  isLeafCall?: boolean;
  hasChildren?: boolean;
  childEndId?: number;
  parentId?: string;
  internalParentId?: number;
  eventName?: string;
  storageSlot?: string;
  storageBefore?: string | null;
  storageAfter?: string | null;
  isError?: boolean;
  frameKey?: string;
  gasUsed?: string;
  gasCum?: string;
  gasDelta?: string;
  gasRemaining?: string;
  input?: string;
  output?: string;
  returnData?: string | null;
  line?: number;
  sourceFile?: string | null;
  jumpDestFn?: string;
  jumpArgsDecoded?: string;
  jumpArgsDecodedFull?: string;
  jumpResult?: string;
  entry?: boolean;
  entryMeta?: any;
  stepNumber?: number;
  snapshotId?: number;
  decodedLog?: any;
  contractName?: string;
  contract?: string;
  hasNoSourceMaps?: boolean;
}
