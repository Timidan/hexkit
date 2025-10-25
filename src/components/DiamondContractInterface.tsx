import React, { useState, useEffect, useMemo } from 'react';
import { ethers } from 'ethers';
import { GemIcon, CheckCircleIcon, XCircleIcon, AlertTriangleIcon, ChevronDownIcon, ChevronRightIcon } from './icons/IconLibrary';
import InlineCopyButton from './ui/InlineCopyButton';
import { 
  Network, 
  Building2, 
  Eye, 
  Zap,
  Play,
  Wallet,
  Settings,
  Hash,
  FileText,
  ExternalLink
} from 'lucide-react';
import MultiNetworkContractSearch from './MultiNetworkContractSearch';
import DiamondFunctionCaller from './DiamondFunctionCaller';
import { SUPPORTED_CHAINS } from '../utils/chains';
import { userRpcManager } from '../utils/userRpc';
import type { Chain } from '../types';

interface ContractSearchResult {
  chain: Chain;
  verified: boolean;
  name?: string;
  abi?: string;
  contractType?: string;
  isDiamond?: boolean;
  facetAddresses?: string[];
  error?: string;
}

interface FacetDetails {
  address: string;
  name?: string;
  verified: boolean;
  abi?: string;
  functionSelectors?: string[];
  functionCount?: number;
}

interface DiamondContractInfo {
  isDiamond: boolean;
  facets: FacetDetails[];
  totalFunctions: number;
}

interface FacetFunction {
  name: string;
  type: 'function';
  inputs: Array<{
    name: string;
    type: string;
    internalType?: string;
  }>;
  outputs: Array<{
    name: string;
    type: string;
    internalType?: string;
  }>;
  stateMutability: 'view' | 'pure' | 'nonpayable' | 'payable';
  selector?: string;
  facetAddress?: string;
  facetName?: string;
}

