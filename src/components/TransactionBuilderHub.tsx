import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { ethers } from "ethers";
import LoadingSpinner from "./shared/LoadingSpinner";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { LayoutTransitionWrapper } from "./ui/animated-tabs";
import { useSimulation } from "../contexts/SimulationContext";
import { AnimatedZapIcon, AnimatedPlayIcon } from "./icons/IconLibrary";
import { SUPPORTED_CHAINS } from "../utils/chains";
import type { BridgeSimulationResponsePayload } from "../utils/transaction-simulation/types";

type BuilderMode = "live" | "simulation" | "analysis";
type BuilderIntentMode = "live" | "simulation" | "replay" | "analysis";

const TXHASH_REPLAY_KEY = 'web3-toolkit:txhash-replay';

const loadSimpleGridUI = () => import("./SimpleGridUI");
const loadTransactionBuilderWagmi = () => import("./TransactionBuilderWagmi");
const loadTxAnalysisPanel = () => import("./tx-analysis/TxAnalysisPanel");

const SimpleGridUI = React.lazy(loadSimpleGridUI);
const TransactionBuilderWagmi = React.lazy(loadTransactionBuilderWagmi);
const TxAnalysisPanel = React.lazy(loadTxAnalysisPanel);

function parseBuilderIntentMode(search: string): BuilderIntentMode | null {
  const mode = new URLSearchParams(search).get('mode');
  if (mode === 'live' || mode === 'simulation' || mode === 'replay' || mode === 'analysis') {
    return mode;
  }
  return null;
}

const TransactionBuilderHub: React.FC = () => {
  const { contractContext, analysisSubject, currentSimulation, simulationId } = useSimulation();

  const resolvedAnalysisSubject = useMemo(() => {
    if (analysisSubject) return analysisSubject;
    if (!currentSimulation || !simulationId) return null;
    const from = currentSimulation.from ?? null;
    const to = currentSimulation.to ?? contractContext?.address ?? null;
    if (!from || !to) return null;
    return {
      simulationId,
      from,
      to,
      txHash: contractContext?.replayTxHash ?? null,
      simulation: currentSimulation as unknown as BridgeSimulationResponsePayload,
    };
  }, [analysisSubject, currentSimulation, simulationId, contractContext?.address, contractContext?.replayTxHash]);
  const location = useLocation();
  const urlIntentMode = parseBuilderIntentMode(location.search);
  const builderSearchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const liveInitialContractData = useMemo(() => {
    const addressParam = builderSearchParams.get('address')?.trim();
    if (!addressParam || !ethers.utils.isAddress(addressParam)) {
      return undefined;
    }

    const chainIdParam = builderSearchParams.get('chainId');
    const parsedChainId = chainIdParam ? Number.parseInt(chainIdParam, 10) : Number.NaN;
    const chain = SUPPORTED_CHAINS.find((candidate) => candidate.id === parsedChainId) || SUPPORTED_CHAINS[0];

    return {
      address: ethers.utils.getAddress(addressParam),
      abi: [] as any[],
      networkId: chain.id,
      networkName: chain.name,
    };
  }, [builderSearchParams]);

  // Track if user has manually selected a mode
  const [userSelectedMode, setUserSelectedMode] = useState(false);

  // Check for clone query param (?clone=<simulationId>)
  const hasCloneParam = new URLSearchParams(location.search).has('clone');

  // Initialize mode based on whether there's simulation context or clone/replay data
  const [mode, setMode] = useState<BuilderMode>(() => {
    const initialIntentMode = parseBuilderIntentMode(location.search);
    if (initialIntentMode === 'live') return 'live';
    if (initialIntentMode === 'simulation' || initialIntentMode === 'replay') return 'simulation';

    // Check for clone query param (set by SimulationHistoryPage)
    if (hasCloneParam) {
      return "simulation";
    }
    try {
      const txHashReplayData = localStorage.getItem(TXHASH_REPLAY_KEY);
      if (txHashReplayData) {
        return "simulation";
      }
    } catch {
      // Ignore errors
    }
    return contractContext?.address ? "simulation" : "live";
  });

  // Explicit URL mode intent should win when present.
  useEffect(() => {
    if (!urlIntentMode) return;
    const nextMode: BuilderMode =
      urlIntentMode === 'live'
        ? 'live'
        : urlIntentMode === 'analysis'
          ? 'analysis'
          : 'simulation';
    setMode((prev) => (prev === nextMode ? prev : nextMode));
  }, [urlIntentMode]);

  // Auto-switch to simulation mode if there's clone/replay data or contract context
  // Don't override user's manual selection
  // Also re-check when route changes (location.search) since component is persistent
  useEffect(() => {
    if (urlIntentMode) return;
    if (userSelectedMode) return;

    // Check for clone query param (highest priority - user clicked Clone from history)
    if (hasCloneParam && mode !== "simulation") {
      setMode("simulation");
      return;
    }

    // Check for txHash replay data (user clicked Re-Simulate on a txHash simulation)
    try {
      const txHashReplayData = localStorage.getItem(TXHASH_REPLAY_KEY);
      if (txHashReplayData && mode !== "simulation") {
        setMode("simulation");
        return;
      }
    } catch {
      // Ignore errors
    }

    // Check for contract context
    if (contractContext?.address && mode !== "simulation") {
      setMode("simulation");
    }
  }, [contractContext?.address, mode, userSelectedMode, hasCloneParam, location.search, urlIntentMode]);

  // Handle user mode change
  const handleModeChange = (value: string) => {
    setUserSelectedMode(true);
    setMode(value as BuilderMode);
  };

  return (
    <div className="transaction-builder-hub px-1 py-2 sm:px-3 sm:py-3">
      {/* Mode selector is now in the capsule Navigation — sub-tabs driven via ?mode= URL param */}

      {/* Content - animated layout transition for mode switch */}
      <div className="tool-content-container">
        <LayoutTransitionWrapper activeKey={mode}>
          <Suspense fallback={<LoadingSpinner text="Loading" fullPage />}>
            {mode === "live" ? (
              <SimpleGridUI mode="live" initialContractData={liveInitialContractData} />
            ) : mode === "analysis" ? (
              <TxAnalysisPanel
                simulation={resolvedAnalysisSubject?.simulation ?? null}
                simulationId={resolvedAnalysisSubject?.simulationId ?? null}
                from={resolvedAnalysisSubject?.from ?? null}
                to={resolvedAnalysisSubject?.to ?? null}
                txHash={resolvedAnalysisSubject?.txHash ?? null}
              />
            ) : (
              <TransactionBuilderWagmi />
            )}
          </Suspense>
        </LayoutTransitionWrapper>
      </div>
    </div>
  );
};

export default TransactionBuilderHub;
