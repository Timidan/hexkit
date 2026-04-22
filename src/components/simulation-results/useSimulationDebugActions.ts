import { useCallback, useEffect, useRef } from "react";
import { traceVaultService } from "../../services/TraceVaultService";
import { isTraceSessionId } from "../../contexts/debug/sessionRef";
import { getChainById } from "../../utils/chains";
import type {
  ContractContextExtras,
  SimulationResultExtras,
} from "./gasHelpers";

interface DebugSlice {
  openDebugWindow: () => void;
  session: { sessionId?: string; simulationId?: string } | null;
  initFromTraceData: (args: {
    simulationId: string;
    chainId: number;
    traceRows: any[];
    sourceTexts: Record<string, string>;
    rawTrace?: any;
  }) => void;
  connectToSession: (args: {
    sessionId: string;
    rpcPort: number;
    snapshotCount: number;
    chainId: number;
    simulationId: string;
  }) => Promise<void>;
  debugPrepState: { simulationId?: string; status?: string } | null | undefined;
  startDebugPrep: (
    request: {
      rpcUrl: string;
      chainId: number;
      txHash: string;
      blockTag?: string;
    },
    simulationId: string,
  ) => void;
}

interface Args extends DebugSlice {
  result: any;
  contractContext: any;
  contextSimulationId: string | null;
  id: string | undefined;
  decodedTrace: any;
  resolveRpcUrl: (chainId: number, fallback?: string) => { url: string };
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
}

/**
 * Encapsulates the "prepare / reuse / open" dance for the debug window:
 * - auto-starts replay prep when a sim was requested with debugEnabled
 * - reuses a live EDB session when possible
 * - falls back to trace-only debugging when no live session exists
 */
export function useSimulationDebugActions(args: Args) {
  const {
    result,
    contractContext,
    contextSimulationId,
    id,
    decodedTrace,
    resolveRpcUrl,
    showSuccess,
    showError,
    openDebugWindow,
    session: debugSession,
    initFromTraceData,
    connectToSession,
    debugPrepState,
    startDebugPrep,
  } = args;

  const autoStartedDebugPrepRef = useRef<Set<string>>(new Set());

  const buildReplayDebugPrepRequest = useCallback(() => {
    const resultWithExtras = result as
      | (typeof result & SimulationResultExtras)
      | null;
    const contextWithExtras = contractContext as typeof contractContext &
      ContractContextExtras;
    const txHash =
      resultWithExtras?.transactionHash || contextWithExtras?.replayTxHash;
    if (!txHash) return null;

    const chainId = result?.chainId || contractContext?.networkId || 1;
    const chain = getChainById(chainId);
    if (!chain) return null;

    const rpcUrl = resolveRpcUrl(chain.id, chain.rpcUrl).url;
    if (!rpcUrl) return null;

    const forkBlockTag =
      typeof resultWithExtras?.forkBlockTag === "string" &&
      resultWithExtras.forkBlockTag.trim()
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
      if (!request) return false;

      autoStartedDebugPrepRef.current.add(simulationId);
      startDebugPrep(request, simulationId);
      return true;
    },
    [buildReplayDebugPrepRequest, debugPrepState, startDebugPrep],
  );

  useEffect(() => {
    const resultWithExtras = result as
      | (typeof result & SimulationResultExtras)
      | null;
    const contextWithExtras = contractContext as typeof contractContext &
      ContractContextExtras;
    const debugRequested =
      resultWithExtras?.debugEnabled === true ||
      contextWithExtras?.debugEnabled === true;

    if (!debugRequested || result?.debugSession?.sessionId) return;

    const txHash =
      resultWithExtras?.transactionHash || contextWithExtras?.replayTxHash;
    if (!txHash) return;

    const simulationId =
      resultWithExtras?.simulationId || contextSimulationId || id;
    if (!simulationId || autoStartedDebugPrepRef.current.has(simulationId))
      return;

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

  const handleOpenDebug = useCallback(async () => {
    const resultWithExtras = result as
      | (typeof result & SimulationResultExtras)
      | null;
    const contextWithExtras = contractContext as typeof contractContext &
      ContractContextExtras;
    const debugRequested =
      resultWithExtras?.debugEnabled === true ||
      contextWithExtras?.debugEnabled === true;

    const chainId = result?.chainId || contractContext?.networkId || 1;
    const simulationId =
      resultWithExtras?.simulationId ||
      contextSimulationId ||
      id ||
      `debug-${Date.now()}`;
    const debugPrepForSimulation =
      debugPrepState?.simulationId === simulationId ? debugPrepState : null;

    if (
      debugPrepForSimulation?.status === "queued" ||
      debugPrepForSimulation?.status === "preparing"
    ) {
      return;
    }

    const targetLiveSessionId = result?.debugSession?.sessionId || null;
    const isExistingTraceSession = debugSession?.sessionId
      ? isTraceSessionId(debugSession.sessionId)
      : false;
    const hasReusableLiveSession =
      !!debugSession &&
      !isExistingTraceSession &&
      ((targetLiveSessionId &&
        debugSession.sessionId === targetLiveSessionId) ||
        (!targetLiveSessionId && debugSession.simulationId === simulationId));
    if (hasReusableLiveSession) {
      openDebugWindow();
      return;
    }

    let traceForDebug = decodedTrace;
    const hasHeavyTraceRows = !!decodedTrace?.rows?.some(
      (row: any) => Array.isArray(row.stack) || Array.isArray(row.memory),
    );
    if (decodedTrace?.rows?.length && !hasHeavyTraceRows) {
      try {
        const fullTrace = await traceVaultService.loadDecodedTrace(
          simulationId,
          { includeHeavy: true },
        );
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
          chainId,
          simulationId,
        });
        openDebugWindow();
        return;
      } catch (err) {
        console.warn("Failed to connect to live EDB session:", err);
        if (debugRequested) {
          showError(
            "Debug Session Unavailable",
            "This simulation was requested with live debugging, but its session could not be reconnected. Re-simulate with Debug enabled.",
          );
          return;
        }
      }
    }

    if (debugRequested) {
      if (startReplayDebugPreparation(simulationId)) {
        showSuccess(
          "Preparing Debug Session",
          "Building a live debug session for this replay. The debugger will be available when preparation completes.",
        );
      } else {
        showError(
          "Debug Session Missing",
          "This replay is missing the RPC or transaction context required to prepare a live debug session. Re-run the replay with Debug enabled.",
        );
      }
      return;
    }

    if (traceForDebug?.rows && traceForDebug.rows.length > 0) {
      initFromTraceData({
        simulationId,
        chainId,
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

  return { handleOpenDebug, hasLiveDebugSession };
}
