import React, { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input, Button, LoadingSpinner, ErrorDisplay, Badge } from '../shared';
import ChainIcon, { type ChainKey } from '../icons/ChainIcon';
import type { Chain } from '../../types';
import '../../styles/ContractComponents.css';

// Map chain names to ChainKey
const getChainKey = (chain: Chain): ChainKey => {
  switch (chain.id) {
    case 1: return 'ETH';
    case 8453: return 'BASE';
    case 137: return 'POLY';
    case 42161: return 'ARB';
    case 10: return 'OP';
    case 56: return 'BSC';
    case 100: return 'GNO';
    default: return 'ETH';
  }
};

export interface ContractAddressInputProps {
  contractAddress: string;
  onAddressChange: (address: string) => void;
  selectedNetwork: Chain | null;
  onNetworkChange: (network: Chain) => void;
  supportedChains: Chain[];
  isLoading?: boolean;
  error?: string | null;
  onFetchABI?: () => void;
  contractName?: string;
  abiSource?: 'sourcify' | 'blockscout' | 'etherscan' | 'manual' | null;
  tokenInfo?: {
    symbol?: string;
    name?: string;
    decimals?: number;
  } | null;
  className?: string;
}

const ContractAddressInput: React.FC<ContractAddressInputProps> = ({
  contractAddress,
  onAddressChange,
  selectedNetwork,
  onNetworkChange,
  supportedChains,
  isLoading = false,
  error,
  onFetchABI,
  contractName,
  abiSource,
  tokenInfo,
  className = ''
}) => {
  const [showNetworkDropdown, setShowNetworkDropdown] = useState(false);

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onAddressChange(e.target.value);
  };

  const isValidAddress = contractAddress && contractAddress.length === 42 && contractAddress.startsWith('0x');

  return (
    <div className={`contract-address-input-container ${className}`}>
      {/* Network Selector */}
      <div>
        <label className="contract-network-label">
          Network
        </label>
        <div className="contract-network-dropdown">
          <button
            onClick={() => setShowNetworkDropdown(!showNetworkDropdown)}
            className="contract-network-button"
          >
            <div className="contract-network-content">
              {selectedNetwork && (
                <ChainIcon 
                  chain={getChainKey(selectedNetwork)} 
                  size={20}
                />
              )}
              <span className="contract-network-text">
                {selectedNetwork?.name || 'Select Network'}
              </span>
            </div>
            <svg className="contract-network-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showNetworkDropdown && (
            <div className="contract-network-dropdown-menu">
              {supportedChains.map((chain) => (
                <button
                  key={chain.id}
                  onClick={() => {
                    onNetworkChange(chain);
                    setShowNetworkDropdown(false);
                  }}
                  className="contract-network-option"
                >
                  <ChainIcon 
                    chain={getChainKey(chain)} 
                    size={20}
                  />
                  <span>{chain.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Contract Address Input */}
      <div>
        <Input
          label="Contract Address"
          value={contractAddress}
          onChange={handleAddressChange}
          placeholder="0x..."
          error={error || undefined}
          rightIcon={
            onFetchABI && isValidAddress ? (
              <button
                onClick={onFetchABI}
                disabled={isLoading}
                style={{ 
                  padding: 'var(--space-1)', 
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  transition: 'background var(--transition-normal)'
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {isLoading ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <Search size={16} />
                )}
              </button>
            ) : undefined
          }
        />
      </div>

      {/* Contract Info Display */}
      {contractName && (
        <div className="contract-info-display">
          <div className="contract-info-row">
            <span className="contract-info-label">Contract:</span>
            <span className="contract-info-value">{contractName}</span>
            {abiSource && (
              <Badge variant="info" size="sm">
                {abiSource}
              </Badge>
            )}
          </div>
          
          {tokenInfo && (
            <div className="contract-token-info">
              {tokenInfo.name && (
                <span className="contract-token-item">
                  Name: <span className="contract-token-value">{tokenInfo.name}</span>
                </span>
              )}
              {tokenInfo.symbol && (
                <span className="contract-token-item">
                  Symbol: <span className="contract-token-value">{tokenInfo.symbol}</span>
                </span>
              )}
              {tokenInfo.decimals !== undefined && (
                <span className="contract-token-item">
                  Decimals: <span className="contract-token-value">{tokenInfo.decimals}</span>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <ErrorDisplay error={error} variant="inline" />
      )}
    </div>
  );
};

export default ContractAddressInput;