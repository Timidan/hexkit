/**
 * StarknetSimulationContext — separate from <SimulationContext> (EVM) so the
 * shapes don't collide. Mirrors the EDB pattern: each new sim stamps a UUID,
 * lives in memory (this context) for the hot path, and is mirrored into
 * IndexedDB for cold-reload.
 *
 * Provider mounts at App-level (sibling of <SimulationProvider>) so all
 * Starknet pages can read/write the current sim entry.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { SimulateResponse } from "@/chains/starknet/simulatorTypes";
import type { StarknetNetwork } from "@/config/networkConfig";
import type { InvokeFormState } from "@/components/starknet/invokeRequestBuilder";

export type StarknetSimulationSource = "manual" | "trace" | "synthetic";

export interface StarknetSimulationEntry {
  id: string;
  source: StarknetSimulationSource;
  response: SimulateResponse;
  /** Present when source === "trace". */
  txHash?: string;
  chainId?: string | null;
  bridgeGitSha?: string | null;
  /** Replay sub-fields lifted from TxTraceView so the page can show them. */
  stateReplayPending?: boolean;
  stateReplayError?: Error | null;
  network: StarknetNetwork;
  /** Form snapshot for the manual sim path so Re-Simulate can clone it. */
  formSnapshot?: InvokeFormState;
  createdAt: number;
}

interface SetSimulationOptions {
  /** Used during cold-reload hydration to skip the IndexedDB save loop. */
  skipHistorySave?: boolean;
}

interface StarknetSimulationContextValue {
  current: StarknetSimulationEntry | null;
  setSimulation: (
    entry: StarknetSimulationEntry,
    options?: SetSimulationOptions,
  ) => void;
  clearSimulation: () => void;
}

const StarknetSimulationContext = createContext<
  StarknetSimulationContextValue | undefined
>(undefined);

export const StarknetSimulationProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [current, setCurrent] = useState<StarknetSimulationEntry | null>(null);

  const setSimulation = useCallback(
    (entry: StarknetSimulationEntry, options?: SetSimulationOptions) => {
      setCurrent(entry);

      if (!options?.skipHistorySave) {
        // Lazy import keeps the IndexedDB layer out of the hot path until a
        // sim actually lands.
        import("../services/StarknetSimulationHistoryService")
          .then(({ starknetSimulationHistoryService }) => {
            starknetSimulationHistoryService
              .saveSimulation(entry)
              .catch((err: unknown) => {
                console.error(
                  "[StarknetSimulation] Failed to save to history:",
                  err,
                );
              });
          })
          .catch((err: unknown) => {
            console.error(
              "[StarknetSimulation] Failed to load history service:",
              err,
            );
          });
      }
    },
    [],
  );

  const clearSimulation = useCallback(() => {
    setCurrent(null);
  }, []);

  const value = useMemo<StarknetSimulationContextValue>(
    () => ({ current, setSimulation, clearSimulation }),
    [current, setSimulation, clearSimulation],
  );

  // Dev-only: expose setSimulation on window so playwriter / smoke tests
  // can seed the context without going through the form. Guarded by
  // `import.meta.env.DEV` so the production bundle never ships this hook.
  useEffect(() => {
    if (import.meta.env.DEV && typeof window !== "undefined") {
      (window as unknown as Record<string, unknown>).__starknetSimulation = {
        setSimulation,
        clearSimulation,
      };
      return () => {
        delete (window as unknown as Record<string, unknown>).__starknetSimulation;
      };
    }
    return undefined;
  }, [setSimulation, clearSimulation]);

  return (
    <StarknetSimulationContext.Provider value={value}>
      {children}
    </StarknetSimulationContext.Provider>
  );
};

export function useStarknetSimulation(): StarknetSimulationContextValue {
  const ctx = useContext(StarknetSimulationContext);
  if (!ctx) {
    throw new Error(
      "useStarknetSimulation must be used within StarknetSimulationProvider",
    );
  }
  return ctx;
}
