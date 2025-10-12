import React, { useState } from 'react';
import type { DiamondFacet } from '../utils/diamondFacetFetcher';
import { BookOpenIcon, EditIcon, ChevronRightIcon } from './icons/IconLibrary';
import InlineCopyButton from './ui/InlineCopyButton';

interface FacetSidebarProps {
  facets: DiamondFacet[];
  selectedFacet: string | null;
  onFacetSelect: (facetAddress: string) => void;
  onFunctionSelect: (facetAddress: string, functionName: string, functionType: 'read' | 'write') => void;
}

export const FacetSidebar: React.FC<FacetSidebarProps> = ({
  facets,
  selectedFacet,
  onFacetSelect,
  onFunctionSelect
}) => {
  const [expandedFacets, setExpandedFacets] = useState<Set<string>>(new Set());

  const toggleFacet = (facetAddress: string) => {
    const newExpanded = new Set(expandedFacets);
    if (newExpanded.has(facetAddress)) {
      newExpanded.delete(facetAddress);
    } else {
      newExpanded.add(facetAddress);
    }
    setExpandedFacets(newExpanded);
  };

  const shortenAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div style={{
      width: '300px',
      backgroundColor: '#1a1a1a',
      borderRight: '1px solid rgba(255, 255, 255, 0.1)',
      height: '100%',
      overflowY: 'auto',
      padding: '16px'
    }}>
      {/* Header */}
      <div style={{
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <h3 style={{
          color: '#ffffff',
          fontSize: '16px',
          fontWeight: '600',
          margin: '0 0 8px 0'
        }}>
          Diamond Facets
        </h3>
        <p style={{
          color: '#888',
          fontSize: '12px',
          margin: 0
        }}>
          {facets.length} facet{facets.length !== 1 ? 's' : ''} found
        </p>
      </div>

      {/* Facets List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {facets.map((facet) => {
          const isExpanded = expandedFacets.has(facet.address);
          const isSelected = selectedFacet === facet.address;
          const totalFunctions = facet.functions.read.length + facet.functions.write.length;

          return (
            <div key={facet.address} style={{
              backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255, 255, 255, 0.05)',
              borderRadius: '8px',
              border: isSelected ? '1px solid #6366f1' : '1px solid rgba(255, 255, 255, 0.1)',
              overflow: 'hidden'
            }}>
              {/* Facet Header */}
              <div
                style={{
                  padding: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
                onClick={() => toggleFacet(facet.address)}
              >
                <div style={{ flex: 1 }}>
                  <div style={{
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: '500',
                    marginBottom: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span>{facet.name}</span>
                    {!facet.isVerified && (
                      <span style={{
                        backgroundColor: '#f59e0b',
                        color: '#000',
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: '600'
                      }}>
                        UNVERIFIED
                      </span>
                    )}
                  </div>
                  <div style={{
                    color: '#888',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span>{shortenAddress(facet.address)}</span>
                    <InlineCopyButton
                      value={facet.address}
                      ariaLabel="Copy facet address"
                      iconSize={12}
                      size={30}
                    />
                  </div>
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{
                    color: '#888',
                    fontSize: '12px'
                  }}>
                    {totalFunctions} func{totalFunctions !== 1 ? 's' : ''}
                  </span>
                  <span
                    style={{
                      color: '#888',
                      fontSize: '12px',
                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    <ChevronRightIcon width={12} height={12} />
                  </span>
                </div>
              </div>

              {/* Facet Functions */}
              {isExpanded && (
                <div style={{
                  borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                  padding: '8px 12px 12px 12px'
                }}>
                  {/* Read Functions */}
                  {facet.functions.read.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{
                        color: '#10b981',
                        fontSize: '12px',
                        fontWeight: '600',
                        marginBottom: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <BookOpenIcon width={16} height={16} />
                        <span>Read ({facet.functions.read.length})</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {facet.functions.read.slice(0, 5).map((func: any) => (
                          <button
                            key={func.name}
                            onClick={() => onFunctionSelect(facet.address, func.name, 'read')}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#10b981',
                              fontSize: '12px',
                              textAlign: 'left',
                              cursor: 'pointer',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontFamily: 'monospace',
                              transition: 'background-color 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                          >
                            {func.name}
                          </button>
                        ))}
                        {facet.functions.read.length > 5 && (
                          <div style={{
                            color: '#888',
                            fontSize: '11px',
                            fontStyle: 'italic',
                            padding: '4px 8px'
                          }}>
                            +{facet.functions.read.length - 5} more...
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Write Functions */}
                  {facet.functions.write.length > 0 && (
                    <div>
                      <div style={{
                        color: '#f59e0b',
                        fontSize: '12px',
                        fontWeight: '600',
                        marginBottom: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <EditIcon width={16} height={16} />
                        <span>Write ({facet.functions.write.length})</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {facet.functions.write.slice(0, 5).map((func: any) => (
                          <button
                            key={func.name}
                            onClick={() => onFunctionSelect(facet.address, func.name, 'write')}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#f59e0b',
                              fontSize: '12px',
                              textAlign: 'left',
                              cursor: 'pointer',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontFamily: 'monospace',
                              transition: 'background-color 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                          >
                            {func.name}
                          </button>
                        ))}
                        {facet.functions.write.length > 5 && (
                          <div style={{
                            color: '#888',
                            fontSize: '11px',
                            fontStyle: 'italic',
                            padding: '4px 8px'
                          }}>
                            +{facet.functions.write.length - 5} more...
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {facets.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          color: '#888'
        }}>
          <div style={{ fontSize: '24px', marginBottom: '12px' }}></div>
          <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
            No facets found
          </div>
          <div style={{ fontSize: '12px' }}>
            Facets will appear here once loaded
          </div>
        </div>
      )}
    </div>
  );
};
