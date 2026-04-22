/**
 * useContractState – manages contract address, network, ABI fetching,
 * saved-contracts storage, and all closely related state. */
import { useState, useCallback, useRef } from "react";
import { ethers } from "ethers";
import type { Chain, ContractInfo } from "../../../types";
import { SUPPORTED_CHAINS, getChainById } from "../../../utils/chains";
import { fetchContractInfoComprehensive } from "../../../utils/comprehensiveContractFetcher";
import { resolveContractContext } from "../../../utils/resolver";
import type { ProxyInfo } from "../../../utils/resolver";
import { detectTokenType } from "../../../utils/universalTokenDetector";
import type { DiamondFacet } from "../../../utils/diamondFacetFetcher";
import {
  detectAndFetchTokenInfo as detectAndFetchTokenInfoExternal,
  type TokenDetectionDeps,
} from "../tokenDetection";
import type { AbiSourceType } from "../GridContext";
import type { InitialContractData, SearchProgress } from "../types";

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

type ContractContextLike = Omit<Partial<InitialContractData>, "abi"> & {
  abi?: unknown[] | null;
};

const SAVED_CONTRACTS_KEY = "web3-toolkit-saved-contracts";

export interface UseContractStateDeps {
  initialContractData?: InitialContractData;
  contractContext?: ContractContextLike | null;
  /** Setters & state from token hook */
  tokenSetters: {
    setTokenInfo: (v: { symbol?: string; name?: string; decimals?: number; assetAddress?: string } | null) => void;
    setTokenDetection: (v: {
      type: string;
      confidence: number;
      detectionMethod: string;
      isDiamond: boolean;
      tokenInfo?: { name?: string; symbol?: string; decimals?: number };
      error?: string;
    } | null) => void;
    setIsERC20: (v: boolean) => void;
    setIsERC721: (v: boolean) => void;
    setIsERC1155: (v: boolean) => void;
    setIsERC777: (v: boolean) => void;
    setIsERC4626: (v: boolean) => void;
    setIsERC2981: (v: boolean) => void;
    setIsDiamond: (v: boolean) => void;
    setIsDetectingTokenType: (v: boolean) => void;
    setIsLoadingContractInfo: (v: boolean) => void;
    isERC20: boolean;
    isERC721: boolean;
    isERC1155: boolean;
    isERC777: boolean;
    isERC4626: boolean;
    isERC2981: boolean;
    isDiamond: boolean;
    tokenInfo: { symbol?: string; name?: string; decimals?: number; assetAddress?: string } | null;
  };
  /** Diamond setters */
  diamondSetters: {
    setSelectedFacet: (v: string | null) => void;
    setDiamondFacets: (v: DiamondFacet[]) => void;
    isDiamond: boolean;
  };
  /** Function state setters needed during ABI load */
  functionSetters: {
    setReadFunctions: React.Dispatch<React.SetStateAction<ethers.utils.FunctionFragment[]>>;
    setWriteFunctions: React.Dispatch<React.SetStateAction<ethers.utils.FunctionFragment[]>>;
    setSelectedFunction: (v: string | null) => void;
    setSelectedFunctionObj: (v: ethers.utils.FunctionFragment | null) => void;
    setFunctionInputs: (v: Record<string, string>) => void;
    setGeneratedCallData: (v: string) => void;
    setFunctionResult: (v: unknown) => void;
    clearPendingRestore?: () => void;
  };
  createEthersProvider: (network: Chain) => Promise<ethers.providers.Provider>;
  sanitizeAbiEntries: (abiItems: unknown[]) => ethers.utils.Fragment[];
}

