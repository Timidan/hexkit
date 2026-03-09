/**
 * useRestorationEffects - Handles restoring state from initialContractData
 * and SimulationContext contractContext.
 * Extracted from SimpleGridMain.tsx (pure structural split -- no behaviour changes).
 */
import { useEffect, type MutableRefObject } from "react";
import { ethers } from "ethers";
import { SUPPORTED_CHAINS } from "../../../utils/chains";
import type { ContractInfo } from "../../../types";
import type { DiamondFacet } from "../../../utils/diamondFacetFetcher";
import type { SimulationContractContext } from "../../../contexts/SimulationContext";
import type { AbiSourceType } from "../GridContext";

/** Serialize a decoded ABI argument to a string for form restoration. */
function serializeDecodedArg(arg: unknown): string {
  if (ethers.BigNumber.isBigNumber(arg)) return arg.toString();
  if (typeof arg === 'bigint') return arg.toString();
  if (Array.isArray(arg)) return JSON.stringify(arg);
  return String(arg);
}

interface RestorationDeps {
  initialContractData: any;
  contractContext: SimulationContractContext | null;
  isRestoringRef: MutableRefObject<boolean>;

  // Contract state
  contractState: {
    setContractSource: (v: "project" | "address") => void;
    setContractAddress: (v: string) => void;
    setSelectedNetwork: (v: any) => void;
    setContractName: (v: string) => void;
    setContractInfo: (v: ContractInfo | null) => void;
    setAbiSource: (v: AbiSourceType) => void;
    setProxyInfo: (v: any) => void;
    userEditedAddressRef: MutableRefObject<boolean>;
    restoredAddressRef: MutableRefObject<string | null>;
    handleFetchABI: () => void;
  };

  // Token state
  tokenState: {
    setTokenInfo: (v: any) => void;
    setTokenDetection: (v: any) => void;
    setIsERC20: (v: boolean) => void;
    setIsERC721: (v: boolean) => void;
    setIsERC1155: (v: boolean) => void;
    setIsERC777: (v: boolean) => void;
    setIsERC4626: (v: boolean) => void;
    setIsERC2981: (v: boolean) => void;
    setIsDiamond: (v: boolean) => void;
  };

  // Diamond state
  diamondState: {
    setDiamondFacets: (v: DiamondFacet[]) => void;
  };

  // Function state
  functionState: {
    setReadFunctions: (v: any[]) => void;
    setWriteFunctions: (v: any[]) => void;
    setSelectedFunctionType: (v: "read" | "write" | null) => void;
    setGeneratedCallData: (v: string) => void;
    setFunctionMode: (v: "function" | "raw") => void;
    pendingFunctionRestoreRef: MutableRefObject<any>;
    filteredReadFunctions: any[];
    filteredWriteFunctions: any[];
    handleFunctionSelect: (key: string, inputs?: Record<string, string>) => void;
  };

  // Simulation state
  simState: {
    setSimulationFromAddress: (v: string) => void;
    setSimulationOverrides: (v: any) => void;
  };
}

/**
 * Encapsulates the three restoration effects:
 * 1. initialContractData prop restoration (clone simulation)
 * 2. SimulationContext contractContext restoration
 * 3. Pending function restore application
 */
