import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { 
  ChevronDown, 
  ChevronRight,
  Edit,
  Play,
  Settings
} from 'lucide-react';
import { SUPPORTED_CHAINS } from '../utils/chains';
import SimpleWalletConnection from './SimpleWalletConnection';
import type { Chain } from '../types';
import type { WalletInfo } from '../types/transaction';

interface ContractInfo {
  address: string;
  chain: Chain;
  name?: string;
  abi?: string;
  verified: boolean;
  isDiamond?: boolean;
}

interface FacetInfo {
  address: string;
  name?: string;
  abi?: string;
  verified: boolean;
  functionCount: number;
  functions: any[];
  isLoading: boolean;
}

const TenderlyStyleTransactionBuilder: React.FC = () => {
  // Contract state
  const [contractAddress, setContractAddress] = useState('');
  const [selectedChain, setSelectedChain] = useState<Chain>(SUPPORTED_CHAINS[0]);
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  const [facets, setFacets] = useState<FacetInfo[]>([]);
  
  // UI state
  const [contractSource, setContractSource] = useState<'project' | 'address'>('address');
  const [functionInputMode, setFunctionInputMode] = useState<'function' | 'raw'>('function');
  const [selectedFunction, setSelectedFunction] = useState('');
  const [functionInputs, setFunctionInputs] = useState<Record<string, any>>({});
  const [isSearching, setIsSearching] = useState(false);
  
  // Wallet and transaction state
  const [connectedWallet, setConnectedWallet] = useState<WalletInfo | null>(null);
  const [txValue, setTxValue] = useState('0');
  const [gasLimit, setGasLimit] = useState('800000');
  
  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState({
    txParams: true,
    blockOverrides: false,
    stateOverrides: false,
    accessLists: false
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Simplified ABI fetching (using same logic but cleaner UI)
  const fetchABIFromSource = async (address: string): Promise<{ success: boolean; abi?: string; name?: string }> => {
    try {
      // Sourcify first
      const checkResponse = await fetch(`https://sourcify.dev/server/check-by-addresses?addresses=${address}&chainIds=${selectedChain.id}`);
      if (checkResponse.ok) {
        const checkData = await checkResponse.json();
        if (checkData?.[0]?.status === 'perfect') {
          const filesResponse = await fetch(`https://sourcify.dev/server/files/any/${selectedChain.id}/${address}`);
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
                name: contractName
              };
            }
          }
        }
      }

      // Etherscan fallback
      const etherscanResponse = await fetch(`${selectedChain.apiUrl}?module=contract&action=getsourcecode&address=${address}&apikey=YourApiKeyToken`);
      if (etherscanResponse.ok) {
        const data = await etherscanResponse.json();
        if (data.status === '1' && data.result?.[0]?.ABI !== 'Contract source code not verified') {
          return {
            success: true,
            abi: data.result[0].ABI,
            name: data.result[0].ContractName
          };
        }
      }

      return { success: false };
    } catch (error) {
      console.warn('ABI fetch failed:', error);
      return { success: false };
    }
  };

  // Diamond detection
  const checkDiamond = async (address: string): Promise<string[] | null> => {
    try {
      const provider = new ethers.providers.JsonRpcProvider(selectedChain.rpcUrl);
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

  // Search contract
  const searchContract = async () => {
    if (!contractAddress || !ethers.utils.isAddress(contractAddress)) return;
    
    setIsSearching(true);
    setContractInfo(null);
    setFacets([]);
    setSelectedFunction('');

    try {
      const result = await fetchABIFromSource(contractAddress);
      
      if (result.success) {
        const facetAddresses = await checkDiamond(contractAddress);
        const isDiamond = facetAddresses !== null;

        setContractInfo({
          address: contractAddress,
          chain: selectedChain,
          name: result.name,
          abi: result.abi,
          verified: true,
          isDiamond
        });

        // If Diamond, fetch facets (simplified)
        if (isDiamond && facetAddresses) {
          const facetData: FacetInfo[] = facetAddresses.map(addr => ({
            address: addr,
            verified: false,
            functionCount: 0,
            functions: [],
            isLoading: false
          }));
          setFacets(facetData);
        }
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Get functions for display
  const getFunctions = () => {
    if (!contractInfo?.abi) return [];
    try {
      const parsedAbi = JSON.parse(contractInfo.abi);
      return parsedAbi.filter((item: any) => item.type === 'function');
    } catch {
      return [];
    }
  };

  const functions = getFunctions();

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <h1 className="text-2xl font-semibold mb-8 text-white">New Simulation</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Contract */}
          <div className="space-y-6">
            {/* Contract Section */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-lg font-medium mb-4 text-white">Contract</h2>
              
              {/* Contract Source Selection */}
              <div className="space-y-4 mb-6">
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      value="project"
                      checked={contractSource === 'project'}
                      onChange={(e) => setContractSource(e.target.value as 'project')}
                      className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600"
                    />
                    <span className="text-gray-300">Select from Project</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      value="address"
                      checked={contractSource === 'address'}
                      onChange={(e) => setContractSource(e.target.value as 'address')}
                      className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600"
                    />
                    <span className="text-gray-300">Insert any address</span>
                  </label>
                </div>

                {contractSource === 'project' && (
                  <div className="relative">
                    <select 
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white appearance-none"
                      value=""
                      onChange={() => {}}
                    >
                      <option value="">Select contract</option>
                      {contractInfo?.isDiamond && <option value="diamond">Diamond</option>}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                )}

                {contractSource === 'address' && (
                  <div className="space-y-4">
                    <div className="flex space-x-2">
                      <select
                        value={selectedChain.id}
                        onChange={(e) => {
                          const chain = SUPPORTED_CHAINS.find(c => c.id === parseInt(e.target.value));
                          if (chain) setSelectedChain(chain);
                        }}
                        className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-3 text-white"
                      >
                        {SUPPORTED_CHAINS.map(chain => (
                          <option key={chain.id} value={chain.id}>{chain.name}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={contractAddress}
                        onChange={(e) => setContractAddress(e.target.value)}
                        placeholder="0x..."
                        className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400"
                      />
                      <button
                        onClick={searchContract}
                        disabled={isSearching || !contractAddress}
                        className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSearching ? 'Loading...' : 'Load'}
                      </button>
                    </div>
                  </div>
                )}

                {contractInfo && (
                  <button className="flex items-center space-x-2 text-purple-400 hover:text-purple-300">
                    <Edit className="w-4 h-4" />
                    <span>Edit source</span>
                  </button>
                )}
              </div>

              {/* Function Selection */}
              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      value="function"
                      checked={functionInputMode === 'function'}
                      onChange={(e) => setFunctionInputMode(e.target.value as 'function')}
                      className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600"
                    />
                    <span className="text-gray-300">Choose function and parameters</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      value="raw"
                      checked={functionInputMode === 'raw'}
                      onChange={(e) => setFunctionInputMode(e.target.value as 'raw')}
                      className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600"
                    />
                    <span className="text-gray-300">Enter raw input data</span>
                  </label>
                </div>

                {functionInputMode === 'function' && (
                  <div className="space-y-4">
                    <div className="relative">
                      <select 
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white appearance-none"
                        value={selectedFunction}
                        onChange={(e) => setSelectedFunction(e.target.value)}
                      >
                        <option value="">Select option</option>
                        {functions.map((func, index) => (
                          <option key={index} value={func.name}>
                            {func.name}({func.inputs?.map((input: any) => input.type).join(', ')})
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                    
                    {contractInfo && (
                      <button className="flex items-center space-x-2 text-purple-400 hover:text-purple-300">
                        <Edit className="w-4 h-4" />
                        <span>Edit ABI</span>
                      </button>
                    )}
                  </div>
                )}

                {functionInputMode === 'raw' && (
                  <textarea
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 h-24 resize-none"
                    placeholder="Enter raw calldata (0x...)"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Transaction Parameters */}
          <div className="space-y-6">
            {/* Transaction Parameters */}
            <div className="bg-gray-800 rounded-lg p-6">
              <button 
                className="flex items-center justify-between w-full text-left mb-4"
                onClick={() => toggleSection('txParams')}
              >
                <h2 className="text-lg font-medium text-white">Transaction Parameters</h2>
                {expandedSections.txParams ? 
                  <ChevronDown className="w-5 h-5 text-gray-400" /> : 
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                }
              </button>

              {expandedSections.txParams && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center space-x-2">
                      <input type="checkbox" className="rounded border-gray-600 bg-gray-700" />
                      <span className="text-gray-300">Use Pending Block</span>
                    </label>
                    <Settings className="w-4 h-4 text-gray-400" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Block Number</label>
                      <input 
                        type="text" 
                        placeholder="/"
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500"
                      />
                      <div className="text-xs text-gray-500 mt-1">Current block: 30930267</div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Tx Index</label>
                      <input 
                        type="text" 
                        placeholder="/"
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500"
                      />
                      <div className="text-xs text-gray-500 mt-1">Maximum Block Index: 14</div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">From</label>
                    <input 
                      type="text" 
                      value="0x0000000000000000000000000000000000000000"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white font-mono text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Gas</label>
                      <input 
                        type="text" 
                        value={gasLimit}
                        onChange={(e) => setGasLimit(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                      />
                      <button className="text-xs text-purple-400 hover:text-purple-300 mt-1">
                        Use custom gas value
                      </button>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Gas Price</label>
                      <input 
                        type="text" 
                        value="0"
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Value</label>
                    <input 
                      type="text" 
                      value={txValue}
                      onChange={(e) => setTxValue(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Block Header Overrides */}
            <div className="bg-gray-800 rounded-lg p-6">
              <button 
                className="flex items-center justify-between w-full text-left mb-4"
                onClick={() => toggleSection('blockOverrides')}
              >
                <h2 className="text-lg font-medium text-white">Block Header Overrides</h2>
                {expandedSections.blockOverrides ? 
                  <ChevronDown className="w-5 h-5 text-gray-400" /> : 
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                }
              </button>

              {expandedSections.blockOverrides && (
                <div className="space-y-4">
                  <label className="flex items-center space-x-2">
                    <input type="checkbox" className="rounded border-gray-600 bg-gray-700" />
                    <span className="text-gray-300">Override Block Number</span>
                  </label>
                  <input 
                    type="text" 
                    placeholder="/"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500"
                  />
                  
                  <label className="flex items-center space-x-2">
                    <input type="checkbox" className="rounded border-gray-600 bg-gray-700" />
                    <span className="text-gray-300">Override Timestamp</span>
                  </label>
                  <input 
                    type="text" 
                    placeholder="/"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500"
                  />
                </div>
              )}
            </div>

            {/* State Overrides */}
            <div className="bg-gray-800 rounded-lg p-6">
              <button 
                className="flex items-center justify-between w-full text-left"
                onClick={() => toggleSection('stateOverrides')}
              >
                <h2 className="text-lg font-medium text-white">State Overrides</h2>
                {expandedSections.stateOverrides ? 
                  <ChevronDown className="w-5 h-5 text-gray-400" /> : 
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                }
              </button>
            </div>

            {/* Optional Access Lists */}
            <div className="bg-gray-800 rounded-lg p-6">
              <button 
                className="flex items-center justify-between w-full text-left"
                onClick={() => toggleSection('accessLists')}
              >
                <h2 className="text-lg font-medium text-white">Optional Access Lists</h2>
                {expandedSections.accessLists ? 
                  <ChevronDown className="w-5 h-5 text-gray-400" /> : 
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                }
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Action */}
        <div className="flex justify-end mt-8">
          <button className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center space-x-2">
            <Play className="w-4 h-4" />
            <span>Simulate Transaction</span>
          </button>
        </div>

        {/* Wallet Connection (if needed for write functions) */}
        {selectedFunction && functions.find(f => f.name === selectedFunction && !['view', 'pure'].includes(f.stateMutability)) && (
          <div className="mt-8 bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-medium mb-4 text-white">Wallet Connection</h3>
            <SimpleWalletConnection 
              onWalletConnect={setConnectedWallet}
              onWalletDisconnect={() => setConnectedWallet(null)}
              connectedWallet={connectedWallet || undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default TenderlyStyleTransactionBuilder;