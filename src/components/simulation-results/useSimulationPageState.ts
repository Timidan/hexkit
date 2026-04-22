import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  extractSimulationArtifacts,
  flattenCallTreeEntries,
  type SimulationCallNode,
} from "../../utils/simulationArtifacts";
import { copyTextToClipboard } from "../../utils/clipboard";
import { useSimulation } from "../../contexts/SimulationContext";
import { useNetworkConfig } from "../../contexts/NetworkConfigContext";
import { useNotifications } from "../NotificationManager";
import type { TraceFilters } from "../ExecutionStackTrace";
import { traceVaultService } from "../../services/TraceVaultService";
import { useDecodedTrace } from "../../hooks/useDecodedTrace";
import { useDebug } from "../../contexts/DebugContext";
import type { SimulationResultsPageProps, SimulatorTab } from "./types";
import { useTraceRows } from "./useTraceRows";
import { useSimulationHistoryLoader } from "./useSimulationHistoryLoader";
import { useEventSignatureLookup } from "./useEventSignatureLookup";
import { useTraceSourceResolver } from "./useTraceSourceResolver";
import { useSimulationDebugActions } from "./useSimulationDebugActions";

import {
  buildAddressToNameMap,
  buildRevertInfo,
  buildTraceDiagnostics,
  buildEnrichedTraceRows,
  buildCallSummaryRow,
} from "./useSimulationPageHelpers";
import type { ContractContextExtras, SimulationResultExtras } from "./gasHelpers";

export type { ContractContextExtras, SimulationResultExtras };

