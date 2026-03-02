import { useState, useEffect, useDeferredValue, useRef, useMemo } from "react";
import { ethers } from "ethers";
import { useLocation } from "react-router-dom";
import {
  lookupFunctionSignatures,
  lookupEventSignatures,
  lookupErrorSignatures,
  searchSignatures,
  cacheSignature,
  getCachedSignatures,
  saveCustomSignature,
  getCustomSignatures,
  clearSignatureCache,
} from "../../utils/signatureDatabase";
import type {
  SignatureResponse,
  SearchResponse,
  SearchProgress,
  CustomSignature,
} from "../../utils/signatureDatabase";
import type {
  TabType,
  ToolSubTab,
  FlattenedSignature,
  CachedSignature,
  ParsedContracts,
} from "./types";
import { isTabType, isToolSubTab } from "./types";
import { areValidSolidityParams, yieldToMain } from "./helpers";

// ------------------------------------------------------------------
// Hook
// ------------------------------------------------------------------

export function useSignatureDatabase(
  initialTab: TabType = "lookup",
  initialToolSubTab: ToolSubTab = "selector",
) {
  const location = useLocation();

  // ---- Tab state ----
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [activeToolSubTab, setActiveToolSubTab] =
    useState<ToolSubTab>(initialToolSubTab);
  const [calculatorSignature, setCalculatorSignature] = useState("");

  // ---- Lookup tab state ----
  const [lookupInput, setLookupInput] = useState("");
  const [lookupType, setLookupType] = useState<"function" | "event" | "error">(
    "function",
  );
  const [lookupResults, setLookupResults] = useState<SignatureResponse | null>(
    null,
  );
  const [isLookingUp, setIsLookingUp] = useState(false);

  // ---- Search tab state ----
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const isSearchStale = searchQuery !== deferredSearchQuery;
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(
    null,
  );
  const [isSearching, setIsSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState<SearchProgress[]>([]);
  const searchAbortRef = useRef<AbortController | null>(null);

  // ---- Custom signatures state ----
  const [customSignature, setCustomSignature] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customProject, setCustomProject] = useState("");
  const [customSignatures, setCustomSignatures] = useState<CustomSignature[]>(
    [],
  );

  // ---- ABI import state ----
  const [abiInput, setAbiInput] = useState("");
  const [contractPath, setContractPath] = useState("");
  const [extractedSignatures, setExtractedSignatures] = useState<{
    functions: string[];
    events: string[];
  }>({ functions: [], events: [] });
  const [isExtracting, setIsExtracting] = useState(false);
  const [showFileModal, setShowFileModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [parsedContracts, setParsedContracts] = useState<ParsedContracts>({});
  const [selectedContracts, setSelectedContracts] = useState<string[]>([]);

  // ---- Cache state ----
  const [cachedFunctions, setCachedFunctions] = useState<any>({});
  const [cachedEvents, setCachedEvents] = useState<any>({});
  const [cachedErrors, setCachedErrors] = useState<any>({});

  // ---- Collapsible states ----
  const [functionsOpen, setFunctionsOpen] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [errorsOpen, setErrorsOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // Memoised / derived values
  // ------------------------------------------------------------------

  const flattenedFunctionResults = useMemo<FlattenedSignature[]>(() => {
    if (!searchResults?.result?.function) return [];
    const items: FlattenedSignature[] = [];
    Object.entries(searchResults.result.function).forEach(
      ([hash, signatures]) => {
        signatures.forEach((sig) => {
          items.push({
            hash,
            name: sig.name,
            filtered: sig.filtered,
            type: "function",
          });
        });
      },
    );
    return items;
  }, [searchResults]);

  const flattenedEventResults = useMemo<FlattenedSignature[]>(() => {
    if (!searchResults?.result?.event) return [];
    const items: FlattenedSignature[] = [];
    Object.entries(searchResults.result.event).forEach(
      ([hash, signatures]) => {
        signatures.forEach((sig) => {
          items.push({
            hash,
            name: sig.name,
            filtered: sig.filtered,
            type: "event",
          });
        });
      },
    );
    return items;
  }, [searchResults]);

  const flattenedCachedFunctions = useMemo<CachedSignature[]>(() => {
    return Object.values(cachedFunctions).map((sig: any) => ({
      hash: sig.hash,
      name: sig.name,
      timestamp: sig.timestamp,
    }));
  }, [cachedFunctions]);

  const flattenedCachedEvents = useMemo<CachedSignature[]>(() => {
    return Object.values(cachedEvents).map((sig: any) => ({
      hash: sig.hash,
      name: sig.name,
      timestamp: sig.timestamp,
    }));
  }, [cachedEvents]);

  const flattenedCachedErrors = useMemo<CachedSignature[]>(() => {
    return Object.values(cachedErrors).map((sig: any) => ({
      hash: sig.hash,
      name: sig.name,
      timestamp: sig.timestamp,
    }));
  }, [cachedErrors]);

  // Dynamically compute selector as the user types
  const calculatorResult = useMemo(() => {
    const sig = calculatorSignature.trim();
    if (!sig || !/^\w+\(.*\)$/.test(sig)) {
      return { selector: "", fullHash: "", error: null };
    }
    const paramsStr = sig.slice(sig.indexOf("(") + 1, -1);
    if (paramsStr.length > 0 && !areValidSolidityParams(paramsStr)) {
      return { selector: "", fullHash: "", error: null };
    }
    try {
      const hash = ethers.utils.id(sig);
      return { selector: hash.slice(0, 10), fullHash: hash, error: null };
    } catch (e: unknown) {
      return {
        selector: "",
        fullHash: "",
        error: e instanceof Error ? e.message : "Failed to calculate selector",
      };
    }
  }, [calculatorSignature]);

  // ------------------------------------------------------------------
  // Side effects
  // ------------------------------------------------------------------

  const loadCachedData = () => {
    setCachedFunctions(getCachedSignatures("function"));
    setCachedEvents(getCachedSignatures("event"));
    setCachedErrors(getCachedSignatures("error"));
    setCustomSignatures(getCustomSignatures());
  };

  useEffect(() => {
    loadCachedData();
  }, []);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setActiveToolSubTab(initialToolSubTab);
  }, [initialToolSubTab]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get("tab");
    const toolParam = params.get("tool");
    const queryParam = params.get("q") ?? params.get("address");

    const requestedTab = isTabType(tabParam)
      ? tabParam
      : isToolSubTab(toolParam)
        ? "tools"
        : null;
    const requestedTool = isToolSubTab(toolParam) ? toolParam : null;

    if (requestedTab) {
      setActiveTab(requestedTab);
    }
    if (requestedTool) {
      setActiveToolSubTab(requestedTool);
    }

    if (!queryParam) return;
    const normalizedQuery = queryParam.trim();
    if (!normalizedQuery) return;

    const targetTab: TabType = requestedTab || "lookup";
    if (targetTab === "lookup") {
      setLookupInput(normalizedQuery);
      return;
    }
    if (targetTab === "search") {
      setSearchQuery(normalizedQuery);
      return;
    }
    if (targetTab === "tools" && requestedTool === "selector") {
      setCalculatorSignature(normalizedQuery);
    }
  }, [location.search]);

  useEffect(() => {
    setError(null);
  }, [activeTab]);

  // Auto-search when deferred query changes (minimum 2 characters)
  useEffect(() => {
    if (deferredSearchQuery.trim().length < 2) {
      return;
    }

    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }

    const abortController = new AbortController();
    searchAbortRef.current = abortController;

    const performSearch = async () => {
      setIsSearching(true);
      setError(null);
      setSearchProgress([]);

      try {
        const results = await searchSignatures(
          deferredSearchQuery,
          true,
          (progress) => {
            if (!abortController.signal.aborted) {
              setSearchProgress((prev) => [...prev, progress]);
            }
          },
        );
        if (!abortController.signal.aborted) {
          setSearchResults(results);
          setSearchProgress([]);
        }
      } catch (err: any) {
        if (!abortController.signal.aborted) {
          setSearchResults(null);
          setError(err.message);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsSearching(false);
        }
      }
    };

    performSearch();

    return () => {
      abortController.abort();
    };
  }, [deferredSearchQuery]);

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------

  const handleLookup = async () => {
    if (!lookupInput.trim()) {
      setError("Please enter a signature hash");
      return;
    }

    setIsLookingUp(true);
    setError(null);
    setLookupResults(null);

    try {
      const hashes = lookupInput
        .split(/[,\s]+/)
        .map((hash) => hash.trim())
        .filter((hash) => hash.length > 0)
        .map((hash) => (hash.startsWith("0x") ? hash : "0x" + hash));

      for (const hash of hashes) {
        if (
          (lookupType === "function" || lookupType === "error") &&
          hash.length !== 10
        ) {
          throw new Error(
            `Invalid ${lookupType} selector: ${hash} (must be 4 bytes / 10 characters with 0x)`,
          );
        }
        if (lookupType === "event" && hash.length !== 66) {
          throw new Error(
            `Invalid event topic: ${hash} (must be 32 bytes / 66 characters with 0x)`,
          );
        }
      }

      let results: SignatureResponse;
      if (lookupType === "function") {
        results = await lookupFunctionSignatures(hashes);
      } else if (lookupType === "error") {
        results = await lookupErrorSignatures(hashes);
      } else {
        results = await lookupEventSignatures(hashes);
      }

      setLookupResults(results);

      const resultsToCache =
        lookupType === "event"
          ? results.result?.event
          : results.result?.function;
      if (resultsToCache) {
        Object.entries(resultsToCache).forEach(([hash, signatures]) => {
          if (signatures && signatures.length > 0) {
            cacheSignature(hash, signatures[0].name, lookupType);
          }
        });
      }

      loadCachedData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError("Please enter a search query");
      return;
    }

    setIsSearching(true);
    setError(null);
    setSearchResults(null);
    setSearchProgress([]);

    try {
      const results = await searchSignatures(searchQuery, true, (progress) => {
        setSearchProgress((prev) => [...prev, progress]);
      });
      setSearchResults(results);
      setSearchProgress([]);
    } catch (err: any) {
      setSearchResults(null);
      setError(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddCustomSignature = () => {
    if (!customSignature.trim()) {
      setError("Please enter a signature");
      return;
    }

    try {
      if (customSignature.includes("(") && customSignature.includes(")")) {
        ethers.utils.id(customSignature);
      } else {
        throw new Error(
          "Invalid signature format. Expected: functionName(type1,type2,...)",
        );
      }

      const newSignature: CustomSignature = {
        signature: customSignature.trim(),
        description: customDescription.trim() || undefined,
        project: customProject.trim() || undefined,
        timestamp: Date.now(),
      };

      saveCustomSignature(newSignature);
      setCustomSignatures(getCustomSignatures());

      setCustomSignature("");
      setCustomDescription("");
      setCustomProject("");
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const extractSignaturesFromABI = async () => {
    if (!abiInput.trim()) {
      setError("Please paste an ABI JSON");
      return;
    }

    setIsExtracting(true);
    setError(null);

    try {
      const abi = JSON.parse(abiInput);
      if (!Array.isArray(abi)) {
        throw new Error("ABI must be an array");
      }

      const functions: string[] = [];
      const events: string[] = [];

      for (let i = 0; i < abi.length; i += 1) {
        const item = abi[i];
        try {
          if (item.type === "function" && item.name) {
            const inputs =
              item.inputs?.map((input: any) => input.type).join(",") || "";
            const signature = `${item.name}(${inputs})`;
            functions.push(signature);
          } else if (item.type === "event" && item.name) {
            const inputs =
              item.inputs?.map((input: any) => input.type).join(",") || "";
            const signature = `${item.name}(${inputs})`;
            events.push(signature);
          }
        } catch (itemError) {
          console.warn("Failed to process ABI item:", item, itemError);
        }
        if ((i + 1) % 200 === 0) {
          await yieldToMain();
        }
      }

      setExtractedSignatures({ functions, events });
      setCustomProject(
        contractPath ? `Contract: ${contractPath}` : "Imported ABI",
      );
    } catch (err: any) {
      setError(`Failed to parse ABI: ${err.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const addExtractedSignatures = (
    signatures: string[],
    type: "function" | "event",
  ) => {
    signatures.forEach((signature) => {
      const newSignature: CustomSignature = {
        signature,
        description: `${type === "function" ? "Function" : "Event"} from imported ABI`,
        project: customProject || "Imported ABI",
        timestamp: Date.now(),
      };
      saveCustomSignature(newSignature);
    });
    setCustomSignatures(getCustomSignatures());
    setError(null);
  };

  const addAllExtractedSignatures = () => {
    addExtractedSignatures(extractedSignatures.functions, "function");
    addExtractedSignatures(extractedSignatures.events, "event");
    setExtractedSignatures({ functions: [], events: [] });
    setAbiInput("");
    setContractPath("");
    setSelectedFiles([]);
    setParsedContracts({});
    setSelectedContracts([]);
  };

  const updateExtractedSignaturesFromSelection = (
    contracts: ParsedContracts,
    selectedContractNames: string[],
  ) => {
    const allFunctions: string[] = [];
    const allEvents: string[] = [];

    selectedContractNames.forEach((contractName) => {
      const contract = contracts[contractName];
      if (contract) {
        allFunctions.push(...contract.functions);
        allEvents.push(...contract.events);
      }
    });

    setExtractedSignatures({
      functions: Array.from(new Set(allFunctions)),
      events: Array.from(new Set(allEvents)),
    });
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const fileArray = Array.from(files);
    setSelectedFiles(fileArray);
    processSelectedFiles(fileArray);
  };

  const processSelectedFiles = async (
    filesToProcess: File[] = selectedFiles,
  ) => {
    if (filesToProcess.length === 0) return;

    setIsExtracting(true);
    setError(null);

    try {
      const contracts: ParsedContracts = {};

      let processedFiles = 0;
      for (const file of filesToProcess) {
        try {
          if (!file.name.toLowerCase().endsWith(".json")) {
            continue;
          }

          const content = await file.text();
          let abi: any;
          let contractName: string;

          try {
            const parsed = JSON.parse(content);
            if (parsed.abi && Array.isArray(parsed.abi)) {
              abi = parsed.abi;
              contractName =
                parsed.contractName || file.name.replace(".json", "");
            } else if (Array.isArray(parsed)) {
              abi = parsed;
              contractName = file.name.replace(".json", "");
            } else {
              continue;
            }
          } catch {
            continue;
          }

          const functions: string[] = [];
          const events: string[] = [];

          for (let i = 0; i < abi.length; i += 1) {
            const item = abi[i];
            try {
              if (item.type === "function" && item.name) {
                const visibility =
                  item.stateMutability || item.visibility || "public";
                const isPublicOrExternal =
                  !visibility ||
                  visibility === "public" ||
                  visibility === "external" ||
                  visibility === "view" ||
                  visibility === "pure" ||
                  visibility === "payable" ||
                  visibility === "nonpayable";

                if (isPublicOrExternal) {
                  const inputs =
                    item.inputs?.map((input: any) => input.type).join(",") ||
                    "";
                  const signature = `${item.name}(${inputs})`;
                  functions.push(signature);
                }
              } else if (item.type === "event" && item.name) {
                const inputs =
                  item.inputs?.map((input: any) => input.type).join(",") || "";
                const signature = `${item.name}(${inputs})`;
                events.push(signature);
              }
            } catch (itemError) {
              console.warn(
                `Failed to process item in ${file.name}:`,
                item,
                itemError,
              );
            }
            if ((i + 1) % 200 === 0) {
              await yieldToMain();
            }
          }

          if (functions.length > 0 || events.length > 0) {
            contracts[contractName] = {
              abi,
              functions: Array.from(new Set(functions)),
              events: Array.from(new Set(events)),
              fileName: file.name,
            };
          }
        } catch (fileError: any) {
          console.error(`Failed to process file ${file.name}:`, fileError);
        }
        processedFiles += 1;
        if (processedFiles % 5 === 0) {
          await yieldToMain();
        }
      }

      setParsedContracts(contracts);
      setSelectedContracts(Object.keys(contracts));
      setContractPath(`${Object.keys(contracts).length} contracts found`);
      updateExtractedSignaturesFromSelection(contracts, Object.keys(contracts));
    } catch (err: any) {
      setError(`Failed to process files: ${err.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleContractSelection = (
    contractName: string,
    isSelected: boolean,
  ) => {
    const newSelection = isSelected
      ? [...selectedContracts, contractName]
      : selectedContracts.filter((name) => name !== contractName);

    setSelectedContracts(newSelection);
    updateExtractedSignaturesFromSelection(parsedContracts, newSelection);
  };

  const selectAllContracts = () => {
    const allContracts = Object.keys(parsedContracts);
    setSelectedContracts(allContracts);
    updateExtractedSignaturesFromSelection(parsedContracts, allContracts);
  };

  const deselectAllContracts = () => {
    setSelectedContracts([]);
    setExtractedSignatures({ functions: [], events: [] });
  };

  const openFileModal = () => {
    setSelectedFiles([]);
    setParsedContracts({});
    setSelectedContracts([]);
    setShowFileModal(true);
  };

  const clearCache = (type?: "function" | "event" | "error" | "custom") => {
    clearSignatureCache(type);
    loadCachedData();
    setError(null);
  };

  // ------------------------------------------------------------------
  // Return everything the UI needs
  // ------------------------------------------------------------------
  return {
    // Tab state
    activeTab,
    setActiveTab,
    activeToolSubTab,
    setActiveToolSubTab,

    // Lookup
    lookupInput,
    setLookupInput,
    lookupType,
    setLookupType,
    lookupResults,
    isLookingUp,
    handleLookup,

    // Search
    searchQuery,
    setSearchQuery,
    isSearchStale,
    searchResults,
    isSearching,
    searchProgress,
    handleSearch,
    flattenedFunctionResults,
    flattenedEventResults,

    // Selector calculator
    calculatorSignature,
    setCalculatorSignature,
    calculatorResult,

    // Custom signatures
    customSignature,
    setCustomSignature,
    customDescription,
    setCustomDescription,
    customProject,
    setCustomProject,
    customSignatures,
    handleAddCustomSignature,

    // ABI import
    abiInput,
    setAbiInput,
    contractPath,
    setContractPath,
    extractedSignatures,
    isExtracting,
    extractSignaturesFromABI,
    addExtractedSignatures,
    addAllExtractedSignatures,

    // File upload
    showFileModal,
    setShowFileModal,
    selectedFiles,
    setSelectedFiles,
    parsedContracts,
    selectedContracts,
    handleFileSelect,
    handleContractSelection,
    selectAllContracts,
    deselectAllContracts,
    openFileModal,

    // Cache
    flattenedCachedFunctions,
    flattenedCachedEvents,
    flattenedCachedErrors,
    functionsOpen,
    setFunctionsOpen,
    eventsOpen,
    setEventsOpen,
    errorsOpen,
    setErrorsOpen,
    customOpen,
    setCustomOpen,
    clearCache,

    // Error
    error,
  };
}
