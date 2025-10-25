import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  Building2,
  Diamond,
  Search,
  Loader,
  CheckCircle,
  XCircle,
  Eye,
  ExternalLink,
  Zap,
  Settings,
  ChevronDown,
  ChevronRight,
  Wallet,
  Play
} from 'lucide-react';
import InlineCopyButton from './ui/InlineCopyButton';
import { SUPPORTED_CHAINS } from '../utils/chains';
import { userRpcManager } from '../utils/userRpc';
import SimpleWalletConnection from './SimpleWalletConnection';
import type { Chain } from '../types';
import type { WalletInfo } from '../types/transaction';

interface ABISource {
  name: string;
  url: string;
  priority: number;
}

interface ContractInfo {
  address: string;
  chain: Chain;
  name?: string;
  abi?: string;
  verified: boolean;
  contractType?: string;
  source?: string;
  isDiamond?: boolean;
}

interface FacetInfo {
  address: string;
  name?: string;
  abi?: string;
  verified: boolean;
  functionCount: number;
  functions: any[];
  source?: string;
  isLoading: boolean;
  error?: string;
}

interface FetchProgress {
  stage: string;
  current: number;
  total: number;
  details: string;
}

const EnhancedTransactionBuilder: React.FC = () => {
  // Contract state
  const [contractAddress, setContractAddress] = useState('');
  const [selectedChain, setSelectedChain] = useState<Chain>(SUPPORTED_CHAINS[0]);
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  const [facets, setFacets] = useState<FacetInfo[]>([]);
  const [selectedFacet, setSelectedFacet] = useState<string>('');
  
  // Loading and progress
  const [isSearching, setIsSearching] = useState(false);
  const [fetchProgress, setFetchProgress] = useState<FetchProgress | null>(null);
  
  // Wallet state
  const [connectedWallet, setConnectedWallet] = useState<WalletInfo | null>(null);
  
  // Function interaction
  const [selectedFunction, setSelectedFunction] = useState('');
  const [functionInputs, setFunctionInputs] = useState<Record<string, any>>({});
  const [functionResults, setFunctionResults] = useState<Record<string, any>>({});
  const [isExecuting, setIsExecuting] = useState(false);

  const resolveRpcUrl = useCallback(
    (chain: Chain) => userRpcManager.getEffectiveRpcUrl(chain, chain.rpcUrl).url,
    []
  );

  // ABI Sources in priority order
  const ABI_SOURCES: ABISource[] = [
    { name: 'Sourcify', url: 'https://sourcify.dev/server', priority: 1 },
    { name: 'Blockscout', url: selectedChain.explorers?.find(e => e.type === 'blockscout')?.url || '', priority: 2 },
    { name: 'Etherscan', url: selectedChain.apiUrl, priority: 3 }
  ];

  // Fetch ABI from multiple sources
  const fetchABIFromSource = async (source: ABISource, address: string): Promise<{ success: boolean; abi?: string; name?: string; contractType?: string }> => {
    try {
      setFetchProgress(prev => prev ? { ...prev, details: `Trying ${source.name}...` } : null);
      
      if (source.name === 'Sourcify') {
        // First check verification status
        const checkResponse = await fetch(`${source.url}/check-by-addresses?addresses=${address}&chainIds=${selectedChain.id}`);
        if (checkResponse.ok) {
          const checkData = await checkResponse.json();
          if (checkData?.[0]?.status === 'perfect') {
            // Contract is verified, fetch files
            const filesResponse = await fetch(`${source.url}/files/any/${selectedChain.id}/${address}`);
            if (filesResponse.ok) {
              const filesData = await filesResponse.json();
              const metadataFile = filesData.files?.find((f: any) => f.name === 'metadata.json');
              if (metadataFile) {
                const metadata = JSON.parse(metadataFile.content);
                const contractName = Object.keys(metadata.settings?.compilationTarget || {})[0]?.split('/').pop()?.replace('.sol', '') ||
                                   Object.keys(metadata.sources)[0]?.split('/').pop()?.replace('.sol', '');
                return {
                  success: true,
                  abi: JSON.stringify(metadata.output.abi),
                  name: contractName,
                  contractType: 'Perfect Match - Sourcify'
                };
              }
            }
          }
        }
      } else if (source.name === 'Blockscout' && source.url) {
        const response = await fetch(`${source.url}/api?module=contract&action=getsourcecode&address=${address}`);
        if (response.ok) {
          const data = await response.json();
          if (data.status === '1' && data.result?.[0]?.ABI !== 'Contract source code not verified') {
            return {
              success: true,
              abi: data.result[0].ABI,
              name: data.result[0].ContractName,
              contractType: 'Verified on Blockscout'
            };
          }
        }
      } else if (source.name === 'Etherscan') {
        const response = await fetch(`${source.url}?module=contract&action=getsourcecode&address=${address}&apikey=YourApiKeyToken`);
        if (response.ok) {
          const data = await response.json();
          if (data.status === '1' && data.result?.[0]?.ABI !== 'Contract source code not verified') {
            return {
              success: true,
              abi: data.result[0].ABI,
              name: data.result[0].ContractName,
              contractType: 'Verified on Etherscan'
            };
          }
        }
      }
      return { success: false };
    } catch (error) {
      console.warn(`${source.name} fetch failed:`, error);
      return { success: false };
    }
  };

  // Check if contract is a Diamond
  const checkDiamond = async (address: string): Promise<string[] | null> => {
    try {
      const provider = new ethers.providers.JsonRpcProvider(resolveRpcUrl(selectedChain));
      const contract = new ethers.Contract(
        address,
        ["function facetAddresses() external view returns (address[] memory facetAddresses_)"],
        provider
      );
      const facetAddresses = await contract.facetAddresses();
      return Array.isArray(facetAddresses) && facetAddresses.length > 0 ? facetAddresses : null;
    } catch {
      return null;
    }
  };

  // Get function selectors for a facet
  const getFacetFunctionSelectors = async (diamondAddress: string, facetAddress: string): Promise<string[]> => {
    try {
      const provider = new ethers.providers.JsonRpcProvider(resolveRpcUrl(selectedChain));
      const contract = new ethers.Contract(
        diamondAddress,
        ["function facetFunctionSelectors(address _facet) external view returns (bytes4[] memory)"],
        provider
      );
      const selectors = await contract.facetFunctionSelectors(facetAddress);
      return selectors || [];
    } catch {
      return [];
    }
  };

  // Fetch facet ABI
  const fetchFacetABI = async (facetAddress: string, diamondAddress: string): Promise<FacetInfo> => {
    const facetInfo: FacetInfo = {
      address: facetAddress,
      verified: false,
      functionCount: 0,
      functions: [],
      isLoading: true
    };

    try {
      // Get function selectors first
      const selectors = await getFacetFunctionSelectors(diamondAddress, facetAddress);
      facetInfo.functionCount = selectors.length;

      // Try to fetch ABI from multiple sources
      for (const source of ABI_SOURCES) {
        const result = await fetchABIFromSource(source, facetAddress);
        if (result.success && result.abi) {
          facetInfo.abi = result.abi;
          facetInfo.name = result.name;
          facetInfo.verified = true;
          facetInfo.source = source.name;
          
          // Parse functions
          try {
            const parsedAbi = JSON.parse(result.abi);
            facetInfo.functions = parsedAbi.filter((item: any) => item.type === 'function');
          } catch {
            facetInfo.functions = [];
          }
          break;
        }
      }
    } catch (error) {
      facetInfo.error = error instanceof Error ? error.message : 'Unknown error';
    }

    facetInfo.isLoading = false;
    return facetInfo;
  };

  // Main contract search function
  const searchContract = async () => {
    if (!contractAddress || !ethers.utils.isAddress(contractAddress)) {
      alert('Please enter a valid contract address');
      return;
    }

    setIsSearching(true);
    setContractInfo(null);
    setFacets([]);
    setSelectedFacet('');
    setFetchProgress({ stage: 'Starting search...', current: 0, total: 3, details: '' });

    try {
      // Step 1: Fetch main contract ABI
      setFetchProgress({ stage: 'Fetching contract ABI', current: 1, total: 3, details: 'Checking multiple sources...' });
      
      let contractResult = null;
      for (const source of ABI_SOURCES) {
        const result = await fetchABIFromSource(source, contractAddress);
        if (result.success) {
          contractResult = result;
          break;
        }
      }

      if (!contractResult?.success) {
        setContractInfo({
          address: contractAddress,
          chain: selectedChain,
          verified: false
        });
        setFetchProgress(null);
        setIsSearching(false);
        return;
      }

      // Step 2: Check if it's a Diamond
      setFetchProgress({ stage: 'Checking Diamond pattern', current: 2, total: 3, details: 'Calling facetAddresses()...' });
      
      const facetAddresses = await checkDiamond(contractAddress);
      const isDiamond = facetAddresses !== null;

      const info: ContractInfo = {
        address: contractAddress,
        chain: selectedChain,
        name: contractResult.name,
        abi: contractResult.abi,
        verified: true,
        contractType: contractResult.contractType,
        source: 'Multi-source',
        isDiamond
      };

      setContractInfo(info);

      // Step 3: If Diamond, fetch facet ABIs in parallel
      if (isDiamond && facetAddresses) {
        setFetchProgress({ stage: 'Fetching facet ABIs', current: 3, total: 3, details: `Found ${facetAddresses.length} facets` });
        
        // Initialize facets with loading state
        const initialFacets: FacetInfo[] = facetAddresses.map(addr => ({
          address: addr,
          verified: false,
          functionCount: 0,
          functions: [],
          isLoading: true
        }));
        setFacets(initialFacets);

        // Fetch facet ABIs in parallel with real-time updates
        const facetPromises = facetAddresses.map(async (facetAddr, index) => {
          const facetInfo = await fetchFacetABI(facetAddr, contractAddress);
          
          // Real-time update of this specific facet
          setFacets(prevFacets => 
            prevFacets.map((f, i) => i === index ? facetInfo : f)
          );
          
          return facetInfo;
        });

        await Promise.all(facetPromises);
      }

      setFetchProgress(null);
    } catch (error) {
      console.error('Contract search failed:', error);
      alert(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSearching(false);
    }
  };

  // Get current functions to display
  const getCurrentFunctions = () => {
    if (!contractInfo?.abi) return [];
    
    try {
      let abi = contractInfo.abi;
      
      // If Diamond and facet selected, use facet ABI
      if (contractInfo.isDiamond && selectedFacet) {
        const facet = facets.find(f => f.address === selectedFacet);
        if (facet?.abi) {
          abi = facet.abi;
        }
      }
      
      const parsedAbi = JSON.parse(abi);
      return parsedAbi.filter((item: any) => item.type === 'function');
    } catch {
      return [];
    }
  };

  const functions = getCurrentFunctions();
  const readFunctions = functions.filter((f: any) => ['view', 'pure'].includes(f.stateMutability));
  const writeFunctions = functions.filter((f: any) => ['nonpayable', 'payable'].includes(f.stateMutability));

  return (
    <div className="panel">
      <div className="flex items-center gap-3 mb-6">
        <Building2 size={28} />
        <h1 className="text-2xl font-bold">Enhanced Transaction Builder</h1>
      </div>

      {/* Contract Search Section */}
      <div className="form-section">
        <h3 className="flex items-center gap-2">
          <Search size={20} />
          Contract Search & Analysis
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="form-group">
              Contract Address
              <input
                type="text"
                value={contractAddress}
                onChange={(e) => setContractAddress(e.target.value)}
                placeholder="0x..."
                className="w-full"
              />
            </label>
          </div>
          
          <div>
            <label className="form-group">
              Network
              <select
                value={selectedChain.id}
                onChange={(e) => {
                  const chain = SUPPORTED_CHAINS.find(c => c.id === parseInt(e.target.value));
                  if (chain) setSelectedChain(chain);
                }}
                className="w-full"
              >
                {SUPPORTED_CHAINS.map(chain => (
                  <option key={chain.id} value={chain.id}>{chain.name}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <button
          onClick={searchContract}
          disabled={isSearching || !contractAddress}
          className="btn-primary w-full md:w-auto"
        >
          {isSearching ? (
            <>
              <Loader size={16} className="animate-spin mr-2" />
              Searching Contract...
            </>
          ) : (
            <>
              <Search size={16} className="mr-2" />
              Search & Analyze Contract
            </>
          )}
        </button>

        {/* Progress Display */}
        {fetchProgress && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Loader size={16} className="animate-spin text-blue-600" />
              <span className="font-medium text-blue-800">{fetchProgress.stage}</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(fetchProgress.current / fetchProgress.total) * 100}%` }}
              ></div>
            </div>
            <div className="text-sm text-blue-600">{fetchProgress.details}</div>
          </div>
        )}
      </div>

      {/* Contract Information */}
      {contractInfo && (
        <div className="form-section">
          <div className="flex items-center justify-between mb-4">
            <h3 className="flex items-center gap-2">
              {contractInfo.isDiamond ? (
                <Diamond size={20} className="text-purple-600" />
              ) : (
                <Building2 size={20} className="text-blue-600" />
              )}
              Contract Information
              {contractInfo.verified ? (
                <CheckCircle size={18} className="text-green-600" />
              ) : (
                <XCircle size={18} className="text-red-600" />
              )}
            </h3>
            
            <div className="flex gap-2">
              <InlineCopyButton
                value={contractInfo.address}
                ariaLabel="Copy contract address"
                iconSize={14}
                size={32}
              />
              <a
                href={`${contractInfo.chain.explorerUrl}/address/${contractInfo.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                <ExternalLink size={16} />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="clean-card">
              <div className="text-sm text-gray-600">Address</div>
              <div className="font-mono text-xs break-all">{contractInfo.address}</div>
            </div>
            <div className="clean-card">
              <div className="text-sm text-gray-600">Name</div>
              <div className="font-medium">{contractInfo.name || 'Unknown'}</div>
            </div>
            <div className="clean-card">
              <div className="text-sm text-gray-600">Type</div>
              <div className="font-medium">
                {contractInfo.isDiamond ? 'Diamond Contract' : 'Standard Contract'}
              </div>
            </div>
            <div className="clean-card">
              <div className="text-sm text-gray-600">Source</div>
              <div className="font-medium">{contractInfo.contractType || 'Unknown'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Diamond Facets Grid */}
      {contractInfo?.isDiamond && facets.length > 0 && (
        <div className="form-section">
          <h3 className="flex items-center gap-2 mb-4">
            <Diamond size={20} className="text-purple-600" />
            Diamond Facets ({facets.length})
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-6">
            {facets.map((facet, index) => (
              <div 
                key={facet.address}
                className={`clean-card cursor-pointer transition-all h-32 flex flex-col justify-between ${
                  selectedFacet === facet.address 
                    ? 'ring-2 ring-purple-500 bg-purple-50' 
                    : 'hover:bg-gray-50'
                }`}
                onClick={() => !facet.isLoading && facet.verified && setSelectedFacet(facet.address)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">
                    Facet #{index + 1}
                  </div>
                  <div className="flex items-center gap-1">
                    {facet.isLoading ? (
                      <Loader size={14} className="animate-spin text-blue-500" />
                    ) : facet.verified ? (
                      <CheckCircle size={14} className="text-green-500" />
                    ) : (
                      <XCircle size={14} className="text-red-500" />
                    )}
                  </div>
                </div>
                
                <div className="text-xs font-mono text-gray-600 mb-2 truncate" title={facet.address}>
                  {facet.address.slice(0, 8)}...{facet.address.slice(-6)}
                </div>
                
                {facet.name && (
                  <div className="text-sm text-gray-800 mb-1 font-medium">
                    {facet.name}
                  </div>
                )}
                
                <div className="flex justify-between items-center text-xs text-gray-600">
                  <span>{facet.functionCount} functions</span>
                  {facet.source && (
                    <span className="text-green-600">{facet.source}</span>
                  )}
                </div>
                
                {facet.isLoading && (
                  <div className="text-xs text-blue-600 mt-1">Loading ABI...</div>
                )}
                {facet.error && (
                  <div className="text-xs text-red-600 mt-1">Failed to load</div>
                )}
              </div>
            ))}
          </div>

          {/* Facet Selection */}
          {facets.some(f => f.verified) && (
            <div className="mb-4">
              <label className="form-group">
                Selected Facet for Interaction
                <select
                  value={selectedFacet}
                  onChange={(e) => setSelectedFacet(e.target.value)}
                  className="w-full md:w-auto"
                >
                  <option value="">Choose a facet...</option>
                  {facets.filter((f: any) => f.verified).map(facet => (
                    <option key={facet.address} value={facet.address}>
                      {facet.name || `Facet ${facet.address.slice(0, 8)}`} ({facet.functionCount} functions)
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
      )}

      {/* Function Interaction */}
      {contractInfo?.verified && (!contractInfo.isDiamond || selectedFacet) && (
        <div className="form-section">
          <h3 className="flex items-center gap-2">
            <Zap size={20} />
            Function Interaction
            <span className="text-sm text-gray-600">
              ({readFunctions.length} read, {writeFunctions.length} write)
            </span>
          </h3>
          
          <div className="decoder-tabs mb-4">
            <button className="active">Read Functions</button>
            <button>Write Functions</button>
          </div>
          
          {functions.length > 0 ? (
            <div className="space-y-4">
              {readFunctions.slice(0, 5).map((func: any, index: number) => (
                <div key={index} className="clean-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye size={16} className="text-blue-600" />
                    <span className="font-medium">{func.name}</span>
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      {func.stateMutability}
                    </span>
                  </div>
                  
                  {func.inputs.length > 0 && (
                    <div className="text-xs text-gray-600 mb-2">
                      Inputs: {func.inputs.map((input: any) => `${input.name}: ${input.type}`).join(', ')}
                    </div>
                  )}
                  
                  <button className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
                    <Play size={12} className="inline mr-1" />
                    Call Function
                  </button>
                </div>
              ))}
              
              {readFunctions.length > 5 && (
                <div className="text-center text-gray-500">
                  ... and {readFunctions.length - 5} more functions
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No functions available for interaction
            </div>
          )}
        </div>
      )}

      {/* Wallet Connection - Only show for write functions */}
      {contractInfo?.verified && (!contractInfo.isDiamond || selectedFacet) && writeFunctions.length > 0 && (
        <div className="form-section">
          <h3 className="flex items-center gap-2">
            <Wallet size={20} />
            Wallet Connection
            <span className="text-sm text-gray-600">(Required for write functions)</span>
          </h3>
          <SimpleWalletConnection 
            onWalletConnect={setConnectedWallet}
            onWalletDisconnect={() => setConnectedWallet(null)}
            connectedWallet={connectedWallet || undefined}
          />
        </div>
      )}
    </div>
  );
};

export default EnhancedTransactionBuilder;
