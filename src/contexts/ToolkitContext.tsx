import React, { createContext, useContext, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

// Shared data interfaces
export interface DecodedTransactionData {
  functionName: string;
  functionSignature: string;
  contractAddress?: string;
  parameters: { name: string; type: string; value: any }[];
  abi?: any[];
  calldata: string;
}

export interface ContractData {
  address: string;
  abi: any[];
  name?: string;
  verified: boolean;
  functions?: string[];
}

export interface GeneratedCalldataData {
  contractAddress: string;
  functionName: string;
  calldata: string;
  abi: any[];
  parameters: Record<string, string>;
  ethValue?: string;
}

// Context state interface
interface ToolkitContextState {
  // Cross-tool sharing
  lastDecodedTransaction: DecodedTransactionData | null;
  lastGeneratedCalldata: GeneratedCalldataData | null;
  recentContractData: ContractData[];
  globalSignatures: Record<string, string>; // selector -> signature
  
  // Current working context
  currentContractAddress: string;
  currentABI: any[] | null;
  
  // Actions
  setDecodedTransaction: (data: DecodedTransactionData) => void;
  setGeneratedCalldata: (data: GeneratedCalldataData) => void;
  addContractData: (data: ContractData) => void;
  addSignature: (selector: string, signature: string) => void;
  setCurrentContract: (address: string, abi?: any[]) => void;
  clearContext: () => void;
  
  // Cross-tool actions
  transferToTransactionBuilder: (data: DecodedTransactionData | GeneratedCalldataData) => void;
  transferToDecoder: (calldata: string) => void;
  
  // Navigation actions
  navigateToBuilder: () => void;
  navigateToDecoder: () => void;
}

// Create context
const ToolkitContext = createContext<ToolkitContextState | undefined>(undefined);

// Provider component
export const ToolkitProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const [lastDecodedTransaction, setLastDecodedTransaction] = useState<DecodedTransactionData | null>(null);
  const [lastGeneratedCalldata, setLastGeneratedCalldata] = useState<GeneratedCalldataData | null>(null);
  const [recentContractData, setRecentContractData] = useState<ContractData[]>([]);
  const [globalSignatures, setGlobalSignatures] = useState<Record<string, string>>({});
  const [currentContractAddress, setCurrentContractAddress] = useState('');
  const [currentABI, setCurrentABI] = useState<any[] | null>(null);

  const setDecodedTransaction = (data: DecodedTransactionData) => {
    setLastDecodedTransaction(data);
    
    if (data.contractAddress && data.abi) {
      addContractData({
        address: data.contractAddress,
        abi: data.abi,
        verified: false,
        functions: data.abi.filter((item: any) => item.type === 'function').map((f: any) => f.name)
      });
    }
    
    const selector = data.calldata.slice(0, 10);
    addSignature(selector, data.functionSignature);
  };

  const setGeneratedCalldata = (data: GeneratedCalldataData) => {
    setLastGeneratedCalldata(data);
    
    addContractData({
      address: data.contractAddress,
      abi: data.abi,
      verified: false,
      functions: data.abi.filter((item: any) => item.type === 'function').map((f: any) => f.name)
    });
  };

  const addContractData = (data: ContractData) => {
    setRecentContractData(prev => {
      const filtered = prev.filter(item => item.address.toLowerCase() !== data.address.toLowerCase());
      return [data, ...filtered].slice(0, 10);
    });
  };

  const addSignature = (selector: string, signature: string) => {
    setGlobalSignatures(prev => ({
      ...prev,
      [selector.toLowerCase()]: signature
    }));
  };

  const setCurrentContract = (address: string, abi?: any[]) => {
    setCurrentContractAddress(address);
    if (abi) {
      setCurrentABI(abi);
    }
  };

  const clearContext = () => {
    setLastDecodedTransaction(null);
    setLastGeneratedCalldata(null);
    setCurrentContractAddress('');
    setCurrentABI(null);
  };

  // Navigation functions
  const navigateToBuilder = () => navigate('/builder');
  const navigateToDecoder = () => navigate('/database?tab=tools&tool=decoder');

  const transferToTransactionBuilder = (data: DecodedTransactionData | GeneratedCalldataData) => {
    if ('functionSignature' in data) {
      setLastDecodedTransaction(data);
    } else {
      setLastGeneratedCalldata(data);
    }
    navigateToBuilder();
  };

  const transferToDecoder = (calldata: string) => {
    navigateToDecoder();
  };

  const contextValue: ToolkitContextState = {
    lastDecodedTransaction,
    lastGeneratedCalldata,
    recentContractData,
    globalSignatures,
    currentContractAddress,
    currentABI,
    setDecodedTransaction,
    setGeneratedCalldata,
    addContractData,
    addSignature,
    setCurrentContract,
    clearContext,
    transferToTransactionBuilder,
    transferToDecoder,
    navigateToBuilder,
    navigateToDecoder,
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
    throw new Error('useToolkit must be used within a ToolkitProvider');
  }
  return context;
};

export default ToolkitContext;