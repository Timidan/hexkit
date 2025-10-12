import React, { useState, useEffect } from 'react';
import { XCloseIcon, GemIcon, ExternalLinkIcon, CopyIcon } from './icons/IconLibrary';
import { Search, AlertTriangle } from 'lucide-react';
import { useNotifications } from './NotificationManager';
import type { DiamondFacet } from '../utils/diamondFacetFetcher';
import SelectorDecoder, { type DecodedSelector } from './shared/SelectorDecoder';
import { ethers } from 'ethers';
import { SUPPORTED_CHAINS } from '../utils/chains';
import type { Chain } from '../types';
import InlineCopyButton from './ui/InlineCopyButton';
import { copyTextToClipboard } from '../utils/clipboard';

interface DiamondContractPopupProps {
  isOpen: boolean;
  onClose: () => void;
  contractAddress: string;
  facets: DiamondFacet[];
  networkName: string;
  blockExplorerUrl?: string;
  chain?: Chain;
}

interface FacetFunction {
  name: string;
  selector: string;
  type: 'function' | 'fallback' | 'receive';
  stateMutability?: string;
  inputs?: any[];
  outputs?: any[];
}

const DiamondContractPopup: React.FC<DiamondContractPopupProps> = ({
  isOpen,
  onClose,
  contractAddress,
  facets,
  networkName,
  blockExplorerUrl,
  chain
}) => {
  const { showSuccess, showError } = useNotifications();
  const [selectedFacetIndex, setSelectedFacetIndex] = useState<number>(0);
  const [expandedABI, setExpandedABI] = useState<boolean>(false);
  const [facetSelectors, setFacetSelectors] = useState<{[facetAddress: string]: string[]}>({});
  const [isLoadingSelectors, setIsLoadingSelectors] = useState<{[facetAddress: string]: boolean}>({});
  const [decodedSelectors, setDecodedSelectors] = useState<{[facetAddress: string]: DecodedSelector[]}>({});

  // Reset selected facet when popup opens
  useEffect(() => {
    if (isOpen) {
      setSelectedFacetIndex(0);
      setExpandedABI(false);
      loadUnverifiedFacetSelectors();
    }
  }, [isOpen, facets]);

  // Load function selectors for unverified facets
  const loadUnverifiedFacetSelectors = async () => {
    if (!chain) return;
    
    const unverifiedFacets = facets.filter(facet => !facet.isVerified);
    
    for (const facet of unverifiedFacets) {
      if (facetSelectors[facet.address]) continue; // Already loaded
      
      setIsLoadingSelectors(prev => ({ ...prev, [facet.address]: true }));
      
      try {
        const selectors = await fetchFacetFunctionSelectors(contractAddress, facet.address, chain);
        setFacetSelectors(prev => ({ ...prev, [facet.address]: selectors }));
      } catch (error) {
        console.warn(`Failed to load selectors for facet ${facet.address}:`, error);
      } finally {
        setIsLoadingSelectors(prev => ({ ...prev, [facet.address]: false }));
      }
    }
  };

  // Fetch function selectors for a specific facet using diamond's facetFunctionSelectors
  const fetchFacetFunctionSelectors = async (diamondAddress: string, facetAddress: string, chain: Chain): Promise<string[]> => {
    const provider = new ethers.providers.JsonRpcProvider(chain.rpcUrl);
    
    // Diamond contract ABI for facetFunctionSelectors function
    const diamondABI = [
      "function facetFunctionSelectors(address facet) external view returns (bytes4[] memory)"
    ];
    
    const diamondContract = new ethers.Contract(diamondAddress, diamondABI, provider);
    
    try {
      const selectors: string[] = await diamondContract.facetFunctionSelectors(facetAddress);
      return selectors.map((selector: string) => selector.toLowerCase());
    } catch (error) {
      throw new Error(`Failed to fetch selectors: ${error}`);
    }
  };

  const handleCopyWithToast = async (text: string, label: string) => {
    try {
      await copyTextToClipboard(text);
      showSuccess('Copied!', `${label} copied to clipboard`);
    } catch (err) {
      showError('Copy Failed', 'Failed to copy to clipboard');
    }
  };

  // Handle decoded selectors for a facet
  const handleSelectorDecoded = (facetAddress: string, decodedResults: DecodedSelector[]) => {
    setDecodedSelectors(prev => ({ ...prev, [facetAddress]: decodedResults }));
  };

  if (!isOpen) return null;

  const selectedFacet = facets[selectedFacetIndex];

  const calculateFunctionSelector = (functionSignature: string): string => {
    // Use ethers to calculate the proper function selector
    try {
      const hash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(functionSignature));
      return hash.slice(0, 10); // First 4 bytes (8 hex chars + 0x)
    } catch (error) {
      // Fallback: simple hash-like calculation if ethers is not available
      let hash = 0;
      for (let i = 0; i < functionSignature.length; i++) {
        const char = functionSignature.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return `0x${(Math.abs(hash) >>> 0).toString(16).slice(0, 8).padStart(8, '0')}`;
    }
  };

  const getFacetFunctions = (facet: DiamondFacet): FacetFunction[] => {
    // For verified facets, use ABI-based approach
    if (facet.isVerified && facet.abi && facet.abi.length > 0) {
      const functions: FacetFunction[] = [];
      facet.abi.forEach((item: any) => {
        if (item.type === 'function') {
          // Calculate proper selector for the function
          const inputTypes = item.inputs?.map((input: any) => input.type).join(',') || '';
          const signature = `${item.name}(${inputTypes})`;
          const selector = calculateFunctionSelector(signature);

          functions.push({
            name: item.name,
            selector,
            type: item.type,
            stateMutability: item.stateMutability,
            inputs: item.inputs,
            outputs: item.outputs
          });
        }
      });
      return functions;
    }

    // For unverified facets, try to use decoded selectors from facetFunctionSelectors()
    if (!facet.isVerified) {
      const rawSelectors = facetSelectors[facet.address] || [];
      const decodedResults = decodedSelectors[facet.address] || [];
      
      if (rawSelectors.length > 0) {
        // Create functions from decoded selectors or raw selectors
        return rawSelectors.map((selector: string) => {
          const decoded = decodedResults.find(d => d.selector.toLowerCase() === selector.toLowerCase());
          
          return {
            name: decoded?.signature || `Unknown Function (${selector})`,
            selector: selector,
            type: 'function' as const,
            stateMutability: 'unknown' as any
          };
        });
      }
    }

    // Fallback: try legacy functions structure
    if (!facet.abi || facet.abi.length === 0) {
      const allFunctions: FacetFunction[] = [];
      
      if (facet.functions?.read) {
        facet.functions.read.forEach((func: any) => {
          const functionName = func.name || 'unknownFunction';
          const inputTypes = func.inputs?.map((input: any) => input.type).join(',') || '';
          const signature = `${functionName}(${inputTypes})`;
          
          allFunctions.push({
            name: functionName,
            selector: calculateFunctionSelector(signature),
            type: 'function' as const,
            stateMutability: 'view'
          });
        });
      }
      
      if (facet.functions?.write) {
        facet.functions.write.forEach((func: any) => {
          const functionName = func.name || 'unknownFunction';
          const inputTypes = func.inputs?.map((input: any) => input.type).join(',') || '';
          const signature = `${functionName}(${inputTypes})`;
          
          allFunctions.push({
            name: functionName,
            selector: calculateFunctionSelector(signature),
            type: 'function' as const,
            stateMutability: func.stateMutability || 'nonpayable'
          });
        });
      }
      
      if (allFunctions.length > 0) return allFunctions;
    }

    // Final fallback
    return [{
      name: 'No Functions Available',
      selector: '0x00000000',
      type: 'function' as const
    }];
  };

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        style={{
          backgroundColor: '#1a1b23',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          width: '100%',
          maxWidth: '900px',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <GemIcon width={24} height={24} style={{ color: '#3b82f6' }} />
            <div>
              <h2 style={{ 
                margin: 0, 
                color: 'white', 
                fontSize: '20px', 
                fontWeight: '600' 
              }}>
                Diamond Contract Details
              </h2>
              <div style={{ 
                fontSize: '14px', 
                color: '#9ca3af', 
                fontFamily: 'monospace',
                marginTop: '4px'
              }}>
                {contractAddress}
                <span style={{ marginLeft: '8px' }}>
                  <InlineCopyButton
                    value={contractAddress}
                    ariaLabel="Copy contract address"
                    iconSize={14}
                    size={32}
                    onCopySuccess={() => showSuccess('Copied!', 'Contract address copied to clipboard')}
                    onCopyError={() => showError('Copy Failed', 'Failed to copy to clipboard')}
                  />
                </span>
              </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {blockExplorerUrl && (
              <a
                href={`${blockExplorerUrl}/address/${contractAddress}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: '#6b7280',
                  textDecoration: 'none',
                  padding: '8px',
                  borderRadius: '8px',
                  transition: 'color 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#3b82f6'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
              >
                <ExternalLinkIcon width={18} height={18} />
              </a>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#6b7280',
                padding: '8px',
                borderRadius: '8px',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                e.currentTarget.style.color = '#ef4444';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#6b7280';
              }}
            >
              <XCloseIcon width={20} height={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Facet List Sidebar */}
          <div style={{
            width: '300px',
            borderRight: '1px solid rgba(255, 255, 255, 0.1)',
            overflow: 'auto',
            backgroundColor: '#0f1015'
          }}>
            <div style={{ padding: '16px' }}>
              <h3 style={{ 
                margin: '0 0 12px 0', 
                color: 'white', 
                fontSize: '16px', 
                fontWeight: '600' 
              }}>
                Facets ({facets.length})
              </h3>
              
              {facets.map((facet, index) => (
                <div
                  key={index}
                  onClick={() => setSelectedFacetIndex(index)}
                  style={{
                    padding: '12px',
                    marginBottom: '8px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor: selectedFacetIndex === index 
                      ? 'rgba(59, 130, 246, 0.1)' 
                      : 'rgba(255, 255, 255, 0.02)',
                    borderColor: selectedFacetIndex === index 
                      ? 'rgba(59, 130, 246, 0.3)' 
                      : 'rgba(255, 255, 255, 0.1)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedFacetIndex !== index) {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedFacetIndex !== index) {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
                    }
                  }}
                >
                  <div style={{ 
                    fontSize: '14px', 
                    fontWeight: '500', 
                    color: 'white',
                    marginBottom: '4px'
                  }}>
                    {facet.name || 'Unknown Facet'}
                  </div>
                  
                  <div style={{ 
                    fontSize: '12px', 
                    color: '#9ca3af', 
                    fontFamily: 'monospace',
                    marginBottom: '4px'
                  }}>
                    {facet.address.slice(0, 10)}...{facet.address.slice(-8)}
                  </div>
                  
                  <div style={{ 
                    fontSize: '12px', 
                    color: '#6b7280'
                  }}>
                    {getFacetFunctions(facet).length} functions
                  </div>
                  
                  <div style={{ 
                    fontSize: '11px', 
                    color: facet.isVerified ? '#10b981' : '#f59e0b',
                    marginTop: '4px'
                  }}>
                    {facet.isVerified ? ' Verified' : ' Unverified'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Facet Details */}
          <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
            {selectedFacet && (
              <>
                {/* Facet Header */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <h3 style={{ 
                      margin: 0, 
                      color: 'white', 
                      fontSize: '18px', 
                      fontWeight: '600' 
                    }}>
                      {selectedFacet.name || 'Unknown Facet'}
                    </h3>
                    <span style={{ 
                      fontSize: '12px', 
                      color: selectedFacet.isVerified ? '#10b981' : '#f59e0b',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: selectedFacet.isVerified 
                        ? 'rgba(16, 185, 129, 0.1)' 
                        : 'rgba(245, 158, 11, 0.1)'
                    }}>
                      {selectedFacet.isVerified ? 'Verified' : 'Unverified'}
                    </span>
                  </div>
                  
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    color: '#9ca3af',
                    fontSize: '14px',
                    fontFamily: 'monospace'
                  }}>
                    {selectedFacet.address}
                    <InlineCopyButton
                      value={selectedFacet.address}
                      ariaLabel="Copy facet address"
                      iconSize={14}
                      size={32}
                      onCopySuccess={() => showSuccess('Copied!', 'Facet address copied to clipboard')}
                      onCopyError={() => showError('Copy Failed', 'Failed to copy to clipboard')}
                    />
                  </div>
                </div>

                {/* Functions */}
                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ 
                    margin: '0 0 12px 0', 
                    color: 'white', 
                    fontSize: '16px', 
                    fontWeight: '600' 
                  }}>
                    Functions ({getFacetFunctions(selectedFacet).length})
                  </h4>

                  {/* Show loading indicator for unverified facets */}
                  {!selectedFacet.isVerified && isLoadingSelectors[selectedFacet.address] && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px',
                      background: 'rgba(33, 150, 243, 0.1)',
                      border: '1px solid rgba(33, 150, 243, 0.3)',
                      borderRadius: '8px',
                      marginBottom: '16px'
                    }}>
                      <Search size={16} className="animate-spin" />
                      <span style={{ fontSize: '14px', color: '#64b5f6' }}>
                        Loading function selectors...
                      </span>
                    </div>
                  )}

                  {/* Selector Decoder for unverified facets */}
                  {!selectedFacet.isVerified && facetSelectors[selectedFacet.address] && facetSelectors[selectedFacet.address].length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      <SelectorDecoder
                        selectors={facetSelectors[selectedFacet.address]}
                        onDecoded={(results) => handleSelectorDecoded(selectedFacet.address, results)}
                        onError={(error) => showError('Decoder Error', error)}
                        showProgress={false}
                        className="facet-selector-decoder"
                      />
                    </div>
                  )}

                  {/* Unverified facet note */}
                  {!selectedFacet.isVerified && (
                    <div style={{
                      padding: '12px',
                      background: 'rgba(245, 158, 11, 0.1)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      borderRadius: '8px',
                      marginBottom: '16px'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '12px',
                        color: '#f59e0b'
                      }}>
                        <AlertTriangle size={14} />
                        <span>Unverified Facet - Function names resolved using signature database</span>
                      </div>
                    </div>
                  )}
                  
                  <div style={{ 
                    backgroundColor: '#0f1015',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    {getFacetFunctions(selectedFacet).map((func, index) => (
                      <div
                        key={index}
                        style={{
                          padding: '12px 16px',
                          borderBottom: index < getFacetFunctions(selectedFacet).length - 1 
                            ? '1px solid rgba(255, 255, 255, 0.05)' 
                            : 'none'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ 
                            color: 'white', 
                            fontSize: '14px', 
                            fontWeight: '500' 
                          }}>
                            {func.name}
                          </span>
                          {func.stateMutability && (
                            <span style={{ 
                              fontSize: '11px', 
                              color: func.stateMutability === 'view' || func.stateMutability === 'pure' 
                                ? '#3b82f6' 
                                : '#ef4444',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: func.stateMutability === 'view' || func.stateMutability === 'pure'
                                ? 'rgba(59, 130, 246, 0.1)'
                                : 'rgba(239, 68, 68, 0.1)'
                            }}>
                              {func.stateMutability}
                            </span>
                          )}
                        </div>
                        
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '8px',
                          color: '#9ca3af',
                          fontSize: '12px',
                          fontFamily: 'monospace'
                        }}>
                          {func.selector}
                          <InlineCopyButton
                            value={func.selector}
                            ariaLabel={`Copy selector for ${func.name}`}
                            iconSize={12}
                            size={28}
                            onCopySuccess={() => showSuccess('Copied!', 'Function selector copied to clipboard')}
                            onCopyError={() => showError('Copy Failed', 'Failed to copy selector')}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ABI Section */}
                {selectedFacet.abi && selectedFacet.abi.length > 0 && (
                  <div>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      marginBottom: '12px'
                    }}>
                      <h4 style={{ 
                        margin: 0, 
                        color: 'white', 
                        fontSize: '16px', 
                        fontWeight: '600' 
                      }}>
                        ABI
                      </h4>
                      
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => setExpandedABI(!expandedABI)}
                          style={{
                            padding: '6px 12px',
                            background: 'rgba(59, 130, 246, 0.1)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            borderRadius: '6px',
                            color: '#3b82f6',
                            fontSize: '12px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          {expandedABI ? 'Collapse' : 'Expand'}
                        </button>
                        
                        <button
                          onClick={() => handleCopyWithToast(JSON.stringify(selectedFacet.abi, null, 2), 'Facet ABI')}
                          style={{
                            padding: '6px 12px',
                            background: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            borderRadius: '6px',
                            color: '#10b981',
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <CopyIcon width={12} height={12} />
                          Copy ABI
                        </button>
                      </div>
                    </div>
                    
                    <div style={{ 
                      backgroundColor: '#0f1015',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      maxHeight: expandedABI ? '400px' : '120px',
                      overflow: 'auto',
                      transition: 'max-height 0.3s ease'
                    }}>
                      <pre style={{
                        margin: 0,
                        padding: '16px',
                        color: '#e2e8f0',
                        fontSize: '12px',
                        fontFamily: 'Monaco, "Roboto Mono", monospace',
                        lineHeight: '1.4',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all'
                      }}>
                        {JSON.stringify(selectedFacet.abi, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiamondContractPopup;
