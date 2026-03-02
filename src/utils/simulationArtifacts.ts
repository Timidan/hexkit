/**
 * Simulation artifact extraction and helpers.
 *
 * Types live in ./simulationArtifactTypes.ts
 * EDB trace conversion lives in ./edbTraceConverter.ts
 * This file is the entry point and re-exports everything.
 */

import type { SimulationResult } from "../types/transaction";

// Re-export types
export type {
  SimulationCallNode,
  SimulationEventEntry,
  SimulationStorageDiffEntry,
  SimulationAssetChangeEntry,
  SimulationSnapshotEntry,
  LightweightOpcodeEntry,
  SimulationArtifacts,
  ExtractSimulationArtifactsOptions,
} from "./simulationArtifactTypes";

import type {
  SimulationCallNode,
  SimulationAssetChangeEntry,
  SimulationStorageDiffEntry,
  SimulationSnapshotEntry,
  LightweightOpcodeEntry,
  SimulationArtifacts,
  ExtractSimulationArtifactsOptions,
} from "./simulationArtifactTypes";

// Re-export EDB converter helpers
export {
  convertEdbTraceToArtifacts,
  normalizeAssetChangeEntry,
  buildOpcodeTraceFromTraceLiteRows,
} from "./edbTraceConverter";

import { convertEdbTraceToArtifacts, normalizeAssetChangeEntry, buildOpcodeTraceFromTraceLiteRows } from "./edbTraceConverter";

// ---- shared utilities -------------------------------------------------

export const ensureArray = <T,>(value: unknown, mapFn?: (item: any) => T): T[] => {
  if (Array.isArray(value)) {
    return mapFn ? value.map(mapFn) : (value as T[]);
  }
  if (value && typeof value === "object") {
    return mapFn ? [mapFn(value)] : [value as T];
  }
  return [];
};

export const normalizeHex = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  return value.startsWith("0x") ? value : `0x${value}`;
};

const parseRawTracePayload = (rawTrace: unknown): Record<string, any> | null => {
  if (!rawTrace) return null;
  let trace: any = rawTrace;
  if (typeof trace === "string") {
    try {
      trace = JSON.parse(trace);
    } catch {
      return null;
    }
  }
  if (trace && typeof trace === "object" && trace.rawTrace) {
    trace = trace.rawTrace;
    if (typeof trace === "string") {
      try {
        trace = JSON.parse(trace);
      } catch {
        return null;
      }
    }
  }
  return trace && typeof trace === "object" ? (trace as Record<string, any>) : null;
};

export const buildOpcodeTraceFromSnapshots = (
  rawTrace: unknown
): LightweightOpcodeEntry[] => {
  const traceObj = parseRawTracePayload(rawTrace);
  if (!traceObj) return [];
  const snapshotEntries = ensureArray(traceObj.snapshots ?? traceObj.inner?.snapshots);
  if (snapshotEntries.length === 0) return [];

  const opcodeTrace: LightweightOpcodeEntry[] = [];
  snapshotEntries.forEach((entry: any, index: number) => {
    if (!entry || typeof entry !== "object") return;
    const detail = entry.detail ?? entry.Detail ?? entry;
    const opcodeDetail = detail?.Opcode ?? detail?.opcode;
    if (!opcodeDetail || typeof opcodeDetail !== "object") return;

    const stackArray = ensureArray(opcodeDetail.stack).map((item) =>
      typeof item === "string" ? item : JSON.stringify(item)
    );
    const storageRead =
      opcodeDetail.storage_read ?? opcodeDetail.storageRead ?? entry.storageRead ?? entry.storage_read ?? null;
    const storageWrite =
      opcodeDetail.storage_write ?? opcodeDetail.storageWrite ?? entry.storageWrite ?? entry.storage_write ?? null;

    opcodeTrace.push({
      id: entry.id ?? opcodeDetail.id ?? index,
      frame_id: entry.frame_id ?? opcodeDetail.frame_id,
      pc: opcodeDetail.pc ?? entry.pc ?? 0,
      opcode: opcodeDetail.opcode ?? entry.opcode ?? 0,
      gas_remaining: opcodeDetail.gas_remaining ?? opcodeDetail.gasRemaining,
      gas_used: opcodeDetail.gas_used ?? opcodeDetail.gasUsed ?? opcodeDetail.gas_cost ?? opcodeDetail.gasCost,
      target_address: entry.target_address ?? opcodeDetail.target_address ?? opcodeDetail.targetAddress ?? entry.targetAddress,
      bytecode_address: entry.bytecode_address ?? opcodeDetail.bytecode_address ?? opcodeDetail.bytecodeAddress ?? entry.bytecodeAddress,
      stack_top: stackArray.length ? stackArray[stackArray.length - 1] : undefined,
      stack_depth: stackArray.length ? stackArray.length : undefined,
      storage_read: storageRead,
      storage_write: storageWrite,
    });
  });

  return opcodeTrace;
};

