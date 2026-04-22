import { useEffect, useRef, useState } from "react";
import { traceVaultService } from "../../services/TraceVaultService";
import type { SimulationResult } from "../../types/transaction";
import type {
  DecodedTraceMeta,
  SimulationContractContext,
} from "../../contexts/SimulationContext";
import type { DecodedTraceRow } from "../../utils/traceDecoder/types";
import { hasInternalInfo } from "./useSimulationPageHelpers";

interface SetSimulationOptions {
  skipHistorySave?: boolean;
}

interface SimulationContextSlice {
  currentSimulation: SimulationResult | null;
  setSimulation: (
    result: SimulationResult,
    contractContext?: SimulationContractContext,
    options?: SetSimulationOptions,
  ) => void;
  setDecodedTraceRows: (rows: DecodedTraceRow[]) => void;
  setDecodedTraceMeta: (meta: DecodedTraceMeta) => void;
  setSourceTexts: (texts: Record<string, string>) => void;
}

interface Args extends SimulationContextSlice {
  id: string | undefined;
  propResult: SimulationResult | null | undefined;
  isFreshNavigation: boolean;
}

/**
 * Loads a simulation from history when the page mounts with an id but no
 * pre-existing prop or context simulation. Also rehydrates the decoded trace
 * and source bundle from TraceVaultService when available.
 */
export function useSimulationHistoryLoader({
  id,
  propResult,
  isFreshNavigation,
  currentSimulation,
  setSimulation,
  setDecodedTraceRows,
  setDecodedTraceMeta,
  setSourceTexts,
}: Args) {
  const [isLoadingFromHistory, setIsLoadingFromHistory] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hasAttemptedLoad = useRef(false);

  useEffect(() => {
    const loadFromHistory = async () => {
      if (propResult || currentSimulation || !id) return;
      if (hasAttemptedLoad.current) return;

      hasAttemptedLoad.current = true;
      setIsLoadingFromHistory(true);
      setLoadError(null);

      try {
        const { simulationHistoryService } = await import(
          "../../services/SimulationHistoryService"
        );
        const stored = await simulationHistoryService.getSimulation(id);

        if (!stored) {
          setLoadError("Simulation not found");
          return;
        }

        setSimulation(stored.result, stored.contractContext, {
          skipHistorySave: true,
        });

        try {
          const traceBundle = await traceVaultService.loadDecodedTrace(id, {
            includeHeavy: false,
          });
          let rowsToUse = traceBundle?.rows;
          if (
            stored.decodedTraceRows &&
            stored.decodedTraceRows.length > 0 &&
            (!rowsToUse ||
              rowsToUse.length === 0 ||
              (!hasInternalInfo(rowsToUse) &&
                hasInternalInfo(stored.decodedTraceRows)))
          ) {
            const { recomputeHierarchy } = await import(
              "../../services/TraceVaultService"
            );
            rowsToUse = recomputeHierarchy(stored.decodedTraceRows);
          }
          if (rowsToUse && rowsToUse.length > 0) {
            setDecodedTraceRows(rowsToUse);
          }
          if (
            traceBundle?.sourceTexts &&
            Object.keys(traceBundle.sourceTexts).length > 0
          ) {
            setSourceTexts(traceBundle.sourceTexts);
          }
          if (traceBundle) {
            setDecodedTraceMeta({
              sourceLines: traceBundle.sourceLines ?? [],
              callMeta: traceBundle.callMeta,
              rawEvents: traceBundle.rawEvents ?? [],
              implementationToProxy: traceBundle.implementationToProxy,
            });
          }
        } catch (traceErr) {
          console.warn(
            "[SimulationResultsPage] Failed to load trace vault:",
            traceErr,
          );
          if (stored.decodedTraceRows && stored.decodedTraceRows.length > 0) {
            const { recomputeHierarchy } = await import(
              "../../services/TraceVaultService"
            );
            setDecodedTraceRows(recomputeHierarchy(stored.decodedTraceRows));
          }
        }
      } catch (err) {
        console.error(
          "[SimulationResultsPage] Failed to load from history:",
          err,
        );
        setLoadError("Failed to load simulation from history");
      } finally {
        setIsLoadingFromHistory(false);
      }
    };

    if (propResult || currentSimulation || !id || hasAttemptedLoad.current)
      return;

    if (isFreshNavigation) {
      setIsLoadingFromHistory(true);
      const timer = window.setTimeout(() => {
        loadFromHistory();
      }, 500);
      return () => window.clearTimeout(timer);
    }

    loadFromHistory();
  }, [
    id,
    propResult,
    currentSimulation,
    setSimulation,
    setDecodedTraceRows,
    setDecodedTraceMeta,
    setSourceTexts,
    isFreshNavigation,
  ]);

  useEffect(() => {
    if (currentSimulation) setIsLoadingFromHistory(false);
  }, [currentSimulation]);

  useEffect(() => {
    hasAttemptedLoad.current = false;
  }, [id]);

  return { isLoadingFromHistory, loadError };
}