export function useSimulationPageState(props: SimulationResultsPageProps) {
  const { result: propResult, onReSimulate } = props;
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const navigationState = location.state as { fromSimulation?: boolean } | null;
  const isFreshNavigation = !!navigationState?.fromSimulation;
  const {
    currentSimulation, contractContext, setSimulation, clearSimulation,
    setTraceContracts, setSourceTexts,
    decodedTraceRows: contextDecodedTraceRows, setDecodedTraceRows,
    decodedTraceMeta, setDecodedTraceMeta,
    simulationId: contextSimulationId, stripHeavyDataFromCurrentSimulation,
  } = useSimulation();
  const { resolveRpcUrl } = useNetworkConfig();
  const { showSuccess, showError } = useNotifications();
  const {
    isDebugging, openDebugWindow, closeDebugWindow, session: debugSession,
    initFromTraceData, connectToSession, isLoading: isDebugLoading,
    debugPrepState, startDebugPrep, cancelDebugPrep,
  } = useDebug();

  const [activeTab, setActiveTab] = useState<SimulatorTab>("summary");
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [traceFilters, setTraceFilters] = useState<TraceFilters>({
    gas: true, full: true, storage: true, events: true,
  });
  const [highlightedValue, setHighlightedValue] = useState<string | null>(null);

  // History loader — rehydrates a stored simulation when opened via /sim/:id.
  const { isLoadingFromHistory, loadError } = useSimulationHistoryLoader({
    id, propResult, isFreshNavigation,
    currentSimulation, setSimulation,
    setDecodedTraceRows, setDecodedTraceMeta, setSourceTexts,
  });

  const result = propResult || currentSimulation;

  // ---- Callbacks ----
  const handleReSimulate = useCallback(() => {
    const resultWithExtras = result as (typeof result & SimulationResultExtras) | null;
    const contextWithExtras = contractContext as (typeof contractContext & ContractContextExtras);

    if (onReSimulate) { onReSimulate(); return; }

    const simId = resultWithExtras?.simulationId || contextSimulationId || id;
    if (simId) {
      navigate(`/builder?mode=simulation&clone=${encodeURIComponent(simId)}`);
      return;
    }

    const txHash = resultWithExtras?.transactionHash;
    if (txHash && typeof txHash === 'string' && txHash.startsWith('0x')) {
      const resultDebugEnabled = resultWithExtras?.debugEnabled;
      const contextDebugEnabled = contextWithExtras?.debugEnabled;
      const replayData = {
        transactionHash: txHash,
        networkId: resultWithExtras?.chainId || contractContext?.networkId || 1,
        networkName: resultWithExtras?.networkName || contractContext?.networkName || 'Ethereum',
        forkBlockTag: resultWithExtras?.forkBlockTag,
        debugEnabled:
          typeof resultDebugEnabled === 'boolean' ? resultDebugEnabled
            : typeof contextDebugEnabled === 'boolean' ? contextDebugEnabled : false,
      };
      localStorage.setItem('web3-toolkit:txhash-replay', JSON.stringify(replayData));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('web3-toolkit:txhash-replay-updated', { detail: replayData }));
      }
    }

    navigate('/builder?mode=simulation&replay=txhash');
  }, [onReSimulate, navigate, result, contractContext, contextSimulationId, id]);

  const handleExportTestData = useCallback(() => {
    if (!result) {
      showError("Export Failed", "No simulation data to export");
      return;
    }

    const exportData: Record<string, unknown> = {
      mode: result.mode || "local",
      rpcUrl: `https://${(contractContext?.networkName || "ethereum").toLowerCase().replace(/\s+/g, "-")}-mainnet.g.alchemy.com/v2/YOUR_API_KEY`,
      chainId: contractContext?.networkId || 1,
      transaction: {
        from: result.from || contractContext?.fromAddress || "0x0000000000000000000000000000000000000000",
        to: result.to || contractContext?.address || "",
        data: result.data || contractContext?.calldata || "0x",
        value: result.value || contractContext?.ethValue || "0x0",
      },
      analysisOptions: {
        quickMode: false, collectCallTree: true, collectEvents: true,
        collectStorageDiffs: true, collectSnapshots: true,
      },
    };

    if (result.blockNumber) exportData.blockTag = String(result.blockNumber);

    copyTextToClipboard(JSON.stringify(exportData, null, 2));
    showSuccess("Copied", "Simulation payload copied to clipboard");
  }, [result, contractContext, showSuccess, showError]);

  // ---- Artifacts ----
  const artifacts = useMemo(() => {
    if (!result) return null;
    return extractSimulationArtifacts(result);
  }, [result]);

  const callTree = useMemo(() => artifacts?.callTree ?? [], [artifacts?.callTree]);
  const flattenedTrace = useMemo(() => flattenCallTreeEntries(callTree), [callTree]);
  const snapshots = useMemo(() => artifacts?.snapshots ?? [], [artifacts?.snapshots]);
  const opcodeTrace = useMemo(() => artifacts?.opcodeTrace ?? [], [artifacts?.opcodeTrace]);
  const events = useMemo(() => artifacts?.events ?? [], [artifacts?.events]);
  const storageDiffs = useMemo(() => artifacts?.storageDiffs ?? [], [artifacts?.storageDiffs]);

  // Event signature hydration for anonymous events in the Events tab.
  const {
    lookedUpEventNames,
    eventNameFilter, setEventNameFilter,
    eventContractFilter, setEventContractFilter,
  } = useEventSignatureLookup({ activeTab, events, contractContext });

  // ---- Persist decoded trace ----
  const persistDecodedTrace = useCallback(
    async (decoded: any, simulationId: string) => {
      const jumpRowCount = decoded?.rows?.filter((r: any) => r?.destFn || r?.jumpMarker || r?.isInternalCall).length ?? 0;

      try {
        const existingTrace = await traceVaultService.loadDecodedTrace(simulationId, { includeHeavy: false });
        const existingJumpCount = existingTrace?.rows?.filter((r: any) => r?.destFn || r?.jumpMarker || r?.isInternalCall).length ?? 0;

        if (existingJumpCount > 0 && jumpRowCount === 0) return;

        const saved = await traceVaultService.saveDecodedTrace(simulationId, decoded);
        const rowsToStore = saved?.lite?.rows ?? decoded.rows;
        const { simulationHistoryService } = await import("../../services/SimulationHistoryService");
        await simulationHistoryService.updateSimulationDecodedRows(simulationId, rowsToStore, {
          maxRetries: 6, delayMs: 150,
        });
      } catch (err) {
        console.error("[SimulationResults] Failed to persist trace:", err);
      }
    },
    []
  );

  const { decodedTrace, isDecoding: isTraceDecoding } = useDecodedTrace({
    result, id, contextDecodedTraceRows, contractContext,
    traceMeta: decodedTraceMeta, onDecoded: persistDecodedTrace,
    decodeMode: "lite",
  });

  // Debug actions — prep, reuse live session, fall back to trace mode.
  const { handleOpenDebug, hasLiveDebugSession } = useSimulationDebugActions({
    result, contractContext, contextSimulationId, id, decodedTrace,
    resolveRpcUrl, showSuccess, showError,
    openDebugWindow, session: debugSession,
    initFromTraceData, connectToSession,
    debugPrepState, startDebugPrep,
  });

  // Trace source resolution — fetch verified contract names into the sim ctx.
  useTraceSourceResolver({ decodedTrace, contractContext, setTraceContracts });

  useEffect(() => {
    if (decodedTrace?.sourceTexts && Object.keys(decodedTrace.sourceTexts).length > 0) {
      setSourceTexts(decodedTrace.sourceTexts);
    }
  }, [decodedTrace?.sourceTexts, setSourceTexts]);

  useEffect(() => {
    if (decodedTrace?.rows && decodedTrace.rows.length > 0) {
      const rowsFromHistory = decodedTrace.rows === contextDecodedTraceRows;
      if (!rowsFromHistory) {
        setDecodedTraceRows(decodedTrace.rows);
        stripHeavyDataFromCurrentSimulation();
      }
    }
  }, [decodedTrace?.rows, setDecodedTraceRows, stripHeavyDataFromCurrentSimulation, contextDecodedTraceRows]);

  // ---- Revert info (delegated) ----
  const revertInfo = useMemo(
    () => buildRevertInfo(result, decodedTrace),
    [result, decodedTrace],
  );

  // ---- Call frame map ----
  const callFrameMap = useMemo(() => {
    const map = new Map<string, SimulationCallNode>();
    flattenedTrace.forEach((node) => {
      if (node.frameKey) map.set(String(node.frameKey), node);
    });
    return map;
  }, [flattenedTrace]);

  const callSummaryRow = useMemo(
    () => buildCallSummaryRow(callTree, result?.data ?? undefined, artifacts?.rawReturnData),
    [callTree, result?.data, artifacts?.rawReturnData],
  );

  const traceRows = useTraceRows({
    callSummaryRow, snapshots, opcodeTrace,
    callFrameMap, events, storageDiffs, decodedTrace,
  });

  const revertFrameKey = useMemo(() => {
    const failing = flattenedTrace.find((node) => !!node.error);
    return failing?.frameKey;
  }, [flattenedTrace]);

  const revertRowId = useMemo(() => {
    if (!revertFrameKey) return null;
    const match = traceRows.find((row) => row.frameKey === revertFrameKey);
    return match?.id ?? null;
  }, [traceRows, revertFrameKey]);

  const snapshotOpcodeCount = useMemo(() => {
    return snapshots.filter((snapshot: any) => {
      if (!snapshot) return false;
      if (snapshot.type === "opcode") return true;
      const detail = snapshot.detail ?? snapshot.Detail ?? snapshot;
      return detail?.Opcode !== undefined || detail?.opcode !== undefined;
    }).length;
  }, [snapshots]);

  // ---- Enriched trace rows (delegated) ----
  const enrichedTraceRows = useMemo(
    () => buildEnrichedTraceRows(traceRows),
    [traceRows],
  );

  const filteredTraceRows = useMemo(() => {
    return enrichedTraceRows.filter((row) => {
      if (row.type === "event" && !traceFilters.events) return false;
      if (row.type === "storage" && !traceFilters.storage) return false;
      return true;
    });
  }, [enrichedTraceRows, traceFilters]);

  // ---- Address-to-name map (delegated) ----
  const addressToName = useMemo(
    () => buildAddressToNameMap(traceRows, contractContext),
    [traceRows, contractContext],
  );

  const formatAddressWithName = useCallback((address: string): { display: string; hasName: boolean } => {
    if (!address || address === "—") return { display: address, hasName: false };
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return { display: address, hasName: false };
    const normalized = address.toLowerCase();
    const name = addressToName.get(normalized);
    if (name) return { display: name, hasName: true };
    return { display: `${address.slice(0, 10)}…${address.slice(-8)}`, hasName: false };
  }, [addressToName]);

  const normalizeValue = useCallback((value: string | undefined | null): string | null => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed === "0x" || trimmed === "0x0" || trimmed === "—") return null;
    if (trimmed.startsWith("0x")) return trimmed.toLowerCase();
    return trimmed;
  }, []);

  const handleShare = useCallback(() => {
    copyTextToClipboard(window.location.href);
    showSuccess("Link Copied", "Simulation URL copied to clipboard");
  }, [showSuccess]);

  const handleBack = useCallback(() => {
    clearSimulation();
    navigate("/builder");
  }, [navigate, clearSimulation]);

  const handleToggleFilter = useCallback(
    (key: keyof typeof traceFilters) => {
      setTraceFilters((prev) => ({ ...prev, [key]: !prev[key] }));
    },
    []
  );

  const handleGoToRevert = useCallback(() => {
    if (!revertRowId) return;
    requestAnimationFrame(() => {
      const element = document.getElementById(`trace-row-${revertRowId}`);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [revertRowId]);

  // ---- Trace diagnostics (delegated) ----
  const traceDiagnostics = useMemo(
    () =>
      buildTraceDiagnostics(
        decodedTrace,
        enrichedTraceRows.length,
        result,
        isTraceDecoding,
        snapshotOpcodeCount,
        opcodeTrace.length,
      ),
    [decodedTrace, enrichedTraceRows.length, result, isTraceDecoding, snapshotOpcodeCount, opcodeTrace.length],
  );

  return {
    // routing / navigation
    id, navigate,
    // result data
    result, artifacts, contractContext, contextSimulationId,
    // tab
    activeTab, setActiveTab,
    // search & filters
    searchQuery, setSearchQuery, deferredSearchQuery,
    traceFilters, handleToggleFilter,
    // UI state
    highlightedValue, setHighlightedValue,
    isLoadingFromHistory, loadError,
    // events
    lookedUpEventNames, eventNameFilter, setEventNameFilter,
    eventContractFilter, setEventContractFilter,
    // decoded trace
    decodedTrace, isTraceDecoding, filteredTraceRows,
    // diagnostics
    traceDiagnostics, revertInfo, revertRowId,
    // actions
    handleBack, handleReSimulate, handleExportTestData,
    handleShare, handleGoToRevert, handleOpenDebug,
    // debug
    isDebugging, isDebugLoading, closeDebugWindow,
    debugPrepState, cancelDebugPrep, hasLiveDebugSession,
    // gas helpers
    callTree, flattenedTrace, opcodeTrace, snapshots, storageDiffs, events,
    // address formatting
    formatAddressWithName, normalizeValue,
  };
}
