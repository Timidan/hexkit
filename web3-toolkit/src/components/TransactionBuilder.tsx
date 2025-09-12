import React, { useState, useEffect, useMemo } from 'react';
import { ethers } from 'ethers';
import { 
  Building2, 
  Settings, 
  Wallet, 
  FileText, 
  Import, 
  Download, 
  CheckCircle,
  Search,
  Link,
  Rocket,
  Eye,
  Loader,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Clock,
  Layers,
  Cog,
  Database,
  Sparkles,
  Diamond,
  Code2,
  Workflow,
  Menu,
  X,
  AlertCircle,
  Zap
} from 'lucide-react';
import type { WalletInfo, TransactionRequest, SimulationResult, TransactionReceipt } from '../types/transaction';
import type { Chain } from '../types';
import SimpleWalletConnection from './SimpleWalletConnection';
import DiamondFunctionCaller from './DiamondFunctionCaller';
import ABIFetcher from './ABIFetcher';
import ContractInfoDisplay from './ContractInfoDisplay';
import { SUPPORTED_CHAINS } from '../utils/chains';
import { simulateTransaction } from '../utils/transactionSimulation';
import { parseTransactionError, formatErrorForUser } from '../utils/errorParser';
import { useToolkit } from '../contexts/ToolkitContext';
import { 
  type DiamondInfo, 
  type DiamondFacet,
  detectDiamondContract, 
  getDetailedFacetInfo, 
  buildDiamondABI 
} from '../utils/diamondStandard';
import { fetchContractABIMultiSource } from '../utils/multiSourceAbiFetcher';
import { analyzeContractWithWhatsABI, createFunctionStubsFromSelectors } from '../utils/whatsabiFetcher';
import '../styles/EnhancedStructInput.css';

// Common contract functions to filter out for diamonds (focus on facet-specific functions)
const STANDARD_ERC_FUNCTIONS = [
  'balanceOf', 'transfer', 'transferFrom', 'approve', 'allowance',
  'totalSupply', 'decimals', 'symbol', 'name', 'owner',
  'supportsInterface'
];

