/**
 * useSharedEffects – shared side-effect logic extracted from SimpleGridMain.tsx.
 * Handles CSS injection, simulation result expansion, auto-decode, auto-calldata,
 * auto-save, and auto-function-type selection.
 * Pure structural split – no behaviour changes.
 */
import { useEffect } from "react";
import { ethers } from "ethers";
import { ContractResultFormatter } from "../../../utils/resultFormatter";
import { extractSimulationArtifacts } from "../../../utils/simulationArtifacts";
import { lookupFunctionSignatures } from "../../../utils/signatureDatabase";

interface SharedEffectsDeps {
  // Simulation state
  simState: {
    simulationResult: any;
    setActiveSimulationFrame: (v: string | null) => void;
    setCollapsedStackFrames: (v: Set<string>) => void;
    simulationFromAddress: string;
    setSimulationFromAddress: (v: string) => void;
    setSimulationResult: (v: any) => void;
    setSimulationError: (v: string | null) => void;
    setIsSimulating: (v: boolean) => void;
  };

  // Function state
  functionState: {
    functionMode: string;
    generatedCallData: string;
    setDecodedCalldata: (v: any) => void;
    updateCallData: () => void;
    selectedFunctionType: "read" | "write" | null;
    setSelectedFunctionType: (v: "read" | "write" | null) => void;
    filteredReadFunctions: any[];
    filteredWriteFunctions: any[];
    setFunctionMode: (v: "function" | "raw") => void;
  };

  // Contract state
  contractState: {
    fetchRequestRef: React.MutableRefObject<number>;
    selectedNetwork: any;
    contractInfo: any;
    contractName: string;
    abiSource: string | null;
    saveContractToStorage: (info: any) => void;
  };

  // Token state
  tokenState: {
    tokenInfo: any;
  };

  // Mode
  isSimulationMode: boolean;
  address: string | undefined;
}

export function useSharedEffects(deps: SharedEffectsDeps): void {
  const {
    simState,
    functionState,
    contractState,
    tokenState,
    isSimulationMode,
    address,
  } = deps;

  // CSS keyframes injection
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      ${ContractResultFormatter.getCSS()}
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Simulation result -> frame expansion
  useEffect(() => {
    if (simState.simulationResult) {
      const artifacts = extractSimulationArtifacts(simState.simulationResult);
      const firstFrame = artifacts.callTree?.[0]?.frameKey ?? null;
      simState.setActiveSimulationFrame(firstFrame);
      simState.setCollapsedStackFrames(new Set());
    } else {
      simState.setActiveSimulationFrame(null);
      simState.setCollapsedStackFrames(new Set());
    }
  }, [simState.simulationResult]);

  // Auto-set simulation from address
  useEffect(() => {
    if (isSimulationMode && address && !simState.simulationFromAddress) {
      simState.setSimulationFromAddress(address);
    }
  }, [isSimulationMode, address, simState.simulationFromAddress]);

  // Clear simulation on mode switch
  useEffect(() => {
    if (!isSimulationMode) {
      simState.setSimulationResult(null);
      simState.setSimulationError(null);
      simState.setIsSimulating(false);
    }
  }, [isSimulationMode]);

  // Auto-decode calldata in raw mode
  useEffect(() => {
    if (functionState.functionMode !== "raw" || !functionState.generatedCallData || functionState.generatedCallData.length < 10) {
      functionState.setDecodedCalldata(null);
      return;
    }
    const selector = functionState.generatedCallData.slice(0, 10);
    let cancelled = false;
    const decodeCalldata = async () => {
      functionState.setDecodedCalldata({ functionName: "", signature: "", args: [], isLoading: true });
      try {
        const result = await lookupFunctionSignatures([selector]);
        if (cancelled) return;
        const signatures = result.result?.function?.[selector];
        if (signatures && signatures.length > 0) {
          const signature = signatures[0].name;
          const functionName = signature.split("(")[0];
          try {
            const iface = new ethers.utils.Interface([`function ${signature}`]);
            const decoded = iface.parseTransaction({ data: functionState.generatedCallData });
            const decodedArgs: string[] = [];
            for (let i = 0; i < decoded.args.length; i++) {
              const arg = decoded.args[i];
              if (ethers.BigNumber.isBigNumber(arg)) decodedArgs.push(arg.toString());
              else if (typeof arg === "bigint") decodedArgs.push(arg.toString());
              else if (Array.isArray(arg)) decodedArgs.push(JSON.stringify(arg));
              else decodedArgs.push(String(arg));
            }
            functionState.setDecodedCalldata({ functionName, signature, args: decodedArgs, isLoading: false });
          } catch {
            functionState.setDecodedCalldata({ functionName, signature, args: [], isLoading: false });
          }
        } else {
          functionState.setDecodedCalldata(null);
        }
      } catch {
        if (!cancelled) functionState.setDecodedCalldata(null);
      }
    };
    decodeCalldata();
    return () => { cancelled = true; };
  }, [functionState.functionMode, functionState.generatedCallData]);

  // Auto-update calldata
  useEffect(() => { functionState.updateCallData(); }, [functionState.updateCallData]);

  // Fetch request ref bump on network change
  useEffect(() => { contractState.fetchRequestRef.current += 1; }, [contractState.selectedNetwork?.id]);

  // Auto-save contract
  useEffect(() => {
    if (contractState.contractInfo && contractState.contractInfo.abi) {
      contractState.saveContractToStorage(contractState.contractInfo);
    }
  }, [contractState.contractInfo, contractState.contractName, contractState.abiSource, tokenState.tokenInfo, contractState.saveContractToStorage]);

  // Auto-select function type
  useEffect(() => {
    if (functionState.selectedFunctionType === null) {
      if (functionState.filteredReadFunctions.length > 0) functionState.setSelectedFunctionType("read");
      else if (functionState.filteredWriteFunctions.length > 0) functionState.setSelectedFunctionType("write");
    }
  }, [functionState.filteredReadFunctions.length, functionState.filteredWriteFunctions.length, functionState.selectedFunctionType]);
}
