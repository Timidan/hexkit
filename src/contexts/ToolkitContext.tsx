import React, {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

// Shared data interfaces
export interface DecodedTransactionData {
  functionName: string;
  functionSignature: string;
  contractAddress?: string;
  parameters: { name: string; type: string; value: any }[];
  abi?: any[];
  calldata: string;
}

// Context state interface
interface ToolkitContextState {
  lastDecodedTransaction: DecodedTransactionData | null;
  setDecodedTransaction: (data: DecodedTransactionData) => void;
}

// Create context
const ToolkitContext = createContext<ToolkitContextState | undefined>(
  undefined,
);

// Provider component
export const ToolkitProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [lastDecodedTransaction, setLastDecodedTransaction] =
    useState<DecodedTransactionData | null>(null);

  const setDecodedTransaction = (data: DecodedTransactionData) => {
    setLastDecodedTransaction(data);
  };

  const contextValue: ToolkitContextState = {
    lastDecodedTransaction,
    setDecodedTransaction,
  };

  return (
    <ToolkitContext.Provider value={contextValue}>
      {children}
    </ToolkitContext.Provider>
  );
};

// Custom hook to use the context
export const useToolkit = (): ToolkitContextState => {
  const context = useContext(ToolkitContext);
  if (!context) {
    throw new Error("useToolkit must be used within a ToolkitProvider");
  }
  return context;
};

export default ToolkitContext;
