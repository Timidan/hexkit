import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { ethers } from "ethers";
import { useSimulation } from "../../contexts/SimulationContext";
import { useDebug } from "../../contexts/DebugContext";
import {
  lookupFunctionSignatures,
  getCachedSignatures,
  cacheSignature,
} from "../../utils/signatureDatabase";
import { networkConfigManager } from "../../config/networkConfig";
import { decodeCalldataWithSignature, formatParamValue } from "./traceTypes";
import { copyTextToClipboard } from "../../utils/clipboard";
import type {
  TraceRow,
  TraceFilters,
  SelectedEvent,
  SignatureDecodedInput,
  TraceValueDetail,
  SearchCategory,
} from "./traceTypes";

// Extracted helpers
import {
  buildAddressToNameMap,
  buildAddressToSymbolMap,
  buildNameToAddressMap,
  extractTxParties,
} from "./traceAddressMaps";
import {
  buildFrameHierarchy,
  buildCollapsedRanges,
  checkRowHidden,
  buildActualParentFrames,
  buildActiveRailsAtRow,
} from "./traceFrameHelpers";

export interface UseTraceStateProps {
  traceRows: TraceRow[];
  filters: TraceFilters;
  searchQuery: string;
  selectedInput?: string | null;
  selectedOutput?: string | null;
  sourceLines?: string[];
  sourceTexts?: Record<string, string>;
  externalHighlightedValue?: string | null;
  onHighlightChange?: (value: string | null) => void;
}

