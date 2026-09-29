import type { DecodedTraceRow } from "../utils/traceDecoder";
import {
  simulationHistoryService,
  type SimulationHistoryFilter,
  type StoredSimulation,
} from "./SimulationHistoryService";
import {
  recomputeHierarchy,
  traceVaultService,
  type TraceVaultDecodedTrace,
} from "./TraceVaultService";

export type {
  SimulationHistoryFilter,
  StoredSimulation,
} from "./SimulationHistoryService";

export interface StoredSimulationRecord {
  stored: StoredSimulation;
  decodedTrace: TraceVaultDecodedTrace | null;
}

const hasInternalInfo = (rows: DecodedTraceRow[] | null | undefined): boolean =>
  Array.isArray(rows) &&
  rows.some(
    (row: any) =>
      row?.destFn ||
      row?.jumpMarker ||
      row?.isInternalCall ||
      row?.internalParentId !== undefined
  );

const internalInfoCount = (rows: DecodedTraceRow[] | null | undefined): number =>
  Array.isArray(rows)
    ? rows.filter(
        (row: any) =>
          row?.destFn ||
          row?.jumpMarker ||
          row?.isInternalCall ||
          row?.internalParentId !== undefined
      ).length
    : 0;

export function pickTraceRows(
  opfsRows: DecodedTraceRow[] | null | undefined,
  indexedDbRows: DecodedTraceRow[] | null | undefined
): { rows: DecodedTraceRow[] | null; recompute: boolean } {
  const vaultRows = Array.isArray(opfsRows) ? opfsRows : [];
  const historyRows = Array.isArray(indexedDbRows) ? indexedDbRows : [];

  if (vaultRows.length > 0 && hasInternalInfo(vaultRows)) {
    return { rows: vaultRows, recompute: false };
  }
  if (historyRows.length > 0 && hasInternalInfo(historyRows)) {
    return { rows: historyRows, recompute: true };
  }
  if (vaultRows.length > 0) {
    return { rows: vaultRows, recompute: false };
  }
  if (historyRows.length > 0) {
    return { rows: historyRows, recompute: true };
  }
  return { rows: null, recompute: false };
}

export async function loadStoredSimulation(
  simulationId: string,
  options?: { includeHeavy?: boolean }
): Promise<StoredSimulationRecord | null> {
  const stored = await simulationHistoryService.getSimulation(simulationId);
  if (!stored) return null;

  let vaultTrace: TraceVaultDecodedTrace | null = null;
  try {
    vaultTrace = await traceVaultService.loadDecodedTrace(simulationId, options);
  } catch {
    // IndexedDB rows remain a valid fallback when OPFS is unavailable or corrupt.
  }

  const selected = pickTraceRows(vaultTrace?.rows, stored.decodedTraceRows);
  if (!selected.rows) {
    return { stored, decodedTrace: vaultTrace };
  }

  const rows = selected.recompute
    ? recomputeHierarchy(selected.rows)
    : selected.rows;

  return {
    stored,
    decodedTrace: {
      rows,
      sourceLines: vaultTrace?.sourceLines ?? [],
      sourceTexts: vaultTrace?.sourceTexts ?? {},
      callMeta: vaultTrace?.callMeta,
      rawEvents: vaultTrace?.rawEvents ?? [],
      implementationToProxy:
        vaultTrace?.implementationToProxy ?? new Map<string, string>(),
    },
  };
}

export async function saveStoredSimulation(
  result: unknown,
  contractContext: unknown,
  providedId?: string
): Promise<string> {
  const simulationId = await simulationHistoryService.saveSimulation(
    result,
    contractContext,
    providedId
  );
  const retentionCandidates =
    await simulationHistoryService.getRetentionCandidates();
  await deleteStoredSimulations(retentionCandidates);
  return simulationId;
}

export function listStoredSimulations(
  filter?: SimulationHistoryFilter
): Promise<StoredSimulation[]> {
  return simulationHistoryService.getSimulations(filter, true);
}

export async function persistDecodedTrace(
  simulationId: string,
  decoded: TraceVaultDecodedTrace
): Promise<void> {
  let existing: TraceVaultDecodedTrace | null = null;
  try {
    existing = await traceVaultService.loadDecodedTrace(simulationId, {
      includeHeavy: false,
    });
  } catch {
    // A failed read should not prevent a fresh trace from being persisted.
  }

  if (
    internalInfoCount(existing?.rows) > 0 &&
    internalInfoCount(decoded.rows) === 0
  ) {
    return;
  }

  const saved = await traceVaultService.saveDecodedTrace(simulationId, decoded);
  const rowsToStore = saved?.lite?.rows ?? decoded.rows;
  await simulationHistoryService.updateSimulationDecodedRows(
    simulationId,
    rowsToStore,
    { maxRetries: 6, delayMs: 150 }
  );
}

export async function deleteStoredSimulation(simulationId: string): Promise<void> {
  await Promise.all([
    simulationHistoryService.deleteSimulation(simulationId),
    traceVaultService.deleteDecodedTrace(simulationId),
  ]);
}

export async function deleteStoredSimulations(
  simulationIds: string[]
): Promise<void> {
  if (simulationIds.length === 0) return;
  await Promise.all([
    simulationHistoryService.deleteSimulations(simulationIds),
    ...simulationIds.map((simulationId) =>
      traceVaultService.deleteDecodedTrace(simulationId)
    ),
  ]);
}

export async function clearStoredSimulations(): Promise<void> {
  await Promise.all([
    simulationHistoryService.clearAll(),
    traceVaultService.clearAll(),
  ]);
}

export function clearStoredTraces(): Promise<void> {
  return traceVaultService.clearAll();
}
