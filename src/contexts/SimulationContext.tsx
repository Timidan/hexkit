import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import type { SimulationResult } from "../types/transaction";
import type { TraceContract } from "../utils/traceAddressCollector";
import type { DecodedTraceRow } from "../utils/traceDecoder";
import { buildOpcodeTraceFromSnapshots } from "../utils/simulationArtifacts";
import type { EvmChainKey } from "../chains/types/evm";
import { toEvmChainKey } from "../chains/types/evm";
import type { StarknetChainId, StarknetChainKey } from "../chains/types/starknet";
import type { SvmChainKey, SvmCluster } from "../chains/types/svm";

/**
 * Metadata from decoded trace that needs to persist across page refreshes.
 * This is stored separately from decodedTraceRows to avoid losing data
 * when loading from history.
 */
export interface DecodedTraceMeta {
  sourceLines: string[];
  callMeta?: any;
  rawEvents?: any[];
  implementationToProxy?: Map<string, string>;
}

/**
 * Fields that are safe to strip from in-memory rawTrace.
 * We preserve snapshots/opcode maps to keep trace decoding deterministic after reloads.
 */
const HEAVY_TRACE_FIELDS = [
  '__rawText',      // Raw JSON text stored for gas extraction (entire response as string)
];

/**
 * Strip only non-essential raw text from a simulation result.
 */
function stripHeavyTraceDataForRuntime(result: SimulationResult): SimulationResult {
  if (!result || typeof result !== 'object') return result;

  const stripped = { ...result } as any;

  if (stripped.rawTrace && typeof stripped.rawTrace === 'object') {
    const rawTrace = { ...stripped.rawTrace };

    for (const field of HEAVY_TRACE_FIELDS) {
      if (field in rawTrace) {
        delete rawTrace[field];
      }
    }

    stripped.rawTrace = rawTrace;
  }

  return stripped as SimulationResult;
}

// Starknet/Svm branches are scaffolds — EVM is the only one consumers
// currently exercise, the public SimulationContractContext alias points
// at EvmSimulationContractContext.
export interface BaseSimulationContractContext {
  simulationOrigin?: 'manual' | 'tx-hash-replay';
  debugEnabled?: boolean;
  sourceTexts?: Record<string, string>;
}

export interface EvmSimulationContractContext extends BaseSimulationContractContext {
  chainFamily: 'evm';
  chainKey: EvmChainKey;
  address: string;
  name?: string; // Contract name from verification or metadata
  abi: any[] | null;
  abiSource?: string; // Source that provided the ABI (e.g., "etherscan", "sourcify", "blockscout")
  networkId: number; // legacy alias for chainId — retained during migration
  networkName: string;
  // Re-simulation support: store function selection and args
  selectedFunction?: string; // Function name that was called
  selectedFunctionType?: "read" | "write"; // Whether it was a read or write function
  functionInputs?: Record<string, string>; // Input values keyed by input name
  calldata?: string; // Generated calldata
  fromAddress?: string; // Sender address used in simulation
  ethValue?: string; // ETH value if any
  blockOverride?: string; // Block number override for simulation
  // Token detection info to preserve
  tokenType?: "ERC20" | "ERC721" | "ERC1155" | "ERC777" | "ERC4626" | null;
  tokenSymbol?: string;
  tokenDecimals?: number;
  // Proxy/Diamond info for resimulation
  proxyType?: string; // e.g., "EIP1967", "DiamondProxy", "TransparentProxy"
  implementationAddress?: string; // For standard proxies
  implementations?: string[]; // For multi-implementation proxies
  diamondFacets?: Array<{
    address: string;
    name?: string;
    selectors?: string[];
    abi?: any[];
  }>; // For Diamond (EIP-2535) contracts
  // Replay metadata (only set when simulationOrigin === 'tx-hash-replay')
  replayTxHash?: string; // The original transaction hash that was replayed
  // Trace contracts: resolved sources for all contracts in the trace
  traceContracts?: Map<string, TraceContract>;
}

export interface StarknetSimulationContractContext extends BaseSimulationContractContext {
  chainFamily: 'starknet';
  chainKey: StarknetChainKey;
  starknetChainId: StarknetChainId;
  contractAddress: string;
  classHash?: string;
  abi?: unknown[] | null;
  entrypoint?: string;
  calldata?: string[];
  accountAddress?: string;
  maxFee?: string;
  nonce?: string;
}