export function useTraceState(props: UseTraceStateProps) {
  const {
    traceRows,
    filters,
    searchQuery,
    selectedInput,
    selectedOutput,
    sourceLines,
    sourceTexts,
    externalHighlightedValue,
    onHighlightChange,
  } = props;

  // ---- Basic UI State ----
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [ioExpanded, setIoExpanded] = useState<boolean>(false);
  const [tokenMovementsExpanded, setTokenMovementsExpanded] = useState<boolean>(false);
  const [inputExpanded, setInputExpanded] = useState<boolean>(false);
  const [outputExpanded, setOutputExpanded] = useState<boolean>(false);
  const [inputViewMode, setInputViewMode] = useState<"decoded" | "raw">("decoded");
  const [outputViewMode, setOutputViewMode] = useState<"decoded" | "raw">("decoded");
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [collapsedFrames, setCollapsedFrames] = useState<Set<string>>(new Set());
  const [internalHighlightedValue, setInternalHighlightedValue] = useState<string | null>(null);
  const [slotXRefEnabled, setSlotXRefEnabled] = useState<boolean>(false);
  const [searchCategory, setSearchCategory] = useState<SearchCategory>('all');
  const [selectedEvent, setSelectedEvent] = useState<SelectedEvent | null>(null);
  const [selectedTraceDetail, setSelectedTraceDetail] = useState<TraceValueDetail | null>(null);
  const [signatureDecodedInput, setSignatureDecodedInput] = useState<SignatureDecodedInput | null>(null);
  const [signatureLookupLoading, setSignatureLookupLoading] = useState(false);
  const [fetchedSymbol, setFetchedSymbol] = useState<string | null>(null);

  // ---- Context ----
  const { openDebugAtRevert, openDebugAtSnapshot, session: debugSession } = useDebug();
  const { contractContext } = useSimulation();

  // ---- Effective ABI (root + facets) ----
  const effectiveDecodeAbi = useMemo(() => {
    const functionBySignature = new Map<string, { item: any; score: number }>();

    const toAbiArray = (abiLike: unknown): any[] => {
      if (!abiLike) return [];
      if (Array.isArray(abiLike)) return abiLike;
      if (typeof abiLike === "string") {
        try {
          const parsed = JSON.parse(abiLike);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    };

    const countTupleComponents = (components: any[] | undefined): number => {
      if (!Array.isArray(components) || components.length === 0) return 0;
      return components.reduce((acc, component) => {
        const nested = countTupleComponents(component?.components);
        return acc + 1 + nested;
      }, 0);
    };

    const scoreFunctionItem = (item: any): number => {
      const outputs = Array.isArray(item?.outputs) ? item.outputs : [];
      return outputs.reduce((score: number, output: { type?: string; components?: unknown[] }) => {
        const outputType = String(output?.type || "");
        if (outputType.startsWith("tuple")) {
          const componentCount = countTupleComponents(output?.components);
          if (componentCount > 0) {
            return score + 20 + componentCount;
          }
          return score + 2;
        }
        return score + 6;
      }, outputs.length as number);
    };

    const addFunctionItem = (item: any) => {
      if (!item || item.type !== "function" || !item.name) return;
      const inputTypes = Array.isArray(item.inputs)
        ? item.inputs.map((input: any) => input?.type || "").join(",")
        : "";
      const signature = `${item.name}(${inputTypes})`;
      const nextScore = scoreFunctionItem(item);
      const existing = functionBySignature.get(signature);
      if (!existing || nextScore >= existing.score) {
        functionBySignature.set(signature, { item, score: nextScore });
      }
    };

    const addFunctionItems = (abiLike: unknown) => {
      const abiArray = toAbiArray(abiLike);
      for (const item of abiArray) {
        addFunctionItem(item);
      }
    };

    addFunctionItems(contractContext?.abi);
    if (contractContext?.diamondFacets) {
      for (const facet of contractContext.diamondFacets) {
        addFunctionItems(facet.abi);
      }
    }

    const normalizedAbiItems = Array.from(functionBySignature.values()).map(
      (entry) => entry.item
    );
    return normalizedAbiItems.length > 0 ? normalizedAbiItems : null;
  }, [contractContext?.abi, contractContext?.diamondFacets]);

  const decodeInterface = useMemo(() => {
    if (!effectiveDecodeAbi) return null;
    try {
      return new ethers.utils.Interface(effectiveDecodeAbi);
    } catch {
      return null;
    }
  }, [effectiveDecodeAbi]);

  // ---- Highlight state ----
  const highlightedValue =
    externalHighlightedValue !== undefined
      ? externalHighlightedValue
      : internalHighlightedValue;
  const setHighlightedValue = useCallback(
    (value: string | null) => {
      if (onHighlightChange) {
        onHighlightChange(value);
      } else {
        setInternalHighlightedValue(value);
      }
    },
    [onHighlightChange]
  );

  // ---- RPC URL ----
  const effectiveRpcUrl = useMemo(() => {
    const networkId = contractContext?.networkId;
    if (!networkId) return undefined;
    const resolution = networkConfigManager.resolveRpcUrl(networkId);
    return resolution.url || undefined;
  }, [contractContext?.networkId]);

  // ---- Fetch token symbol ----
  useEffect(() => {
    if (contractContext?.tokenSymbol || fetchedSymbol) return;
    if (!contractContext?.address) return;

    const isTokenContract = contractContext?.tokenType &&
      ['ERC20', 'ERC721', 'ERC1155', 'ERC777', 'ERC4626'].includes(contractContext.tokenType);

    if (!isTokenContract) {
      const abiArray = Array.isArray(contractContext.abi)
        ? contractContext.abi
        : typeof contractContext.abi === 'string'
          ? JSON.parse(contractContext.abi)
          : [];

      const hasSymbolFn = abiArray.some(
        (item: any) => item.type === 'function' && item.name === 'symbol' &&
          (!item.inputs || item.inputs.length === 0)
      );

      if (!hasSymbolFn) return;
    }

    const fetchSymbol = async () => {
      try {
        const networkId = contractContext.networkId || 1;
        const resolution = networkConfigManager.resolveRpcUrl(networkId);
        const rpcUrl = resolution.url;
        if (!rpcUrl) return;

        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        const contract = new ethers.Contract(
          contractContext.address,
          ['function symbol() view returns (string)'],
          provider
        );

        const symbol = await contract.symbol();
        if (symbol && typeof symbol === 'string') {
          setFetchedSymbol(symbol);
        }
      } catch {
        // Could not fetch token symbol
      }
    };

    fetchSymbol();
  }, [contractContext?.address, contractContext?.abi, contractContext?.tokenSymbol, contractContext?.networkId, fetchedSymbol]);

  // ---- Address maps (delegated to traceAddressMaps.ts) ----
  const addressToName = useMemo(
    () => buildAddressToNameMap(traceRows),
    [traceRows],
  );

  const addressToSymbol = useMemo(
    () =>
      buildAddressToSymbolMap(
        contractContext?.address,
        contractContext?.tokenSymbol,
        contractContext?.diamondFacets,
        fetchedSymbol,
      ),
    [contractContext?.address, contractContext?.tokenSymbol, contractContext?.diamondFacets, fetchedSymbol],
  );

  const resolveAddressName = useCallback(
    (address: string | undefined | null): string | null => {
      if (!address) return null;
      const trimmed = address.trim();
      if (!trimmed.startsWith("0x") || trimmed.length !== 42) return null;
      return addressToName.get(trimmed.toLowerCase()) || null;
    },
    [addressToName]
  );

  const { txSender, txReceiver } = useMemo(
    () => extractTxParties(traceRows),
    [traceRows],
  );

  const getGlobalAddressTag = useCallback(
    (address: string | undefined | null): 'Sender' | 'Receiver' | null => {
      if (!address) return null;
      const normalized = address.toLowerCase();
      if (normalized === txSender) return 'Sender';
      if (normalized === txReceiver) return 'Receiver';
      return null;
    },
    [txSender, txReceiver]
  );

  const nameToAddress = useMemo(
    () => buildNameToAddressMap(addressToName),
    [addressToName],
  );

  const getRowAddress = useCallback(
    (row: TraceRow): string | null => {
      if (row.to && row.to.length === 42) return row.to;
      if (row.entryMeta?.target && row.entryMeta.target.length === 42)
        return row.entryMeta.target;
      if (row.contractName) {
        const addr = nameToAddress.get(row.contractName.toLowerCase());
        if (addr) return addr;
      }
      return null;
    },
    [nameToAddress]
  );

  // ---- Value normalization ----
  const normalizeValue = useCallback(
    (value: string | undefined | null): string | null => {
      if (!value) return null;
      const trimmed = value.trim();
      if (!trimmed || trimmed === "0x" || trimmed === "0x0") return null;
      if (trimmed.startsWith("0x")) {
        if (trimmed.length >= 42) {
          return trimmed.toLowerCase();
        }
        return null;
      }
      if (/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(trimmed)) {
        return null;
      }
      if (trimmed === "true" || trimmed === "false") {
        return null;
      }
      return trimmed;
    },
    []
  );

  const isStoragePointerFunction = useCallback(
    (fnName: string | undefined): boolean => {
      if (!fnName) return false;
      const lowerName = fnName.toLowerCase();
      return lowerName.endsWith("storage") || lowerName.includes("storage()");
    },
    []
  );

  // ---- Frame hierarchy (delegated to traceFrameHelpers.ts) ----
  const frameHierarchy = useMemo(
    () => buildFrameHierarchy(traceRows),
    [traceRows],
  );

  // ---- Row index map (O(1) lookup by ID) ----
  const rowIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    traceRows.forEach((row, idx) => map.set(row.id, idx));
    return map;
  }, [traceRows]);

  // ---- Collapsed ranges ----
  const collapsedRanges = useMemo(
    () => buildCollapsedRanges(collapsedFrames, traceRows, rowIndexMap),
    [collapsedFrames, traceRows, rowIndexMap],
  );

  // ---- Row visibility ----
  const isRowHidden = useCallback(
    (rowId: string, opcodeName?: string): boolean =>
      checkRowHidden(
        rowId,
        opcodeName,
        frameHierarchy,
        collapsedFrames,
        collapsedRanges,
        traceRows,
        rowIndexMap,
        filters,
      ),
    [frameHierarchy, collapsedFrames, collapsedRanges, traceRows, rowIndexMap, filters]
  );

  const toggleFrameCollapse = useCallback(
    (frameId: string, event: React.MouseEvent) => {
      event.stopPropagation();
      // Clear any stuck highlight -- collapsing removes DOM nodes so onMouseLeave may never fire
      setHighlightedValue(null);
      setCollapsedFrames((prev) => {
        const next = new Set(prev);
        if (next.has(frameId)) {
          next.delete(frameId);
        } else {
          next.add(frameId);
        }
        return next;
      });
    },
    [setHighlightedValue]
  );

  // ---- Scroll refs ----
  const listContainerRef = useRef<HTMLDivElement>(null);

  // Clear highlight on scroll -- elements move out from under the cursor without triggering onMouseLeave
  useEffect(() => {
    const el = listContainerRef.current;
    if (!el) return;
    const handleScroll = () => {
      if (highlightedValue) setHighlightedValue(null);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [highlightedValue, setHighlightedValue]);

  // ---- Search ----
  const rowMatchesSearch = useCallback(
    (row: TraceRow, query: string, category: SearchCategory): boolean => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();

      switch (category) {
        case 'opcode':
          return !!(row.opcodeName?.toLowerCase().includes(q));
        case 'from':
          return !!(
            row.from?.toLowerCase().includes(q) ||
            row.entryMeta?.caller?.toLowerCase().includes(q) ||
            row.entryMeta?.callerName?.toLowerCase().includes(q)
          );
        case 'to':
          return !!(
            row.to?.toLowerCase().includes(q) ||
            row.entryMeta?.target?.toLowerCase().includes(q) ||
            row.entryMeta?.targetContractName?.toLowerCase().includes(q)
          );
        case 'function':
          return !!(
            row.functionName?.toLowerCase().includes(q) ||
            row.entryMeta?.function?.toLowerCase().includes(q) ||
            row.entryMeta?.selector?.toLowerCase().includes(q) ||
            row.jumpDestFn?.toLowerCase().includes(q)
          );
        case 'file':
          return !!(row.sourceFile?.toLowerCase().includes(q));
        case 'contract':
          return !!(
            row.contractName?.toLowerCase().includes(q) ||
            row.contract?.toLowerCase().includes(q) ||
            row.entryMeta?.codeContractName?.toLowerCase().includes(q)
          );
        case 'state':
          return !!(
            row.storageSlot?.toLowerCase().includes(q) ||
            row.storageBefore?.toLowerCase().includes(q) ||
            row.storageAfter?.toLowerCase().includes(q) ||
            row.opcodeName?.toLowerCase() === 'sload' ||
            row.opcodeName?.toLowerCase() === 'sstore'
          );
        case 'all':
        default:
          if (row.opcodeName?.toLowerCase().includes(q)) return true;
          if (row.contractName?.toLowerCase().includes(q)) return true;
          if (row.functionName?.toLowerCase().includes(q)) return true;
          if (row.from?.toLowerCase().includes(q)) return true;
          if (row.to?.toLowerCase().includes(q)) return true;
          if (row.entryMeta?.caller?.toLowerCase().includes(q)) return true;
          if (row.entryMeta?.target?.toLowerCase().includes(q)) return true;
          if (row.storageSlot?.toLowerCase().includes(q)) return true;
          if (row.storageAfter?.toLowerCase().includes(q)) return true;
          if (row.storageBefore?.toLowerCase().includes(q)) return true;
          if (row.input?.toLowerCase().includes(q)) return true;
          if (row.output?.toLowerCase().includes(q)) return true;
          if (row.entryMeta?.selector?.toLowerCase().includes(q)) return true;
          if (row.entryMeta?.function?.toLowerCase().includes(q)) return true;
          if (row.sourceFile?.toLowerCase().includes(q)) return true;
          if (row.jumpDestFn?.toLowerCase().includes(q)) return true;
          if (row.contract?.toLowerCase().includes(q)) return true;
          return false;
      }
    },
    []
  );

  // ---- Visible rows ----
  const visibleRows = useMemo(() => {
    return traceRows
      .map((row, originalIndex) => ({ row, originalIndex }))
      .filter(({ row }) => !isRowHidden(row.id, row.opcodeName))
      .filter(({ row }) => rowMatchesSearch(row, searchQuery, searchCategory));
  }, [traceRows, isRowHidden, rowMatchesSearch, searchQuery, searchCategory]);

  // ---- Scroll to current step (native DOM) ----
  useEffect(() => {
    if (currentStepIndex < 0) return;
    const container = listContainerRef.current;
    if (!container) return;
    const containerStyle = window.getComputedStyle(container);
    const canScrollVertically =
      container.scrollHeight > container.clientHeight + 1 &&
      (containerStyle.overflowY === "auto" || containerStyle.overflowY === "scroll");
    if (!canScrollVertically) return;
    const visibleIndex = visibleRows.findIndex(
      ({ originalIndex }) => originalIndex === currentStepIndex
    );
    if (visibleIndex < 0) return;
    const rowEl = container.querySelector(
      `.exec-trace-rows > div:nth-child(${visibleIndex + 1})`
    );
    if (rowEl) {
      rowEl.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [currentStepIndex, visibleRows]);

  const ROW_HEIGHT = 22;

  // ---- Actual parent frames (delegated) ----
  const actualParentFrames = useMemo(
    () => buildActualParentFrames(visibleRows, collapsedFrames),
    [visibleRows, collapsedFrames],
  );

  // ---- Active rails (delegated) ----
  const activeRailsAtRow = useMemo(
    () => buildActiveRailsAtRow(visibleRows, actualParentFrames),
    [visibleRows, actualParentFrames],
  );

  // ---- Input decoding ----
  const currentStep = traceRows.length > 0 ? traceRows[currentStepIndex] : null;

  const decodedInput = useMemo(() => {
    const inputData = currentStep?.input || selectedInput;
    if (!inputData || inputData === "0x" || !decodeInterface) {
      return null;
    }
    try {
      const decoded = decodeInterface.parseTransaction({ data: inputData });
      return {
        name: decoded.name,
        signature: decoded.signature,
        args: decoded.args,
        fragment: decoded.functionFragment,
      };
    } catch {
      return null;
    }
  }, [currentStep?.input, selectedInput, decodeInterface]);

  // ---- Signature lookup fallback ----
  useEffect(() => {
    const inputData = currentStep?.input || selectedInput;
    if (!inputData || inputData === "0x" || inputData.length < 10 || decodedInput) {
      setSignatureDecodedInput(null);
      return;
    }

    const selector = inputData.slice(0, 10).toLowerCase();
    const cached = getCachedSignatures("function");
    if (cached[selector]) {
      const signature = cached[selector].name;
      const decoded = decodeCalldataWithSignature(inputData, signature);
      if (decoded) {
        setSignatureDecodedInput({ ...decoded, signature });
        return;
      }
    }

    let cancelled = false;
    setSignatureLookupLoading(true);

    lookupFunctionSignatures([selector])
      .then((response) => {
        if (cancelled) return;
        const signatures = response.result?.function?.[selector];
        if (signatures && signatures.length > 0) {
          const sig = signatures.find((s) => !s.filtered) || signatures[0];
          const signature = sig.name;
          cacheSignature(selector, signature, "function");
          const decoded = decodeCalldataWithSignature(inputData, signature);
          if (decoded) {
            setSignatureDecodedInput({ ...decoded, signature });
          } else {
            setSignatureDecodedInput({
              name: signature.split("(")[0],
              params: [],
              signature,
            });
          }
        } else {
          setSignatureDecodedInput(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSignatureDecodedInput(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSignatureLookupLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentStep?.input, selectedInput, decodedInput]);

  // ---- Output decoding ----
  const decodedOutput = useMemo(() => {
    const outputData = selectedOutput;

    if (!outputData || outputData === "0x" || !decodeInterface) {
      return null;
    }

    try {
      let functionFragment: any = null;

      if (selectedInput && selectedInput.length >= 10) {
        try {
          const parsed = decodeInterface.parseTransaction({ data: selectedInput });
          functionFragment = parsed.functionFragment;
        } catch {
          // Failed to parse selected input for output decoding
        }
      }

      if (!functionFragment && selectedInput && selectedInput.length >= 10) {
        const selector = selectedInput.slice(0, 10).toLowerCase();
        try {
          for (const fragment of Object.values(decodeInterface.functions)) {
            if (decodeInterface.getSighash(fragment).toLowerCase() === selector) {
              functionFragment = fragment;
              break;
            }
          }
        } catch {
          // Failed to find function by selector
        }
      }

      if (!functionFragment && contractContext?.selectedFunction) {
        const selectedFn = contractContext.selectedFunction;
        try {
          if (selectedFn.includes("(")) {
            functionFragment = decodeInterface.getFunction(selectedFn);
          } else {
            const candidates = Object.values(decodeInterface.functions).filter(
              (fragment: any) => fragment.name === selectedFn
            );
            if (candidates.length === 1) {
              functionFragment = candidates[0];
            }
          }
        } catch {
          // Failed to resolve selected function for output decoding
        }
      }

      if (!functionFragment) {
        return null;
      }

      const result = decodeInterface.decodeFunctionResult(functionFragment, outputData);

      return { values: result, fragment: functionFragment };
    } catch {
      return null;
    }
  }, [
    selectedOutput,
    selectedInput,
    decodeInterface,
    contractContext?.selectedFunction,
  ]);

  const handleCopy = useCallback((text: string) => {
    copyTextToClipboard(text).catch(() => {});
  }, []);

  const handleJumpToStep = useCallback(
    (stepIndex: number) => {
      setCurrentStepIndex(Math.max(0, Math.min(traceRows.length - 1, stepIndex)));
    },
    [traceRows.length]
  );

  return {
    // UI state
    currentStepIndex,
    ioExpanded,
    setIoExpanded,
    tokenMovementsExpanded,
    setTokenMovementsExpanded,
    inputExpanded,
    setInputExpanded,
    outputExpanded,
    setOutputExpanded,
    inputViewMode,
    setInputViewMode,
    outputViewMode,
    setOutputViewMode,
    expandedRowId,
    setExpandedRowId,
    collapsedFrames,
    slotXRefEnabled,
    setSlotXRefEnabled,
    searchCategory,
    setSearchCategory,
    selectedEvent,
    setSelectedEvent,
    selectedTraceDetail,
    setSelectedTraceDetail,
    signatureDecodedInput,
    signatureLookupLoading,
    fetchedSymbol,
    // Context
    debugSession,
    openDebugAtRevert,
    openDebugAtSnapshot,
    contractContext,
    // Highlight
    highlightedValue,
    setHighlightedValue,
    // Address maps
    addressToName,
    addressToSymbol,
    resolveAddressName,
    getGlobalAddressTag,
    getRowAddress,
    // Normalization
    normalizeValue,
    isStoragePointerFunction,
    // Frame hierarchy
    frameHierarchy,
    collapsedRanges,
    toggleFrameCollapse,
    actualParentFrames,
    activeRailsAtRow,
    // Visible rows
    visibleRows,
    currentStep,
    // Decoding
    decodedInput,
    decodedOutput,
    // Scroll/list
    listContainerRef,
    listRef: null,
    listHeight: 0,
    ROW_HEIGHT,
    // Handlers
    handleCopy,
    handleJumpToStep,
    // RPC
    effectiveRpcUrl,
  };
}
