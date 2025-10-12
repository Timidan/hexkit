import React, { useState, useEffect } from 'react';
import type { Chain } from '../types';
import { apiKeyManager } from '../utils/apiKeys';

interface APIKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  chain: Chain;
  onAPIKeySaved: (apiKey: string) => void;
}

const APIKeyModal: React.FC<APIKeyModalProps> = ({
  isOpen,
  onClose,
  chain,
  onAPIKeySaved,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const existingKey = apiKeyManager.getAPIKey(chain);
      setApiKey(existingKey || '');
      setIsValid(!!existingKey);
    }
  }, [isOpen, chain]);

  const handleSave = () => {
    if (apiKey.trim()) {
      apiKeyManager.setAPIKey(chain, apiKey.trim());
      onAPIKeySaved(apiKey.trim());
    }
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const validateApiKey = (key: string) => {
    // Basic validation - API keys are usually alphanumeric and at least 32 characters
    const isValidFormat = /^[a-zA-Z0-9]{32,}$/.test(key.trim());
    setIsValid(isValidFormat);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3> API Key Required</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <p>
            To fetch ABIs from <strong>{chain.name}</strong>, you need an API key from{' '}
            <strong>{chain.explorerUrl.replace('https://', '').split('.')[0]}</strong>.
          </p>
          
          <div className="api-key-info">
            <h4>How to get an API key:</h4>
            <ol>
              <li>Visit <a href={`${chain.explorerUrl}/apis`} target="_blank" rel="noopener noreferrer">
                {chain.explorerUrl}/apis
              </a></li>
              <li>Create a free account</li>
              <li>Generate an API key</li>
              <li>Paste it below</li>
            </ol>
          </div>

          <div className="form-group">
            <label>API Key</label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                validateApiKey(e.target.value);
              }}
              placeholder="Paste your API key here..."
              style={{
                borderColor: apiKey && !isValid ? '#ff6b6b' : 'rgba(255, 255, 255, 0.2)',
              }}
            />
            {apiKey && !isValid && (
              <small style={{ color: '#ff6b6b' }}>
                API key should be at least 32 alphanumeric characters
              </small>
            )}
          </div>

          <div className="security-note">
            <p> <strong>Security:</strong> Your API key is stored locally in your browser and never sent to our servers.</p>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={handleCancel} className="btn-secondary">
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={!apiKey.trim()}
            className="btn-primary"
          >
            Save API Key
          </button>
        </div>
      </div>
    </div>
  );
};

export default APIKeyModal;