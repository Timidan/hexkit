import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Network, Wifi, WifiOff } from 'lucide-react';
import type { Chain } from '../../types';
import ChainIcon, { type ChainKey } from '../icons/ChainIcon';

const API_KEY =
  (import.meta.env as unknown as { API_KEY?: string; VITE_API_KEY?: string })
    .API_KEY ||
  (import.meta.env as unknown as { API_KEY?: string; VITE_API_KEY?: string })
    .VITE_API_KEY ||
  '';

// Enhanced chain configuration with testnet support
export interface ExtendedChain extends Partial<Chain> {
  id: number;
  name: string;
  rpcUrl?: string;
  blockExplorer?: string;
  isTestnet?: boolean;
  category?: 'mainnet' | 'testnet' | 'local';
  color?: string;
  chainKey?: ChainKey;
}

// Comprehensive network list with mainnets and testnets
export const EXTENDED_NETWORKS: ExtendedChain[] = [
  // Mainnets
  {
    id: 1,
    name: 'Ethereum',
    rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/demo',
    blockExplorer: 'https://etherscan.io',
    isTestnet: false,
    category: 'mainnet',
    color: '#627eea',
    chainKey: 'ETH'
  },
  {
    id: 137,
    name: 'Polygon',
    rpcUrl: 'https://polygon-mainnet.g.alchemy.com/v2/demo',
    blockExplorer: 'https://polygonscan.com',
    isTestnet: false,
    category: 'mainnet',
    color: '#8247e5',
    chainKey: 'POLY'
  },
  {
    id: 42161,
    name: 'Arbitrum One',
    rpcUrl: 'https://arb-mainnet.g.alchemy.com/v2/demo',
    blockExplorer: 'https://arbiscan.io',
    isTestnet: false,
    category: 'mainnet',
    color: '#28a0f0',
    chainKey: 'ARB'
  },
  {
    id: 10,
    name: 'Optimism',
    rpcUrl: 'https://opt-mainnet.g.alchemy.com/v2/demo',
    blockExplorer: 'https://optimistic.etherscan.io',
    isTestnet: false,
    category: 'mainnet',
    color: '#ff0420',
    chainKey: 'OP'
  },
  {
    id: 8453,
    name: 'Base',
    rpcUrl: 'https://base-mainnet.g.alchemy.com/v2/demo',
    blockExplorer: 'https://basescan.org',
    isTestnet: false,
    category: 'mainnet',
    color: '#0052ff',
    chainKey: 'BASE'
  },
  {
    id: 56,
    name: 'BNB Smart Chain',
    rpcUrl: 'https://bsc-dataseed.binance.org',
    blockExplorer: 'https://bscscan.com',
    isTestnet: false,
    category: 'mainnet',
    color: '#f3ba2f',
    chainKey: 'BSC'
  },
  {
    id: 100,
    name: 'Gnosis Chain',
    rpcUrl: 'https://rpc.gnosischain.com',
    blockExplorer: 'https://gnosisscan.io',
    isTestnet: false,
    category: 'mainnet',
    color: '#3e6957',
    chainKey: 'GNO'
  },
  
  // Testnets
  {
    id: 11155111,
    name: 'Sepolia',
    rpcUrl: (API_KEY
      ? `https://eth-sepolia.g.alchemy.com/v2/${API_KEY}`
      : 'https://rpc.sepolia.ethpandaops.io'),
    blockExplorer: 'https://sepolia.etherscan.io',
    isTestnet: true,
    category: 'testnet',
    color: '#627eea',
    chainKey: 'ETH'
  },
  {
    id: 17000,
    name: 'Holesky',
    rpcUrl: 'https://ethereum-holesky.publicnode.com',
    blockExplorer: 'https://holesky.etherscan.io',
    isTestnet: true,
    category: 'testnet',
    color: '#627eea',
    chainKey: 'ETH'
  },
  {
    id: 80002,
    name: 'Polygon Amoy',
    rpcUrl: 'https://rpc-amoy.polygon.technology',
    blockExplorer: 'https://amoy.polygonscan.com',
    isTestnet: true,
    category: 'testnet',
    color: '#8247e5',
    chainKey: 'POLY'
  },
  {
    id: 421614,
    name: 'Arbitrum Sepolia',
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    blockExplorer: 'https://sepolia.arbiscan.io',
    isTestnet: true,
    category: 'testnet',
    color: '#28a0f0',
    chainKey: 'ARB'
  },
  {
    id: 11155420,
    name: 'Optimism Sepolia',
    rpcUrl: 'https://sepolia.optimism.io',
    blockExplorer: 'https://sepolia-optimism.etherscan.io',
    isTestnet: true,
    category: 'testnet',
    color: '#ff0420',
    chainKey: 'OP'
  },
  {
    id: 4202,
    name: 'Lisk Sepolia',
    rpcUrl: 'https://rpc.sepolia-api.lisk.com',
    blockExplorer: 'https://sepolia-blockscout.lisk.com',
    isTestnet: true,
    category: 'testnet',
    color: '#0f74ff',
    chainKey: 'LISK'
  },
  {
    id: 84532,
    name: 'Base Sepolia',
    rpcUrl: API_KEY
      ? `https://base-sepolia.g.alchemy.com/v2/${API_KEY}`
      : 'https://sepolia.base.org',
    blockExplorer: 'https://sepolia.basescan.org',
    isTestnet: true,
    category: 'testnet',
    color: '#0052ff',
    chainKey: 'BASE'
  },
  {
    id: 97,
    name: 'BNB Testnet',
    rpcUrl: 'https://bsc-testnet.public.blastapi.io',
    blockExplorer: 'https://testnet.bscscan.com',
    isTestnet: true,
    category: 'testnet',
    color: '#f3ba2f',
    chainKey: 'BSC'
  },
];

