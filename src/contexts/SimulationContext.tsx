import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { SimulationResult } from "../types/transaction";

export interface SimulationContractContext {
  address: string;
  name?: string; // Contract name from verification or metadata
  abi: any[] | null;
  networkId: number;
  networkName: string;
}

interface SimulationContextValue {
  currentSimulation: SimulationResult | null;
  contractContext: SimulationContractContext | null;
  setSimulation: (result: SimulationResult, contractContext?: SimulationContractContext) => void;
  clearSimulation: () => void;
  simulationId: string | null;
  setSimulationId: (id: string) => void;
}

const SimulationContext = createContext<SimulationContextValue | undefined>(
  undefined
);

const STORAGE_KEY = "web3-toolkit:simulation-state";

// Helper to safely parse localStorage
const loadFromStorage = () => {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored);

    // Check if data is stale (older than 24 hours)
    const timestamp = parsed.timestamp || 0;
    const isStale = Date.now() - timestamp > 24 * 60 * 60 * 1000;

    if (isStale) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

export const SimulationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // Initialize from localStorage
  const [currentSimulation, setCurrentSimulation] =
    useState<SimulationResult | null>(() => {
      const stored = loadFromStorage();
      return stored?.currentSimulation || null;
    });

  const [contractContext, setContractContext] =
    useState<SimulationContractContext | null>(() => {
      const stored = loadFromStorage();
      return stored?.contractContext || null;
    });

  const [simulationId, setSimulationId] = useState<string | null>(() => {
    const stored = loadFromStorage();
    return stored?.simulationId || null;
  });

  const setSimulation = useCallback((result: SimulationResult, contractCtx?: SimulationContractContext) => {
    setCurrentSimulation(result);
    if (contractCtx) {
      setContractContext(contractCtx);
    }
    // Generate a simple ID if not provided
    const id =
      (result as any).simulationId ||
      (result as any).transactionHash ||
      (result as any).txHash ||
      Date.now().toString();
    setSimulationId(id);
  }, []);

  const clearSimulation = useCallback(() => {
    setCurrentSimulation(null);
    setContractContext(null);
    setSimulationId(null);
    // Clear from localStorage
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Persist to localStorage whenever state changes
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (currentSimulation || contractContext || simulationId) {
      const data = {
        currentSimulation,
        contractContext,
        simulationId,
        timestamp: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }, [currentSimulation, contractContext, simulationId]);

  return (
    <SimulationContext.Provider
      value={{
        currentSimulation,
        contractContext,
        setSimulation,
        clearSimulation,
        simulationId,
        setSimulationId,
      }}
    >
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
