/**
 * useSimulationState – manages simulation execution, results, stack frames,
 * and rendering helpers.
 *
 * Extracted from SimpleGridMain.tsx (pure structural split – no behaviour changes).
 */
import React, { useState, useCallback, useMemo, type ReactNode } from "react";
import { ethers } from "ethers";
import type { SimulationResult, TransactionRequest } from "../../../types/transaction";
import type { SimulationOverrides } from "../../SimulationOverridesPanel";
import {
  extractSimulationArtifacts,
  flattenCallTreeEntries,
  getCallNodeError,
  type SimulationCallNode,
} from "../../../utils/simulationArtifacts";
import { simulateTransaction } from "../../../utils/transactionSimulation";
import { resolveProxyInfo } from "../../../utils/resolver";
import type { ProxyInfo } from "../../../utils/resolver";
import { CopyButton } from "../../ui/copy-button";
import { AlertTriangleIcon } from "../../icons/IconLibrary";
import { decodeFunctionSelector } from "../utils";
import { classifySimulationError } from "../../../utils/errorParser";

export interface UseSimulationStateDeps {
  selectedNetwork: any;
  contractAddress: string;
  contractInfo: any;
  contractName: string;
  address: string | undefined;
  isConnected: boolean;
  walletClient: any;
  mode: string;
  proxyInfo: ProxyInfo | null;
  setProxyInfo: (v: ProxyInfo | null) => void;
  isDiamond: boolean;
  diamondFacets: any[];
  isERC20: boolean;
  isERC721: boolean;
  isERC1155: boolean;
  isERC777: boolean;
  isERC4626: boolean;
  tokenInfo: any;
  abiSource: string | null;
  selectedFunctionObj: any;
  selectedFunctionType: string | null;
  functionInputs: Record<string, string>;
  generatedCallData: string;
  createEthersProvider: (network: any) => Promise<ethers.providers.Provider>;
  showError: (title: string, message: string) => void;
  showWarning: (title: string, message: string) => void;
  navigate: (path: string, options?: any) => void;
  setSimulation: (result: any, context?: any) => void;
}