export interface SvmSimulationContractContext extends BaseSimulationContractContext {
  chainFamily: 'svm';
  chainKey: SvmChainKey;
  cluster: SvmCluster;
  programId: string;
  idl?: unknown | null;
  instructionName?: string;
  instructionData?: string;
  accounts?: Array<{ pubkey: string; isSigner?: boolean; isWritable?: boolean }>;
  payer?: string;
  recentBlockhash?: string;
  computeUnitLimit?: number;
}

/** Cross-family simulation context union. Narrow with isEvmContext/isStarknetContext/isSvmContext. */
export type AnyChainSimulationContractContext =
  | EvmSimulationContractContext
  | StarknetSimulationContractContext
  | SvmSimulationContractContext;

// Alias to EVM branch so existing consumers keep compiling without forcing
// narrowing. Switch to AnyChainSimulationContractContext once adapters
// narrow at their own boundary.
export type SimulationContractContext = EvmSimulationContractContext;

export function isEvmContext(
  ctx: AnyChainSimulationContractContext | null | undefined,
): ctx is EvmSimulationContractContext {
  return !!ctx && ctx.chainFamily === 'evm';
}

export function isStarknetContext(
  ctx: AnyChainSimulationContractContext | null | undefined,
): ctx is StarknetSimulationContractContext {
  return !!ctx && ctx.chainFamily === 'starknet';
}

export function isSvmContext(
  ctx: AnyChainSimulationContractContext | null | undefined,
): ctx is SvmSimulationContractContext {
  return !!ctx && ctx.chainFamily === 'svm';
}

interface SetSimulationOptions {
  skipHistorySave?: boolean; // Don't save to IndexedDB (e.g., when viewing existing)
}

interface SimulationContextValue {
  currentSimulation: SimulationResult | null;
  contractContext: SimulationContractContext | null;
  setSimulation: (result: SimulationResult, contractContext?: SimulationContractContext, options?: SetSimulationOptions) => void;
  clearSimulation: () => void;
  simulationId: string | null;
  setSimulationId: (id: string) => void;
  /** Update trace contracts (resolved sources for all addresses in trace) */
  setTraceContracts: (contracts: Map<string, TraceContract>) => void;
  /** Update source texts from decoded trace (EDB artifacts) */
  setSourceTexts: (sourceTexts: Record<string, string>) => void;
  /** Decoded trace rows from traceDecoder - shared between SimulationResultsPage and DebugWindow */
  decodedTraceRows: DecodedTraceRow[] | null;
  setDecodedTraceRows: (rows: DecodedTraceRow[]) => void;
  /** Decoded trace metadata - persisted separately to survive page refresh */
  decodedTraceMeta: DecodedTraceMeta | null;
  setDecodedTraceMeta: (meta: DecodedTraceMeta | null) => void;
  /** Strip heavy trace data from currentSimulation after decoding is complete */
  stripHeavyDataFromCurrentSimulation: () => void;
}

const SimulationContext = createContext<SimulationContextValue | undefined>(
  undefined
);

const STORAGE_KEY = "web3-toolkit:simulation-state";

