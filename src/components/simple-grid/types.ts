/**
 * Types and interfaces for SimpleGridUI sub-components.
 * Extracted from SimpleGridUI.tsx during structural refactor.
 */
import type { ReactNode } from "react";
import type { ethers } from "ethers";
import type { Chain, ContractInfo } from "../../types";
import type { DiamondFacet } from "../../utils/diamondFacetFetcher";
import type { SimulationResult, TransactionRequest } from "../../types/transaction";
import type { SimulationOverrides } from "../SimulationOverridesPanel";
import type { ProxyInfo } from "../../utils/resolver";
import type { ABIInput } from "../ContractInputComponent";

export type SavedContractEntry = ContractInfo & {
  savedAt?: string;
  abiSource?: string;
  tokenInfo?: {
    type?: string;
    symbol?: string;
    name?: string;
    decimals?: number;
    confidence?: number;
  } | null;
};

export type FacetDetailStatus = "pending" | "fetching" | "success" | "error";

export interface FacetDetail {
  index: number;
  address: string;
  status: FacetDetailStatus;
}

export interface FacetProgressState {
  current: number;
  total: number;
  currentFacet: string;
  status: "fetching" | "success" | "error";
  index: number;
}

export interface SearchProgress {
  source: string;
  status: "searching" | "found" | "not_found" | "error";
  message?: string;
}

export interface SimpleGridUIProps {
  contractModeToggle?: ReactNode;
  mode?: "live" | "simulation";
  initialContractData?: InitialContractData;
}

export interface InitialContractData {
  address: string;
  name?: string;
  abi: any[];
  networkId: number;
  networkName?: string;
  selectedFunction?: string;
  selectedFunctionType?: "read" | "write";
  functionInputs?: Record<string, string>;
  calldata?: string;
  fromAddress?: string;
  ethValue?: string;
  blockOverride?: string;
  debugEnabled?: boolean;
  tokenType?: "ERC20" | "ERC721" | "ERC1155" | "ERC777" | "ERC4626" | null;
  tokenSymbol?: string;
  tokenDecimals?: number;
  proxyType?: string;
  implementationAddress?: string;
  implementations?: string[];
  beaconAddress?: string;
  adminAddress?: string;
  diamondFacets?: Array<{
    address: string;
    name?: string;
    selectors?: string[];
    abi?: any[];
    source?: string;
    isVerified?: boolean;
    functions?: { read: unknown[]; write: unknown[] };
  }>;
}

export interface ContractCardProps {
  // Contract state
  contractAddress: string;
  contractName: string;
  contractInfo: ContractInfo | null;
  selectedNetwork: Chain | null;
  isLoadingABI: boolean;
  abiSource: string | null;
  abiError: string | null;
  searchProgress: SearchProgress | null;
  isFetchingContractDetails: boolean;
  isSimulationMode: boolean;
  isDiamond: boolean;
  proxyInfo: ProxyInfo | null;
  implementationName: string | null;
  isLoadingImplementation: boolean;
  tokenDetection: {
    type: string;
    confidence: number;
    detectionMethod: string;
    isDiamond: boolean;
    tokenInfo?: { name?: string; symbol?: string; decimals?: number };
    error?: string;
  } | null;
  tokenInfo: {
    symbol?: string;
    name?: string;
    decimals?: number;
    assetAddress?: string;
  } | null;

  // Token flags
  isERC20: boolean;
  isERC721: boolean;
  isERC1155: boolean;
  isERC777: boolean;
  isERC4626: boolean;
  isERC2981: boolean;

  // Handlers
  onAddressChange: (value: string) => void;
  onNetworkChange: (network: Chain | null) => void;
  onDiamondPopupOpen: () => void;

  // Resolve helpers
  resolvedContractName: string;
  contractModeToggle?: ReactNode;
}

export interface FunctionPanelProps {
  // Mode and state
  functionMode: "function" | "raw";
  setFunctionMode: (mode: "function" | "raw") => void;
  selectedFunctionType: "read" | "write" | null;
  setSelectedFunctionType: (type: "read" | "write" | null) => void;
  selectedFunction: string | null;
  selectedFunctionObj: ethers.utils.FunctionFragment | null;

  // Functions lists
  filteredReadFunctions: ethers.utils.FunctionFragment[];
  filteredWriteFunctions: ethers.utils.FunctionFragment[];
  allReadFunctions: ethers.utils.FunctionFragment[];
  allWriteFunctions: ethers.utils.FunctionFragment[];

  // Search
  functionSearch: string;
  setFunctionSearch: (s: string) => void;
  showFunctionSearch: boolean;
  setShowFunctionSearch: (show: boolean) => void;
  searchFilteredFunctions: Array<ethers.utils.FunctionFragment & { functionType: "read" | "write" }>;