export function useRestorationEffects(deps: RestorationDeps): void {
  const {
    initialContractData,
    contractContext,
    isRestoringRef,
    contractState,
    tokenState,
    diamondState,
    functionState,
    simState,
  } = deps;

  // ===================== Handle initial contract data from prop (clone simulation) =====================
  useEffect(() => {
    if (!initialContractData) return;
    isRestoringRef.current = true;
    let funcToRestore: string | undefined;
    const initialNetwork = SUPPORTED_CHAINS.find((c) => c.id === initialContractData.networkId);

    // Always hydrate address/network from initial contract data, even without ABI.
    contractState.setContractSource("address");
    if (initialContractData.address) {
      contractState.setContractAddress(initialContractData.address);
    }
    if (initialNetwork) {
      contractState.setSelectedNetwork(initialNetwork);
    }
    if (initialContractData.name) {
      contractState.setContractName(initialContractData.name);
    }

    if (initialContractData.abi && initialContractData.abi.length > 0) {
      try {
        const iface = new ethers.utils.Interface(initialContractData.abi);
        const readFns: ethers.utils.FunctionFragment[] = [];
        const writeFns: ethers.utils.FunctionFragment[] = [];
        Object.values(iface.functions).forEach((fn) => {
          if (fn.stateMutability === "view" || fn.stateMutability === "pure") readFns.push(fn);
          else writeFns.push(fn);
        });
        functionState.setReadFunctions(readFns);
        functionState.setWriteFunctions(writeFns);

        if (initialNetwork) {
          const info: ContractInfo = {
            address: initialContractData.address,
            chain: initialNetwork,
            abi: JSON.stringify(initialContractData.abi),
            verified: false,
            name: initialContractData.name,
          };
          contractState.setContractInfo(info);
          contractState.setAbiSource("restored");
        }

        funcToRestore = initialContractData.selectedFunction || contractContext?.selectedFunction;
        let inputsToRestore = initialContractData.functionInputs || contractContext?.functionInputs;
        const funcTypeToRestore = initialContractData.selectedFunctionType || contractContext?.selectedFunctionType;
        const calldataToRestore = initialContractData.calldata || contractContext?.calldata;

        // Fallback: if functionInputs is empty but calldata exists, decode from calldata
        if ((!inputsToRestore || Object.keys(inputsToRestore).length === 0) && calldataToRestore && calldataToRestore !== "0x") {
          try {
            const decoded = iface.parseTransaction({ data: calldataToRestore });
            if (decoded && decoded.args) {
              inputsToRestore = {};
              decoded.functionFragment.inputs.forEach((input: any, idx: number) => {
                const serialized = serializeDecodedArg(decoded.args[idx]);
                inputsToRestore![`${decoded.name}_${idx}`] = serialized;
                if (input.name) inputsToRestore![input.name] = serialized;
              });
              // Also use decoded function name if we don't have one
              if (!funcToRestore) funcToRestore = decoded.name;
            }
          } catch {
            // Failed to decode calldata for input recovery
          }
        }

        if (funcToRestore) {
          functionState.pendingFunctionRestoreRef.current = {
            functionKey: funcToRestore,
            functionInputs: inputsToRestore || {},
            functionType: funcTypeToRestore,
            calldata: calldataToRestore,
          };
        }

        if (funcTypeToRestore) functionState.setSelectedFunctionType(funcTypeToRestore);

        if (initialContractData.proxyType) {
          if (initialContractData.proxyType === 'DiamondProxy' || initialContractData.proxyType === 'diamond') {
            tokenState.setIsDiamond(true);
          } else {
            contractState.setProxyInfo({
              isProxy: true,
              proxyType: initialContractData.proxyType as any,
              implementationAddress: initialContractData.implementationAddress,
              implementations: initialContractData.implementations,
              beaconAddress: initialContractData.beaconAddress,
              adminAddress: initialContractData.adminAddress,
            });
          }
        }
        if (initialContractData.diamondFacets && initialContractData.diamondFacets.length > 0) {
          const mappedFacets: DiamondFacet[] = initialContractData.diamondFacets.map((f: any) => ({
            address: f.address,
            name: f.name || 'Unknown Facet',
            abi: f.abi || [],
            source: f.source || 'restored',
            isVerified: f.isVerified ?? false,
            functions: f.functions || { read: [], write: [] },
            selectors: f.selectors,
          }));
          diamondState.setDiamondFacets(mappedFacets);
        }

        // Restore token detection state from cached data
        const isDiamondClone = initialContractData.proxyType === 'DiamondProxy' || initialContractData.proxyType === 'diamond';
        if (initialContractData.tokenType) {
          tokenState.setTokenDetection({
            type: initialContractData.tokenType,
            confidence: 1.0,
            detectionMethod: "restored",
            isDiamond: isDiamondClone,
            tokenInfo: { name: initialContractData.name, symbol: initialContractData.tokenSymbol, decimals: initialContractData.tokenDecimals },
          });
          tokenState.setIsERC20(initialContractData.tokenType === "ERC20");
          tokenState.setIsERC721(initialContractData.tokenType === "ERC721");
          tokenState.setIsERC1155(initialContractData.tokenType === "ERC1155");
          tokenState.setIsERC777(initialContractData.tokenType === "ERC777");
          tokenState.setIsERC4626(initialContractData.tokenType === "ERC4626");
        }
        if (initialContractData.tokenSymbol || initialContractData.tokenDecimals !== undefined) {
          tokenState.setTokenInfo({
            name: initialContractData.name,
            symbol: initialContractData.tokenSymbol,
            decimals: initialContractData.tokenDecimals,
          });
        }
      } catch {
        // Failed to process initialContractData ABI
      }
    }

    // Non-ABI restoration
    try {
      const fromAddrToRestore = initialContractData.fromAddress || contractContext?.fromAddress;
      if (fromAddrToRestore) simState.setSimulationFromAddress(fromAddrToRestore);

      const calldataToRestore = initialContractData.calldata || contractContext?.calldata;
      if (calldataToRestore && calldataToRestore !== "0x") {
        functionState.setGeneratedCallData(calldataToRestore);
        if (!funcToRestore && !initialContractData.selectedFunction) functionState.setFunctionMode("raw");
      }

      const ethValueToRestore = initialContractData.ethValue || contractContext?.ethValue;
      if (ethValueToRestore && ethValueToRestore !== "0") simState.setSimulationOverrides((prev: any) => ({ ...prev, value: ethValueToRestore }));

      const blockOverrideToRestore = initialContractData.blockOverride || contractContext?.blockOverride;
      if (blockOverrideToRestore) simState.setSimulationOverrides((prev: any) => ({ ...prev, blockNumber: blockOverrideToRestore }));

      const debugEnabledToRestore = initialContractData.debugEnabled ?? contractContext?.debugEnabled;
      if (typeof debugEnabledToRestore === 'boolean') {
        simState.setSimulationOverrides((prev: any) => ({ ...prev, enableDebug: debugEnabledToRestore }));
      }
    } catch {
      // Failed to restore simulation overrides
    }

    setTimeout(() => { isRestoringRef.current = false; }, 100);
  }, [initialContractData, contractContext]);

  // ===================== Restore from SimulationContext =====================
  useEffect(() => {
    if (contractState.userEditedAddressRef.current) return;
    if (initialContractData?.abi && initialContractData.abi.length > 0) return;
    if (contractContext && contractContext.address) {
      const alreadyRestored = contractState.restoredAddressRef.current?.toLowerCase() === contractContext.address.toLowerCase();
      if (!alreadyRestored) {
        contractState.restoredAddressRef.current = contractContext.address;
        isRestoringRef.current = true;
        contractState.setContractSource("address");
        contractState.setContractAddress(contractContext.address);

        const matchingNetwork = SUPPORTED_CHAINS.find((chain) => chain.id === contractContext.networkId);
        if (matchingNetwork) contractState.setSelectedNetwork(matchingNetwork);

        if (contractContext.abi && Array.isArray(contractContext.abi) && matchingNetwork) {
          try {
            const abiString = JSON.stringify(contractContext.abi);
            const iface = new ethers.utils.Interface(contractContext.abi);
            const readFns: ethers.utils.FunctionFragment[] = [];
            const writeFns: ethers.utils.FunctionFragment[] = [];
            Object.values(iface.functions).forEach((fn) => {
              if (fn.stateMutability === "view" || fn.stateMutability === "pure") readFns.push(fn);
              else writeFns.push(fn);
            });
            functionState.setReadFunctions(readFns);
            functionState.setWriteFunctions(writeFns);
            contractState.setContractName(contractContext.name || "");

            const restoredInfo: ContractInfo = {
              address: contractContext.address,
              chain: matchingNetwork,
              abi: abiString,
              verified: false,
              name: contractContext.name,
            };
            contractState.setContractInfo(restoredInfo);
            contractState.setAbiSource("restored");

            // Reset all token state before applying cached values
            tokenState.setTokenDetection(null);
            tokenState.setIsERC20(false);
            tokenState.setIsERC721(false);
            tokenState.setIsERC1155(false);
            tokenState.setIsERC777(false);
            tokenState.setIsERC4626(false);
            tokenState.setIsERC2981(false);
            tokenState.setIsDiamond(false);
            tokenState.setTokenInfo(null);

            // Restore badge state from cached contract context
            const isDiamondContract = contractContext.proxyType === "DiamondProxy" || contractContext.proxyType === "diamond";
            if (contractContext.tokenType) {
              tokenState.setTokenDetection({
                type: contractContext.tokenType,
                confidence: 1.0,
                detectionMethod: "restored",
                isDiamond: isDiamondContract,
                tokenInfo: { name: contractContext.name, symbol: contractContext.tokenSymbol, decimals: contractContext.tokenDecimals },
              });
              tokenState.setIsERC20(contractContext.tokenType === "ERC20");
              tokenState.setIsERC721(contractContext.tokenType === "ERC721");
              tokenState.setIsERC1155(contractContext.tokenType === "ERC1155");
              tokenState.setIsERC777(contractContext.tokenType === "ERC777");
              tokenState.setIsERC4626(contractContext.tokenType === "ERC4626");
            }
            if (isDiamondContract) {
              tokenState.setIsDiamond(true);
            }
            if (contractContext.proxyType && !isDiamondContract) {
              contractState.setProxyInfo({
                isProxy: true,
                proxyType: contractContext.proxyType as any,
                implementationAddress: contractContext.implementationAddress,
                implementations: contractContext.implementations,
              });
            }
            if (contractContext.tokenSymbol || contractContext.tokenDecimals !== undefined) {
              tokenState.setTokenInfo({
                name: contractContext.name,
                symbol: contractContext.tokenSymbol,
                decimals: contractContext.tokenDecimals,
              });
            }

            let ctxInputsToRestore = contractContext.functionInputs;
            let ctxFuncToRestore = contractContext.selectedFunction;

            // Fallback: if functionInputs is empty but calldata exists, decode from calldata
            if ((!ctxInputsToRestore || Object.keys(ctxInputsToRestore).length === 0) && contractContext.calldata && contractContext.calldata !== "0x") {
              try {
                const decoded = iface.parseTransaction({ data: contractContext.calldata });
                if (decoded && decoded.args) {
                  ctxInputsToRestore = {};
                  decoded.functionFragment.inputs.forEach((input: any, idx: number) => {
                    const serialized = serializeDecodedArg(decoded.args[idx]);
                    ctxInputsToRestore![`${decoded.name}_${idx}`] = serialized;
                    if (input.name) ctxInputsToRestore![input.name] = serialized;
                  });
                  if (!ctxFuncToRestore) ctxFuncToRestore = decoded.name;
                }
              } catch (decodeErr) {
                console.warn('[SimpleGridUI] Failed to decode calldata for input recovery (context):', decodeErr);
              }
            }

            if (ctxFuncToRestore) {
              functionState.pendingFunctionRestoreRef.current = {
                functionKey: ctxFuncToRestore,
                functionInputs: ctxInputsToRestore || {},
                functionType: contractContext.selectedFunctionType,
                calldata: contractContext.calldata,
              };
            }
          } catch (error) {
            console.error('[SimpleGridUI] Failed to restore ABI:', error);
          }
        }

        if (contractContext.fromAddress) simState.setSimulationFromAddress(contractContext.fromAddress);
        if (contractContext.calldata && contractContext.calldata !== "0x") {
          functionState.setGeneratedCallData(contractContext.calldata);
          if (!contractContext.selectedFunction) functionState.setFunctionMode("raw");
        }
        if (contractContext.ethValue && contractContext.ethValue !== "0") simState.setSimulationOverrides((prev: any) => ({ ...prev, value: contractContext.ethValue }));
        if (contractContext.blockOverride) simState.setSimulationOverrides((prev: any) => ({ ...prev, blockNumber: contractContext.blockOverride }));
        if (typeof contractContext.debugEnabled === "boolean") {
          simState.setSimulationOverrides((prev: any) => ({ ...prev, enableDebug: contractContext.debugEnabled }));
        }

        setTimeout(() => { isRestoringRef.current = false; }, 100);

        // Background ABI refetch for authoritative token detection
        setTimeout(() => {
          if (contractContext.selectedFunction) {
            functionState.pendingFunctionRestoreRef.current = {
              functionKey: contractContext.selectedFunction,
              functionInputs: contractContext.functionInputs || {},
              functionType: contractContext.selectedFunctionType,
              calldata: contractContext.calldata,
            };
          }
          contractState.handleFetchABI();
        }, 300);
      }
    }
  }, [contractContext]);

  // ===================== Apply pending function restoration =====================
  useEffect(() => {
    const pending = functionState.pendingFunctionRestoreRef.current;
    if (!pending) return;
    const hasRead = functionState.filteredReadFunctions.length > 0;
    const hasWrite = functionState.filteredWriteFunctions.length > 0;
    if (!hasRead && !hasWrite) return;

    const savedFunctionKey = pending.functionKey;
    const savedType = pending.functionType as "read" | "write" | undefined;

    // Compute calldata selector (first 4 bytes) for overload disambiguation
    const calldataSelector = pending.calldata && pending.calldata.length >= 10
      ? pending.calldata.slice(0, 10).toLowerCase()
      : null;

    // Helper: compute 4-byte selector for a function fragment
    const functionSelector = (func: ethers.utils.FunctionFragment): string => {
      try {
        const iface = new ethers.utils.Interface([func]);
        return iface.getSighash(func).toLowerCase();
      } catch { return ""; }
    };

    // Helper: recover function inputs from calldata when stored inputs are empty
    const recoverInputsFromCalldata = (func: ethers.utils.FunctionFragment, inputs: Record<string, string>): Record<string, string> => {
      if (Object.keys(inputs).length > 0) return inputs;
      if (!pending.calldata || pending.calldata === "0x") return inputs;
      try {
        const iface = new ethers.utils.Interface([func]);
        const decoded = iface.decodeFunctionData(func.name, pending.calldata);
        const recovered: Record<string, string> = {};
        func.inputs.forEach((input: any, idx: number) => {
          const serialized = serializeDecodedArg(decoded[idx]);
          recovered[`${func.name}_${idx}`] = serialized;
          if (input.name) {
            recovered[input.name] = serialized;
          }
        });
        return recovered;
      } catch (e) {
        console.warn('[SimpleGridUI] Failed to decode calldata in apply-pending:', e);
        return inputs;
      }
    };

    let matched = false;

    if (savedFunctionKey.includes('-')) {
      // Format: "write-3" (type-index key)
      const [type, indexStr] = savedFunctionKey.split('-');
      const index = parseInt(indexStr);
      const functions = type === 'read' ? functionState.filteredReadFunctions : functionState.filteredWriteFunctions;
      if (functions[index]) {
        const resolvedInputs = recoverInputsFromCalldata(functions[index], pending.functionInputs);
        functionState.setSelectedFunctionType(type as "read" | "write");
        functionState.handleFunctionSelect(savedFunctionKey, resolvedInputs);
        matched = true;
      }
    } else {
      // Format: "transfer" (function name only)
      const searchOrder: Array<{ type: "read" | "write"; fns: typeof functionState.filteredReadFunctions }> =
        savedType === "read"
          ? [{ type: "read", fns: functionState.filteredReadFunctions }, { type: "write", fns: functionState.filteredWriteFunctions }]
          : [{ type: "write", fns: functionState.filteredWriteFunctions }, { type: "read", fns: functionState.filteredReadFunctions }];

      for (const { type, fns } of searchOrder) {
        for (let i = 0; i < fns.length; i++) {
          if (fns[i].name !== savedFunctionKey) continue;
          if (calldataSelector && functionSelector(fns[i]) !== calldataSelector) continue;
          const fullKey = `${type}-${i}`;
          const resolvedInputs = recoverInputsFromCalldata(fns[i], pending.functionInputs);
          functionState.setSelectedFunctionType(type);
          functionState.handleFunctionSelect(fullKey, resolvedInputs);
          matched = true;
          break;
        }
        if (matched) break;
      }

      // Fallback: if selector didn't match any overload, try name-only match
      if (!matched) {
        for (const { type, fns } of searchOrder) {
          const index = fns.findIndex(fn => fn.name === savedFunctionKey);
          if (index !== -1) {
            const fullKey = `${type}-${index}`;
            const resolvedInputs = recoverInputsFromCalldata(fns[index], pending.functionInputs);
            functionState.setSelectedFunctionType(type);
            functionState.handleFunctionSelect(fullKey, resolvedInputs);
            matched = true;
            break;
          }
        }
      }
    }
    // Only clear pending if we actually matched
    if (matched) {
      functionState.pendingFunctionRestoreRef.current = null;
    }
  }, [functionState.filteredReadFunctions, functionState.filteredWriteFunctions]);
}