// ---- public helpers ---------------------------------------------------

export const flattenCallTreeEntries = (
  nodes: SimulationCallNode[]
): SimulationCallNode[] => {
  const list: SimulationCallNode[] = [];
  const walk = (arr: SimulationCallNode[]) => {
    arr.forEach((node) => {
      list.push(node);
      if (node.children && node.children.length) {
        walk(node.children);
      }
    });
  };
  walk(nodes);
  return list;
};

export const getCallNodeError = (node?: SimulationCallNode | null) =>
  node?.error ?? null;

// ---- main extraction --------------------------------------------------

export const extractSimulationArtifacts = (
  result: SimulationResult,
  options: ExtractSimulationArtifactsOptions = {}
): SimulationArtifacts => {
  const includeRawPayload = options.includeRawPayload === true;
  const artifacts: SimulationArtifacts = {
    callTree: [],
    events: [],
    assetChanges: [],
    storageDiffs: [],
    snapshots: [],
    opcodeTrace: [],
    rawReturnData: null,
    rawPayload: null,
  };

  const rawTrace = result.rawTrace;
  const traceLiteRows = ensureArray((result as any)?.traceLite?.rows);
  if (rawTrace === null || rawTrace === undefined) {
    if (traceLiteRows.length > 0) {
      artifacts.opcodeTrace = buildOpcodeTraceFromTraceLiteRows(traceLiteRows);
    }
    return artifacts;
  }

  if (typeof rawTrace === "string") {
    artifacts.rawPayload = includeRawPayload ? rawTrace : null;
    artifacts.rawReturnData = normalizeHex(rawTrace);
    return artifacts;
  }

  if (Array.isArray(rawTrace)) {
    if (includeRawPayload) {
      try {
        artifacts.rawPayload = JSON.stringify(rawTrace, null, 2);
      } catch {
        artifacts.rawPayload = null;
      }
    }
    const converted = convertEdbTraceToArtifacts(rawTrace);
    artifacts.callTree = converted.callTree;
    artifacts.events = converted.events;
    artifacts.assetChanges = converted.assetChanges;
    return artifacts;
  }

  if (typeof rawTrace !== "object") {
    return artifacts;
  }

  const traceObj = rawTrace as Record<string, any>;
  if (includeRawPayload) {
    try {
      artifacts.rawPayload = JSON.stringify(traceObj, null, 2);
    } catch {
      artifacts.rawPayload = null;
    }
  }

  // Handle nested inner structure (EDB has inner.inner)
  let innerTraceEntries: any[] = [];

  // First check if there's a double-nested structure: rawTrace.inner.inner
  if (traceObj.inner && typeof traceObj.inner === 'object' && traceObj.inner.inner) {
    innerTraceEntries = ensureArray(traceObj.inner.inner);
  }
  // Otherwise check if rawTrace.inner is directly an array
  else if (traceObj.inner) {
    innerTraceEntries = ensureArray(traceObj.inner);
  }

  if (innerTraceEntries.length > 0) {
    const converted = convertEdbTraceToArtifacts(innerTraceEntries);
    artifacts.callTree = converted.callTree;
    artifacts.events = converted.events;
    artifacts.assetChanges = converted.assetChanges;
  }

  if (artifacts.callTree.length === 0) {
    const treeCandidates = [
      traceObj.callTree,
      traceObj.trace,
      traceObj.calls,
      traceObj.callPath,
    ];
    for (const candidate of treeCandidates) {
      const nodes = ensureArray<SimulationCallNode>(candidate);
      if (nodes.length > 0) {
        artifacts.callTree = nodes;
        break;
      }
    }
  }

  if (artifacts.events.length === 0) {
    const eventCandidates = ensureArray(traceObj.events)
      .concat(ensureArray(traceObj.logs))
      .concat(ensureArray(traceObj.decodedLogs))
      .concat(ensureArray(traceObj.eventLogs));
    artifacts.events = eventCandidates.map((event: any) => ({
      name: event?.name || event?.event,
      signature: event?.signature,
      // NOTE: event.contract could be a name, not address - only use actual address fields
      address: event?.address || event?.data?.address || event?.logInfo?.address,
      decoded: event?.args ?? event?.decoded,
      data: event,
    }));
  }

  const serverAssetChanges = ensureArray(traceObj.assetChanges)
    .map((entry) => normalizeAssetChangeEntry(entry))
    .filter(Boolean) as SimulationAssetChangeEntry[];
  if (serverAssetChanges.length > 0) {
    artifacts.assetChanges = [...serverAssetChanges, ...artifacts.assetChanges];
  }

  // Extract lightweight opcode trace first to avoid duplicating heavy snapshot payloads.
  const opcodeTraceEntries = ensureArray(traceObj.opcodeTrace);
  if (opcodeTraceEntries.length > 0) {
    artifacts.opcodeTrace = opcodeTraceEntries as LightweightOpcodeEntry[];
  } else if (traceLiteRows.length > 0) {
    artifacts.opcodeTrace = buildOpcodeTraceFromTraceLiteRows(traceLiteRows);
  }

  const snapshotEntries = ensureArray(traceObj.snapshots);
  if (artifacts.opcodeTrace.length === 0 && snapshotEntries.length > 0) {
    artifacts.snapshots = snapshotEntries
      .map((entry: any) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const detail = entry.detail ?? entry.Detail ?? entry;
        const opcodeDetail = detail?.Opcode ?? detail?.opcode;
        const hookDetail = detail?.Hook ?? detail?.hook;
        if (opcodeDetail) {
          const stackArray = ensureArray(opcodeDetail.stack).map((item) =>
            typeof item === "string" ? item : JSON.stringify(item)
          );
          const storageRead = opcodeDetail.storage_read ?? opcodeDetail.storageRead ?? null;
          const storageWrite = opcodeDetail.storage_write ?? opcodeDetail.storageWrite ?? null;
          return {
            id: entry.id ?? opcodeDetail.id,
            frameId: entry.frame_id ?? opcodeDetail.frame_id,
            type: "opcode" as const,
            targetAddress:
              entry.target_address ??
              opcodeDetail.target_address ??
              opcodeDetail.targetAddress,
            bytecodeAddress:
              entry.bytecode_address ??
              opcodeDetail.bytecode_address ??
              opcodeDetail.bytecodeAddress,
            pc: opcodeDetail.pc,
            opcode: opcodeDetail.opcode,
            stackTop: stackArray.length ? stackArray[stackArray.length - 1] : null,
            stackDepth: stackArray.length,
            calldata:
              opcodeDetail.calldata ??
              opcodeDetail.call_data ??
              opcodeDetail.callData ??
              null,
            gasRemaining: opcodeDetail.gas_remaining ?? opcodeDetail.gasRemaining ?? null,
            gasCost: opcodeDetail.gas_cost ?? opcodeDetail.gasCost ?? null,
            storageRead,
            storageWrite,
          };
        }
        if (hookDetail) {
          return {
            id: entry.id ?? hookDetail.id,
            frameId: entry.frame_id ?? hookDetail.frame_id,
            type: "hook" as const,
            targetAddress:
              entry.target_address ??
              hookDetail.target_address ??
              hookDetail.targetAddress,
            bytecodeAddress:
              entry.bytecode_address ??
              hookDetail.bytecode_address ??
              hookDetail.bytecodeAddress,
            sourcePath: hookDetail.path ?? null,
            sourceOffset: hookDetail.offset ?? null,
            sourceLength: hookDetail.length ?? null,
            locals: hookDetail.locals ?? null,
            state:
              hookDetail.state_variables ??
              hookDetail.stateVariables ??
              null,
          };
        }
        return null;
      })
      .filter(Boolean) as SimulationSnapshotEntry[];
    artifacts.opcodeTrace = buildOpcodeTraceFromSnapshots(traceObj);
  }

  // Handle storage diffs - can be object {address: {slot: value}} or array
  const storageDiffsRaw = traceObj.storageDiffs ?? traceObj.stateDiffs ?? traceObj.storageChanges;

  if (storageDiffsRaw && typeof storageDiffsRaw === 'object' && !Array.isArray(storageDiffsRaw)) {
    // EDB format: { "0xAddress": { "0xSlot": "0xValue" } }
    artifacts.storageDiffs = [];
    Object.entries(storageDiffsRaw).forEach(([address, slots]) => {
      if (slots && typeof slots === 'object') {
        Object.entries(slots as Record<string, any>).forEach(([slot, value]) => {
          artifacts.storageDiffs.push({
            address,
            slot,
            key: slot,
            before: undefined,
            after: typeof value === 'string' ? value : JSON.stringify(value),
            value: typeof value === 'string' ? value : JSON.stringify(value),
          });
        });
      }
    });
  } else {
    // Array format: [{ address, slot, before, after }]
    const storageCandidates = ensureArray(storageDiffsRaw);
    artifacts.storageDiffs = storageCandidates.map((entry: any) => ({
      address: entry?.address,
      slot: entry?.slot ?? entry?.key,
      key: entry?.key,
      before: entry?.before ?? entry?.previous,
      after: entry?.after ?? entry?.current ?? entry?.value,
      value: entry?.value,
    }));
  }

  // Supplement storageDiffs with SSTORE operations from external contracts
  if (snapshotEntries.length > 0) {
    const existingAddresses = new Set(
      artifacts.storageDiffs
        .map((d) => d.address?.toLowerCase())
        .filter(Boolean)
    );

    const additionalDiffs: Map<string, SimulationStorageDiffEntry> = new Map();

    snapshotEntries.forEach((entry: any) => {
      if (!entry || typeof entry !== 'object') return;

      const detail = entry.detail ?? entry.Detail ?? entry;
      const opcodeDetail = detail?.Opcode ?? detail?.opcode;
      if (!opcodeDetail) return;

      const opcode = opcodeDetail.opcode;
      if (opcode !== 85 && opcode !== 0x55) return;

      const targetAddress = entry.target_address ?? opcodeDetail.target_address;
      if (!targetAddress) return;

      if (existingAddresses.has(targetAddress.toLowerCase())) return;

      const stack = ensureArray(opcodeDetail.stack);
      if (stack.length < 2) return;

      const slot = String(stack[stack.length - 1]);
      const value = String(stack[stack.length - 2]);

      const key = `${targetAddress.toLowerCase()}:${slot.toLowerCase()}`;
      const existing = additionalDiffs.get(key);

      additionalDiffs.set(key, {
        address: targetAddress,
        slot,
        key: slot,
        before: existing?.before,
        after: value,
        value,
      });
    });

    if (additionalDiffs.size > 0) {
      artifacts.storageDiffs = [
        ...artifacts.storageDiffs,
        ...Array.from(additionalDiffs.values()),
      ];
    }
  }

  // Extract return data
  let extractedReturnData: string | null =
    normalizeHex(traceObj.returnData) ??
    normalizeHex(traceObj.output) ??
    normalizeHex(traceObj.return_value) ??
    null;

  if (!extractedReturnData && innerTraceEntries.length > 0) {
    const rootEntry = innerTraceEntries[0];
    const result = rootEntry?.result;
    extractedReturnData =
      normalizeHex(result?.Success?.output) ??
      normalizeHex(result?.output) ??
      null;
  }

  if (!extractedReturnData && artifacts.callTree.length > 0) {
    extractedReturnData = normalizeHex(artifacts.callTree[0].output) ?? null;
  }

  artifacts.rawReturnData = extractedReturnData;

  return artifacts;
};
