/**
 * GridContext - Internal context for SimpleGridUI sub-components.
 *
 * This context exposes the full component state so that JSX sections
 * extracted into separate files can access state without prop drilling.
 *
 * NOTE: This is an internal implementation detail of the simple-grid module.
 * External consumers should use SimpleGridUIContext from src/contexts/ instead.
 */
import { createContext, useContext, type ReactNode } from "react";
import { ethers } from "ethers";
import type { Chain, ContractInfo } from "../../types";
import type { DiamondFacet } from "../../utils/diamondFacetFetcher";
import type { SimulationResult, TransactionRequest } from "../../types/transaction";
import type { SimulationOverrides } from "../SimulationOverridesPanel";
import type { ProxyInfo } from "../../utils/resolver";
import type { ComplexValueMetadata } from "../../utils/complexValueBuilder";
import type { ABIInput } from "../ContractInputComponent";
import type { FacetDetailStatus } from "./types";
import type { SimulationCallNode } from "../../utils/simulationArtifacts";

// DecodedCalldataState: mirrors types.ts DecodedCalldata (kept here for GridContextValue compatibility)
export interface DecodedCalldataState {
  functionName: string;
  signature: string;
  args: string[];
  isLoading: boolean;
}

export interface FunctionResultState {
  data: any;
  formattedResult?: any;
  functionABI?: any;
  error?: string;
  isLoading?: boolean;
}

export interface TokenInfoState {
  symbol?: string;
  name?: string;
  decimals?: number;
  assetAddress?: string;
}

export interface TokenDetectionState {
  type: string;
  confidence: number;
  detectionMethod: string;
  isDiamond: boolean;
  tokenInfo?: { name?: string; symbol?: string; decimals?: number };
  error?: string;
}

export type AbiSourceType =
  | "sourcify"
  | "blockscout"
  | "etherscan"
  | "blockscout-bytecode"
  | "whatsabi"
  | "manual"
  | "restored"
  | null;

export interface GridContextValue {
  // --- Props ---
  contractModeToggle?: ReactNode;
  mode?: "live" | "simulation";
  isSimulationMode: boolean;

  // --- Contract state ---
  contractAddress: string;
  setContractAddress: (v: string) => void;
  selectedNetwork: Chain | null;
  setSelectedNetwork: (v: Chain | null) => void;
  contractName: string;
  setContractName: (v: string) => void;
  contractInfo: ContractInfo | null;
  setContractInfo: (v: ContractInfo | null) => void;
  contractSource: "project" | "address";
  setContractSource: (v: "project" | "address") => void;
  isLoadingABI: boolean;
  setIsLoadingABI: (v: boolean) => void;
  abiError: string | null;
  setAbiError: (v: string | null) => void;
  abiSource: AbiSourceType;
  setAbiSource: (v: AbiSourceType) => void;
  searchProgress: string;
  setSearchProgress: (v: string) => void;
  isLoadingContractInfo: boolean;
  isDetectingTokenType: boolean;
  proxyInfo: ProxyInfo | null;
  implementationAbi: any[] | null;
  implementationName: string | null;
  isLoadingImplementation: boolean;

  // --- Token state ---
  tokenInfo: TokenInfoState | null;
  tokenDetection: TokenDetectionState | null;
  isERC20: boolean;
  isERC721: boolean;
  isERC1155: boolean;
  isERC777: boolean;
  isERC4626: boolean;
  isERC2981: boolean;
  isDiamond: boolean;

  // --- Diamond facet state ---
  selectedFacet: string | null;
  setSelectedFacet: (v: string | null) => void;
  diamondFacets: DiamondFacet[];
  setDiamondFacets: (v: DiamondFacet[]) => void;
  showFacetSidebar: boolean;
  setShowFacetSidebar: (v: boolean) => void;
  facetLoading: boolean;
  facetProgress: number;
  facetProgressDetails: {
    loadedFacets: number;
    totalFacets: number;
    currentFacetAddress: string;
    currentFacetName: string;
    loadedFunctionCount: number;
  };
  showFacetDetails: boolean;
  setShowFacetDetails: (v: boolean) => void;

  // --- Function state ---
  functionMode: "function" | "raw";
  setFunctionMode: (v: "function" | "raw") => void;
  selectedFunctionType: "read" | "write" | null;
  setSelectedFunctionType: (v: "read" | "write" | null) => void;
  selectedFunction: string | null;
  setSelectedFunction: (v: string | null) => void;
  selectedFunctionObj: ethers.utils.FunctionFragment | null;
  readFunctions: ethers.utils.FunctionFragment[];
  writeFunctions: ethers.utils.FunctionFragment[];
  functionSearch: string;
  setFunctionSearch: (v: string) => void;
  showFunctionSearch: boolean;
  setShowFunctionSearch: (v: boolean) => void;
  filteredReadFunctions: ethers.utils.FunctionFragment[];
  filteredWriteFunctions: ethers.utils.FunctionFragment[];
  searchFilteredFunctions: Array<{ fn: ethers.utils.FunctionFragment; facetName?: string }>;
  totalFacetReads: number;
  totalFacetWrites: number;
  isFacetDataPending: boolean;
  resolvedContractName: string;

  // --- Function inputs / calldata ---
  functionInputs: { [key: string]: string };
  generatedCallData: string;
  setGeneratedCallData: (v: string) => void;
  decodedCalldata: DecodedCalldataState | null;
  setDecodedCalldata: (v: DecodedCalldataState | null) => void;
  enhancedParameters: { [key: string]: any };
  useEnhancedUI: boolean;
  setUseEnhancedUI: (v: boolean) => void;
  memoizedInputs: ABIInput[];
  contractInputsHook: any; // useContractInputs return value

