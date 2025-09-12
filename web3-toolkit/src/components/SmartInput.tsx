import React, { useState, useRef, useEffect } from 'react';
import { ethers } from 'ethers';

interface SmartInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  type?: 'address' | 'calldata' | 'abi' | 'any';
  multiline?: boolean;
  rows?: number;
  className?: string;
  disabled?: boolean;
  recentValues?: string[];
  onValidation?: (isValid: boolean, error?: string) => void;
}

interface InputSuggestion {
  value: string;
  type: string;
  description: string;
}

const SmartInput: React.FC<SmartInputProps> = ({
  value,
  onChange,
  placeholder,
  label,
  type = 'any',
  multiline = false,
  rows = 3,
  className = '',
  disabled = false,
  recentValues = [],
  onValidation,
}) => {
  const [suggestions, setSuggestions] = useState<InputSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [validationState, setValidationState] = useState<{
    isValid: boolean;
    error?: string;
    suggestion?: string;
  }>({ isValid: true });
  
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Validate input based on type
  useEffect(() => {
    validateInput(value);
  }, [value, type]);

  const validateInput = (inputValue: string) => {
    if (!inputValue.trim()) {
      setValidationState({ isValid: true });
      onValidation?.(true);
      return;
    }

    let isValid = true;
    let error = '';
    let suggestion = '';

    switch (type) {
      case 'address':
        isValid = ethers.utils.isAddress(inputValue.trim());
        if (!isValid) {
          error = 'Invalid Ethereum address format';
          if (inputValue.length === 40 && !inputValue.startsWith('0x')) {
            suggestion = 'Did you mean: 0x' + inputValue + '?';
          }
        }
        break;
      
      case 'calldata':
        const cleaned = inputValue.trim();
        isValid = /^0x[a-fA-F0-9]*$/.test(cleaned) && cleaned.length >= 10;
        if (!isValid) {
          if (!cleaned.startsWith('0x')) {
            error = 'Calldata must start with 0x';
            suggestion = 'Did you mean: 0x' + cleaned + '?';
          } else if (cleaned.length < 10) {
            error = 'Calldata too short (minimum 10 characters for function selector)';
          } else {
            error = 'Invalid hex characters in calldata';
          }
        }
        break;
      
      case 'abi':
        try {
          if (inputValue.trim()) {
            const parsed = JSON.parse(inputValue);
            isValid = Array.isArray(parsed) || (typeof parsed === 'object' && parsed.abi);
            if (!isValid) {
              error = 'ABI must be a JSON array or object with abi property';
            }
          }
        } catch {
          error = 'Invalid JSON format';
          isValid = false;
        }
        break;
    }

    setValidationState({ isValid, error, suggestion });
    onValidation?.(isValid, error);
  };

  const handlePaste = async (event: React.ClipboardEvent) => {
    event.preventDefault();
    const pastedText = event.clipboardData.getData('text');
    const detected = detectInputType(pastedText);
    
    if (detected.suggestions.length > 0) {
      setSuggestions(detected.suggestions);
      setShowSuggestions(true);
    }
    
    // If we detect a clear format match, auto-format it
    if (detected.autoFormat) {
      onChange(detected.autoFormat);
    } else {
      onChange(pastedText);
    }
  };

  const handleSmartPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const detected = detectInputType(text);
      
      if (detected.suggestions.length > 0) {
        setSuggestions(detected.suggestions);
        setShowSuggestions(true);
      }
      
      if (detected.autoFormat) {
        onChange(detected.autoFormat);
      } else {
        onChange(text);
      }
    } catch (error) {
      console.warn('Failed to read clipboard:', error);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      // Could add a temporary success indicator here
    } catch (error) {
      console.warn('Failed to copy to clipboard:', error);
    }
  };

  const handleClear = () => {
    onChange('');
    setShowSuggestions(false);
  };

  const handleSuggestionSelect = (suggestion: InputSuggestion) => {
    onChange(suggestion.value);
    setShowSuggestions(false);
  };

  const detectInputType = (input: string): {
    suggestions: InputSuggestion[];
    autoFormat?: string;
  } => {
    const suggestions: InputSuggestion[] = [];
    let autoFormat: string | undefined;

    const trimmed = input.trim();
    
    // Detect Ethereum address
    if (ethers.utils.isAddress(trimmed)) {
      suggestions.push({
        value: trimmed,
        type: 'address',
        description: 'Ethereum contract address'
      });
    }

    // Detect address without 0x prefix
    if (trimmed.length === 40 && /^[a-fA-F0-9]+$/.test(trimmed)) {
      const withPrefix = '0x' + trimmed;
      suggestions.push({
        value: withPrefix,
        type: 'address',
        description: 'Ethereum address (added 0x prefix)'
      });
      if (type === 'address') {
        autoFormat = withPrefix;
      }
    }

    // Detect calldata
    if (/^0x[a-fA-F0-9]+$/.test(trimmed) && trimmed.length >= 10) {
      suggestions.push({
        value: trimmed,
        type: 'calldata',
        description: `Transaction calldata (${(trimmed.length - 2) / 2} bytes)`
      });
    }

    // Detect calldata without 0x prefix
    if (/^[a-fA-F0-9]+$/.test(trimmed) && trimmed.length >= 8) {
      const withPrefix = '0x' + trimmed;
      suggestions.push({
        value: withPrefix,
        type: 'calldata',
        description: `Transaction calldata (added 0x prefix, ${trimmed.length / 2} bytes)`
      });
      if (type === 'calldata') {
        autoFormat = withPrefix;
      }
    }

    // Detect JSON (ABI)
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) || (typeof parsed === 'object' && parsed.abi)) {
        suggestions.push({
          value: trimmed,
          type: 'abi',
          description: 'JSON ABI or contract artifact'
        });
      }
    } catch {
      // Not JSON, that's fine
    }

    // Detect transaction hash
    if (/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
      suggestions.push({
        value: trimmed,
        type: 'txhash',
        description: 'Transaction hash'
      });
    }

    return { suggestions, autoFormat };
  };

  const InputComponent = multiline ? 'textarea' : 'input';

  return (
    <div className={`smart-input-container ${className}`}>
      {label && <label className="smart-input-label">{label}</label>}
      
      <div className="smart-input-wrapper">
        <InputComponent
          ref={inputRef as any}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled}
          rows={multiline ? rows : undefined}
          className={`smart-input ${validationState.isValid ? '' : 'error'} ${disabled ? 'disabled' : ''}`}
        />
        
        <div className="smart-input-actions">
          {value && (
            <button
              type="button"
              onClick={handleCopy}
              className="input-action-btn copy-btn"
              title="Copy to clipboard"
            >
              📋
            </button>
          )}
          
          <button
            type="button"
            onClick={handleSmartPaste}
            className="input-action-btn paste-btn"
            title="Paste and auto-detect format"
          >
            📥
          </button>
          
          {recentValues.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSuggestions(!showSuggestions)}
              className="input-action-btn recent-btn"
              title="Show recent values"
            >
              🕒
            </button>
          )}
          
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="input-action-btn clear-btn"
              title="Clear input"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Validation feedback */}
      {!validationState.isValid && (
        <div className="validation-feedback error">
          <span className="validation-error">⚠️ {validationState.error}</span>
          {validationState.suggestion && (
            <button
              type="button"
              onClick={() => onChange(validationState.suggestion!.replace('Did you mean: ', '').replace('?', ''))}
              className="validation-suggestion"
            >
              {validationState.suggestion}
            </button>
          )}
        </div>
      )}

      {/* Success feedback for valid inputs */}
      {validationState.isValid && value && type !== 'any' && (
        <div className="validation-feedback success">
          <span className="validation-success">✅ Valid {type} format</span>
        </div>
      )}

      {/* Suggestions dropdown */}
      {showSuggestions && (suggestions.length > 0 || recentValues.length > 0) && (
        <div className="suggestions-dropdown">
          {suggestions.length > 0 && (
            <div className="suggestions-section">
              <div className="suggestions-header">📥 Detected formats:</div>
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleSuggestionSelect(suggestion)}
                  className="suggestion-item"
                >
                  <div className="suggestion-type">{suggestion.type}</div>
                  <div className="suggestion-desc">{suggestion.description}</div>
                  <div className="suggestion-value">{suggestion.value.slice(0, 40)}...</div>
                </button>
              ))}
            </div>
          )}
          
          {recentValues.length > 0 && (
            <div className="suggestions-section">
              <div className="suggestions-header">🕒 Recent values:</div>
              {recentValues.slice(0, 5).map((recent, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => { onChange(recent); setShowSuggestions(false); }}
                  className="suggestion-item recent"
                >
                  <div className="suggestion-value">{recent.slice(0, 60)}...</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SmartInput;