const getDefaultChainKey = (id: number): ChainKey => {
  switch (id) {
    case 1:
    case 17000:
    case 11155111:
      return 'ETH';
    case 137:
    case 80002:
      return 'POLY';
    case 42161:
    case 421614:
      return 'ARB';
    case 10:
    case 11155420:
      return 'OP';
    case 8453:
    case 84532:
      return 'BASE';
    case 56:
    case 97:
      return 'BSC';
    case 100:
      return 'GNO';
    case 4202:
      return 'LISK';
    default:
      return 'ETH';
  }
};

export interface NetworkSelectorProps {
  selectedNetwork: ExtendedChain | null;
  onNetworkChange: (network: ExtendedChain) => void;
  networks?: ExtendedChain[];
  showTestnets?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'compact';
}

const NetworkSelector: React.FC<NetworkSelectorProps> = ({
  selectedNetwork,
  onNetworkChange,
  networks = EXTENDED_NETWORKS,
  showTestnets = false,
  className = '',
  size = 'md',
  variant = 'default'
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [networkCategory, setNetworkCategory] = useState<'live' | 'testnet'>(
    selectedNetwork?.isTestnet ? 'testnet' : showTestnets ? 'testnet' : 'live'
  );
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!selectedNetwork) return;
    setNetworkCategory(selectedNetwork.isTestnet ? 'testnet' : 'live');
  }, [selectedNetwork?.id, selectedNetwork?.isTestnet]);

  useEffect(() => {
    if (!isDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('keydown', handleEscape, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [isDropdownOpen]);

  const filteredNetworks = networks.filter((network) =>
    networkCategory === 'testnet' ? network.isTestnet : !network.isTestnet
  );

  const mainnetCount = networks.filter(n => !n.isTestnet).length;
  const testnetCount = networks.filter(n => n.isTestnet).length;

  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return {
          button: { padding: '8px 12px', fontSize: '14px' },
          icon: 20,
          dropdown: { fontSize: '13px' }
        };
      case 'md':
        return {
          button: { padding: '12px 16px', fontSize: '16px' },
          icon: 24,
          dropdown: { fontSize: '14px' }
        };
      case 'lg':
        return {
          button: { padding: '16px 20px', fontSize: '18px' },
          icon: 28,
          dropdown: { fontSize: '16px' }
        };
      default:
        return {
          button: { padding: '12px 16px', fontSize: '16px' },
          icon: 24,
          dropdown: { fontSize: '14px' }
        };
    }
  };

  const sizeStyles = getSizeStyles();

  const getNetworkStatus = (network: ExtendedChain) => {
    return network.isTestnet ? 'Testnet' : 'Mainnet';
  };

  const renderNetworkIcon = (
    network?: ExtendedChain | null,
    size = sizeStyles.icon
  ) => {
    if (!network) {
      return <Network size={size} />;
    }

    const resolvedKey = network.chainKey ?? getDefaultChainKey(network.id);

    return (
      <ChainIcon
        chain={resolvedKey}
        size={size}
        rounded={Math.max(6, Math.round(size / 2))}
      />
    );
  };

  const dropdownIconSize = Math.max(20, sizeStyles.icon);

  return (
    <div
      ref={containerRef}
      className={`network-selector ${className}`}
      style={{ position: 'relative' }}
    >
      {variant === 'default' && (
        <label style={{
          fontSize: '14px',
          fontWeight: '600',
          color: '#fff',
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Network size={16} />
          Network
        </label>
      )}

      {/* Main selector button */}
      <div
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        style={{
          ...sizeStyles.button,
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: variant === 'compact' ? '8px' : '12px',
          cursor: 'pointer',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minWidth: variant === 'compact' ? '140px' : '200px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            fontSize: sizeStyles.icon,
            width: `${sizeStyles.icon + 8}px`,
            height: `${sizeStyles.icon + 8}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: selectedNetwork?.color ? `${selectedNetwork.color}20` : 'rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            border: selectedNetwork?.color ? `1px solid ${selectedNetwork.color}40` : '1px solid rgba(255, 255, 255, 0.2)'
          }}>
            {renderNetworkIcon(selectedNetwork)}
          </div>
          
          {variant === 'default' && (
            <div>
              <div style={{ 
                fontSize: sizeStyles.button.fontSize, 
                fontWeight: '600', 
                color: '#fff',
                lineHeight: '1.2'
              }}>
                {selectedNetwork?.name || 'Select Network'}
              </div>
              {selectedNetwork && (
                <div style={{ 
                  fontSize: '12px', 
                  color: selectedNetwork.isTestnet ? '#fbbf24' : '#22c55e',
                  marginTop: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  {selectedNetwork.isTestnet ? <WifiOff size={10} /> : <Wifi size={10} />}
                  {getNetworkStatus(selectedNetwork)}
                </div>
              )}
            </div>
          )}
        </div>
        
        <ChevronDown
          size={size === 'sm' ? 16 : size === 'lg' ? 20 : 18}
          style={{
            color: 'rgba(255, 255, 255, 0.6)',
            transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.3s ease'
          }}
        />
      </div>

      {/* Dropdown menu */}
      {isDropdownOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: 'rgba(20, 20, 20, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '12px',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          zIndex: 1000,
          marginTop: '8px',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          maxHeight: '400px',
          overflowY: 'auto'
        }}>
          {/* Category selector */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            background: 'rgba(255, 255, 255, 0.02)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                color: '#9ca3af'
              }}>
                <span>{mainnetCount} Live • {testnetCount} Testnets</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'rgba(148, 163, 184, 0.8)'
                  }}
                >
                  Network Type
                </span>
                <div
                  data-style-version="glass-v2"
                  role="tablist"
                  aria-label="Network Type"
                  style={{
                    display: 'inline-flex',
                    position: 'relative',
                    padding: '2px',
                    borderRadius: '12px',
                    border: '1px solid rgba(148, 163, 184, 0.16)',
                    background: 'rgba(15, 23, 42, 0.55)',
                    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.45)',
                    backdropFilter: 'blur(14px)',
                    WebkitBackdropFilter: 'blur(14px)'
                  }}
                >
                  {(['live', 'testnet'] as const).map((category) => {
                    const isActive = networkCategory === category;
                    const handleSelect = (event: React.SyntheticEvent) => {
                      event.stopPropagation();
                      setNetworkCategory(category);
                    };

                    return (
                      <div
                        key={category}
                        role="tab"
                        aria-selected={isActive}
                        tabIndex={0}
                        onClick={handleSelect}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            handleSelect(event);
                          }
                        }}
                        style={{
                          cursor: 'pointer',
                          padding: '8px 18px',
                          fontSize: '12px',
                          fontWeight: 600,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: isActive ? '#f9fafb' : '#cbd5f5',
                          background: isActive
                            ? 'rgba(99, 102, 241, 0.32)'
                            : 'transparent',
                          border: 'none',
                          outline: 'none',
                          transition: 'all 0.2s ease',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          borderRadius: '10px',
                          boxShadow: isActive
                            ? '0 12px 24px rgba(99, 102, 241, 0.35)'
                            : 'none'
                        }}
                      >
                        <span>{category === 'live' ? 'Live' : 'Testnet'}</span>
                        {isActive ? (
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background:
                                category === 'live'
                                  ? 'linear-gradient(135deg, #34d399, #22c55e)'
                                  : 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                              boxShadow:
                                category === 'live'
                                  ? '0 0 10px rgba(34, 197, 94, 0.65)'
                                  : '0 0 10px rgba(245, 158, 11, 0.65)'
                            }}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Network list */}
          {filteredNetworks.map((network) => (
            <div
              key={network.id}
              onClick={() => {
                onNetworkChange(network);
                setIsDropdownOpen(false);
              }}
              style={{
                padding: '16px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                ...sizeStyles.dropdown
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <div style={{
                fontSize: dropdownIconSize,
                width: `${dropdownIconSize + 8}px`,
                height: `${dropdownIconSize + 8}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: network.color ? `${network.color}20` : 'rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                border: network.color ? `1px solid ${network.color}40` : '1px solid rgba(255, 255, 255, 0.2)'
              }}>
                {renderNetworkIcon(network, dropdownIconSize)}
              </div>
              
              <div style={{ flex: 1 }}>
                <div style={{ 
                  fontSize: '14px', 
                  fontWeight: '600', 
                  color: '#fff',
                  marginBottom: '2px'
                }}>
                  {network.name}
                </div>
                <div style={{ 
                  fontSize: '12px', 
                  color: network.isTestnet ? '#fbbf24' : '#22c55e',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  {network.isTestnet ? <WifiOff size={10} /> : <Wifi size={10} />}
                  {getNetworkStatus(network)}
                </div>
              </div>

              {selectedNetwork?.id === network.id && (
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#22c55e',
                  boxShadow: '0 0 8px rgba(34, 197, 94, 0.4)'
                }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NetworkSelector;