  // --- Simulation state ---
  simulationOverrides: SimulationOverrides;
  setSimulationOverrides: (v: SimulationOverrides) => void;
  simulationFromAddress: string;
  setSimulationFromAddress: (v: string) => void;
  simulationResult: SimulationResult | null;
  setSimulationResult: (v: SimulationResult | null) => void;
  simulationError: string | null;
  isSimulating: boolean;
  collapsedStackFrames: Set<string>;
  setCollapsedStackFrames: (v: Set<string>) => void;
  activeSimulationFrame: string | null;
  setActiveSimulationFrame: (v: string | null) => void;
  filters: { showOnlyErrors: boolean };
  setFilters: (v: { showOnlyErrors: boolean }) => void;
  summaryTrace: SimulationCallNode | null;
  usePendingBlock: boolean;
  setUsePendingBlock: (v: boolean) => void;

  // --- Function result ---
  functionResult: FunctionResultState | null;
  setFunctionResult: (v: FunctionResultState | null) => void;

  // --- UI state ---
  isDiamondPopupOpen: boolean;
  setIsDiamondPopupOpen: (v: boolean) => void;
  showSavedContracts: boolean;
  setShowSavedContracts: (v: boolean) => void;
  showAbiUpload: boolean;
  setShowAbiUpload: (v: boolean) => void;
  manualAbi: string;
  setManualAbi: (v: string) => void;
  savedContracts: any[];

  // --- Refs ---
  isRestoringRef: React.MutableRefObject<boolean>;
  userEditedAddressRef: React.MutableRefObject<boolean>;

  // --- Styles ---
  cardStyle: React.CSSProperties;
  contractCardStyle: React.CSSProperties;
  sectionTitleStyle: React.CSSProperties;
  gridContainerStyle: React.CSSProperties;
  headerStyle: React.CSSProperties;
  subHeaderStyle: React.CSSProperties;
  gridStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
  buttonStyle: React.CSSProperties;
  selectionCardStyle: (isSelected: boolean) => React.CSSProperties;

  // --- Callbacks ---
  handleFetchABI: () => Promise<void>;
  handleCancelFetch: () => void;
  handleManualABI: () => Promise<void>;
  handleManualAddressChange: (v: string) => void;
  handleFunctionSelect: (value: string, initialInputValues?: Record<string, string>) => void;
  handleInputChange: (inputKey: string, value: string) => void;
  handleFacetSelect: (facetAddress: string) => void;
  handleSidebarFunctionSelect: (funcSig: string, facetAddr?: string) => void;
  handleValuesChange: (values: Record<string, any>, allValid: boolean) => void;
  handleCalldataGenerated: (calldata: string) => void;
  generateCallData: (functionSignature: string, inputs?: string[]) => string;
  updateCallData: () => void;
  runSimulation: (transaction: TransactionRequest, options?: { description?: string; fromOverride?: string }) => Promise<SimulationResult | null>;
  renderSimulationInsights: (options?: { emptyMessage?: string }) => ReactNode;
  renderCallTreeNodes: (nodes: SimulationCallNode[], depth?: number) => ReactNode;
  resetContractDerivedState: () => void;
  saveContractToStorage: (info: any) => void;
  loadContractFromStorage: (entry: any) => Promise<void>;
  createEthersProvider: (network: any) => Promise<ethers.providers.Provider>;
  sanitizeAbiEntries: (abiItems: any[]) => any[];

  // --- Notifications ---
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
  showWarning: (title: string, message: string) => void;
  showInfo: (title: string, message: string) => void;
  showNotification: (notification: any) => void;

  // --- Wagmi ---
  address: string | undefined;
  isConnected: boolean;
  walletClient: any;
  publicClient: any;
  chainId: number | undefined;
  switchChain: any;
  accountChain: any;

  // --- Router ---
  navigate: (path: string) => void;

  // --- Simulation context ---
  setSimulation: (v: any) => void;
  simulationId: string | null;

  // --- Computed ---
  requiresWalletForWrite: boolean;
  walletMissingForWrite: boolean;
  disableSimulationAction: boolean;

  // --- Extended facet maps ---
  facetSelectorToName: Map<string, string>;

  // --- Missing computed/state used in JSX ---
  isFetchingContractDetails: boolean;
  getWalletChainId: () => number | undefined;
  allReadFunctions: ethers.utils.FunctionFragment[];
  allWriteFunctions: ethers.utils.FunctionFragment[];
  setReadFunctions: React.Dispatch<React.SetStateAction<ethers.utils.FunctionFragment[]>>;
  setWriteFunctions: React.Dispatch<React.SetStateAction<ethers.utils.FunctionFragment[]>>;
  setFacetLoading: (v: boolean) => void;
  setFacetProgress: (v: number) => void;
  setFacetProgressDetails: React.Dispatch<React.SetStateAction<{
    loadedFacets: number;
    totalFacets: number;
    currentFacetAddress: string;
    currentFacetName: string;
    loadedFunctionCount: number;
  }>>;
  facetStatusColors: Record<string, string>;
  facetStatusLabels: Record<string, string>;
  selectedFunctionAbi: any;
  normalizeSavedContracts: (contracts: any[]) => any[];
  simulationIdRef: React.MutableRefObject<string | null>;
}

const GridContext = createContext<GridContextValue | null>(null);

export function useGridContext(): GridContextValue {
  const ctx = useContext(GridContext);
  if (!ctx) {
    throw new Error("useGridContext must be used within a GridProvider");
  }
  return ctx;
}

export const GridProvider = GridContext.Provider;
