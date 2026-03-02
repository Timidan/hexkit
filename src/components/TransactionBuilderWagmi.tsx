import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { LayoutTransitionWrapper } from "./ui/animated-tabs";
import { ethers } from "ethers";
import SimpleGridUI from "./SimpleGridUI";
import { EXTENDED_NETWORKS } from "./shared/NetworkSelector";
import { SUPPORTED_CHAINS } from "../utils/chains";
import { useSimulation } from "../contexts/SimulationContext";
import {
  type SimulationViewMode,
  type TxHashReplayData,
  TXHASH_REPLAY_KEY,
  TXHASH_REPLAY_EVENT,
  TXHASH_REPLAY_LAST_INTENT_KEY,
} from "./transaction-builder/types";
import { SimulationReplayResults } from "./transaction-builder/SimulationReplayResults";
import { TransactionReplayView } from "./transaction-builder/TransactionReplayView";
import { renderModeToggle } from "./transaction-builder/renderModeToggle";
import { attemptCalldataDecodeNotification } from "./transaction-builder/calldataDecodeNotification";
import "../styles/SharedComponents.css";
import "../styles/SimulatorWorkbench.css";

// Re-export public API so existing consumers are not broken
export { SimulationReplayResults } from "./transaction-builder/SimulationReplayResults";
export {
  TXHASH_REPLAY_KEY,
  TXHASH_REPLAY_EVENT,
  TXHASH_REPLAY_LAST_INTENT_KEY,
} from "./transaction-builder/types";
export type { TxHashReplayData } from "./transaction-builder/types";

