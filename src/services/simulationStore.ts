/**
 * Simulation persistence coordinator.
 *
 * Owns the cross-service policy (OPFS-vs-IndexedDB load ladder, the
 * persist-decoded-trace write path, and the cross-store delete) that used to
 * live duplicated in SimulationHistoryPage and useSimulationPageState.
 * SimulationHistoryService and TraceVaultService are private collaborators of
 * this module — callers depend on the coordinator, not the leaf stores.
 */

import { simulationHistoryService } from "./SimulationHistoryService";
import {
  traceVaultService,
  recomputeHierarchy,
  type TraceVaultDecodedTrace,
} from "./TraceVaultService";
import { hasInternalInfo } from "../components/simulation-results/useSimulationPageHelpers";
import type { DecodedTraceRow } from "../utils/traceDecoder";
import type { DecodedTraceMeta } from "../contexts/SimulationContext";

export interface LoadedSimulation {
  result: any;
  contractContext: any;
  decodedRows: DecodedTraceRow[] | null;
  sourceTexts: Record<string, string> | null;
  meta: DecodedTraceMeta | null;
}

const TRACE_DIR = "trace-vault";

/**
 * The 4-branch row-selection ladder (OPFS+internal -> IndexedDB+internal ->
 * OPFS-any -> IndexedDB-any). Pure: exported for unit testing.
 */
export const pickTraceRows = (
  opfsRows: DecodedTraceRow[] | undefined,
  indexedDbRows: DecodedTraceRow[] | undefined
): { rows: DecodedTraceRow[] | null; recompute: boolean } => {
  const opfsRowCount = opfsRows?.length ?? 0;
  const indexedDbRowCount = indexedDbRows?.length ?? 0;
  const opfsHasInternal = hasInternalInfo(opfsRows);
  const indexedDbHasInternal = hasInternalInfo(indexedDbRows);

  // Prefer OPFS if it has rows with hierarchy info
  // Fall back to IndexedDB only if OPFS is empty/missing hierarchy but IndexedDB has it
  let rowsToUse: DecodedTraceRow[] | undefined;
  let fromIndexedDb = false;

  if (opfsRowCount > 0 && opfsHasInternal) {
    // OPFS has full data with hierarchy - use it
    rowsToUse = opfsRows;
  } else if (indexedDbRowCount > 0 && indexedDbHasInternal) {
    // IndexedDB has hierarchy but OPFS doesn't - use IndexedDB
    rowsToUse = indexedDbRows;
    fromIndexedDb = true;
  } else if (opfsRowCount > 0) {
    // OPFS has rows (even without hierarchy) - use it
    rowsToUse = opfsRows;
  } else if (indexedDbRowCount > 0) {
    // IndexedDB has rows as last resort
    rowsToUse = indexedDbRows;
    fromIndexedDb = true;
  }

  if (rowsToUse && rowsToUse.length > 0) {
    // OPFS rows arrive already hierarchy-recomputed from loadDecodedTrace; only
    // raw IndexedDB rows still need a recompute. This avoids a redundant second
    // O(n) pass over the (often large) OPFS row set on every history load.
    return { rows: rowsToUse, recompute: fromIndexedDb };
  }

  return { rows: null, recompute: false };
};

export async function loadStoredSimulation(
  id: string
): Promise<LoadedSimulation | null> {
  const stored = await simulationHistoryService.getSimulation(id);
  if (!stored?.result || !stored?.contractContext) {
    return null;
  }

  try {
    const traceBundle = await traceVaultService.loadDecodedTrace(id, {
      includeHeavy: false,
    });

    const { rows, recompute } = pickTraceRows(traceBundle?.rows, stored.decodedTraceRows);

    const decodedRows = rows ? (recompute ? recomputeHierarchy(rows) : rows) : null;
    const sourceTexts =
      traceBundle?.sourceTexts &&
      Object.keys(traceBundle.sourceTexts).length > 0
        ? traceBundle.sourceTexts
        : null;
    const meta: DecodedTraceMeta = {
      sourceLines: traceBundle?.sourceLines ?? [],
      callMeta: traceBundle?.callMeta,
      rawEvents: traceBundle?.rawEvents ?? [],
      implementationToProxy:
        traceBundle?.implementationToProxy ?? new Map<string, string>(),
    };

    return {
      result: stored.result,
      contractContext: stored.contractContext,
      decodedRows,
      sourceTexts,
      meta,
    };
  } catch {
    // Fallback: restore decoded rows from IndexedDB on OPFS failure
    const decodedRows =
      stored.decodedTraceRows && stored.decodedTraceRows.length > 0
        ? recomputeHierarchy(stored.decodedTraceRows)
        : null;
    return {
      result: stored.result,
      contractContext: stored.contractContext,
      decodedRows,
      sourceTexts: null,
      meta: null,
    };
  }
}

export async function persistDecodedTrace(
  simulationId: string,
  decoded: TraceVaultDecodedTrace
): Promise<void> {
  const jumpRowCount =
    (decoded as any)?.rows?.filter(
      (r: any) => r?.destFn || r?.jumpMarker || r?.isInternalCall
    ).length ?? 0;

  try {
    const existingTrace = await traceVaultService.loadDecodedTrace(simulationId, {
      includeHeavy: false,
    });
    const existingJumpCount =
      existingTrace?.rows?.filter(
        (r: any) => r?.destFn || r?.jumpMarker || r?.isInternalCall
      ).length ?? 0;

    if (existingJumpCount > 0 && jumpRowCount === 0) return;

    const saved = await traceVaultService.saveDecodedTrace(simulationId, decoded);
    const rowsToStore = saved?.lite?.rows ?? decoded.rows;
    await simulationHistoryService.updateSimulationDecodedRows(simulationId, rowsToStore, {
      maxRetries: 6,
      delayMs: 150,
    });
  } catch (err) {
    console.error("[SimulationResults] Failed to persist trace:", err);
  }
}

export async function deleteStoredSimulation(id: string): Promise<void> {
  await simulationHistoryService.deleteSimulation(id);
  await traceVaultService.deleteDecodedTrace(id);
}

export async function deleteStoredSimulations(ids: string[]): Promise<void> {
  await simulationHistoryService.deleteSimulations(ids);
  await Promise.allSettled(ids.map((id) => traceVaultService.deleteDecodedTrace(id)));
}

export async function clearStoredSimulations(): Promise<void> {
  await simulationHistoryService.clearAll();
  if (typeof navigator !== "undefined" && navigator.storage?.getDirectory) {
    const root = await navigator.storage.getDirectory();
    try {
      await root.removeEntry(TRACE_DIR, { recursive: true });
    } catch (error: any) {
      if (error?.name === "NotFoundError") return;
      throw error;
    }
  }
}