export function useContractState(deps: UseContractStateDeps) {
  const {
    initialContractData,
    contractContext,
    tokenSetters,
    diamondSetters,
    functionSetters,
    createEthersProvider,
    sanitizeAbiEntries,
  } = deps;

  // ---------- initial data helper ----------
  const getInitialData = () => {
    if (initialContractData) {
      return {
        address: initialContractData.address,
        network: SUPPORTED_CHAINS.find(c => c.id === initialContractData.networkId) || SUPPORTED_CHAINS[0],
        name: initialContractData.name || "",
      };
    }
    if (contractContext?.address) {
      return {
        address: contractContext.address,
        network: SUPPORTED_CHAINS.find(c => c.id === contractContext.networkId) || SUPPORTED_CHAINS[0],
        name: contractContext.name || "",
      };
    }
    return { address: "", network: SUPPORTED_CHAINS[0], name: "" };
  };

  const initialData = getInitialData();

  // ---------- state ----------
  const [contractSource, setContractSource] = useState<"project" | "address">(() => {
    if (initialContractData?.address || contractContext?.address) return "address";
    return "project";
  });
  const [contractAddress, setContractAddress] = useState(initialData.address);
  const [selectedNetwork, setSelectedNetwork] = useState<Chain | null>(initialData.network);
  const [contractName, setContractName] = useState<string>(initialData.name);
  const [isLoadingABI, setIsLoadingABI] = useState(false);
  const [abiError, setAbiError] = useState<string | null>(null);
  const [abiSource, setAbiSource] = useState<AbiSourceType>(null);
  const [searchProgress, setSearchProgress] = useState<SearchProgress | null>(null);
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  const [showSavedContracts, setShowSavedContracts] = useState(false);
  const [showAbiUpload, setShowAbiUpload] = useState(false);
  const [manualAbi, setManualAbi] = useState("");
  const [proxyInfo, setProxyInfo] = useState<ProxyInfo | null>(null);
  const [implementationAbi, setImplementationAbi] = useState<unknown[] | null>(null);
  const [implementationName, setImplementationName] = useState<string | null>(null);
  const [isLoadingImplementation, setIsLoadingImplementation] = useState(false);

  const fetchRequestRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  const restoredAddressRef = useRef<string | null>(null);
  const userEditedAddressRef = useRef(false);

  // ---------- handlers ----------

  const resetContractDerivedState = useCallback(() => {
    tokenSetters.setTokenInfo(null);
    tokenSetters.setTokenDetection(null);
    tokenSetters.setIsERC20(false);
    tokenSetters.setIsERC721(false);
    tokenSetters.setIsERC1155(false);
    tokenSetters.setIsERC777(false);
    tokenSetters.setIsERC4626(false);
    tokenSetters.setIsERC2981(false);
    tokenSetters.setIsDiamond(false);
    setProxyInfo(null);
    setImplementationAbi(null);
    setImplementationName(null);
    setIsLoadingImplementation(false);
    functionSetters.setReadFunctions([]);
    functionSetters.setWriteFunctions([]);
    functionSetters.clearPendingRestore?.();
    setContractInfo(null);
    setAbiSource(null);
    setAbiError(null);
  }, [tokenSetters, functionSetters]);

  const handleManualAddressChange = (value: string) => {
    userEditedAddressRef.current = true;
    setContractAddress(value);
    resetContractDerivedState();
    restoredAddressRef.current = null;
  };

  // ---------- token info bridge ----------
  const detectAndFetchTokenInfo = async (
    abi: ethers.utils.Fragment[],
    preserveContractName: boolean = false,
    functionsParam: string[] = [],
    eventsParam: string[] = []
  ) => {
    const tdeps: TokenDetectionDeps = {
      abiSource,
      contractAddress,
      selectedNetwork,
      contractName,
      createEthersProvider,
      state: {
        isERC20: tokenSetters.isERC20,
        isERC721: tokenSetters.isERC721,
        isERC1155: tokenSetters.isERC1155,
        isERC777: tokenSetters.isERC777,
        isERC4626: tokenSetters.isERC4626,
        isERC2981: tokenSetters.isERC2981,
        isDiamond: tokenSetters.isDiamond,
        tokenInfo: tokenSetters.tokenInfo,
      },
      setters: {
        setIsLoadingContractInfo: tokenSetters.setIsLoadingContractInfo,
        setContractName,
        setTokenInfo: tokenSetters.setTokenInfo,
        setTokenDetection: tokenSetters.setTokenDetection,
        setIsERC20: tokenSetters.setIsERC20,
        setIsERC721: tokenSetters.setIsERC721,
        setIsERC1155: tokenSetters.setIsERC1155,
        setIsERC777: tokenSetters.setIsERC777,
        setIsERC4626: tokenSetters.setIsERC4626,
        setIsERC2981: tokenSetters.setIsERC2981,
        setIsDiamond: tokenSetters.setIsDiamond,
      },
    };
    return detectAndFetchTokenInfoExternal(tdeps, abi, preserveContractName, functionsParam, eventsParam);
  };

  const getFunctionNames = (abi: ethers.utils.Fragment[]): string[] =>
    abi
      .filter((item): item is ethers.utils.FunctionFragment => item.type === "function")
      .map((item) => item.name);

  const getEventSignatures = (abi: ethers.utils.Fragment[]): string[] =>
    abi
      .filter((item): item is ethers.utils.EventFragment => item.type === "event")
      .map((event) => {
        const inputs = event.inputs
          .map((input) =>
            input.type === "tuple"
              ? `(${input.components?.map((comp: ethers.utils.ParamType) => comp.type).join(",")})`
              : input.type
          )
          .join(",");
        return `${event.name}(${inputs})`;
      });

  // ---------- categorize ABI ----------
  const categorizeABIFunctions = (
    abi: ethers.utils.Fragment[],
    skipTokenInfoFetch: boolean = false
  ) => {
    const reads: ethers.utils.FunctionFragment[] = [];
    const writes: ethers.utils.FunctionFragment[] = [];
    abi.forEach((item) => {
      if (item.type === "function") {
        const funcFragment = item as ethers.utils.FunctionFragment;
        if (funcFragment.stateMutability === "view" || funcFragment.stateMutability === "pure") {
          reads.push(funcFragment);
        } else {
          writes.push(funcFragment);
        }
      }
    });
    functionSetters.setReadFunctions(reads);
    functionSetters.setWriteFunctions(writes);

    if (!skipTokenInfoFetch) {
      const functionNames = getFunctionNames(abi);
      const eventSignatures = getEventSignatures(abi);
      detectAndFetchTokenInfo(abi, false, functionNames, eventSignatures);
    }
  };

  // ---------- handleFetchABI (comprehensive, resolver-backed) ----------
  const handleFetchABI = async () => {
    if (!selectedNetwork || !contractAddress) {
      setAbiError("Please enter a contract address and select a network");
      return;
    }
    if (!contractAddress.startsWith("0x") || contractAddress.length !== 42) {
      setAbiError("Invalid contract address format");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoadingABI(true);
    setAbiError(null);
    setAbiSource(null);
    setSearchProgress(null);
    setContractInfo(null);
    functionSetters.setReadFunctions([]);
    functionSetters.setWriteFunctions([]);
    diamondSetters.setSelectedFacet(null);
    diamondSetters.setDiamondFacets([]);
    tokenSetters.setIsDiamond(false);
    functionSetters.setSelectedFunction(null);
    functionSetters.setSelectedFunctionObj(null);
    functionSetters.setFunctionInputs({});
    functionSetters.setGeneratedCallData("0x");
    setContractName("");
    tokenSetters.setTokenInfo(null);
    tokenSetters.setTokenDetection(null);
    tokenSetters.setIsDetectingTokenType(true);
    tokenSetters.setIsERC20(false);
    tokenSetters.setIsERC721(false);
    tokenSetters.setIsERC1155(false);
    tokenSetters.setIsERC777(false);
    tokenSetters.setIsERC4626(false);
    tokenSetters.setIsERC2981(false);
    functionSetters.setFunctionResult(null);

    const requestId = Date.now();
    fetchRequestRef.current = requestId;
    const isStale = () => fetchRequestRef.current !== requestId || controller.signal.aborted;

    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 50)));

    try {
      const chainConfig = getChainById(selectedNetwork?.id || 0) || (selectedNetwork as Chain);
      const result = await fetchContractInfoComprehensive(
        contractAddress,
        chainConfig,
        (progress) => { if (!isStale()) setSearchProgress(progress); }
      );

      if (isStale()) return;

      if (result.success && result.abi) {
        try {
          const parsedABI = sanitizeAbiEntries(JSON.parse(result.abi));
          const contractInfoObj: ContractInfo = {
            address: result.address,
            chain: result.chain,
            abi: result.abi,
            verified: !!result.verified,
            name: result.contractName || undefined,
          };
          if (isStale()) return;
          setContractInfo(contractInfoObj);
          setAbiError(null);
          categorizeABIFunctions(parsedABI, true);

          const functionNames = getFunctionNames(parsedABI);
          const eventSignatures = getEventSignatures(parsedABI);
          await detectAndFetchTokenInfo(parsedABI, true, functionNames, eventSignatures);
          if (isStale()) return;
          if (result.contractName) setContractName(result.contractName);
          if (result.tokenInfo) tokenSetters.setTokenInfo(result.tokenInfo);
          if (result.source) setAbiSource(result.source as AbiSourceType);

          // Proxy detection (non-blocking)
          resolveContractContext(contractAddress, selectedNetwork, { abi: true, proxy: true, proxyTimeout: 10000 })
            .then(async (ctx) => {
              if (ctx.proxyInfo?.isProxy) {
                setProxyInfo(ctx.proxyInfo);
                if (ctx.implementationAbi && ctx.implementationAddress && !diamondSetters.isDiamond) {
                  setIsLoadingImplementation(true);
                  try {
                    setImplementationAbi(ctx.implementationAbi);
                    setImplementationName(ctx.name || null);
                    functionSetters.setReadFunctions((prevRead) => {
                      const implSigs = new Set(ctx.functions.read.map(f => f.name));
                      const uniqueProxyFuncs = prevRead.filter(f => !implSigs.has(f.name));
                      const implFragments = ctx.functions.read.map((f) =>
                        ethers.utils.FunctionFragment.from({
                          type: "function",
                          name: f.name,
                          inputs: f.inputs,
                          outputs: f.outputs,
                          stateMutability: f.stateMutability,
                        })
                      );
                      return [...implFragments, ...uniqueProxyFuncs];
                    });
                    functionSetters.setWriteFunctions((prevWrite) => {
                      const implSigs = new Set(ctx.functions.write.map(f => f.name));
                      const uniqueProxyFuncs = prevWrite.filter(f => !implSigs.has(f.name));
                      const implFragments = ctx.functions.write.map((f) =>
                        ethers.utils.FunctionFragment.from({
                          type: "function",
                          name: f.name,
                          inputs: f.inputs,
                          outputs: f.outputs,
                          stateMutability: f.stateMutability,
                        })
                      );
                      return [...implFragments, ...uniqueProxyFuncs];
                    });
                  } finally {
                    setIsLoadingImplementation(false);
                  }
                }
              }
            })
            .catch(() => { /* Proxy detection failed */ });

          // Universal token detection
          try {
            const provider = await createEthersProvider(selectedNetwork);
            const det = await detectTokenType(provider, contractAddress);
            if (isStale()) return;
            tokenSetters.setTokenDetection({
              type: det.type,
              confidence: det.type === "unknown" ? 0 : 0.95,
              detectionMethod: det.method,
              isDiamond: det.isDiamond,
              tokenInfo: { name: det.name, symbol: det.symbol, decimals: det.decimals },
            });
            tokenSetters.setIsERC20(det.type === "ERC20");
            tokenSetters.setIsERC721(det.type === "ERC721");
            tokenSetters.setIsERC1155(det.type === "ERC1155");
            tokenSetters.setIsDiamond(det.isDiamond);
          } catch {
            // Universal detector failed
          }
        } catch (parseError) {
          setAbiError("Failed to parse contract ABI");
        }
      } else {
        // No verified ABI — still run universal detection
        try {
          if (result?.tokenInfo?.name) setContractName(result.tokenInfo.name);
          else setContractName("Unknown Contract");
          if (result?.tokenInfo) tokenSetters.setTokenInfo({ name: result.tokenInfo.name, symbol: result.tokenInfo.symbol, decimals: result.tokenInfo.decimals });

          const provider = await createEthersProvider(selectedNetwork);
          const det = await detectTokenType(provider, contractAddress);
          if (isStale()) return;
          tokenSetters.setTokenDetection({ type: det.type, confidence: det.type === "unknown" ? 0 : 0.95, detectionMethod: det.method, isDiamond: det.isDiamond, tokenInfo: { name: det.name, symbol: det.symbol, decimals: det.decimals } });
          tokenSetters.setIsERC20(det.type === "ERC20");
          tokenSetters.setIsERC721(det.type === "ERC721");
          tokenSetters.setIsERC1155(det.type === "ERC1155");
          tokenSetters.setIsDiamond(det.isDiamond);
        } catch {
          // Universal detector failed
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      if (fetchRequestRef.current !== requestId) return;
      setAbiError("Network error occurred while fetching contract information");
    } finally {
      if (fetchRequestRef.current === requestId && !controller.signal.aborted) {
        setIsLoadingABI(false);
        tokenSetters.setIsDetectingTokenType(false);
      }
    }
  };

  const handleCancelFetch = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoadingABI(false);
    setAbiError(null);
    setSearchProgress(null);
    tokenSetters.setIsDetectingTokenType(false);
  }, [tokenSetters]);

  // ---------- handleManualABI ----------
  const handleManualABI = async () => {
    if (!manualAbi.trim() || !contractAddress || !selectedNetwork) {
      setAbiError("Please provide a valid ABI JSON and contract address");
      return;
    }
    try {
      const parsedABI = sanitizeAbiEntries(JSON.parse(manualAbi.trim()));
      const contractInfoObj: ContractInfo = { address: contractAddress, chain: selectedNetwork, abi: manualAbi.trim(), verified: false };
      setContractInfo(contractInfoObj);
      setAbiError(null);
      setShowAbiUpload(false);
      categorizeABIFunctions(parsedABI);
      setAbiSource("manual");

      const functionNames = getFunctionNames(parsedABI);
      const eventSignatures = getEventSignatures(parsedABI);
      await detectAndFetchTokenInfo(parsedABI, false, functionNames, eventSignatures);
    } catch (parseError) {
      setAbiError("Invalid ABI JSON format. Please check your ABI and try again.");
    }
  };

  // ---------- saved contracts ----------
  const normalizeSavedContracts = (contracts: SavedContractEntry[]): SavedContractEntry[] => {
    const sorted = [...contracts].sort((a, b) => {
      const aTime = a.savedAt ? new Date(a.savedAt).getTime() : 0;
      const bTime = b.savedAt ? new Date(b.savedAt).getTime() : 0;
      return bTime - aTime;
    });
    const deduped: SavedContractEntry[] = [];
    const seen = new Set<string>();
    for (const entry of sorted) {
      if (!entry?.address) continue;
      const chainId = entry.chain?.id ?? 0;
      const key = `${entry.address.toLowerCase()}-${chainId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(entry);
      if (deduped.length >= 50) break;
    }
    return deduped;
  };

  const loadSavedContracts = (): SavedContractEntry[] => {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVED_CONTRACTS_KEY) || "[]");
      const normalized = normalizeSavedContracts(Array.isArray(raw) ? raw : []);
      localStorage.setItem(SAVED_CONTRACTS_KEY, JSON.stringify(normalized));
      return normalized;
    } catch {
      return [];
    }
  };

  const saveContractToStorage = useCallback(
    (info: ContractInfo) => {
      try {
        const rawExisting = JSON.parse(localStorage.getItem(SAVED_CONTRACTS_KEY) || "[]");
        const existing = Array.isArray(rawExisting) ? (rawExisting as SavedContractEntry[]) : [];
        const contractKey = `${info.address.toLowerCase()}-${info.chain.id}`;
        const updated = existing.filter((c) => `${c.address.toLowerCase()}-${c.chain.id}` !== contractKey);
        const nameToSave = contractName && !contractName.startsWith("Smart Contract") && !contractName.startsWith("Unknown") && !contractName.startsWith("ERC")
          ? contractName
          : info.name || contractName;
        updated.unshift({
          ...info,
          name: nameToSave,
          abiSource: abiSource || undefined,
          tokenInfo: tokenSetters.tokenInfo,
          savedAt: new Date().toISOString()
        });
        const trimmed = updated.slice(0, 50);
        localStorage.setItem(SAVED_CONTRACTS_KEY, JSON.stringify(trimmed));
      } catch {
        // Failed to save contract
      }
    },
    [contractName, abiSource, tokenSetters.tokenInfo]
  );

  const loadContractFromStorage = async (savedContract: SavedContractEntry) => {
    // Reset ALL derived state (token flags, proxy info, functions, etc.)
    resetContractDerivedState();
    setContractName("");
    functionSetters.setGeneratedCallData("0x");
    functionSetters.setSelectedFunction(null);
    functionSetters.setSelectedFunctionObj(null);
    functionSetters.setFunctionInputs({});
    setContractAddress(savedContract.address);
    setSelectedNetwork(savedContract.chain);
    if (savedContract.name) setContractName(savedContract.name);
  };

  const [savedContracts] = useState<SavedContractEntry[]>(loadSavedContracts());

  return {
    // state
    contractSource, setContractSource,
    contractAddress, setContractAddress,
    selectedNetwork, setSelectedNetwork,
    contractName, setContractName,
    isLoadingABI, setIsLoadingABI,
    abiError, setAbiError,
    abiSource, setAbiSource,
    searchProgress, setSearchProgress,
    contractInfo, setContractInfo,
    showSavedContracts, setShowSavedContracts,
    showAbiUpload, setShowAbiUpload,
    manualAbi, setManualAbi,
    proxyInfo, setProxyInfo,
    implementationAbi, setImplementationAbi,
    implementationName, setImplementationName,
    isLoadingImplementation, setIsLoadingImplementation,
    savedContracts,
    // refs
    fetchRequestRef,
    restoredAddressRef,
    userEditedAddressRef,
    // handlers
    resetContractDerivedState,
    getInitialData,
    handleManualAddressChange,
    handleFetchABI,
    handleCancelFetch,
    handleManualABI,
    saveContractToStorage,
    normalizeSavedContracts,
    loadSavedContracts,
    loadContractFromStorage,
    categorizeABIFunctions,
    detectAndFetchTokenInfo,
  };
}
