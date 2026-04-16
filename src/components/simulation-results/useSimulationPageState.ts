import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { lookupEventSignatures, getCachedSignatures, cacheSignature } from "../../utils/signatureDatabase";
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
import { collectTraceAddresses, createTraceContractMap } from "../../utils/traceAddressCollector";
import { traceVaultService } from "../../services/TraceVaultService";
import { useDecodedTrace } from "../../hooks/useDecodedTrace";
import { useDebug } from "../../contexts/DebugContext";
import { getChainById } from "../../utils/chains";
import type { SimulationResultsPageProps, SimulatorTab } from "./types";
import { decodeRawEvent } from "./eventDecoder";
import { useTraceRows } from "./useTraceRows";

// Extracted helpers
import {
  type InternalInfoRow,
  type ContractContextExtras,
  type SimulationResultExtras,
  hasInternalInfo,
  buildAddressToNameMap,
  buildRevertInfo,
  buildTraceDiagnostics,
  buildEnrichedTraceRows,
  buildCallSummaryRow,
} from "./useSimulationPageHelpers";

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
  const [highlightedTraceRow, setHighlightedTraceRow] = useState<string | null>(null);
  const [highlightedValue, setHighlightedValue] = useState<string | null>(null);
  const [isLoadingFromHistory, setIsLoadingFromHistory] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hasAttemptedLoad = useRef(false);
  const resolvedAddressesRef = useRef<Set<string>>(new Set());
  const autoStartedDebugPrepRef = useRef<Set<string>>(new Set());
  const [lookedUpEventNames, setLookedUpEventNames] = useState<Record<string, string>>({});
  const [eventNameFilter, setEventNameFilter] = useState<string>("");
  const [eventContractFilter, setEventContractFilter] = useState<string>("");

  // ---- Load from history ----
  useEffect(() => {
    const loadFromHistory = async () => {
      if (propResult || currentSimulation || !id) return;
      if (hasAttemptedLoad.current) return;

      hasAttemptedLoad.current = true;
      setIsLoadingFromHistory(true);
      setLoadError(null);

      try {
        const { simulationHistoryService } = await import('../../services/SimulationHistoryService');
        const stored = await simulationHistoryService.getSimulation(id);

        if (stored) {
          setSimulation(stored.result, stored.contractContext, { skipHistorySave: true });
          try {
            const traceBundle = await traceVaultService.loadDecodedTrace(id, { includeHeavy: false });
            let rowsToUse = traceBundle?.rows;
            if (
              stored.decodedTraceRows &&
              stored.decodedTraceRows.length > 0 &&
              (!rowsToUse ||
                rowsToUse.length === 0 ||
                (!hasInternalInfo(rowsToUse) &&
                  hasInternalInfo(stored.decodedTraceRows)))
            ) {
              const { recomputeHierarchy } = await import('../../services/TraceVaultService');
              rowsToUse = recomputeHierarchy(stored.decodedTraceRows);
            }
            if (rowsToUse && rowsToUse.length > 0) {
              setDecodedTraceRows(rowsToUse);
            }
            if (traceBundle?.sourceTexts && Object.keys(traceBundle.sourceTexts).length > 0) {
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
            console.warn("[SimulationResultsPage] Failed to load trace vault:", traceErr);
            if (stored.decodedTraceRows && stored.decodedTraceRows.length > 0) {
              const { recomputeHierarchy } = await import('../../services/TraceVaultService');
              setDecodedTraceRows(recomputeHierarchy(stored.decodedTraceRows));
            }
          }
        } else {
          setLoadError(`Simulation not found`);
        }
      } catch (err) {
        console.error("[SimulationResultsPage] Failed to load from history:", err);
        setLoadError("Failed to load simulation from history");
      } finally {
        setIsLoadingFromHistory(false);
      }
    };

    if (propResult || currentSimulation || !id || hasAttemptedLoad.current) return;

    if (isFreshNavigation) {
      setIsLoadingFromHistory(true);
      const timer = window.setTimeout(() => { loadFromHistory(); }, 500);
      return () => window.clearTimeout(timer);
    }

    loadFromHistory();
  }, [id, propResult, currentSimulation, setSimulation, setDecodedTraceRows, setDecodedTraceMeta, setSourceTexts, isFreshNavigation]);

  useEffect(() => {
    if (currentSimulation) setIsLoadingFromHistory(false);
  }, [currentSimulation]);

  useEffect(() => {
    hasAttemptedLoad.current = false;
  }, [id]);

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

  // ---- Event signature lookup ----
  useEffect(() => {
    if (activeTab !== 'events' || events.length === 0) return;

    const lookupUnknownEvents = async () => {
      const cachedSignatures = getCachedSignatures('event');
      const cachedNamesToAdd: Record<string, string> = {};
      const allAbis: any[] = [];
      if (contractContext?.abi) allAbis.push(contractContext.abi);
      if (contractContext?.diamondFacets) {
        contractContext.diamondFacets.forEach((f: any) => { if (f.abi) allAbis.push(f.abi); });
      }
      const unknownTopics: string[] = [];

      events.forEach((event: any) => {
        if (event.name && event.name !== 'Anonymous Event') return;
        let topic0: string | null = null;
        if (event.data?.topics?.[0]) topic0 = String(event.data.topics[0]);
        else if (event.topics?.[0]) topic0 = String(event.topics[0]);
        if (!topic0) return;
        const normalizedTopic = '0x' + topic0.replace(/^0x/, '').padStart(64, '0');
        if (cachedSignatures[normalizedTopic]) {
          if (!lookedUpEventNames[normalizedTopic]) {
            cachedNamesToAdd[normalizedTopic] = cachedSignatures[normalizedTopic].name;
          }
          return;
        }
        if (lookedUpEventNames[normalizedTopic]) return;
        const decoded = decodeRawEvent(event, allAbis);
        if (decoded?.name) return;
        if (!unknownTopics.includes(normalizedTopic)) unknownTopics.push(normalizedTopic);
      });

      if (Object.keys(cachedNamesToAdd).length > 0) {
        setLookedUpEventNames(prev => ({ ...prev, ...cachedNamesToAdd }));
      }

      if (unknownTopics.length > 0) {
        try {
          const response = await lookupEventSignatures(unknownTopics);
          if (response.ok && response.result?.event) {
            const newNames: Record<string, string> = {};
            Object.entries(response.result.event).forEach(([hash, signatures]) => {
              if (signatures && signatures.length > 0) {
                const name = signatures[0].name;
                const eventName = name.split('(')[0];
                newNames[hash] = eventName;
                cacheSignature(hash, eventName, 'event');
              }
            });
            if (Object.keys(newNames).length > 0) {
              setLookedUpEventNames(prev => ({ ...prev, ...newNames }));
            }
          }
        } catch (err) {
          console.warn('[Events] Failed to look up event signatures:', err);
        }
      }
    };

    lookupUnknownEvents();
  }, [activeTab, events, contractContext, lookedUpEventNames]);

  // ---- Persist decoded trace ----
  const persistDecodedTrace = useCallback(
    async (decoded: any, simulationId: string) => {
      const hasJumpRows = decoded?.rows?.some((r: any) => r?.destFn || r?.jumpMarker || r?.isInternalCall);
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

  const buildReplayDebugPrepRequest = useCallback(() => {
    const resultWithExtras = result as (typeof result & SimulationResultExtras) | null;
    const contextWithExtras = contractContext as (typeof contractContext & ContractContextExtras);
    const txHash = resultWithExtras?.transactionHash || contextWithExtras?.replayTxHash;
    if (!txHash) {
      return null;
    }

    const chainId = result?.chainId || contractContext?.networkId || 1;
    const chain = getChainById(chainId);
    if (!chain) {
      return null;
    }

    const rpcUrl = resolveRpcUrl(chain.id, chain.rpcUrl).url;
    if (!rpcUrl) {
      return null;
    }

    const forkBlockTag =
      typeof resultWithExtras?.forkBlockTag === "string" && resultWithExtras.forkBlockTag.trim()
        ? resultWithExtras.forkBlockTag.trim()
        : undefined;

    return {
      rpcUrl,
      chainId,
      txHash,
      ...(forkBlockTag ? { blockTag: forkBlockTag } : {}),
    };
  }, [contractContext, resolveRpcUrl, result]);

  const startReplayDebugPreparation = useCallback(
    (simulationId: string) => {
      const prepStateForSimulation =
        debugPrepState?.simulationId === simulationId ? debugPrepState : null;
      if (
        prepStateForSimulation?.status === "queued" ||
        prepStateForSimulation?.status === "preparing" ||
        prepStateForSimulation?.status === "ready"
      ) {
        return true;
      }

      const request = buildReplayDebugPrepRequest();
      if (!request) {
        return false;
      }

      autoStartedDebugPrepRef.current.add(simulationId);
      startDebugPrep(request, simulationId);
      return true;
    },
    [buildReplayDebugPrepRequest, debugPrepState, startDebugPrep]
  );

  useEffect(() => {
    const resultWithExtras = result as (typeof result & SimulationResultExtras) | null;
    const contextWithExtras = contractContext as (typeof contractContext & ContractContextExtras);
    const debugRequested =
      resultWithExtras?.debugEnabled === true ||
      contextWithExtras?.debugEnabled === true;

    if (!debugRequested || result?.debugSession?.sessionId) {
      return;
    }

    const txHash = resultWithExtras?.transactionHash || contextWithExtras?.replayTxHash;
    if (!txHash) {
      return;
    }

    const simulationId = resultWithExtras?.simulationId || contextSimulationId || id;
    if (!simulationId || autoStartedDebugPrepRef.current.has(simulationId)) {
      return;
    }

    const prepStateForSimulation =
      debugPrepState?.simulationId === simulationId ? debugPrepState : null;
    if (
      prepStateForSimulation?.status === "queued" ||
      prepStateForSimulation?.status === "preparing" ||
      prepStateForSimulation?.status === "ready" ||
      prepStateForSimulation?.status === "failed"
    ) {
      return;
    }

    startReplayDebugPreparation(simulationId);
  }, [
    contractContext,
    contextSimulationId,
    debugPrepState,
    id,
    result,
    startReplayDebugPreparation,
  ]);

  // ---- Debug window ----
  const handleOpenDebug = useCallback(async () => {
    const resultWithExtras = result as (typeof result & SimulationResultExtras) | null;
    const contextWithExtras = contractContext as (typeof contractContext & ContractContextExtras);
    const debugRequested =
      resultWithExtras?.debugEnabled === true ||
      contextWithExtras?.debugEnabled === true;

    const chainId = result?.chainId || contractContext?.networkId || 1;
    const simulationId =
      resultWithExtras?.simulationId || contextSimulationId || id || `debug-${Date.now()}`;
    const debugPrepForSimulation =
      debugPrepState?.simulationId === simulationId ? debugPrepState : null;

    if (
      debugPrepForSimulation?.status === "queued" ||
      debugPrepForSimulation?.status === "preparing"
    ) {
      return;
    }

    // Prep finished ready but auto-connect from useDebugPrep.handleReady may
    // still be in flight (it's fire-and-forget). If we already have the
    // sessionId from the ready event, connect with it directly before opening
    // so the first click opens the debugger instead of re-triggering prep.
    if (
      debugPrepForSimulation?.status === "ready" &&
      debugPrepForSimulation.sessionId &&
      debugSession?.sessionId !== debugPrepForSimulation.sessionId
    ) {
      try {
        await connectToSession({
          sessionId: debugPrepForSimulation.sessionId,
          rpcPort: 0,
          snapshotCount: debugPrepForSimulation.snapshotCount ?? 0,
          chainId,
          simulationId,
        });
        openDebugWindow();
        return;
      } catch (err) {
        console.warn("[handleOpenDebug] Failed to connect to prepped session:", err);
      }
    }

    const targetLiveSessionId = result?.debugSession?.sessionId || null;
    const isExistingTraceSession = debugSession?.sessionId?.startsWith('trace-');
    const hasReusableLiveSession =
      !!debugSession && !isExistingTraceSession &&
      (
        (targetLiveSessionId && debugSession.sessionId === targetLiveSessionId) ||
        (!targetLiveSessionId && debugSession.simulationId === simulationId)
      );
    if (hasReusableLiveSession) { openDebugWindow(); return; }

    let traceForDebug = decodedTrace;
    const hasHeavyTraceRows =
      !!decodedTrace?.rows?.some((row: any) => Array.isArray(row.stack) || Array.isArray(row.memory));
    if (decodedTrace?.rows?.length && !hasHeavyTraceRows) {
      try {
        const fullTrace = await traceVaultService.loadDecodedTrace(simulationId, { includeHeavy: true });
        if (fullTrace?.rows?.length) traceForDebug = fullTrace as any;
      } catch (err) {
        console.warn("[handleOpenDebug] Failed to load full trace:", err);
      }
    }

    if (result?.debugSession?.sessionId) {
      try {
        await connectToSession({
          sessionId: result.debugSession.sessionId,
          rpcPort: result.debugSession.rpcPort,
          snapshotCount: result.debugSession.snapshotCount,
          chainId, simulationId,
        });
        openDebugWindow();
        return;
      } catch (err) {
        console.warn('Failed to connect to live EDB session:', err);
        if (debugRequested) {
          showError(
            "Debug Session Unavailable",
            "This simulation was requested with live debugging, but its session could not be reconnected. Re-simulate with Debug enabled."
          );
          return;
        }
      }
    }

    if (debugRequested) {
      if (startReplayDebugPreparation(simulationId)) {
        showSuccess(
          "Preparing Debug Session",
          "Building a live debug session for this replay. The debugger will be available when preparation completes."
        );
      } else {
        showError(
          "Debug Session Missing",
          "This replay is missing the RPC or transaction context required to prepare a live debug session. Re-run the replay with Debug enabled."
        );
      }
      return;
    }

    if (traceForDebug?.rows && traceForDebug.rows.length > 0) {
      initFromTraceData({
        simulationId, chainId,
        traceRows: traceForDebug.rows,
        sourceTexts: traceForDebug.sourceTexts || {},
        rawTrace: resultWithExtras?.rawTrace,
      });
      openDebugWindow();
      return;
    }

    openDebugWindow();
  }, [
    connectToSession,
    contextSimulationId,
    contractContext,
    debugPrepState,
    debugSession,
    decodedTrace,
    id,
    initFromTraceData,
    openDebugWindow,
    result,
    showError,
    showSuccess,
    startReplayDebugPreparation,
  ]);

  const hasLiveDebugSession = !!result?.debugSession?.sessionId;

  // ---- Trace source resolution ----
  const contractContextRef = useRef(contractContext);
  contractContextRef.current = contractContext;

  useEffect(() => {
    const resolveTraceSources = async () => {
      const ctx = contractContextRef.current;
      if (!decodedTrace?.rows || !ctx) return;

      const txFrom = ctx.fromAddress?.toLowerCase();
      const addresses = collectTraceAddresses(decodedTrace.rows, txFrom);
      if (addresses.size === 0) return;

      const addressKey = Array.from(addresses).sort().join(',');
      if (resolvedAddressesRef.current.has(addressKey)) return;
      resolvedAddressesRef.current.add(addressKey);

      const contractMap = createTraceContractMap(addresses);
      const addressList = Array.from(addresses).slice(0, 10);

      try {
        const { contractResolver } = await import('../../utils/resolver/ContractResolver');
        const chainId = ctx.networkId;
        const chainName = ctx.networkName;

        await Promise.allSettled(
          addressList.map(async (addr) => {
            try {
              const result = await Promise.race([
                contractResolver.resolve(addr, { id: chainId, name: chainName } as any),
                new Promise<null>((_, reject) =>
                  setTimeout(() => reject(new Error('timeout')), 5000)
                )
              ]);
              if (result && result.verified) {
                const contract = contractMap.get(addr);
                if (contract) {
                  contract.name = result.name || contract.name;
                  contract.sourceCode = result.metadata?.sourceCode;
                  contract.verified = true;
                  contract.sourceProvider = result.source || undefined;
                }
              }
              return result;
            } catch { return null; }
          })
        );

        setTraceContracts(contractMap);
      } catch (err) {
        console.warn('[SimResultsPage] Failed to resolve trace sources:', err);
      }
    };

    resolveTraceSources();
  }, [decodedTrace, setTraceContracts]);

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
    if (!address || address === "\u2014") return { display: address, hasName: false };
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return { display: address, hasName: false };
    const normalized = address.toLowerCase();
    const name = addressToName.get(normalized);
    if (name) return { display: name, hasName: true };
    return { display: `${address.slice(0, 10)}\u2026${address.slice(-8)}`, hasName: false };
  }, [addressToName]);

  const normalizeValue = useCallback((value: string | undefined | null): string | null => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed === "0x" || trimmed === "0x0" || trimmed === "\u2014") return null;
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
    setHighlightedTraceRow(revertRowId);
    requestAnimationFrame(() => {
      const element = document.getElementById(`trace-row-${revertRowId}`);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [revertRowId]);

  useEffect(() => {
    if (!highlightedTraceRow) return;
    const timer = window.setTimeout(() => setHighlightedTraceRow(null), 2000);
    return () => window.clearTimeout(timer);
  }, [highlightedTraceRow]);

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
    highlightedTraceRow, highlightedValue, setHighlightedValue,
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