export const SimulationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // Memory-only state - no localStorage persistence (use History for past simulations)
  const [currentSimulation, setCurrentSimulation] = useState<SimulationResult | null>(null);
  const [contractContext, setContractContext] = useState<SimulationContractContext | null>(null);
  const [simulationId, setSimulationId] = useState<string | null>(null);
  // Decoded trace rows - shared between SimulationResultsPage and DebugWindow
  const [decodedTraceRows, setDecodedTraceRowsState] = useState<DecodedTraceRow[] | null>(null);
  // Decoded trace metadata - persisted separately to survive page refresh
  const [decodedTraceMeta, setDecodedTraceMetaState] = useState<DecodedTraceMeta | null>(null);

  // Clear old localStorage data on mount to free space
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore errors
      }
    }
  }, []);

  const setSimulation = useCallback((result: SimulationResult, contractCtx?: SimulationContractContext, options?: SetSimulationOptions) => {
    let nextResult = result;
    if (result?.rawTrace && typeof result.rawTrace === 'object') {
      const rawTrace = result.rawTrace as Record<string, any>;
      const hasOpcodeTrace = Array.isArray(rawTrace.opcodeTrace) && rawTrace.opcodeTrace.length > 0;
      if (!hasOpcodeTrace) {
        const opcodeTrace = buildOpcodeTraceFromSnapshots(rawTrace);
        if (opcodeTrace.length > 0) {
          nextResult = {
            ...result,
            rawTrace: {
              ...rawTrace,
              opcodeTrace,
            },
          };
        }
      }
    }

    setCurrentSimulation(nextResult);
    if (contractCtx) {
      // Defensive backfill: legacy contexts (from IndexedDB rows predating the
      // chainFamily/chainKey migration) may lack these fields. Stamp them as
      // EVM at the boundary so downstream code can trust the discriminator.
      const chainFamily = contractCtx.chainFamily ?? 'evm';
      const chainKey = contractCtx.chainKey ?? toEvmChainKey(contractCtx.networkId ?? 1);
      setContractContext({ ...contractCtx, chainFamily, chainKey });
    }
    setDecodedTraceRowsState(null);
    setDecodedTraceMetaState(null);

    const id =
      (nextResult as any).simulationId ||
      (nextResult as any).transactionHash ||
      (nextResult as any).txHash ||
      crypto.randomUUID();
    setSimulationId(id);

    if (!options?.skipHistorySave) {
      import('../services/SimulationHistoryService').then(({ simulationHistoryService }) => {
        simulationHistoryService.saveSimulation(nextResult, contractCtx || null, id).catch(err => {
          console.error("[Simulation] Failed to save to history:", err);
        });
      }).catch(err => {
        console.error("[Simulation] Failed to load history service:", err);
      });
    }
  }, []);

  /**
   * Strip heavy trace data from currentSimulation after it's been decoded.
   * Call this from SimulationResultsPage after decodedTraceRows is computed.
   */
  const stripHeavyDataFromCurrentSimulation = useCallback(() => {
    setCurrentSimulation(prev => {
      if (!prev) return prev;
      return stripHeavyTraceDataForRuntime(prev);
    });
  }, []);

  const clearSimulation = useCallback(() => {
    setCurrentSimulation(null);
    setContractContext(null);
    setSimulationId(null);
    setDecodedTraceRowsState(null);
    setDecodedTraceMetaState(null);
  }, []);

  const setDecodedTraceRows = useCallback((rows: DecodedTraceRow[]) => {
    setDecodedTraceRowsState(rows);
  }, []);

  const setDecodedTraceMeta = useCallback((meta: DecodedTraceMeta | null) => {
    setDecodedTraceMetaState(meta);
  }, []);

  const setTraceContracts = useCallback((contracts: Map<string, TraceContract>) => {
    setContractContext(prev => {
      if (!prev) return prev;
      return { ...prev, traceContracts: contracts };
    });
  }, []);

  const setSourceTexts = useCallback((sourceTexts: Record<string, string>) => {
    setContractContext(prev => {
      if (!prev) return prev;
      return { ...prev, sourceTexts };
    });
  }, []);

  const providerValue = useMemo<SimulationContextValue>(() => ({
    currentSimulation,
    contractContext,
    setSimulation,
    clearSimulation,
    simulationId,
    setSimulationId,
    setTraceContracts,
    setSourceTexts,
    decodedTraceRows,
    setDecodedTraceRows,
    decodedTraceMeta,
    setDecodedTraceMeta,
    stripHeavyDataFromCurrentSimulation,
  }), [
    currentSimulation,
    contractContext,
    setSimulation,
    clearSimulation,
    simulationId,
    setSimulationId,
    setTraceContracts,
    setSourceTexts,
    decodedTraceRows,
    setDecodedTraceRows,
    decodedTraceMeta,
    setDecodedTraceMeta,
    stripHeavyDataFromCurrentSimulation,
  ]);

  return (
    <SimulationContext.Provider value={providerValue}>
      {children}
    </SimulationContext.Provider>
  );
};

export const useSimulation = () => {
  const context = useContext(SimulationContext);
  if (!context) {
    throw new Error("useSimulation must be used within SimulationProvider");
  }
  return context;
};
