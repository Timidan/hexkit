/**
 * buildGridContextValue – assembles the GridContext value object and style constants.
 * Extracted from SimpleGridMain.tsx (pure structural split – no behaviour changes).
 */
import type React from "react";
import type { ReactNode } from "react";
import { sanitizeAbiEntries } from "./utils";

/* ------------------------------------------------------------------ */
/*  Style constants                                                    */
/* ------------------------------------------------------------------ */

export const CARD_STYLE = { background: "#1a1a1a", border: "1px solid #333", borderRadius: "12px", padding: "24px", marginBottom: "20px" };

export function buildContractCardStyle(isSimulationMode: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "20px",
    background: "transparent",
    border: "1px solid #444",
    borderRadius: "8px",
    boxShadow: "none",
    ...(isSimulationMode ? { maxHeight: "calc(100vh - 180px)", overflowY: "auto" as const, overscrollBehavior: "contain" as const, minHeight: 0 } : {}),
  };
}

export const SECTION_TITLE_STYLE: React.CSSProperties = { fontSize: "15px", fontWeight: 600, color: "#888", marginBottom: "12px", textTransform: "uppercase" as const, letterSpacing: "0.05em" };
export const GRID_CONTAINER_STYLE = { width: "100%", display: "flex", justifyContent: "center" };
export const HEADER_STYLE = { fontSize: "25px", fontWeight: "bold", color: "#fff", marginBottom: "8px" };
export const SUB_HEADER_STYLE = { fontSize: "19px", fontWeight: "600", color: "#fff", marginBottom: "20px" };

export function buildGridStyle(isSimulationMode: boolean): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: isSimulationMode ? "1fr 380px" : "1fr",
    gap: "20px",
    width: "100%",
    maxWidth: isSimulationMode ? "1100px" : "600px",
    margin: "0 auto",
    padding: 0,
  };
}

export const INPUT_STYLE = { width: "100%", padding: "12px 16px", background: "#2a2a2a", border: "1px solid #555", borderRadius: "8px", color: "#fff", fontSize: "15px", marginBottom: "8px" };
export const BUTTON_STYLE = { padding: "12px 20px", background: "#007bff", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "15px", fontWeight: "500" };

export const selectionCardStyle = (isSelected: boolean) => ({
  padding: "16px",
  background: isSelected ? "#1e40af20" : "#2a2a2a",
  border: `2px solid ${isSelected ? "#007bff" : "#555"}`,
  borderRadius: "10px",
  cursor: "pointer",
  marginBottom: "12px",
  transition: "all 0.2s ease",
});

/* ------------------------------------------------------------------ */
/*  Context value builder                                              */
/* ------------------------------------------------------------------ */

interface BuildContextArgs {
  // Props
  contractModeToggle: ReactNode | undefined;
  mode: string;
  isSimulationMode: boolean;

  // Domain hooks
  contractState: any;
  tokenState: any;
  diamondState: any;
  functionState: any;
  simState: any;
  walletHelpers: any;

  // Computed
  isFetchingContractDetails: boolean;
  isFacetDataPending: boolean;
  resolvedContractName: string;
  requiresWalletForWrite: boolean;
  walletMissingForWrite: boolean;
  disableSimulationAction: boolean;

  // Refs
  isRestoringRef: React.MutableRefObject<boolean>;
  simulationIdRef: React.MutableRefObject<string | null>;

  // Wagmi
  address: string | undefined;
  isConnected: boolean;
  walletClient: any;
  publicClient: any;
  chainId: number;
  switchChain: any;
  accountChain: any;
  wagmiConfig: any;

  // Router
  navigate: any;

  // Notifications
  showSuccess: any;
  showError: any;
  showWarning: any;
  showInfo: any;
  showNotification: any;

  // Simulation context
  setSimulation: any;
  contextSimulationId: string | null;
}

