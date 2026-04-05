/**
 * SimpleGridMain – thin orchestrator that composes domain hooks and wires
 * everything into GridProvider for child components.
 *
 * Refactored: state + handlers extracted into hooks/ directory.
 * Restoration effects in hooks/useRestorationEffects.ts.
 * Shared effects in hooks/useSharedEffects.ts.
 * Context value + styles in buildGridContextValue.ts.
 */
import React, {
  useEffect,
  useRef,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  useAccount,
  useWalletClient,
  usePublicClient,
  useChainId,
  useSwitchChain,
  useConfig,
} from "wagmi";
import { useNotifications } from "../NotificationManager";
import { useSimulation } from "../../contexts/SimulationContext";
import { sanitizeAbiEntries } from "./utils";

import "../../styles/SharedComponents.css";
import "../../styles/SimulatorWorkbench.css";
import "../../styles/SimpleGridUI.css";

import { GridProvider } from "./GridContext";
import GridLayout from "./GridLayout";

// Hooks
import { useTokenState } from "./hooks/useTokenState";
import { useDiamondState } from "./hooks/useDiamondState";
import { useWalletHelpers } from "./hooks/useWalletHelpers";
import { useFunctionState } from "./hooks/useFunctionState";
import { useContractState } from "./hooks/useContractState";
import { useSimulationState } from "./hooks/useSimulationState";
import { useRestorationEffects } from "./hooks/useRestorationEffects";
import { useSharedEffects } from "./hooks/useSharedEffects";
import { buildGridContextValue } from "./buildGridContextValue";
import type { SimpleGridUIProps } from "./types";