const TransactionBuilderWagmi: React.FC = () => {
  const { contractContext } = useSimulation();
  const location = useLocation();

  // Clone data fetched from IndexedDB when ?clone=<id> query param is present
  const [cloneData, setCloneData] = useState<any>(null);
  const [urlPrefillContractData, setUrlPrefillContractData] = useState<any>(null);
  // True while async clone fetch is in progress - prevents flash of wrong view
  const [cloneLoading, setCloneLoading] = useState(() => {
    const params = new URLSearchParams(location.search);
    return !!params.get('clone');
  });

  // Initialize viewMode: "replay" if txHash replay data exists, otherwise "builder"
  const [viewMode, setViewMode] = useState<SimulationViewMode>(() => {
    const params = new URLSearchParams(location.search);
    const requestedMode = params.get('mode');
    if (requestedMode === 'replay' || params.get('replay') === 'txhash') {
      return "replay";
    }
    if (requestedMode === 'simulation') {
      return "builder";
    }

    // Check for txHash replay data (set by SimulationResultsPage for re-simulation)
    try {
      const txHashReplayData = localStorage.getItem(TXHASH_REPLAY_KEY);
      if (txHashReplayData) {
        return "replay";
      }
    } catch {
      // Ignore errors
    }
    return "builder";
  });

  // Read clone simulation ID from URL query param (?clone=<simulationId>).
  // Uses location.search so it re-triggers when PersistentTools reveals
  // this component after a new navigation from SimulationHistoryPage.
  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const cloneId = params.get('clone');
    if (!cloneId) {
      // No clone param - clear stale state (handles clone->no-clone transition)
      setCloneLoading(false);
      setCloneData(null);
      return;
    }

    // Set loading before async fetch to prevent wrong-view flash on URL transitions
    setCloneLoading(true);
    let cancelled = false;
    import('../services/SimulationHistoryService').then(({ simulationHistoryService }) => {
      simulationHistoryService.getSimulation(cloneId).then(fullSim => {
        if (cancelled) return;
        if (!fullSim) {
          setCloneLoading(false);
          setCloneData(null);
          return;
        }

        // Determine origin: top-level origin (canonical) > contractContext > inference from result
        const origin = fullSim.origin
          || fullSim.contractContext?.simulationOrigin
          || (fullSim.transactionHash
            || fullSim.contractContext?.replayTxHash
            || fullSim.result?.transactionHash
            || fullSim.result?.txHash
            || fullSim.result?.mode === 'onchain'
              ? 'tx-hash-replay'
              : 'manual');

        if (origin === 'tx-hash-replay') {
          // Route to replay view with prefilled hash & network
          // Check all possible locations where the tx hash might be stored (including legacy records)
          const replayHash = fullSim.transactionHash
            || fullSim.contractContext?.replayTxHash
            || fullSim.result?.transactionHash
            || fullSim.result?.txHash
            || '';
          const networkId = fullSim.contractContext?.networkId || fullSim.networkId || 1;
          const networkName = fullSim.contractContext?.networkName || fullSim.networkName || 'Ethereum';

          if (replayHash) {
            const replayData: TxHashReplayData = {
              transactionHash: replayHash,
              networkId,
              networkName,
              forkBlockTag: fullSim.contractContext?.blockOverride || undefined,
              debugEnabled: fullSim.contractContext?.debugEnabled || false,
              source: "simulation-history-clone",
            };
            const replayPrefill = { ...replayData, noAutoReplay: true };
            const replayAudit = {
              transactionHash: replayData.transactionHash,
              noAutoReplay: true,
              source: replayData.source,
              recordedAt: Date.now(),
            };
            // Write prefill data - TransactionReplayView will pick it up
            // Set noAutoReplay flag so user must click Run manually
            try {
              localStorage.setItem(TXHASH_REPLAY_KEY, JSON.stringify(replayPrefill));
              localStorage.setItem(TXHASH_REPLAY_LAST_INTENT_KEY, JSON.stringify(replayAudit));
              window.dispatchEvent(new CustomEvent(TXHASH_REPLAY_EVENT, { detail: replayPrefill }));
            } catch (storageErr) {
              // localStorage quota exceeded - clear artifact cache and retry
              const keysToRemove: string[] = [];
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('web3toolkit:sim:artifact:')) {
                  keysToRemove.push(key);
                }
              }
              keysToRemove.forEach(k => localStorage.removeItem(k));
              try {
                localStorage.setItem(TXHASH_REPLAY_KEY, JSON.stringify(replayPrefill));
                localStorage.setItem(TXHASH_REPLAY_LAST_INTENT_KEY, JSON.stringify(replayAudit));
                window.dispatchEvent(new CustomEvent(TXHASH_REPLAY_EVENT, { detail: replayPrefill }));
              } catch {
                // Still can't write - fall through, replay view will work without prefill
              }
            }
            setViewMode('replay');

            // Decode-aware notification: if calldata exists, try to decode it
            // and offer "Switch to Manual" with decoded args
            const calldata = fullSim.contractContext?.calldata;
            const targetAddress = fullSim.contractContext?.address;
            if (calldata && calldata.length >= 10 && targetAddress) {
              attemptCalldataDecodeNotification(calldata, targetAddress, networkId, fullSim.contractContext, setViewMode, setCloneData);
            }
          } else {
            // No hash available, fall back to manual builder with whatever we have
            setCloneData(fullSim.contractContext || null);
          }
        } else {
          // Manual origin: pass to SimpleGridUI and ensure builder view is active
          const ctx = fullSim.contractContext;
          if (ctx) {
            setCloneData(ctx);
            setViewMode('builder');
          } else {
            // No contractContext found for simulation
          }
        }
        setCloneLoading(false);
      }).catch(err => {
        if (!cancelled) {
          setCloneLoading(false);
        }
      });
    }).catch(err => {
      // Chunk-load / dynamic import failure
      if (!cancelled) {
        setCloneLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [location.search]);

  // Keep route intent in sync while this component stays mounted in PersistentTools.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedMode = params.get('mode');
    if (requestedMode === 'replay' || params.get('replay') === 'txhash') {
      setViewMode('replay');
      return;
    }
    if (requestedMode === 'simulation') {
      setViewMode('builder');
    }
  }, [location.search]);

  // URL prefill contract intent: /builder?mode=simulation&address=0x...&chainId=...
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('clone')) {
      setUrlPrefillContractData(null);
      return;
    }

    const addressParam = params.get('address')?.trim();
    if (!addressParam || !ethers.utils.isAddress(addressParam)) {
      setUrlPrefillContractData(null);
      return;
    }

    const normalizedAddress = ethers.utils.getAddress(addressParam);
    const rawChainId = params.get('chainId');
    const parsedChainId = rawChainId ? Number.parseInt(rawChainId, 10) : Number.NaN;
    const matchedNetwork = SUPPORTED_CHAINS.find((chain) => chain.id === parsedChainId);
    const networkId = matchedNetwork?.id || contractContext?.networkId || 1;
    const networkName = matchedNetwork?.name || contractContext?.networkName || 'Ethereum';

    setUrlPrefillContractData((prev: any) => {
      if (
        prev &&
        typeof prev.address === 'string' &&
        prev.address.toLowerCase() === normalizedAddress.toLowerCase() &&
        prev.networkId === networkId
      ) {
        return prev;
      }
      return {
        address: normalizedAddress,
        name: contractContext?.name,
        abi: [],
        networkId,
        networkName,
      };
    });
  }, [location.search, contractContext?.name, contractContext?.networkId, contractContext?.networkName]);

  const handleModeChange = (mode: SimulationViewMode) => setViewMode(mode);

  // Build initialContractData from cloneData first, then contractContext as fallback
  const initialContractData = React.useMemo(() => {
    // Priority: cloneData > URL prefill > current contract context
    const source = cloneData || urlPrefillContractData || contractContext;
    if (!source?.address) return undefined;

    return {
      address: source.address,
      name: source.name,
      abi: source.abi || [],
      networkId: source.networkId,
      networkName: source.networkName,
      // Re-simulation fields
      selectedFunction: source.selectedFunction,
      selectedFunctionType: source.selectedFunctionType,
      functionInputs: source.functionInputs,
      calldata: source.calldata,
      fromAddress: source.fromAddress,
      ethValue: source.ethValue,
      blockOverride: source.blockOverride,
      debugEnabled: source.debugEnabled,
      // Token info
      tokenType: source.tokenType,
      tokenSymbol: source.tokenSymbol,
      tokenDecimals: source.tokenDecimals,
      // Proxy/Diamond info
      proxyType: source.proxyType,
      implementationAddress: source.implementationAddress,
      implementations: source.implementations,
      diamondFacets: source.diamondFacets,
    };
  }, [cloneData, urlPrefillContractData, contractContext]);

  // While clone data is loading from IndexedDB, show nothing to avoid flash of wrong view
  if (cloneLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a' }} />
    );
  }

  return (
    <LayoutTransitionWrapper activeKey={viewMode}>
      {viewMode === "builder" ? (
        <SimpleGridUI
          contractModeToggle={renderModeToggle(viewMode, handleModeChange)}
          mode="simulation"
          initialContractData={initialContractData}
        />
      ) : (
        <TransactionReplayView
          modeToggle={renderModeToggle(viewMode, handleModeChange)}
        />
      )}
    </LayoutTransitionWrapper>
  );
};

export default TransactionBuilderWagmi;
