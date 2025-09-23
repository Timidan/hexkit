import React, { useState } from 'react';
import { ChevronDown, Network, Wifi, WifiOff } from 'lucide-react';
import type { Chain } from '../../types';

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
  icon?: string;
  color?: string;
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
    icon: '⟠'
  },
  {
    id: 137,
    name: 'Polygon',
    rpcUrl: 'https://polygon-mainnet.g.alchemy.com/v2/demo',
    blockExplorer: 'https://polygonscan.com',
    isTestnet: false,
    category: 'mainnet',
    color: '#8247e5',
    icon: '⬟'
  },
  {
    id: 42161,
    name: 'Arbitrum One',
    rpcUrl: 'https://arb-mainnet.g.alchemy.com/v2/demo',
    blockExplorer: 'https://arbiscan.io',
    isTestnet: false,
    category: 'mainnet',
    color: '#28a0f0',
    icon: '🔵'
  },
  {
    id: 10,
    name: 'Optimism',
    rpcUrl: 'https://opt-mainnet.g.alchemy.com/v2/demo',
    blockExplorer: 'https://optimistic.etherscan.io',
    isTestnet: false,
    category: 'mainnet',
    color: '#ff0420',
    icon: '🔴'
  },
  {
    id: 8453,
    name: 'Base',
    rpcUrl: 'https://base-mainnet.g.alchemy.com/v2/demo',
    blockExplorer: 'https://basescan.org',
    isTestnet: false,
    category: 'mainnet',
    color: '#0052ff',
    icon: '🟦'
  },
  {
    id: 56,
    name: 'BNB Smart Chain',
    rpcUrl: 'https://bsc-dataseed.binance.org',
    blockExplorer: 'https://bscscan.com',
    isTestnet: false,
    category: 'mainnet',
    color: '#f3ba2f',
    icon: '🟡'
  },
  {
    id: 100,
    name: 'Gnosis Chain',
    rpcUrl: 'https://rpc.gnosischain.com',
    blockExplorer: 'https://gnosisscan.io',
    isTestnet: false,
    category: 'mainnet',
    color: '#3e6957',
    icon: '🟢'
  },
  
  // Testnets
  {
    id: 11155111,
    name: 'Sepolia',
    rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/demo',
    blockExplorer: 'https://sepolia.etherscan.io',
    isTestnet: true,
    category: 'testnet',
    color: '#627eea',
    icon: '⟠'
  },
  {
    id: 5,
    name: 'Goerli',
    rpcUrl: 'https://eth-goerli.g.alchemy.com/v2/demo',
    blockExplorer: 'https://goerli.etherscan.io',
    isTestnet: true,
    category: 'testnet',
    color: '#627eea',
    icon: '⟠'
  },
  {
    id: 80001,
    name: 'Polygon Mumbai',
    rpcUrl: 'https://polygon-mumbai.g.alchemy.com/v2/demo',
    blockExplorer: 'https://mumbai.polygonscan.com',
    isTestnet: true,
    category: 'testnet',
    color: '#8247e5',
    icon: '⬟'
  },
  {
    id: 421614,
    name: 'Arbitrum Sepolia',
    rpcUrl: 'https://arb-sepolia.g.alchemy.com/v2/demo',
    blockExplorer: 'https://sepolia.arbiscan.io',
    isTestnet: true,
    category: 'testnet',
    color: '#28a0f0',
    icon: '🔵'
  },
  {
    id: 11155420,
    name: 'Optimism Sepolia',
    rpcUrl: 'https://opt-sepolia.g.alchemy.com/v2/demo',
    blockExplorer: 'https://sepolia-optimism.etherscan.io',
    isTestnet: true,
    category: 'testnet',
    color: '#ff0420',
    icon: '🔴'
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
    icon: '🟦'
  },
  {
    id: 97,
    name: 'BNB Testnet',
    rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
    blockExplorer: 'https://testnet.bscscan.com',
    isTestnet: true,
    category: 'testnet',
    color: '#f3ba2f',
    icon: '🟡'
  },
];

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
  const [showTestnetToggle, setShowTestnetToggle] = useState(showTestnets);

  // Filter networks based on testnet preference
  const filteredNetworks = networks.filter(network => 
    showTestnetToggle ? true : !network.isTestnet
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

  const getNetworkIcon = (network: ExtendedChain) => {
    return network.icon || '🌐';
  };

  const getNetworkStatus = (network: ExtendedChain) => {
    return network.isTestnet ? 'Testnet' : 'Mainnet';
  };

  return (
    <div className={`network-selector ${className}`} style={{ position: 'relative' }}>
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
            {selectedNetwork ? getNetworkIcon(selectedNetwork) : '🌐'}
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
          {/* Testnet toggle */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            background: 'rgba(255, 255, 255, 0.02)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                color: '#9ca3af'
              }}>
                <span>{mainnetCount} Mainnets • {testnetCount} Testnets</span>
              </div>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTestnetToggle(!showTestnetToggle);
                }}
                style={{
                  padding: '4px 8px',
                  background: showTestnetToggle ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                  border: `1px solid ${showTestnetToggle ? 'rgba(245, 158, 11, 0.4)' : 'rgba(255, 255, 255, 0.2)'}`,
                  borderRadius: '6px',
                  fontSize: '11px',
                  color: showTestnetToggle ? '#fbbf24' : '#9ca3af',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {showTestnetToggle ? 'Hide Testnets' : 'Show Testnets'}
              </button>
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
                fontSize: '20px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: network.color ? `${network.color}20` : 'rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                border: network.color ? `1px solid ${network.color}40` : '1px solid rgba(255, 255, 255, 0.2)'
              }}>
                {getNetworkIcon(network)}
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