export function buildGridContextValue(args: BuildContextArgs): any {
  const {
    contractModeToggle, mode, isSimulationMode,
    contractState, tokenState, diamondState, functionState, simState, walletHelpers,
    isFetchingContractDetails, isFacetDataPending, resolvedContractName,
    requiresWalletForWrite, walletMissingForWrite, disableSimulationAction,
    isRestoringRef, simulationIdRef,
    address, isConnected, walletClient, publicClient, chainId, switchChain, accountChain, wagmiConfig,
    navigate,
    showSuccess, showError, showWarning, showInfo, showNotification,
    setSimulation, contextSimulationId,
  } = args;

  return {
    // Props
    contractModeToggle,
    mode,
    isSimulationMode,
    // Contract state
    contractAddress: contractState.contractAddress, setContractAddress: contractState.setContractAddress,
    selectedNetwork: contractState.selectedNetwork, setSelectedNetwork: contractState.setSelectedNetwork,
    contractName: contractState.contractName, setContractName: contractState.setContractName,
    contractInfo: contractState.contractInfo, setContractInfo: contractState.setContractInfo,
    contractSource: contractState.contractSource, setContractSource: contractState.setContractSource,
    isLoadingABI: contractState.isLoadingABI, setIsLoadingABI: contractState.setIsLoadingABI,
    abiError: contractState.abiError, setAbiError: contractState.setAbiError,
    abiSource: contractState.abiSource, setAbiSource: contractState.setAbiSource,
    searchProgress: contractState.searchProgress, setSearchProgress: contractState.setSearchProgress,
    isLoadingContractInfo: tokenState.isLoadingContractInfo,
    isDetectingTokenType: tokenState.isDetectingTokenType,
    proxyInfo: contractState.proxyInfo, implementationAbi: contractState.implementationAbi,
    implementationName: contractState.implementationName, isLoadingImplementation: contractState.isLoadingImplementation,
    // Token state
    tokenInfo: tokenState.tokenInfo, tokenDetection: tokenState.tokenDetection,
    isERC20: tokenState.isERC20, isERC721: tokenState.isERC721, isERC1155: tokenState.isERC1155,
    isERC777: tokenState.isERC777, isERC4626: tokenState.isERC4626, isERC2981: tokenState.isERC2981,
    isDiamond: tokenState.isDiamond,
    // Diamond facet state
    selectedFacet: diamondState.selectedFacet, setSelectedFacet: diamondState.setSelectedFacet,
    diamondFacets: diamondState.diamondFacets, setDiamondFacets: diamondState.setDiamondFacets,
    showFacetSidebar: diamondState.showFacetSidebar, setShowFacetSidebar: diamondState.setShowFacetSidebar,
    facetLoading: diamondState.facetLoading, facetProgress: diamondState.facetProgress,
    facetProgressDetails: diamondState.facetProgressDetails,
    showFacetDetails: diamondState.showFacetDetails, setShowFacetDetails: diamondState.setShowFacetDetails,
    // Function state
    functionMode: functionState.functionMode, setFunctionMode: functionState.setFunctionMode,
    selectedFunctionType: functionState.selectedFunctionType, setSelectedFunctionType: functionState.setSelectedFunctionType,
    selectedFunction: functionState.selectedFunction, setSelectedFunction: functionState.setSelectedFunction,
    selectedFunctionObj: functionState.selectedFunctionObj,
    readFunctions: functionState.readFunctions, writeFunctions: functionState.writeFunctions,
    functionSearch: functionState.functionSearch, setFunctionSearch: functionState.setFunctionSearch,
    showFunctionSearch: functionState.showFunctionSearch, setShowFunctionSearch: functionState.setShowFunctionSearch,
    filteredReadFunctions: functionState.filteredReadFunctions, filteredWriteFunctions: functionState.filteredWriteFunctions,
    searchFilteredFunctions: functionState.searchFilteredFunctions,
    totalFacetReads: functionState.totalFacetReads, totalFacetWrites: functionState.totalFacetWrites,
    isFacetDataPending, resolvedContractName,
    // Function inputs / calldata
    functionInputs: functionState.functionInputs,
    generatedCallData: functionState.generatedCallData, setGeneratedCallData: functionState.setGeneratedCallData,
    decodedCalldata: functionState.decodedCalldata, setDecodedCalldata: functionState.setDecodedCalldata,
    enhancedParameters: functionState.enhancedParameters, useEnhancedUI: functionState.useEnhancedUI,
    setUseEnhancedUI: functionState.setUseEnhancedUI,
    memoizedInputs: functionState.memoizedInputs, contractInputsHook: functionState.contractInputsHook,
    // Simulation state
    simulationOverrides: simState.simulationOverrides, setSimulationOverrides: simState.setSimulationOverrides,
    simulationFromAddress: simState.simulationFromAddress, setSimulationFromAddress: simState.setSimulationFromAddress,
    simulationResult: simState.simulationResult, setSimulationResult: simState.setSimulationResult,
    simulationError: simState.simulationError, isSimulating: simState.isSimulating,
    collapsedStackFrames: simState.collapsedStackFrames, setCollapsedStackFrames: simState.setCollapsedStackFrames,
    activeSimulationFrame: simState.activeSimulationFrame, setActiveSimulationFrame: simState.setActiveSimulationFrame,
    filters: simState.filters, setFilters: simState.setFilters,
    summaryTrace: simState.summaryTrace, usePendingBlock: simState.usePendingBlock, setUsePendingBlock: simState.setUsePendingBlock,
    // Function result
    functionResult: functionState.functionResult, setFunctionResult: functionState.setFunctionResult,
    // UI state
    isDiamondPopupOpen: diamondState.isDiamondPopupOpen, setIsDiamondPopupOpen: diamondState.setIsDiamondPopupOpen,
    showSavedContracts: contractState.showSavedContracts, setShowSavedContracts: contractState.setShowSavedContracts,
    showAbiUpload: contractState.showAbiUpload, setShowAbiUpload: contractState.setShowAbiUpload,
    manualAbi: contractState.manualAbi, setManualAbi: contractState.setManualAbi,
    savedContracts: contractState.savedContracts,
    // Refs
    isRestoringRef, userEditedAddressRef: contractState.userEditedAddressRef,
    // Styles
    cardStyle: CARD_STYLE,
    contractCardStyle: buildContractCardStyle(isSimulationMode),
    sectionTitleStyle: SECTION_TITLE_STYLE,
    gridContainerStyle: GRID_CONTAINER_STYLE,
    headerStyle: HEADER_STYLE,
    subHeaderStyle: SUB_HEADER_STYLE,
    gridStyle: buildGridStyle(isSimulationMode),
    inputStyle: INPUT_STYLE,
    buttonStyle: BUTTON_STYLE,
    selectionCardStyle,
    // Callbacks
    handleFetchABI: contractState.handleFetchABI,
    handleCancelFetch: contractState.handleCancelFetch,
    handleManualABI: contractState.handleManualABI,
    handleManualAddressChange: contractState.handleManualAddressChange,
    handleFunctionSelect: functionState.handleFunctionSelect,
    handleInputChange: functionState.handleInputChange,
    handleFacetSelect: diamondState.handleFacetSelect,
    handleSidebarFunctionSelect: diamondState.handleSidebarFunctionSelect,
    handleValuesChange: functionState.handleValuesChange,
    handleCalldataGenerated: functionState.handleCalldataGenerated,
    generateCallData: functionState.generateCallData,
    updateCallData: functionState.updateCallData,
    runSimulation: simState.runSimulation,
    renderSimulationInsights: simState.renderSimulationInsights,
    renderCallTreeNodes: simState.renderCallTreeNodes,
    resetContractDerivedState: contractState.resetContractDerivedState,
    saveContractToStorage: contractState.saveContractToStorage,
    loadContractFromStorage: contractState.loadContractFromStorage,
    createEthersProvider: walletHelpers.createEthersProvider,
    sanitizeAbiEntries,
    // Notifications
    showSuccess, showError, showWarning, showInfo, showNotification,
    // Wagmi
    address, isConnected,
    walletClient, publicClient, chainId, switchChain,
    accountChain, wagmiConfig,
    // Router
    navigate,
    // Simulation context
    setSimulation, simulationId: contextSimulationId,
    // Computed
    requiresWalletForWrite, walletMissingForWrite, disableSimulationAction,
    // Missing computed/state
    isFetchingContractDetails,
    getWalletChainId: walletHelpers.getWalletChainId,
    allReadFunctions: functionState.allReadFunctions,
    allWriteFunctions: functionState.allWriteFunctions,
    setReadFunctions: functionState.setReadFunctions,
    setWriteFunctions: functionState.setWriteFunctions,
    setFacetLoading: diamondState.setFacetLoading,
    setFacetProgress: diamondState.setFacetProgress,
    setFacetProgressDetails: diamondState.setFacetProgressDetails,
    facetStatusColors: diamondState.facetStatusColors,
    facetStatusLabels: diamondState.facetStatusLabels,
    selectedFunctionAbi: functionState.selectedFunctionObj,
    normalizeSavedContracts: contractState.normalizeSavedContracts,
    simulationIdRef,
  };
}
