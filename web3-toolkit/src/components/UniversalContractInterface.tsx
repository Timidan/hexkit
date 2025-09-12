import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { 
  Search, 
  Diamond, 
  Building2, 
  Eye,
  Copy,
  ExternalLink,
  ChevronDown,
  Loader,
  CheckCircle,
  XCircle,
  Zap
} from 'lucide-react';
import { SUPPORTED_CHAINS } from '../utils/chains';
import { fetchContractABIMultiSource } from '../utils/multiSourceAbiFetcher';
import DiamondFunctionCaller from './DiamondFunctionCaller';
import type { Chain } from '../types';

interface ContractInfo {
  address: string;
  chain: Chain;
  name?: string;
  abi?: string;
  verified: boolean;
  isDiamond?: boolean;
  facetAddresses?: string[];
  contractType?: string;
}

interface FacetDetails {
  address: string;
  name?: string;
  verified: boolean;
  abi?: string;
  functionCount?: number;
}

const UniversalContractInterface: React.FC = () => {
  const [address, setAddress] = useState('');
  const [selectedChain, setSelectedChain] = useState<Chain>(SUPPORTED_CHAINS[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  const [facets, setFacets] = useState<FacetDetails[]>([]);
  const [activeTab, setActiveTab] = useState<'read' | 'write'>('read');
  const [selectedFacet, setSelectedFacet] = useState<string>('');

  // Diamond detection
  const detectDiamond = async (contractAddress: string, chain: Chain) => {
    try {
      const provider = new ethers.providers.JsonRpcProvider(chain.rpcUrl);
      const contract = new ethers.Contract(
        contractAddress,
        ["function facetAddresses() external view returns (address[] memory facetAddresses_)"],
        provider
      );
      const facetAddresses = await contract.facetAddresses();
      return Array.isArray(facetAddresses) && facetAddresses.length > 0 ? facetAddresses : null;
    } catch {
      return null;
    }
  };

  // Analyze facets
  const analyzeFacets = async (contractAddress: string, facetAddresses: string[], chain: Chain) => {
    const facetDetails: FacetDetails[] = [];
    
    for (const facetAddr of facetAddresses) {
      try {
        const facetInfo = await fetchContractABIMultiSource(facetAddr, [chain]);
        
        // Get function count
        const provider = new ethers.providers.JsonRpcProvider(chain.rpcUrl);
        const diamond = new ethers.Contract(
          contractAddress,
          ["function facetFunctionSelectors(address _facet) external view returns (bytes4[] memory)"],
          provider
        );
        const selectors = await diamond.facetFunctionSelectors(facetAddr);
        
        facetDetails.push({
          address: facetAddr,
          name: facetInfo.contractName,
          verified: facetInfo.success,
          abi: facetInfo.abi,
          functionCount: selectors?.length || 0
        });
      } catch {
        facetDetails.push({
          address: facetAddr,
          verified: false,
          functionCount: 0
        });
      }
    }
    
    return facetDetails;
  };

  // Search contract
  const searchContract = async () => {
    if (!address || !ethers.utils.isAddress(address)) {
      alert('Please enter a valid contract address');
      return;
    }

    setIsLoading(true);
    setContractInfo(null);
    setFacets([]);
    setSelectedFacet('');

    try {
      // Fetch contract info
      const result = await fetchContractABIMultiSource(address, [selectedChain]);
      
      const info: ContractInfo = {
        address,
        chain: selectedChain,
        name: result.contractName,
        abi: result.abi,
        verified: result.success,
        contractType: result.contractType
      };

      // Check if it's a Diamond
      const facetAddresses = await detectDiamond(address, selectedChain);
      if (facetAddresses) {
        info.isDiamond = true;
        info.facetAddresses = facetAddresses;
        
        // Analyze facets
        const facetDetails = await analyzeFacets(address, facetAddresses, selectedChain);
        setFacets(facetDetails);
        
        // Select first verified facet
        const firstVerified = facetDetails.find(f => f.verified);
        if (firstVerified) {
          setSelectedFacet(firstVerified.address);
        }
      }

      setContractInfo(info);
    } catch (error) {
      console.error('Contract search failed:', error);
      alert('Failed to fetch contract information');
    } finally {
      setIsLoading(false);
    }
  };

  // Get functions from contract/facet
  const getFunctions = () => {
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
      return parsedAbi
        .filter((item: any) => item.type === 'function')
        .map((func: any) => ({
          ...func,
          facetAddress: contractInfo.isDiamond ? selectedFacet : undefined,
          facetName: contractInfo.isDiamond ? facets.find(f => f.address === selectedFacet)?.name : undefined
        }));
    } catch {
      return [];
    }
  };

  const functions = getFunctions();
  const readFunctions = functions.filter(f => ['view', 'pure'].includes(f.stateMutability));
  const writeFunctions = functions.filter(f => ['nonpayable', 'payable'].includes(f.stateMutability));

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="border-b border-gray-700 bg-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold mb-4">Contract Interface</h1>
          
          {/* Search Bar */}
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Contract Address (0x...)"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                onKeyPress={(e) => e.key === 'Enter' && searchContract()}
              />
            </div>
            
            <div className="relative">
              <select
                value={selectedChain.id}
                onChange={(e) => {
                  const chain = SUPPORTED_CHAINS.find(c => c.id === parseInt(e.target.value));
                  if (chain) setSelectedChain(chain);
                }}
                className="appearance-none bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 pr-8 text-white focus:outline-none focus:border-blue-500"
              >
                {SUPPORTED_CHAINS.map(chain => (
                  <option key={chain.id} value={chain.id}>{chain.name}</option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            
            <button
              onClick={searchContract}
              disabled={isLoading || !address}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader size={16} className="animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search size={16} />
                  Search
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Contract Info */}
      {contractInfo && (
        <div className="max-w-6xl mx-auto px-6 py-6">
          {/* Contract Header */}
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  {contractInfo.isDiamond ? (
                    <Diamond size={24} className="text-purple-500" />
                  ) : (
                    <Building2 size={24} className="text-blue-500" />
                  )}
                  <h2 className="text-xl font-semibold">
                    {contractInfo.isDiamond ? 'Diamond Contract' : 'Smart Contract'}
                  </h2>
                  {contractInfo.verified ? (
                    <CheckCircle size={18} className="text-green-500" />
                  ) : (
                    <XCircle size={18} className="text-red-500" />
                  )}
                </div>
                <div className="text-gray-300 font-mono text-sm mb-2">{contractInfo.address}</div>
                {contractInfo.name && (
                  <div className="text-gray-400 text-sm">{contractInfo.name}</div>
                )}
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(contractInfo.address)}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                  <Copy size={16} />
                </button>
                <a
                  href={`${contractInfo.chain.explorerUrl}/address/${contractInfo.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                  <ExternalLink size={16} />
                </a>
              </div>
            </div>

            {/* Diamond Facets */}
            {contractInfo.isDiamond && facets.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-700">
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Choose a facet to interact with:
                  </label>
                  <div className="relative">
                    <select
                      value={selectedFacet}
                      onChange={(e) => setSelectedFacet(e.target.value)}
                      className="appearance-none bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 pr-8 text-white focus:outline-none focus:border-blue-500 w-full"
                    >
                      <option value="">Choose Facet</option>
                      {facets.filter(f => f.verified).map(facet => (
                        <option key={facet.address} value={facet.address}>
                          {facet.name || `Facet ${facet.address.slice(0, 8)}`} ({facet.functionCount} functions)
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                
                <div className="text-xs text-gray-400">
                  {facets.filter(f => f.verified).length} verified facets • {facets.length} total facets
                </div>
              </div>
            )}
          </div>

          {/* Function Interface */}
          {contractInfo.verified && (!contractInfo.isDiamond || selectedFacet) && (
            <div className="bg-gray-800 rounded-lg">
              {/* Tabs */}
              <div className="flex border-b border-gray-700">
                <button
                  onClick={() => setActiveTab('read')}
                  className={`px-6 py-3 font-medium transition-colors ${
                    activeTab === 'read'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Read ({readFunctions.length})
                </button>
                <button
                  onClick={() => setActiveTab('write')}
                  className={`px-6 py-3 font-medium transition-colors ${
                    activeTab === 'write'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Write ({writeFunctions.length})
                </button>
              </div>

              {/* Function Caller */}
              <div className="p-6">
                {functions.length > 0 ? (
                  <DiamondFunctionCaller
                    contractAddress={contractInfo.address}
                    chain={contractInfo.chain}
                    functions={activeTab === 'read' ? readFunctions : writeFunctions}
                    provider={new ethers.providers.JsonRpcProvider(contractInfo.chain.rpcUrl)}
                  />
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    No {activeTab} functions available
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Not Verified State */}
          {contractInfo && !contractInfo.verified && (
            <div className="bg-red-900/20 border border-red-700 rounded-lg p-6 text-center">
              <XCircle size={48} className="text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-red-400 mb-2">Contract Not Verified</h3>
              <p className="text-gray-400">
                This contract is not verified on {contractInfo.chain.name}. 
                Function interaction is not available.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!contractInfo && !isLoading && (
        <div className="max-w-6xl mx-auto px-6 py-20 text-center">
          <Building2 size={64} className="text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-400 mb-2">Enter a Contract Address</h3>
          <p className="text-gray-500">
            Search for any smart contract on supported networks to interact with it
          </p>
        </div>
      )}
    </div>
  );
};

export default UniversalContractInterface;