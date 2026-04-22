/**
 * useFunctionState – manages function selection, inputs, calldata generation
 * and decoded calldata state. */
import { useState, useCallback, useMemo, useRef } from "react";
import { ethers } from "ethers";
import type { ABIInput } from "../../ContractInputComponent";
import { useContractInputs } from "../../../hooks/useContractInputs";
import { lookupFunctionSignatures } from "../../../utils/signatureDatabase";
import type { ContractInfo } from "../../../types";

export interface UseFunctionStateDeps {
  contractInfo: ContractInfo | null;
  isDiamond: boolean;
  diamondFacets: any[];
  selectedFacet: string | null;
  sanitizeAbiEntries: (items: any[]) => any[];
  isRestoringRef: React.MutableRefObject<boolean>;
}

export function useFunctionState(deps: UseFunctionStateDeps) {
  const { contractInfo, isDiamond, diamondFacets, selectedFacet, sanitizeAbiEntries, isRestoringRef } = deps;

  // ---------- state ----------
  const [functionMode, setFunctionMode] = useState<"function" | "raw">("function");
  const [selectedFunctionType, setSelectedFunctionType] = useState<"read" | "write" | null>(null);
  const [selectedFunction, setSelectedFunction] = useState<string | null>(null);
  const [selectedFunctionObj, setSelectedFunctionObj] = useState<ethers.utils.FunctionFragment | null>(null);
  const [generatedCallData, setGeneratedCallData] = useState<string>("0x");
  const [decodedCalldata, setDecodedCalldata] = useState<{
    functionName: string;
    signature: string;
    args: string[];
    isLoading: boolean;
  } | null>(null);
  const [functionInputs, setFunctionInputs] = useState<{ [key: string]: string }>({});
  const [functionSearch, setFunctionSearch] = useState<string>("");
  const [showFunctionSearch, setShowFunctionSearch] = useState<boolean>(false);
  const [readFunctions, setReadFunctions] = useState<ethers.utils.FunctionFragment[]>([]);
  const [writeFunctions, setWriteFunctions] = useState<ethers.utils.FunctionFragment[]>([]);
  const [functionResult, setFunctionResult] = useState<any>(null);

  const [enhancedParameters, setEnhancedParameters] = useState<{ [key: string]: any }>({});
  const [useEnhancedUI, setUseEnhancedUI] = useState(true);

  const pendingFunctionRestoreRef = useRef<{ functionKey: string; functionInputs: Record<string, string>; functionType?: "read" | "write"; calldata?: string } | null>(null);

  // ---------- memoized inputs ----------
  const memoizedInputs = useMemo(() => {
    return selectedFunctionObj?.inputs.map(
      (input) => ({ name: input.name, type: input.type, internalType: (input as any).internalType, components: (input as any).components } as ABIInput)
    ) || [];
  }, [selectedFunctionObj]);

  // ---------- callbacks ----------
  const handleValuesChange = useCallback((values: Record<string, any>, _allValid: boolean) => {
    const newInputs: { [key: string]: string } = {};
    if (selectedFunctionObj) {
      selectedFunctionObj.inputs.forEach((input: any, idx: number) => {
        const value = values[input.name];
        // Preserve falsy values like 0, false, "" – only default genuinely missing keys
        const serialized = value === null || value === undefined
          ? ""
          : typeof value === "object" ? JSON.stringify(value) : String(value);
        newInputs[`${selectedFunctionObj.name}_${idx}`] = serialized;
        newInputs[input.name] = serialized;
      });
      setFunctionInputs(newInputs);
    }
  }, [selectedFunctionObj]);

  const handleCalldataGenerated = useCallback((calldata: string) => {
    setGeneratedCallData(calldata);
  }, []);

  const contractInputsHook = useContractInputs({
    inputs: memoizedInputs,
    selectedFunction: selectedFunctionObj,
    initialValues: functionInputs,
    onValuesChange: handleValuesChange,
    onCalldataGenerated: handleCalldataGenerated,
  });

  // ---------- all / filtered functions ----------
  const allReadFunctions = useMemo(() => {
    let allReads = [...readFunctions];
    if (isDiamond) {
      diamondFacets.forEach((facet) => {
        if (Array.isArray(facet.abi)) {
          (facet.abi as unknown[]).forEach((item) => {
            const entry = item as { type?: string; stateMutability?: string };
            if (entry?.type === "function" && (entry.stateMutability === "view" || entry.stateMutability === "pure")) {
              allReads.push(item as unknown as ethers.utils.FunctionFragment);
            }
          });
        }
      });
    }
    return allReads;
  }, [readFunctions, isDiamond, diamondFacets]);

  const allWriteFunctions = useMemo(() => {
    let allWrites = [...writeFunctions];
    if (isDiamond) {
      diamondFacets.forEach((facet) => {
        if (Array.isArray(facet.abi)) {
          (facet.abi as unknown[]).forEach((item) => {
            const entry = item as { type?: string; stateMutability?: string };
            if (entry?.type === "function" && !(entry.stateMutability === "view" || entry.stateMutability === "pure")) {
              allWrites.push(item as unknown as ethers.utils.FunctionFragment);
            }
          });
        }
      });
    }
    return allWrites;
  }, [writeFunctions, isDiamond, diamondFacets]);

  const filteredReadFunctions = useMemo(() => {
    let base = readFunctions;
    if (isDiamond && selectedFacet) {
      const facet = diamondFacets.find((f) => f.address.toLowerCase() === selectedFacet.toLowerCase());
      if (facet && Array.isArray(facet.abi)) {
        const reads: ethers.utils.FunctionFragment[] = [];
        (facet.abi as unknown[]).forEach((item) => {
          const entry = item as { type?: string; stateMutability?: string };
          if (entry?.type === "function" && (entry.stateMutability === "view" || entry.stateMutability === "pure")) {
            reads.push(item as unknown as ethers.utils.FunctionFragment);
          }
        });
        if (reads.length > 0) base = reads;
      }
    } else if (isDiamond && !selectedFacet) {
      base = allReadFunctions;
    }
    return base;
  }, [isDiamond, selectedFacet, diamondFacets, readFunctions, allReadFunctions]);

  const filteredWriteFunctions = useMemo(() => {
    let base = writeFunctions;
    if (isDiamond && selectedFacet) {
      const facet = diamondFacets.find((f) => f.address.toLowerCase() === selectedFacet.toLowerCase());
      if (facet && Array.isArray(facet.abi)) {
        const writes: ethers.utils.FunctionFragment[] = [];
        (facet.abi as unknown[]).forEach((item) => {
          const entry = item as { type?: string; stateMutability?: string };
          if (entry?.type === "function" && !(entry.stateMutability === "view" || entry.stateMutability === "pure")) {
            writes.push(item as unknown as ethers.utils.FunctionFragment);
          }
        });
        if (writes.length > 0) base = writes;
      }
    } else if (isDiamond && !selectedFacet) {
      base = allWriteFunctions;
    }
    return base;
  }, [isDiamond, selectedFacet, diamondFacets, writeFunctions, allWriteFunctions]);

  const searchFilteredFunctions = useMemo(() => {
    const q = functionSearch.trim().toLowerCase();
    if (!q) return [];
    const allFunctionsWithType = [
      ...allReadFunctions.map((fn) => ({ ...fn, functionType: "read" as const })),
      ...allWriteFunctions.map((fn) => ({ ...fn, functionType: "write" as const })),
    ];
    return allFunctionsWithType.filter((fn) =>
      `${fn.name}(${fn.inputs?.map((i) => i.type).join(",")})`.toLowerCase().includes(q)
    );
  }, [functionSearch, allReadFunctions, allWriteFunctions]);

  const totalFacetReads = useMemo(() => diamondFacets.reduce((acc, facet) => acc + (facet.functions?.read?.length || 0), 0), [diamondFacets]);
  const totalFacetWrites = useMemo(() => diamondFacets.reduce((acc, facet) => acc + (facet.functions?.write?.length || 0), 0), [diamondFacets]);

  // ---------- handlers ----------
  const generateCallData = useCallback(
    (functionSignature: string, inputs: string[] = []) => {
      try {
        if (!contractInfo?.abi) return "0x";
        const parsedABI = sanitizeAbiEntries(JSON.parse(contractInfo.abi));
        const targetFunction = parsedABI.find((item: any) => {
          if (item.type === "function" && item.name) {
            const sig = `${item.name}(${item.inputs?.map((input: any) => input.type).join(",") || ""})`;
            return sig === functionSignature;
          }
          return false;
        });
        if (!targetFunction || !targetFunction.name) return "0x";
        const iface = new ethers.utils.Interface([targetFunction]);
        return iface.encodeFunctionData(targetFunction.name, inputs);
      } catch {
        return "0x";
      }
    },
    [contractInfo?.abi, sanitizeAbiEntries]
  );

  const handleFunctionSelect = (value: string, initialInputValues?: Record<string, string>) => {
    setSelectedFunction(value);
    setFunctionResult(null);
    if (value && value !== "" && value !== "Select function") {
      const [type, index] = value.split("-");
      const functions = type === "read" ? filteredReadFunctions : filteredWriteFunctions;
      const func = functions[parseInt(index)];
      if (func) {
        setSelectedFunctionObj(func);
        if (initialInputValues && Object.keys(initialInputValues).length > 0) {
          setFunctionInputs(initialInputValues);
          // Force the useContractInputs hook to re-apply initial values
          // even when re-selecting the same function name (re-simulation case)
          contractInputsHook.forceReapply();
          try {
            const inputsArray = func.inputs?.map((input: any, idx: number) => {
              const inputKey = `${func.name}_${idx}`;
              return initialInputValues[input.name] ?? initialInputValues[inputKey] ?? "";
            }) || [];
            const iface = new ethers.utils.Interface([func]);
            setGeneratedCallData(iface.encodeFunctionData(func.name, inputsArray));
          } catch (error) {
            setGeneratedCallData("0x");
          }
        } else {
          const initialInputs: { [key: string]: string } = {};
          func.inputs?.forEach((input, idx) => { initialInputs[`${func.name}_${idx}`] = ""; });
          setFunctionInputs(initialInputs);
          try {
            const emptyParams = new Array(func.inputs?.length || 0).fill("");
            const iface = new ethers.utils.Interface([func]);
            setGeneratedCallData(iface.encodeFunctionData(func.name, emptyParams));
          } catch (error) {
            setGeneratedCallData("0x");
          }
        }
      }
    } else {
      setSelectedFunctionObj(null);
      setFunctionInputs({});
      setGeneratedCallData("0x");
    }
  };

  const updateCallData = useCallback(() => {
    if (!selectedFunctionObj) {
      if (functionMode !== "raw" && !isRestoringRef.current) setGeneratedCallData("0x");
      return;
    }
    try {
      const inputsArray = selectedFunctionObj.inputs.map((input: any, idx: number) => {
        const inputKey = `${selectedFunctionObj.name}_${idx}`;
        const value = functionInputs[inputKey];
        if (value === undefined || value === "") {
          if (input.type === "bool") return false;
          if (input.type.includes("uint") || input.type.includes("int")) return "0";
          if (input.type === "address") return "0x0000000000000000000000000000000000000000";
          if (input.type.includes("bytes")) return "0x";
          if (input.type.includes("[]")) return [];
          if (input.type.includes("tuple")) return {};
          return "";
        }
        if (typeof value === "string" && (input.type.includes("tuple") || input.type.includes("[]"))) {
          try { return JSON.parse(value); } catch { return value; }
        }
        return value;
      });
      const iface = new ethers.utils.Interface([selectedFunctionObj]);
      setGeneratedCallData(iface.encodeFunctionData(selectedFunctionObj.name, inputsArray));
    } catch (error) {
      setGeneratedCallData("0x");
    }
  }, [selectedFunctionObj, functionInputs, functionMode, isRestoringRef]);

  const handleInputChange = (inputKey: string, value: string) => {
    setFunctionInputs((prev) => ({ ...prev, [inputKey]: value }));
    setTimeout(() => updateCallData(), 0);
  };

  // decodeCalldata is handled via useEffect in the orchestrator (auto-decode on raw calldata change)

  return {
    // state
    functionMode, setFunctionMode,
    selectedFunctionType, setSelectedFunctionType,
    selectedFunction, setSelectedFunction,
    selectedFunctionObj, setSelectedFunctionObj,
    generatedCallData, setGeneratedCallData,
    decodedCalldata, setDecodedCalldata,
    functionInputs, setFunctionInputs,
    functionSearch, setFunctionSearch,
    showFunctionSearch, setShowFunctionSearch,
    readFunctions, setReadFunctions,
    writeFunctions, setWriteFunctions,
    functionResult, setFunctionResult,
    enhancedParameters, setEnhancedParameters,
    useEnhancedUI, setUseEnhancedUI,
    memoizedInputs,
    contractInputsHook,
    // computed
    allReadFunctions, allWriteFunctions,
    filteredReadFunctions, filteredWriteFunctions,
    searchFilteredFunctions,
    totalFacetReads, totalFacetWrites,
    // refs
    pendingFunctionRestoreRef,
    // handlers
    handleFunctionSelect,
    generateCallData,
    updateCallData,
    handleInputChange,
    handleValuesChange,
    handleCalldataGenerated,
  };
}
