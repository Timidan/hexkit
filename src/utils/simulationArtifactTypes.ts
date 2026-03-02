/**
 * Type definitions for simulation artifacts.
 *
 * Extracted from simulationArtifacts.ts to keep each module under 800 lines.
 */

export type SimulationCallNode = {
  frameKey: string;
  type?: string;
  from?: string;
  to?: string;
  functionName?: string;
  label?: string;
  gasUsed?: string | number;
  value?: string | number;
  input?: string;
  output?: string;
  depth?: number;
  error?: string | null;
  children?: SimulationCallNode[];
};

export type SimulationEventEntry = {
  name?: string;
  signature?: string;
  address?: string;
  decoded?: unknown;
  data?: { topics?: string[]; data?: string; [key: string]: unknown };
  topics?: string[];
};

export type SimulationStorageDiffEntry = {
  address?: string;
  slot?: string;
  key?: string;
  before?: string;
  after?: string;
  value?: string;
};

export type SimulationAssetChangeEntry = {
  address?: string;
  symbol?: string;
  amount?: string;
  rawAmount?: string;
  direction?: "in" | "out";
  counterparty?: string;
  name?: string;
};

export type SimulationSnapshotEntry = {
  id?: number;
  frameId?: number;
  type: "opcode" | "hook";
  targetAddress?: string;
  bytecodeAddress?: string;
  pc?: number;
  opcode?: number;
  stackTop?: string | null;
  stackDepth?: number;
  calldata?: string | null;
  gasRemaining?: number | string | null;
  gasCost?: number | string | null;
  storageRead?: { slot?: string; value?: string } | null;
  storageWrite?: { slot?: string; before?: string; after?: string } | null;
  sourcePath?: string | null;
  sourceOffset?: number | null;
  sourceLength?: number | null;
  locals?: Record<string, unknown> | null;
  state?: Record<string, unknown> | null;
};

// Lightweight opcode entry for lazy loading mode (when full snapshots are not sent)
export type LightweightOpcodeEntry = {
  id: number;
  frame_id?: { depth: number; index: number };
  frameId?: { depth: number; index: number };
  pc: number;
  opcode: number;
  gas_remaining?: number;
  gasRemaining?: number;
  gas_used?: number;
  gasUsed?: number;
  target_address?: string;
  targetAddress?: string;
  bytecode_address?: string;
  bytecodeAddress?: string;
  storage_read?: { slot: string; value: string } | null;
  storageRead?: { slot: string; value: string } | null;
  storage_write?: { slot: string; before: string; after: string } | null;
  storageWrite?: { slot: string; before: string; after: string } | null;
  stack_top?: string | null;
  stackTop?: string | null;
  stack_depth?: number;
  stackDepth?: number;
};

export interface SimulationArtifacts {
  callTree: SimulationCallNode[];
  events: SimulationEventEntry[];
  assetChanges: SimulationAssetChangeEntry[];
  storageDiffs: SimulationStorageDiffEntry[];
  snapshots: SimulationSnapshotEntry[];
  opcodeTrace: LightweightOpcodeEntry[];
  rawReturnData: string | null;
  rawPayload: string | null;
}

export interface ExtractSimulationArtifactsOptions {
  includeRawPayload?: boolean;
}