  // Diamond
  isDiamond: boolean;
  diamondFacets: DiamondFacet[];
  showFacetSidebar: boolean;
  setShowFacetSidebar: (show: boolean) => void;
  selectedFacet: string | null;
  setSelectedFacet: (facet: string | null) => void;
  isFacetDataPending: boolean;
  totalFacetReads: number;
  totalFacetWrites: number;

  // Calldata
  generatedCallData: string;

  // Inputs hook
  contractInputsHook: any;
  functionInputs: Record<string, string>;

  // Execution
  handleFunctionSelect: (value: string) => void;
  handleSearchFunctionSelect: (fn: ethers.utils.FunctionFragment & { functionType: "read" | "write" }, index: number) => void;

  // Proxy
  proxyInfo: ProxyInfo | null;
  implementationAbi: any[] | null;

  // Contract
  contractAddress: string;
  contractInfo: ContractInfo | null;
  selectedNetwork: Chain | null;

  // Wallet
  isConnected: boolean;
  walletClient: any;
  address: string | undefined;
  accountChain: { id: number } | undefined;
  chainId: number;
  switchChain: any;
  publicClient: any;

  // Simulation
  isSimulationMode: boolean;
  isSimulating: boolean;
  simulationFromAddress: string;
  simulationOverrides: SimulationOverrides;
  simulationError: string | null;
  functionResult: {
    data: any;
    formattedResult?: any;
    functionABI?: any;
    error?: string;
    isLoading?: boolean;
  } | null;
  setFunctionResult: (result: any) => void;
  setGeneratedCallData: (data: string) => void;
  walletMissingForWrite: boolean;
  disableSimulationAction: boolean;

  // Helper functions
  runSimulation: (tx: TransactionRequest, options?: { description?: string; fromOverride?: string }) => Promise<SimulationResult | null>;
  createEthersProvider: (network: any) => Promise<ethers.providers.JsonRpcProvider>;
  sanitizeAbiEntries: (items: any[]) => any[];
  safeBigNumberToString: (obj: any) => any;
  getWalletChainId: (client?: any) => Promise<number | undefined>;
  renderSimulationInsights: (options?: { emptyMessage?: string }) => ReactNode;

  // Notifications
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string, timeout?: number) => void;
  showWarning: (title: string, message: string) => void;
  showInfo: (title: string, message: string) => void;
  showNotification: (opts: any) => void;
}

export interface RawCalldataPanelProps {
  generatedCallData: string;
  setGeneratedCallData: (data: string) => void;
  decodedCalldata: {
    functionName: string;
    signature: string;
    args: string[];
    isLoading: boolean;
  } | null;
  contractAddress: string;
  selectedNetwork: Chain | null;

  // Simulation
  isSimulationMode: boolean;
  isSimulating: boolean;
  simulationFromAddress: string;
  functionResult: {
    data: any;
    formattedResult?: any;
    functionABI?: any;
    error?: string;
    isLoading?: boolean;
  } | null;
  setFunctionResult: (result: any) => void;

  // Helpers
  runSimulation: (tx: TransactionRequest, options?: { description?: string; fromOverride?: string }) => Promise<SimulationResult | null>;
  createEthersProvider: (network: any) => Promise<ethers.providers.JsonRpcProvider>;
  safeBigNumberToString: (obj: any) => any;
  renderSimulationInsights: (options?: { emptyMessage?: string }) => ReactNode;

  // Notifications
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string, timeout?: number) => void;
  showWarning: (title: string, message: string) => void;
}

export interface DiamondProgressProps {
  isDiamond: boolean;
  facetLoading: boolean;
  facetProgress: FacetProgressState;
  facetProgressDetails: FacetDetail[];
  showFacetDetails: boolean;
  setShowFacetDetails: (show: boolean) => void;
  selectedNetwork: Chain | null;
  contractAddress: string;

  // Callbacks
  setDiamondFacets: (facets: DiamondFacet[]) => void;
  setShowFacetSidebar: (show: boolean) => void;
  setReadFunctions: (fns: ethers.utils.FunctionFragment[]) => void;
  setWriteFunctions: (fns: ethers.utils.FunctionFragment[]) => void;
  setFacetLoading: (loading: boolean) => void;
  setFacetProgress: (progress: FacetProgressState) => void;
  setFacetProgressDetails: React.Dispatch<React.SetStateAction<FacetDetail[]>>;
  setSearchProgress: (progress: SearchProgress | null) => void;
}

export const FACET_STATUS_COLORS: Record<FacetDetailStatus, string> = {
  pending: "#6b7280",
  fetching: "#38bdf8",
  success: "#22c55e",
  error: "#ef4444",
};

export const FACET_STATUS_LABELS: Record<FacetDetailStatus, string> = {
  pending: "Pending",
  fetching: "Loading",
  success: "Ready",
  error: "Error",
};