const SimpleGridUI: React.FC<SimpleGridUIProps> = ({
  contractModeToggle,
  mode = "live",
  initialContractData,
}) => {
  // ===================== External hooks =====================
  const { address, isConnected, chain: accountChain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const wagmiConfig = useConfig();
  const { showSuccess, showError, showWarning, showInfo, showNotification } = useNotifications();
  const navigate = useNavigate();
  const {
    setSimulation,
    contractContext,
    simulationId: contextSimulationId,
  } = useSimulation();

  const simulationIdRef = useRef<string | null>(contextSimulationId);
  useEffect(() => { simulationIdRef.current = contextSimulationId; }, [contextSimulationId]);

  const isSimulationMode = mode === "simulation";
  const isRestoringRef = useRef(false);

  // ===================== Domain hooks =====================

  // 1. Token state (no deps on other hooks)
  const tokenState = useTokenState();

  // 2. Wallet helpers
  const walletHelpers = useWalletHelpers({
    accountChainId: accountChain?.id,
    chainId,
    showWarning,
    showError,
  });

  // 3. Function state (needs isDiamond, diamondFacets, selectedFacet from diamond)
  //    We manage diamond state first as a simple hook, then wire into function state.
  //    But function state also provides setters needed by diamond. We break the cycle
  //    by using a two-phase approach.

  // 3a. Diamond state (needs function setters – passed lazily)
  const fnSetSelectedFunction = useRef<any>(null);
  const fnSetSelectedFunctionObj = useRef<any>(null);

  const diamondState = useDiamondState({
    setSelectedFunction: (...args: any[]) => fnSetSelectedFunction.current?.(...args),
    setSelectedFunctionObj: (...args: any[]) => fnSetSelectedFunctionObj.current?.(...args),
  });

  // 3b. Function state
  const functionState = useFunctionState({
    contractInfo: null, // will be set after contract state; we read from contractState below
    isDiamond: tokenState.isDiamond,
    diamondFacets: diamondState.diamondFacets,
    selectedFacet: diamondState.selectedFacet,
    sanitizeAbiEntries,
    isRestoringRef,
  });

  // Wire lazy refs
  fnSetSelectedFunction.current = functionState.setSelectedFunction;
  fnSetSelectedFunctionObj.current = functionState.setSelectedFunctionObj;

  // 4. Contract state
  const contractState = useContractState({
    initialContractData,
    contractContext,
    tokenSetters: {
      setTokenInfo: tokenState.setTokenInfo,
      setTokenDetection: tokenState.setTokenDetection,
      setIsERC20: tokenState.setIsERC20,
      setIsERC721: tokenState.setIsERC721,
      setIsERC1155: tokenState.setIsERC1155,
      setIsERC777: tokenState.setIsERC777,
      setIsERC4626: tokenState.setIsERC4626,
      setIsERC2981: tokenState.setIsERC2981,
      setIsDiamond: tokenState.setIsDiamond,
      setIsDetectingTokenType: tokenState.setIsDetectingTokenType,
      setIsLoadingContractInfo: tokenState.setIsLoadingContractInfo,
      isERC20: tokenState.isERC20,
      isERC721: tokenState.isERC721,
      isERC1155: tokenState.isERC1155,
      isERC777: tokenState.isERC777,
      isERC4626: tokenState.isERC4626,
      isERC2981: tokenState.isERC2981,
      isDiamond: tokenState.isDiamond,
      tokenInfo: tokenState.tokenInfo,
    },
    diamondSetters: {
      setSelectedFacet: diamondState.setSelectedFacet,
      setDiamondFacets: diamondState.setDiamondFacets,
      isDiamond: tokenState.isDiamond,
    },
    functionSetters: {
      setReadFunctions: functionState.setReadFunctions,
      setWriteFunctions: functionState.setWriteFunctions,
      setSelectedFunction: functionState.setSelectedFunction,
      setSelectedFunctionObj: functionState.setSelectedFunctionObj,
      setFunctionInputs: functionState.setFunctionInputs,
      setGeneratedCallData: functionState.setGeneratedCallData,
      setFunctionResult: functionState.setFunctionResult,
      clearPendingRestore: () => { functionState.pendingFunctionRestoreRef.current = null; },
    },
    createEthersProvider: walletHelpers.createEthersProvider,
    sanitizeAbiEntries,
  });

  // 5. Simulation state
  const simState = useSimulationState({
    selectedNetwork: contractState.selectedNetwork,
    contractAddress: contractState.contractAddress,
    contractInfo: contractState.contractInfo,
    contractName: contractState.contractName,
    address,
    isConnected,
    walletClient,
    mode,
    proxyInfo: contractState.proxyInfo,
    setProxyInfo: contractState.setProxyInfo,
    isDiamond: tokenState.isDiamond,
    diamondFacets: diamondState.diamondFacets,
    isERC20: tokenState.isERC20,
    isERC721: tokenState.isERC721,
    isERC1155: tokenState.isERC1155,
    isERC777: tokenState.isERC777,
    isERC4626: tokenState.isERC4626,
    tokenInfo: tokenState.tokenInfo,
    abiSource: contractState.abiSource,
    selectedFunctionObj: functionState.selectedFunctionObj,
    selectedFunctionType: functionState.selectedFunctionType,
    functionInputs: functionState.functionInputs,
    generatedCallData: functionState.generatedCallData,
    createEthersProvider: walletHelpers.createEthersProvider,
    showError,
    showWarning,
    navigate,
    setSimulation,
  });

  // ===================== Shared effects =====================
  useSharedEffects({
    simState,
    functionState,
    contractState,
    tokenState,
    isSimulationMode,
    address,
  });

  // ===================== Restoration effects =====================
  useRestorationEffects({
    initialContractData,
    contractContext,
    isRestoringRef,
    contractState,
    tokenState,
    diamondState,
    functionState,
    simState,
  });

  // ===================== Computed values =====================

  // Wallet-derived computed
  const requiresWalletForWrite = !isSimulationMode;
  const walletMissingForWrite =
    functionState.selectedFunctionType === "write" && requiresWalletForWrite && (!isConnected || !walletClient);
  const disableSimulationAction =
    isSimulationMode && simState.isSimulating && functionState.selectedFunctionType === "write";

  const isFetchingContractDetails = contractState.isLoadingABI || tokenState.isLoadingContractInfo;
  const isFacetDataPending = tokenState.isDiamond && (diamondState.facetLoading || (diamondState.diamondFacets.length === 0 && isFetchingContractDetails));
  const resolvedContractName = contractState.contractName && contractState.contractName.trim().length > 0
    ? contractState.contractName
    : isFetchingContractDetails ? "Loading contract..." : "Unknown Contract";

  // ===================== Context value =====================

  const gridContextValue = buildGridContextValue({
    contractModeToggle,
    mode,
    isSimulationMode,
    contractState,
    tokenState,
    diamondState,
    functionState,
    simState,
    walletHelpers,
    isFetchingContractDetails,
    isFacetDataPending,
    resolvedContractName,
    requiresWalletForWrite,
    walletMissingForWrite,
    disableSimulationAction,
    isRestoringRef,
    simulationIdRef,
    address,
    isConnected,
    walletClient,
    publicClient,
    chainId,
    switchChain,
    accountChain,
    wagmiConfig,
    navigate,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showNotification,
    setSimulation,
    contextSimulationId,
  });

  return (
    <GridProvider value={gridContextValue}>
      <GridLayout />
    </GridProvider>
  );
};

export default SimpleGridUI;