const DiamondContractInterface: React.FC = () => {
  const [selectedContract, setSelectedContract] = useState<{
    address: string;
    chain: Chain;
    results: ContractSearchResult[];
    diamondInfo?: DiamondContractInfo;
  } | null>(null);
  
  const [selectedFacet, setSelectedFacet] = useState<FacetDetails | null>(null);
  const [expandedFacets, setExpandedFacets] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'search' | 'interact'>('search');

  // Handle contract search results
  const handleContractFound = (results: ContractSearchResult[], diamondInfo?: DiamondContractInfo) => {
    const verifiedResult = results.find(r => r.verified);
    if (!verifiedResult) return;

    setSelectedContract({
      address: verifiedResult.name ? `${verifiedResult.name} (${results[0].chain.name})` : results[0].chain.name,
      chain: verifiedResult.chain,
      results,
      diamondInfo
    });

    // Switch to interact tab if diamond is detected
    if (diamondInfo?.isDiamond) {
      setActiveTab('interact');
    }
  };

  // Extract functions from verified facets for the DiamondFunctionCaller
  const diamondFunctions = useMemo(() => {
    if (!selectedContract?.diamondInfo) return [];

    const functions: FacetFunction[] = [];
    
    selectedContract.diamondInfo.facets.forEach(facet => {
      if (facet.verified && facet.abi) {
        try {
          const parsedAbi = JSON.parse(facet.abi);
          const facetFunctions = parsedAbi
            .filter((item: any) => item.type === 'function')
            .map((func: any) => ({
              ...func,
              facetAddress: facet.address,
              facetName: facet.name || `Facet ${facet.address.slice(0, 8)}`
            }));
          
          functions.push(...facetFunctions);
        } catch (error) {
          console.warn(`Failed to parse ABI for facet ${facet.address}:`, error);
        }
      }
    });

    return functions;
  }, [selectedContract]);

  // Toggle facet expansion
  const toggleFacetExpansion = (facetAddress: string) => {
    setExpandedFacets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(facetAddress)) {
        newSet.delete(facetAddress);
      } else {
        newSet.add(facetAddress);
      }
      return newSet;
    });
  };

  // Get provider for the selected chain
  const provider = useMemo(() => {
    if (!selectedContract) return undefined;
    const rpcUrl = userRpcManager.getEffectiveRpcUrl(
      selectedContract.chain,
      selectedContract.chain.rpcUrl
    ).url;
    return new ethers.providers.JsonRpcProvider(rpcUrl);
  }, [selectedContract]);

  return (
    <div className="panel">
      <h1 className="flex items-center gap-3 text-2xl font-bold mb-6">
        <GemIcon width={28} height={28} className="text-purple-600" />
        Diamond Contract Interface
      </h1>

      {/* Tab Navigation */}
      <div className="flex mb-6 border-b">
        <button
          onClick={() => setActiveTab('search')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'search'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <Network size={18} className="inline mr-2" />
          Search Contracts
        </button>
        <button
          onClick={() => setActiveTab('interact')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'interact'
              ? 'border-b-2 border-purple-500 text-purple-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
          disabled={!selectedContract?.diamondInfo?.isDiamond}
        >
          <GemIcon width={18} height={18} className="inline mr-2" />
          Diamond Interaction
          {selectedContract?.diamondInfo?.isDiamond && (
            <span className="ml-2 text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full">
              Active
            </span>
          )}
        </button>
      </div>

      {/* Search Tab */}
      {activeTab === 'search' && (
        <div>
          <MultiNetworkContractSearch 
            onContractFound={handleContractFound}
          />
          
          {/* Selected Contract Summary */}
          {selectedContract && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-medium text-blue-800 mb-2">Selected Contract</h3>
              <div className="text-sm text-blue-700">
                <p><strong>Address:</strong> {selectedContract.results[0]?.name || 'Unknown'}</p>
                <p><strong>Chain:</strong> {selectedContract.chain.name}</p>
                {selectedContract.diamondInfo && (
                  <p><strong>Type:</strong> Diamond Contract ({selectedContract.diamondInfo.facets.length} facets)</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Diamond Interaction Tab */}
      {activeTab === 'interact' && selectedContract?.diamondInfo?.isDiamond && (
        <div className="space-y-6">
          {/* Diamond Overview */}
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <GemIcon width={24} height={24} className="text-purple-600" />
              <div>
                <h3 className="text-lg font-semibold text-purple-800">
                  Diamond Contract Overview
                </h3>
                <p className="text-purple-600">
                  {selectedContract.diamondInfo.facets.length} facets • {selectedContract.diamondInfo.totalFunctions} functions
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-4 border">
                <div className="text-2xl font-bold text-green-600">
                  {selectedContract.diamondInfo.facets.filter(f => f.verified).length}
                </div>
                <div className="text-sm text-gray-600">Verified Facets</div>
              </div>
              <div className="bg-white rounded-lg p-4 border">
                <div className="text-2xl font-bold text-blue-600">
                  {diamondFunctions.length}
                </div>
                <div className="text-sm text-gray-600">Available Functions</div>
              </div>
              <div className="bg-white rounded-lg p-4 border">
                <div className="text-2xl font-bold text-purple-600">
                  {selectedContract.diamondInfo.facets.filter(f => !f.verified).length}
                </div>
                <div className="text-sm text-gray-600">Unverified Facets</div>
              </div>
            </div>
          </div>

          {/* Facet Details */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Facet Details</h3>
            
            {selectedContract.diamondInfo.facets.map((facet, index) => (
              <div key={facet.address} className="border rounded-lg overflow-hidden">
                <div 
                  className="p-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => toggleFacetExpansion(facet.address)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {expandedFacets.has(facet.address) ? (
                        <ChevronDownIcon width={20} height={20} />
                      ) : (
                        <ChevronRightIcon width={20} height={20} />
                      )}
                      
                      <div>
                        <div className="font-medium">
                          Facet #{index + 1} {facet.name && `- ${facet.name}`}
                        </div>
                        <div className="text-sm text-gray-600 font-mono">
                          {facet.address}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {facet.verified ? (
                          <CheckCircleIcon width={16} height={16} className="text-green-600" />
                        ) : (
                          <XCircleIcon width={16} height={16} className="text-red-600" />
                        )}
                        <span className="text-sm text-gray-600">
                          {facet.functionCount} functions
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <a
                        href={`${selectedContract.chain.explorerUrl}/address/${facet.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-gray-600 hover:text-gray-800 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink size={16} />
                      </a>
                      <InlineCopyButton
                        value={facet.address}
                        ariaLabel="Copy facet address"
                        iconSize={14}
                        size={30}
                      />
                    </div>
                  </div>
                </div>
                
                {/* Expanded Facet Content */}
                {expandedFacets.has(facet.address) && (
                  <div className="p-4 border-t bg-white">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Verification Status
                        </label>
                        <div className={`px-3 py-1 rounded-full text-sm inline-flex items-center gap-2 ${
                          facet.verified ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {facet.verified ? (
                            <>
                              <CheckCircleIcon width={14} height={14} />
                              Verified
                            </>
                          ) : (
                            <>
                              <XCircleIcon width={14} height={14} />
                              Unverified
                            </>
                          )}
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Function Count
                        </label>
                        <div className="text-lg font-semibold text-gray-900">
                          {facet.functionCount}
                        </div>
                      </div>
                    </div>
                    
                    {facet.verified ? (
                      <div className="text-sm text-green-700 bg-green-50 p-3 rounded-lg">
                        <CheckCircleIcon width={14} height={14} style={{ marginRight: '4px' }} />This facet is verified and its functions are available for interaction below.
                      </div>
                    ) : (
                      <div className="text-sm text-red-700 bg-red-50 p-3 rounded-lg">
                        <AlertTriangleIcon width={14} height={14} style={{ marginRight: '4px' }} />This facet is not verified. Function calls may be limited to known selectors only.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Diamond Function Caller */}
          {diamondFunctions.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center gap-2 mb-4">
                <Zap size={20} className="text-purple-600" />
                <h3 className="text-lg font-semibold">Function Interaction</h3>
                <span className="text-sm text-gray-600">
                  ({diamondFunctions.length} functions available)
                </span>
              </div>
              
              <DiamondFunctionCaller
                contractAddress={selectedContract.results.find(r => r.verified)?.chain ? 
                  selectedContract.results.find(r => r.verified)!.name || "" : ""}
                chain={selectedContract.chain}
                functions={diamondFunctions}
                provider={provider}
              />
            </div>
          )}
        </div>
      )}

      {/* No Diamond Selected State */}
      {activeTab === 'interact' && !selectedContract?.diamondInfo?.isDiamond && (
        <div className="text-center py-12">
          <GemIcon width={64} height={64} className="text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-gray-600 mb-2">
            No Diamond Contract Selected
          </h3>
          <p className="text-gray-500 mb-6">
            Search for a contract in the Search tab to get started with Diamond interaction.
          </p>
          <button
            onClick={() => setActiveTab('search')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Network size={16} className="inline mr-2" />
            Go to Search
          </button>
        </div>
      )}
    </div>
  );
};

export default DiamondContractInterface;