export default function TransactionBuilder() {
  const toolkit = useToolkit();
  const [currentChain, setCurrentChain] = useState<Chain>(SUPPORTED_CHAINS[0]);

  // Wallet connection state
  const [connectedWallet, setConnectedWallet] = useState<WalletInfo | null>(null);

  // Contract and ABI state
  const [contractAddress, setContractAddress] = useState<string>(toolkit?.currentContractAddress || '');
  const [abi, setAbi] = useState<string>('');
  const [contractMetadata, setContractMetadata] = useState<any>(null);

  // Function execution state
  const [selectedFunction, setSelectedFunction] = useState<string>('');
  const [functionInputs, setFunctionInputs] = useState<Record<string, any>>({});
  const [functionTab, setFunctionTab] = useState<'read' | 'write'>('read');
  const [ethValue, setEthValue] = useState<string>('');
  const [gasLimit, setGasLimit] = useState<string>('');

  // Diamond Standard support state
  const [diamondInfo, setDiamondInfo] = useState<DiamondInfo | null>(null);
  const [selectedFacet, setSelectedFacet] = useState<string>('');
  const [facetGridExpanded, setFacetGridExpanded] = useState<boolean>(true);
  const [settingsDropdownOpen, setSettingsDropdownOpen] = useState<boolean>(false);
  const [etherscanApiKey, setEtherscanApiKey] = useState<string>('');
  const [isDetectingDiamond, setIsDetectingDiamond] = useState(false);
  const [groupedFunctions, setGroupedFunctions] = useState<Record<string, any[]>>({});
  const [facetLoadingProgress, setFacetLoadingProgress] = useState({ current: 0, total: 0 });

  // Transaction execution state
  const [builtTransaction, setBuiltTransaction] = useState<TransactionRequest | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);
  const [error, setError] = useState<string>('');
  const [showImportOptions, setShowImportOptions] = useState<boolean>(false);
  const [readOnlyResult, setReadOnlyResult] = useState<any>(null);
  const [isExecutingReadOnly, setIsExecutingReadOnly] = useState(false);

  // Memoized provider
  const memoizedProvider = useMemo(() => {
    const network = {
      name: currentChain.name,
      chainId: currentChain.id
    };
    return new ethers.providers.JsonRpcProvider(currentChain.rpcUrl, network);
  }, [currentChain]);

  // Helper functions
  const isReadOnlyFunction = useMemo(() => {
    if (!abi || !selectedFunction) return false;
    try {
      const parsedAbi = JSON.parse(abi);
      const func = parsedAbi.find((item: any) => item.type === 'function' && item.name === selectedFunction);
      return func?.stateMutability === 'view' || func?.stateMutability === 'pure';
    } catch {
      return false;
    }
  }, [abi, selectedFunction]);

  const formatValue = (value: any): string => {
    if (ethers.BigNumber.isBigNumber(value)) {
      return value.toString();
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  const resetInputs = () => {
    setFunctionInputs({});
  };

  // Auto-execute read-only functions when inputs change
  useEffect(() => {
    if (isReadOnlyFunction && selectedFunction && contractAddress && abi) {
      executeReadOnlyFunction();
    }
  }, [selectedFunction, functionInputs, isReadOnlyFunction]);

  // Diamond detection effect with enhanced workflow
  useEffect(() => {
    if (!contractAddress || !memoizedProvider) {
      return;
    }

    const detectDiamond = async () => {
      if (contractAddress.length < 42) {
        console.log('❌ Invalid contract address length, skipping diamond detection');
        return;
      }

      if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
        console.log('❌ Invalid contract address format, skipping diamond detection');
        return;
      }
      
      console.log('✅ Contract address found, proceeding with diamond detection:', contractAddress);

      setIsDetectingDiamond(true);
      
      try {
        // Phase 1: Basic diamond detection
        const result = await detectDiamondContract(contractAddress, memoizedProvider);
        setDiamondInfo(result);
        
        if (result.isDiamond && result.facets.length > 0) {
          console.log(`💎 Diamond detected with ${result.facets.length} facets`);
          
          // Phase 2: Enhanced facet processing
          setFacetLoadingProgress({ current: 0, total: result.facets.length });
          
          try {
            const detailedFacets = await getDetailedFacetInfo(contractAddress, result.facets, memoizedProvider);
            
            // Update diamond info with detailed facets
            const enhancedDiamondInfo = { ...result, facets: detailedFacets };
            setDiamondInfo(enhancedDiamondInfo);
            
            // Phase 3: Build comprehensive ABI
            const diamondABI = await buildDiamondABI(contractAddress, detailedFacets, memoizedProvider);
            
            if (!abi && diamondABI) {
              setAbi(diamondABI);
            }
            
            // Phase 4: Process functions for grouped display
            try {
              const parsedAbi = JSON.parse(diamondABI || '[]');
              const functionGroups: Record<string, any[]> = {};
              
              detailedFacets.forEach(facet => {
                if (facet.functionSelectors && facet.functionSelectors.length > 0) {
                  const facetFunctions = parsedAbi.filter((item: any) => 
                    item.type === 'function' && 
                    facet.functionSelectors.some((selector: string) => {
                      const funcSignature = `${item.name}(${item.inputs?.map((input: any) => input.type).join(',') || ''})`;
                      const calculatedSelector = ethers.utils.id(funcSignature).slice(0, 10);
                      return calculatedSelector === selector;
                    })
                  );
                  
                  if (facetFunctions.length > 0) {
                    functionGroups[facet.facetName || facet.facetAddress] = facetFunctions.map((func: any) => ({
                      ...func,
                      facetAddress: facet.facetAddress,
                      facetName: facet.facetName
                    }));
                  }
                }
              });
              
              setGroupedFunctions(functionGroups);
              console.log(`🔧 Processed ${Object.keys(functionGroups).length} facet function groups`);
              
            } catch (abiError) {
              console.warn('Error processing diamond ABI for grouping:', abiError);
            }
            
            setFacetLoadingProgress({ current: result.facets.length, total: result.facets.length });
            console.log(`✅ Enhanced diamond workflow completed: ${detailedFacets.length} facets processed`);
            
          } catch (enhancedError) {
            console.error('Enhanced diamond processing failed, using basic info:', enhancedError);
          }
        }
        
      } catch (error) {
        console.error('Error during diamond detection:', error);
        setDiamondInfo(null);
      } finally {
        setIsDetectingDiamond(false);
        setFacetLoadingProgress({ current: 0, total: 0 });
      }
    };

    detectDiamond();
  }, [contractAddress, memoizedProvider, abi, currentChain.id, etherscanApiKey]);

  // Read-only function execution
  const executeReadOnlyFunction = async (): Promise<void> => {
    if (!abi || !selectedFunction || !contractAddress || !isReadOnlyFunction) {
      return;
    }

    setIsExecutingReadOnly(true);
    setReadOnlyResult(null);
    setError('');

    try {
      const contractAbi = JSON.parse(abi);
      const contract = new ethers.Contract(contractAddress, contractAbi, memoizedProvider);

      const functionAbi = contractAbi.find((item: any) => 
        item.type === 'function' && item.name === selectedFunction
      );

      if (!functionAbi) {
        setError(`Function ${selectedFunction} not found in ABI`);
        return;
      }

      const inputs = functionAbi.inputs?.map((input: any, index: number) => {
        const key = `${selectedFunction}_${index}`;
        const value = functionInputs[key];
        
        try {
          if (typeof value === 'string' && value.trim()) {
            if (input.type.includes('[]')) {
              return JSON.parse(value);
            }
            if (input.type.includes('int')) {
              return ethers.BigNumber.from(value);
            }
          }
          return value || '';
        } catch {
          return value || '';
        }
      }) || [];

      console.log(`Calling ${selectedFunction} with inputs:`, inputs);
      const result = await contract[selectedFunction](...inputs);

      let formattedResult;
      if (ethers.BigNumber.isBigNumber(result)) {
        formattedResult = {
          type: 'BigNumber',
          value: result.toString(),
          hex: result.toHexString()
        };
      } else if (Array.isArray(result)) {
        formattedResult = result.map((item: any, index: number) => ({
          index,
          value: ethers.BigNumber.isBigNumber(item) ? item.toString() : item,
          type: typeof item
        }));
      } else if (typeof result === 'object' && result !== null) {
        formattedResult = {
          ...result,
          formatted: JSON.stringify(result, (key, value) => 
            ethers.BigNumber.isBigNumber(value) ? value.toString() : value, 2
          )
        };
      } else {
        formattedResult = result;
      }

      setReadOnlyResult(formattedResult);
      
    } catch (error) {
      console.error('Read-only execution failed:', error);
      setError(`Read-only execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExecutingReadOnly(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Settings */}
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Transaction Builder
          </h2>
          
          {/* Settings Dropdown */}
          <div className="relative">
            <button
              onClick={() => setSettingsDropdownOpen(!settingsDropdownOpen)}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              <Settings className="w-4 h-4" />
              Settings
              <ChevronDown className={`w-4 h-4 transition-transform ${settingsDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {settingsDropdownOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-gray-900">Etherscan API Settings</h3>
                    <button
                      onClick={() => setSettingsDropdownOpen(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Etherscan API Key
                      </label>
                      <input
                        type="password"
                        value={etherscanApiKey}
                        onChange={(e) => setEtherscanApiKey(e.target.value)}
                        placeholder="Enter your Etherscan API key for enhanced features"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      API key enables enhanced contract verification, source code access, and faster ABI fetching.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Contract Address Input */}
        <div className="mb-4">
          <label htmlFor="contractAddress" className="block text-sm font-medium text-gray-700 mb-1">
            Contract Address
          </label>
          <input
            id="contractAddress"
            type="text"
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value)}
            placeholder="0x..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* ABI Fetcher Component */}
        <div className="mb-4">
          <ABIFetcher
            onABIFetched={(fetchedAbi, metadata, chain) => {
              setAbi(fetchedAbi);
              setContractMetadata(metadata);
              if (chain && chain !== currentChain) {
                setCurrentChain(chain);
              }
            }}
            initialContractAddress={contractAddress}
            onContractAddressChange={setContractAddress}
            etherscanApiKey={etherscanApiKey}
          />
        </div>

        {/* ABI Input */}
        <div className="mb-4">
          <label htmlFor="abi" className="block text-sm font-medium text-gray-700 mb-1">
            Contract ABI
          </label>
          <textarea
            id="abi"
            value={abi}
            onChange={(e) => setAbi(e.target.value)}
            placeholder="Paste ABI JSON here or use ABI Fetcher above..."
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
          />
        </div>

        {/* Contract Info Display */}
        {contractMetadata && (
          <ContractInfoDisplay 
            abi={abi}
            contractAddress={contractAddress}
            chain={currentChain}
            contractMetadata={contractMetadata}
          />
        )}
      </div>

      {/* Diamond Contract Detection and Info */}
      {isDetectingDiamond && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Loader className="w-4 h-4 animate-spin text-yellow-600" />
            <span className="text-sm text-yellow-700">Detecting diamond contract pattern...</span>
          </div>
          {facetLoadingProgress.total > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-yellow-600 mb-1">
                <span>Processing facets...</span>
                <span>{facetLoadingProgress.current}/{facetLoadingProgress.total}</span>
              </div>
              <div className="w-full bg-yellow-200 rounded-full h-2">
                <div 
                  className="bg-yellow-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(facetLoadingProgress.current / facetLoadingProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Diamond Info Display */}
      {diamondInfo && diamondInfo.isDiamond && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg">
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Diamond className="w-5 h-5 text-purple-600" />
                <span className="text-lg font-medium text-purple-800">Diamond Contract Detected</span>
              </div>
              <button
                onClick={() => setFacetGridExpanded(!facetGridExpanded)}
                className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700"
              >
                {facetGridExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                {facetGridExpanded ? 'Collapse' : 'Expand'} Facets
              </button>
            </div>
            
            <div className="mt-3 flex items-center gap-6 text-sm text-purple-700">
              <div className="flex items-center gap-1">
                <Layers className="w-4 h-4" />
                <span>{diamondInfo.facets.length} facets</span>
              </div>
              <div className="flex items-center gap-1">
                <Code2 className="w-4 h-4" />
                <span>{diamondInfo.totalFunctions} functions</span>
              </div>
              {Object.keys(groupedFunctions).length > 0 && (
                <div className="flex items-center gap-1">
                  <Workflow className="w-4 h-4" />
                  <span>{Object.keys(groupedFunctions).length} function groups</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Facet Grid */}
          {facetGridExpanded && (
            <div className="border-t border-purple-200 p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {diamondInfo.facets.map((facet, index) => (
                  <div 
                    key={facet.facetAddress} 
                    className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                      selectedFacet === facet.facetAddress 
                        ? 'border-purple-400 bg-purple-100' 
                        : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50'
                    }`}
                    onClick={() => setSelectedFacet(
                      selectedFacet === facet.facetAddress ? '' : facet.facetAddress
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-2 h-2 rounded-full ${facet.verified ? 'bg-green-400' : 'bg-yellow-400'}`} />
                          <span className="font-medium text-sm text-gray-900 truncate">
                            {facet.facetName || `Facet ${index + 1}`}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 font-mono break-all">
                          {facet.facetAddress}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {facet.functionSelectors?.length || 0} functions
                        </p>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(facet.facetAddress);
                          }}
                          className="text-gray-400 hover:text-gray-600"
                          title="Copy address"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(`${currentChain.blockExplorer}/address/${facet.facetAddress}`, '_blank');
                          }}
                          className="text-gray-400 hover:text-gray-600"
                          title="View on block explorer"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Function Selection and Execution */}
      {abi && (
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Function Interaction
          </h3>
          
          {/* Function Selection */}
          <div className="mb-4">
            <label htmlFor="function" className="block text-sm font-medium text-gray-700 mb-1">
              Select Function
            </label>
            <select
              id="function"
              value={selectedFunction}
              onChange={(e) => setSelectedFunction(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select a function...</option>
              {(() => {
                try {
                  const parsedAbi = JSON.parse(abi);
                  
                  // Group functions by facet if we have diamond info
                  if (diamondInfo?.isDiamond && Object.keys(groupedFunctions).length > 0) {
                    const options: React.ReactNode[] = [];
                    
                    Object.entries(groupedFunctions).forEach(([facetName, functions]) => {
                      if (functions.length > 0) {
                        options.push(
                          <optgroup key={facetName} label={`${facetName} (${functions.length} functions)`}>
                            {functions.map((func: any) => (
                              <option key={`${facetName}-${func.name}`} value={func.name}>
                                {func.name}({func.inputs?.map((input: any) => `${input.type} ${input.name}`).join(', ')})
                              </option>
                            ))}
                          </optgroup>
                        );
                      }
                    });
                    
                    return options;
                  } else {
                    // Regular contract - show all functions
                    return parsedAbi
                      .filter((item: any) => item.type === 'function')
                      .map((func: any) => (
                        <option key={func.name} value={func.name}>
                          {func.name}({func.inputs?.map((input: any) => `${input.type} ${input.name}`).join(', ')})
                        </option>
                      ));
                  }
                } catch {
                  return [];
                }
              })()}
            </select>
          </div>

          {/* Function Inputs */}
          {selectedFunction && (() => {
            try {
              const parsedAbi = JSON.parse(abi);
              const func = parsedAbi.find((item: any) => item.type === 'function' && item.name === selectedFunction);
              if (func && func.inputs && func.inputs.length > 0) {
                return (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Function Parameters</h4>
                    <div className="space-y-3">
                      {func.inputs.map((input: any, index: number) => (
                        <div key={index}>
                          <label className="block text-sm font-medium text-gray-600 mb-1">
                            {input.name || `param${index}`} ({input.type})
                          </label>
                          <input
                            type="text"
                            className="w-full p-2 border rounded"
                            value={functionInputs[`${selectedFunction}_${index}`] || ''}
                            onChange={(e) => setFunctionInputs(prev => ({
                              ...prev,
                              [`${selectedFunction}_${index}`]: e.target.value
                            }))}
                            placeholder={`Enter ${input.type} value`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
            } catch {
              return null;
            }
          })()}

          {/* Read-only function execution */}
          {isReadOnlyFunction && selectedFunction && contractAddress && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-800">Read-only Function Result</span>
                {isExecutingReadOnly && <Loader className="w-4 h-4 animate-spin text-blue-600" />}
              </div>
              
              {readOnlyResult !== null && (
                <div className="mt-2">
                  <pre className="text-sm bg-white p-3 rounded border overflow-auto max-h-40">
                    {formatValue(readOnlyResult)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Diamond Function Caller Integration */}
          {diamondInfo?.isDiamond && Object.keys(groupedFunctions).length > 0 && (
            <div className="mt-6">
              <DiamondFunctionCaller
                contractAddress={contractAddress}
                chain={currentChain}
                functions={Object.values(groupedFunctions).flat()}
                provider={memoizedProvider}
                connectedWallet={connectedWallet || undefined}
              />
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>
      )}

      {/* Wallet Connection */}
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
          <Wallet className="w-5 h-5" />
          Wallet Connection
        </h3>
        <SimpleWalletConnection 
          onWalletConnect={setConnectedWallet}
          onWalletDisconnect={() => setConnectedWallet(null)}
          connectedWallet={connectedWallet || undefined}
        />
      </div>
    </div>
  );
}