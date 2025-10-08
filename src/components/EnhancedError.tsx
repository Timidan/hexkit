import React, { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, CopyIcon } from './icons/IconLibrary';
import { copyTextToClipboard } from '../utils/clipboard';

interface ErrorSuggestion {
  action: string;
  description: string;
  onClick?: () => void;
}

interface EnhancedErrorProps {
  error: string;
  title?: string;
  suggestions?: ErrorSuggestion[];
  canRetry?: boolean;
  onRetry?: () => void;
  technicalDetails?: string;
  className?: string;
}

const EnhancedError: React.FC<EnhancedErrorProps> = ({
  error,
  title = 'Something went wrong',
  suggestions = [],
  canRetry = false,
  onRetry,
  technicalDetails,
  className = '',
}) => {
  const [showDetails, setShowDetails] = useState(false);

  const getErrorCategory = (errorMessage: string): {
    category: string;
    icon: string;
    color: string;
    defaultSuggestions: ErrorSuggestion[];
  } => {
    const errorLower = errorMessage.toLowerCase();
    
    if (errorLower.includes('network') || errorLower.includes('connection') || errorLower.includes('timeout')) {
      return {
        category: 'Network Error',
        icon: '🌐',
        color: '#ff9800',
        defaultSuggestions: [
          { action: 'Check your internet connection', description: 'Ensure you have a stable internet connection' },
          { action: 'Try a different RPC endpoint', description: 'The blockchain node might be temporarily unavailable' },
          { action: 'Wait and retry', description: 'Network issues are often temporary' }
        ]
      };
    }
    
    if (errorLower.includes('invalid') || errorLower.includes('format') || errorLower.includes('malformed')) {
      return {
        category: 'Input Error',
        icon: '📝',
        color: '#f44336',
        defaultSuggestions: [
          { action: 'Check your input format', description: 'Make sure addresses start with 0x and calldata is valid hex' },
          { action: 'Try copying from a trusted source', description: 'Avoid manual typing for complex data' },
          { action: 'Use the smart input helpers', description: 'Our input fields can auto-detect and format data' }
        ]
      };
    }
    
    if (errorLower.includes('not found') || errorLower.includes('404') || errorLower.includes('does not exist')) {
      return {
        category: 'Not Found',
        icon: '🔍',
        color: '#2196f3',
        defaultSuggestions: [
          { action: 'Double-check the address', description: 'Ensure the contract address is correct' },
          { action: 'Try a different chain', description: 'The contract might be on a different network' },
          { action: 'Check if the contract is verified', description: 'Unverified contracts may not have public ABIs' }
        ]
      };
    }
    
    if (errorLower.includes('api') || errorLower.includes('key') || errorLower.includes('rate limit')) {
      return {
        category: 'API Error',
        icon: '🔑',
        color: '#9c27b0',
        defaultSuggestions: [
          { action: 'Check your API key', description: 'Ensure your API keys are configured correctly' },
          { action: 'Wait before retrying', description: 'You might have hit a rate limit' },
          { action: 'Try a different data source', description: 'Some explorers may be temporarily down' }
        ]
      };
    }
    
    if (errorLower.includes('gas') || errorLower.includes('insufficient funds')) {
      return {
        category: 'Transaction Error',
        icon: '⛽',
        color: '#ff5722',
        defaultSuggestions: [
          { action: 'Check your balance', description: 'Ensure you have enough ETH for gas fees' },
          { action: 'Increase gas limit', description: 'The transaction might need more gas to complete' },
          { action: 'Try during off-peak hours', description: 'Gas prices are often lower during less busy times' }
        ]
      };
    }
    
    return {
      category: 'Unknown Error',
      icon: '⚠️',
      color: '#ff6b6b',
      defaultSuggestions: [
        { action: 'Try refreshing the page', description: 'A simple refresh can often resolve temporary issues' },
        { action: 'Check the browser console', description: 'Look for additional technical details' },
        { action: 'Report this issue', description: 'Help us improve by reporting unexpected errors' }
      ]
    };
  };

  const errorInfo = getErrorCategory(error);
  const allSuggestions = [...suggestions, ...errorInfo.defaultSuggestions];

  return (
    <div className={`enhanced-error ${className}`}>
      <div className="error-header">
        <div className="error-icon-container" style={{ backgroundColor: errorInfo.color }}>
          <span className="error-icon">{errorInfo.icon}</span>
        </div>
        <div className="error-title-section">
          <h3 className="error-title">{title}</h3>
          <div className="error-category">{errorInfo.category}</div>
        </div>
        {canRetry && onRetry && (
          <button onClick={onRetry} className="retry-button">
            🔄 Retry
          </button>
        )}
      </div>
      
      <div className="error-message">
        {error}
      </div>
      
      {allSuggestions.length > 0 && (
        <div className="error-suggestions">
          <h4 className="suggestions-title">💡 Try these solutions:</h4>
          <div className="suggestions-list">
            {allSuggestions.slice(0, 3).map((suggestion, index) => (
              <div key={index} className="suggestion-card">
                <div className="suggestion-action">{suggestion.action}</div>
                <div className="suggestion-description">{suggestion.description}</div>
                {suggestion.onClick && (
                  <button 
                    onClick={suggestion.onClick}
                    className="suggestion-button"
                  >
                    Try this
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {technicalDetails && (
        <div className="technical-details">
          <button 
            onClick={() => setShowDetails(!showDetails)}
            className="details-toggle"
          >
            {showDetails ? <ChevronDownIcon width={12} height={12} /> : <ChevronRightIcon width={12} height={12} />} Technical Details
          </button>
          {showDetails && (
            <div className="details-content">
              <pre className="details-text">{technicalDetails}</pre>
              <button
                onClick={async () => {
                  try {
                    await copyTextToClipboard(technicalDetails);
                  } catch (error) {
                    console.warn('Failed to copy error details', error);
                  }
                }}
                className="copy-details-btn"
              >
                <CopyIcon width={14} height={14} style={{ marginRight: '6px' }} />
                Copy Details
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EnhancedError;
