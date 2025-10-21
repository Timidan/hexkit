import React, { useState } from 'react';
import { SearchIcon, CheckCircleIcon, AlertTriangleIcon } from './icons/IconLibrary';
import { Key } from 'lucide-react';
import type { Chain } from '../types';
import MultiNetworkContractSearch from './MultiNetworkContractSearch';
import UniversalAPIKeyModal from './UniversalAPIKeyModal';
import { universalApiKeyManager } from '../utils/universalApiKeys';

interface ABIFetcherProps {
  onABIFetched: (abi: string, contractMetadata?: { 
    name?: string; 
    compilerVersion?: string;
    tokenInfo?: {
      name?: string;
      symbol?: string;
      decimals?: string;
      totalSupply?: string;
      tokenType?: string;
      divisor?: string;
    };
    isDiamond?: boolean;
    facetAddresses?: string[];
  }, chain?: Chain) => void;
  initialContractAddress?: string;
  onContractAddressChange?: (address: string) => void;
  etherscanApiKey?: string;
  availableChains?: Chain[];
  allowMultiSelect?: boolean;
}

const ABIFetcher: React.FC<ABIFetcherProps> = ({ 
  onABIFetched, 
  initialContractAddress = '',
  onContractAddressChange,
  etherscanApiKey: propEtherscanApiKey,
  availableChains,
  allowMultiSelect,
}) => {
  const [showAPIKeyModal, setShowAPIKeyModal] = useState(false);

  const handleContractSelected = (address: string, chain: Chain, abi: string, contractMetadata?: { 
    name?: string; 
    compilerVersion?: string;
    tokenInfo?: {
      name?: string;
      symbol?: string;
      decimals?: string;
      totalSupply?: string;
      tokenType?: string;
      divisor?: string;
    };
    isDiamond?: boolean;
    facetAddresses?: string[];
  }) => {
    // Notify parent component of the selected contract with chain information
    onABIFetched(abi, contractMetadata, chain);
    
    if (onContractAddressChange) {
      onContractAddressChange(address);
    }
  };

  const handleAPIKeySaved = () => {
    setShowAPIKeyModal(false);
  };

  // Get API key for multi-network search - prefer prop over universal manager
  const activeEtherscanApiKey = propEtherscanApiKey || universalApiKeyManager.getAPIKey('ETHERSCAN') || undefined;

  return (
    <div className="abi-fetcher">
      <h3 style={{ 
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <SearchIcon width={20} height={20} />
        Contract ABI Search
      </h3>
      
      <MultiNetworkContractSearch
        onContractSelected={handleContractSelected}
        etherscanApiKey={activeEtherscanApiKey}
        initialAddress={initialContractAddress}
        availableChains={availableChains}
        allowMultiSelect={allowMultiSelect}
      />

      {/* API Key Management */}
      <div style={{
        background: 'rgba(107, 114, 128, 0.05)',
        border: '1px solid rgba(107, 114, 128, 0.2)',
        borderRadius: '6px',
        padding: '12px',
        marginTop: '12px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {activeEtherscanApiKey ? (
              <span style={{ color: '#22c55e', fontSize: '13px' }}>
                <CheckCircleIcon width={14} height={14} style={{ marginRight: '4px' }} />Etherscan API key configured (enhances rate limits)
              </span>
            ) : (
              <span style={{ color: '#f59e0b', fontSize: '13px' }}>
                <AlertTriangleIcon width={14} height={14} style={{ marginRight: '4px' }} />API key recommended for better reliability
              </span>
            )}
          </div>
          <button
            onClick={() => setShowAPIKeyModal(true)}
            style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '12px',
              cursor: 'pointer',
              color: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Key size={12} />
            {activeEtherscanApiKey ? 'Manage API Keys' : 'Add API Key'}
          </button>
        </div>
      </div>

      <UniversalAPIKeyModal
        isOpen={showAPIKeyModal}
        onClose={() => setShowAPIKeyModal(false)}
        onAPIKeySaved={handleAPIKeySaved}
      />
    </div>
  );
};

export default ABIFetcher;