export function useSimulationState(deps: UseSimulationStateDeps) {
  const {
    selectedNetwork, contractAddress, contractInfo, contractName,
    address, isConnected, walletClient, mode,
    proxyInfo, setProxyInfo, isDiamond, diamondFacets,
    isERC20, isERC721, isERC1155, isERC777, isERC4626, tokenInfo, abiSource,
    selectedFunctionObj, selectedFunctionType, functionInputs, generatedCallData,
    createEthersProvider, showError, showWarning,
    navigate, setSimulation,
  } = deps;

  const isSimulationMode = mode === "simulation";

  // ---------- state ----------
  const [simulationOverrides, setSimulationOverrides] = useState<SimulationOverrides>({
    enableDebug: false,
  });
  const simulationFromAddress = simulationOverrides.from || "";
  const setSimulationFromAddress = (value: string) =>
    setSimulationOverrides((prev) => ({ ...prev, from: value }));
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [collapsedStackFrames, setCollapsedStackFrames] = useState<Set<string>>(new Set());
  const [activeSimulationFrame, setActiveSimulationFrame] = useState<string | null>(null);
  const [filters, setFilters] = useState({ gas: true, full: true, storage: true, events: true });
  const [usePendingBlock, setUsePendingBlock] = useState(true);

  const summaryTrace = useMemo(() => {
    if (simulationResult && typeof simulationResult.rawTrace === "object" && simulationResult.rawTrace && !Array.isArray(simulationResult.rawTrace)) {
      return simulationResult.rawTrace as Record<string, unknown>;
    }
    return null;
  }, [simulationResult]);

  // ---------- run simulation ----------
  const runSimulation = useCallback(
    async (
      transaction: TransactionRequest,
      options?: { description?: string; fromOverride?: string }
    ): Promise<SimulationResult | null> => {
      if (!selectedNetwork) {
        showWarning("Network Required", "Select a network before running a simulation.");
        return null;
      }

      const fromCandidate = (options?.fromOverride || simulationOverrides.from || "").trim() || address || "0x0000000000000000000000000000000000000000";
      if (!ethers.utils.isAddress(fromCandidate)) {
        showError("Invalid Simulation Address", "Enter a valid address to impersonate for the simulation.");
        return null;
      }
      const normalizedFrom = ethers.utils.getAddress(fromCandidate);

      setIsSimulating(true);
      setSimulationError(null);
      setSimulationResult(null);

      try {
        const provider = await createEthersProvider(selectedNetwork);
        let resolvedProxyInfo = proxyInfo;

        if (!resolvedProxyInfo) {
          const proxyTarget = (contractAddress || transaction.to || "").trim();
          if (proxyTarget && ethers.utils.isAddress(proxyTarget)) {
            try {
              const detectedProxyInfo = await Promise.race([
                resolveProxyInfo(proxyTarget, selectedNetwork, provider),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
              ]);
              if (detectedProxyInfo === null) {
                // Proxy detection timed out
              } else {
                resolvedProxyInfo = detectedProxyInfo;
                if (detectedProxyInfo.isProxy) setProxyInfo(detectedProxyInfo);
              }
            } catch {
              // Proxy detection failed before run
            }
          }
        }

        const transactionWithOverrides: TransactionRequest = {
          ...transaction,
          ...(simulationOverrides.value && {
            value: simulationOverrides.value.startsWith("0x")
              ? simulationOverrides.value
              : ethers.utils.parseEther(simulationOverrides.value).toHexString(),
          }),
          ...(simulationOverrides.gas && { gasLimit: simulationOverrides.gas }),
          ...(simulationOverrides.gasPrice && { gasPrice: simulationOverrides.gasPrice }),
          ...(simulationOverrides.blockNumber && { blockTag: simulationOverrides.blockNumber }),
          ...(isDiamond && diamondFacets.length > 0 && { diamondFacetAddresses: diamondFacets.map(f => f.address) }),
          ...(resolvedProxyInfo?.isProxy && {
            proxyImplementationAddresses: resolvedProxyInfo.implementations?.length
              ? resolvedProxyInfo.implementations
              : resolvedProxyInfo.implementationAddress ? [resolvedProxyInfo.implementationAddress] : undefined,
          }),
        };

        // Respect the user's debug intent at the initial simulation entry point.
        const result = await simulateTransaction(
          transactionWithOverrides,
          selectedNetwork,
          normalizedFrom,
          provider,
          { enableDebug: simulationOverrides.enableDebug === true }
        );
        // Persist the effective sender used by the simulator for debugging/QA parity.
        (result as any).requestedFrom = normalizedFrom;

        let parsedAbi: any[] | null = null;
        if (contractInfo?.abi) {
          try { parsedAbi = typeof contractInfo.abi === 'string' ? JSON.parse(contractInfo.abi) : contractInfo.abi; } catch { parsedAbi = null; }
        }

        let detectedTokenType: "ERC20" | "ERC721" | "ERC1155" | "ERC777" | "ERC4626" | null = null;
        if (isERC20) detectedTokenType = "ERC20";
        else if (isERC721) detectedTokenType = "ERC721";
        else if (isERC1155) detectedTokenType = "ERC1155";
        else if (isERC777) detectedTokenType = "ERC777";
        else if (isERC4626) detectedTokenType = "ERC4626";

        const contractContextToSave = {
          address: contractAddress || transaction.to || "",
          name: contractInfo?.name || contractName || undefined,
          abi: parsedAbi,
          abiSource: abiSource || undefined,
          networkId: selectedNetwork?.id || 1,
          networkName: selectedNetwork?.name || "Ethereum",
          simulationOrigin: 'manual' as const,
          selectedFunction: selectedFunctionObj?.name || undefined,
          selectedFunctionType: selectedFunctionType || undefined,
          functionInputs: Object.keys(functionInputs).length > 0 ? functionInputs : undefined,
          calldata: generatedCallData !== "0x" ? generatedCallData : undefined,
          fromAddress: normalizedFrom,
          ethValue: simulationOverrides.value || undefined,
          blockOverride: simulationOverrides.blockNumber || undefined,
          debugEnabled: simulationOverrides.enableDebug === true,
          tokenType: detectedTokenType,
          tokenSymbol: tokenInfo?.symbol || undefined,
          tokenDecimals: tokenInfo?.decimals || undefined,
          proxyType: resolvedProxyInfo?.proxyType || (isDiamond ? "DiamondProxy" : undefined),
          implementationAddress: resolvedProxyInfo?.implementationAddress,
          implementations: resolvedProxyInfo?.implementations,
          beaconAddress: resolvedProxyInfo?.beaconAddress,
          adminAddress: resolvedProxyInfo?.adminAddress,
          diamondFacets: isDiamond && diamondFacets.length > 0 ? diamondFacets.map(facet => ({ address: facet.address, name: facet.name, selectors: facet.selectors, abi: facet.abi })) : undefined,
        };

        const simulationId =
          (result as any).simulationId || (result as any).transactionHash || (result as any).txHash ||
          crypto.randomUUID();
        (result as any).simulationId = simulationId;

        setSimulation(result, contractContextToSave);

        navigate(`/simulation/${simulationId}`, { state: { fromSimulation: true } });
        setSimulationResult(null);
        return result;
      } catch (error: any) {
        const rawMessage = error?.message || error?.toString?.() || "Simulation failed due to an unexpected error.";
        const classified = classifySimulationError(rawMessage);
        setSimulationError(classified.message);
        showError("Simulation Error", classified.message);
        return null;
      } finally {
        setIsSimulating(false);
      }
    },
    [
      address, selectedNetwork, showError, showWarning, simulationOverrides,
      navigate, setSimulation, createEthersProvider,
      contractAddress, contractInfo?.abi, contractInfo?.name, contractName,
      selectedFunctionObj, selectedFunctionType, functionInputs, generatedCallData,
      isERC20, isERC721, isERC1155, isERC777, isERC4626, tokenInfo,
      proxyInfo, isDiamond, diamondFacets,
    ]
  );

  // ---------- render helpers ----------
  const renderCallTreeNodes = (nodes: SimulationCallNode[], depth = 0): React.ReactNode | null => {
    if (!nodes || nodes.length === 0) return null;
    return (
      <ul className="simulation-call-tree">
        {nodes.slice(0, 25).map((node, index) => {
          const label = node.functionName || node.label || node.type || `${node.from || "unknown"} → ${node.to || "unknown"}`;
          const gas = node.gasUsed !== undefined ? String(node.gasUsed) : null;
          const value = node.value !== undefined ? String(node.value) : undefined;
          return (
            <li key={`call-node-${depth}-${index}`} className="simulation-call-node">
              <div className="simulation-call-node__title">{label}</div>
              <div className="simulation-call-node__meta">
                {node.from && <span>from <code className="simulation-call-node__code">{node.from}</code></span>}
                {node.to && <span>to <code className="simulation-call-node__code">{node.to}</code></span>}
                {gas && <span>gas: {gas}</span>}
                {value && <span>value: {value}</span>}
              </div>
              {node.children && node.children.length > 0 && (
                <div className="simulation-call-node__children">
                  {renderCallTreeNodes(node.children, depth + 1)}
                </div>
              )}
            </li>
          );
        })}
        {nodes.length > 25 && <li className="simulation-panel__hint">+{nodes.length - 25} additional call frames</li>}
      </ul>
    );
  };

  const renderSimulationInsights = (options?: { emptyMessage?: string }): ReactNode => {
    if (!isSimulationMode) return null;
    if (isSimulating || simulationResult) return null;

    if (simulationError) {
      return (
        <div className="simulation-helper-card" style={{ borderColor: "rgba(248, 113, 113, 0.4)", color: "#fecaca" }}>
          <AlertTriangleIcon width={20} height={20} />
          <div>
            <strong>Simulation failed</strong>
            <p style={{ margin: 0 }}>{simulationError}</p>
          </div>
        </div>
      );
    }

    return null;
  };

  return {
    // state
    simulationOverrides, setSimulationOverrides,
    simulationFromAddress, setSimulationFromAddress,
    simulationResult, setSimulationResult,
    simulationError, setSimulationError,
    isSimulating, setIsSimulating,
    collapsedStackFrames, setCollapsedStackFrames,
    activeSimulationFrame, setActiveSimulationFrame,
    filters, setFilters,
    summaryTrace,
    usePendingBlock, setUsePendingBlock,
    isSimulationMode,
    // handlers
    runSimulation,
    renderCallTreeNodes,
    renderSimulationInsights,
  };
}
