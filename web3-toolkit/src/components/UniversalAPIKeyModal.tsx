import React, { useState, useEffect } from 'react';
import { API_PROVIDERS, universalApiKeyManager, type ApiProviderKey } from '../utils/universalApiKeys';
import type { Chain } from '../types';

interface UniversalAPIKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  chain?: Chain; // Optional - used to suggest which provider to configure
  onAPIKeySaved: () => void;
}

const UniversalAPIKeyModal: React.FC<UniversalAPIKeyModalProps> = ({
  isOpen,
  onClose,
  chain,
  onAPIKeySaved,
}) => {
  const [activeProvider, setActiveProvider] = useState<ApiProviderKey>('ETHERSCAN');
  const [apiKeys, setApiKeys] = useState<{ [K in ApiProviderKey]: string }>({
    ETHERSCAN: '',
    BLOCKSCOUT: '',
  });
  const [isValid, setIsValid] = useState<{ [K in ApiProviderKey]: boolean }>({
    ETHERSCAN: false,
    BLOCKSCOUT: false,
  });

  useEffect(() => {
    if (isOpen) {
      // Load existing keys
      const newApiKeys = { ...apiKeys };
      const newIsValid = { ...isValid };
      
      Object.keys(API_PROVIDERS).forEach((providerKey) => {
        const key = providerKey as ApiProviderKey;
        const existingKey = universalApiKeyManager.getAPIKey(key);
        newApiKeys[key] = existingKey || '';
        newIsValid[key] = !!existingKey;
      });
      
      setApiKeys(newApiKeys);
      setIsValid(newIsValid);

      // If a chain is provided, suggest the best provider for it
      if (chain) {
        const supportedProviders = universalApiKeyManager.getProvidersForChain(chain);
        if (supportedProviders.length > 0) {
          setActiveProvider(supportedProviders[0]);
        }
      }
    }
  }, [isOpen, chain]);

  const handleSave = () => {
    // Save all API keys
    Object.entries(apiKeys).forEach(([providerKey, apiKey]) => {
      const key = providerKey as ApiProviderKey;
      if (apiKey.trim()) {
        universalApiKeyManager.setAPIKey(key, apiKey.trim());
      } else {
        universalApiKeyManager.removeAPIKey(key);
      }
    });
    
    onAPIKeySaved();
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const validateApiKey = (provider: ApiProviderKey, key: string) => {
    // Basic validation - API keys are usually alphanumeric and at least 32 characters for Etherscan
    // Blockscout keys might be different or optional
    let isValidFormat = false;
    
    if (provider === 'ETHERSCAN') {
      isValidFormat = /^[a-zA-Z0-9]{32,}$/.test(key.trim());
    } else if (provider === 'BLOCKSCOUT') {
      // Blockscout keys might be optional or have different format
      isValidFormat = key.trim() === '' || /^[a-zA-Z0-9]{16,}$/.test(key.trim());
    }
    
    setIsValid(prev => ({ ...prev, [provider]: isValidFormat }));
  };

  const handleKeyChange = (provider: ApiProviderKey, value: string) => {
    setApiKeys(prev => ({ ...prev, [provider]: value }));
    validateApiKey(provider, value);
  };

  if (!isOpen) return null;

  const activeProviderInfo = API_PROVIDERS[activeProvider];
  const providersForChain = chain ? universalApiKeyManager.getProvidersForChain(chain) : Object.keys(API_PROVIDERS) as ApiProviderKey[];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content api-key-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🔐 Universal API Keys</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <p>
            Configure API keys for block explorer services. <strong>One Etherscan API key works across ALL EVM chains</strong> in the toolkit.
          </p>
          
          {chain && (
            <div className="chain-info">
              <p><strong>For {chain.name}:</strong> {
                providersForChain.length > 0 
                  ? `Supported by ${providersForChain.map(p => API_PROVIDERS[p].name).join(', ')}`
                  : 'No configured providers support this chain'
              }</p>
            </div>
          )}

          <div className="provider-tabs">
            {Object.entries(API_PROVIDERS).map(([providerKey, provider]) => (
              <button
                key={providerKey}
                className={`provider-tab ${activeProvider === providerKey ? 'active' : ''}`}
                onClick={() => setActiveProvider(providerKey as ApiProviderKey)}
              >
                {provider.name}
                {universalApiKeyManager.hasAPIKey(providerKey as ApiProviderKey) && (
                  <span className="key-indicator">✅</span>
                )}
              </button>
            ))}
          </div>

          <div className="provider-content">
            <div className="provider-info">
              <h4>{activeProviderInfo.name}</h4>
              <p>{activeProviderInfo.description}</p>
              
              <div className="api-key-instructions">
                <h5>How to get an API key:</h5>
                <ol>
                  {activeProviderInfo.instructions.map((instruction, index) => (
                    <li key={index}>{instruction}</li>
                  ))}
                </ol>
                {activeProviderInfo.website && (
                  <p>
                    <a href={activeProviderInfo.website} target="_blank" rel="noopener noreferrer">
                      → Get API Key
                    </a>
                  </p>
                )}
              </div>
            </div>

            <div className="form-group">
              <label>
                {activeProviderInfo.name} API Key
                {activeProvider === 'BLOCKSCOUT' && <small> (optional)</small>}
              </label>
              <input
                type="text"
                value={apiKeys[activeProvider]}
                onChange={(e) => handleKeyChange(activeProvider, e.target.value)}
                placeholder={
                  activeProvider === 'ETHERSCAN' 
                    ? "Paste your Etherscan API key here..." 
                    : "Optional Blockscout API key..."
                }
                style={{
                  borderColor: apiKeys[activeProvider] && !isValid[activeProvider] ? '#ff6b6b' : 'rgba(255, 255, 255, 0.2)',
                }}
              />
              {apiKeys[activeProvider] && !isValid[activeProvider] && activeProvider === 'ETHERSCAN' && (
                <small style={{ color: '#ff6b6b' }}>
                  Etherscan API key should be at least 32 alphanumeric characters
                </small>
              )}
            </div>
          </div>

          <div className="security-note">
            <p>🔒 <strong>Security:</strong> Your API keys are stored locally in your browser and never sent to our servers.</p>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={handleCancel} className="btn-secondary">
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="btn-primary"
          >
            Save API Keys
          </button>
        </div>
      </div>
    </div>
  );
};

export default UniversalAPIKeyModal;