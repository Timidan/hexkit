import React, { useState } from 'react';
import { Search, ChevronDown, Eye, Edit } from 'lucide-react';
import { ethers } from 'ethers';
import { Button, Input, Badge } from '../shared';
import '../../styles/ContractComponents.css';

export interface FunctionSelectorProps {
  selectedFunctionType: 'read' | 'write' | null;
  onFunctionTypeChange: (type: 'read' | 'write' | null) => void;
  selectedFunction: string | null;
  onFunctionChange: (functionName: string | null) => void;
  readFunctions: ethers.utils.FunctionFragment[];
  writeFunctions: ethers.utils.FunctionFragment[];
  functionSearch: string;
  onSearchChange: (search: string) => void;
  showFunctionSearch: boolean;
  onToggleSearch: (show: boolean) => void;
  className?: string;
}

const FunctionSelector: React.FC<FunctionSelectorProps> = ({
  selectedFunctionType,
  onFunctionTypeChange,
  selectedFunction,
  onFunctionChange,
  readFunctions,
  writeFunctions,
  functionSearch,
  onSearchChange,
  showFunctionSearch,
  onToggleSearch,
  className = ''
}) => {
  const [expandedType, setExpandedType] = useState<'read' | 'write' | null>(null);

  // Filter functions based on search
  const filterFunctions = (functions: ethers.utils.FunctionFragment[]) => {
    if (!functionSearch) return functions;
    return functions.filter(func => 
      func.name.toLowerCase().includes(functionSearch.toLowerCase())
    );
  };

  const filteredReadFunctions = filterFunctions(readFunctions);
  const filteredWriteFunctions = filterFunctions(writeFunctions);

  const handleFunctionTypeSelect = (type: 'read' | 'write') => {
    if (selectedFunctionType === type) {
      onFunctionTypeChange(null);
      setExpandedType(null);
    } else {
      onFunctionTypeChange(type);
      setExpandedType(type);
    }
    onFunctionChange(null); // Reset selected function
  };

  const handleFunctionSelect = (functionName: string) => {
    onFunctionChange(functionName);
    setExpandedType(null);
  };

  return (
    <div className={`function-selector-container ${className}`}>
      {/* Function Type Selector */}
      <div className="function-type-buttons">
        <Button
          variant={selectedFunctionType === 'read' ? 'primary' : 'ghost'}
          onClick={() => handleFunctionTypeSelect('read')}
          icon={<Eye size={16} />}
          className="function-type-button"
        >
          Read Functions
          {readFunctions.length > 0 && (
            <Badge variant="accent" size="sm" style={{ marginLeft: 'var(--space-2)' }}>
              {readFunctions.length}
            </Badge>
          )}
        </Button>
        <Button
          variant={selectedFunctionType === 'write' ? 'primary' : 'ghost'}
          onClick={() => handleFunctionTypeSelect('write')}
          icon={<Edit size={16} />}
          className="function-type-button"
        >
          Write Functions
          {writeFunctions.length > 0 && (
            <Badge variant="warning" size="sm" style={{ marginLeft: 'var(--space-2)' }}>
              {writeFunctions.length}
            </Badge>
          )}
        </Button>
      </div>

      {/* Search Toggle */}
      {selectedFunctionType && (
        <div className="function-search-header">
          <span className="function-search-label">
            {selectedFunctionType === 'read' ? 'Read' : 'Write'} Functions
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleSearch(!showFunctionSearch)}
            icon={<Search size={16} />}
          >
            Search
          </Button>
        </div>
      )}

      {/* Function Search */}
      {showFunctionSearch && selectedFunctionType && (
        <Input
          placeholder="Search functions..."
          value={functionSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          leftIcon={<Search size={16} />}
        />
      )}

      {/* Function List */}
      {selectedFunctionType && (
        <div className="function-list-container">
          {selectedFunctionType === 'read' && (
            <div>
              {filteredReadFunctions.length === 0 ? (
                <p className="function-list-empty">
                  {functionSearch ? 'No functions match your search' : 'No read functions available'}
                </p>
              ) : (
                <div className="function-list-items">
                  {filteredReadFunctions.map((func) => (
                    <button
                      key={func.name}
                      onClick={() => handleFunctionSelect(func.name)}
                      className={`function-item ${
                        selectedFunction === func.name ? 'function-item-read-selected' : ''
                      }`}
                    >
                      <div className="function-item-header">
                        <span className="function-item-name">{func.name}</span>
                        <Badge variant="info" size="sm">
                          view
                        </Badge>
                      </div>
                      {func.inputs.length > 0 && (
                        <div className="function-item-params">
                          {func.inputs.length} parameter{func.inputs.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedFunctionType === 'write' && (
            <div>
              {filteredWriteFunctions.length === 0 ? (
                <p className="function-list-empty">
                  {functionSearch ? 'No functions match your search' : 'No write functions available'}
                </p>
              ) : (
                <div className="function-list-items">
                  {filteredWriteFunctions.map((func) => (
                    <button
                      key={func.name}
                      onClick={() => handleFunctionSelect(func.name)}
                      className={`function-item ${
                        selectedFunction === func.name ? 'function-item-write-selected' : ''
                      }`}
                    >
                      <div className="function-item-header">
                        <span className="function-item-name">{func.name}</span>
                        <Badge variant="warning" size="sm">
                          {func.stateMutability || 'write'}
                        </Badge>
                      </div>
                      {func.inputs.length > 0 && (
                        <div className="function-item-params">
                          {func.inputs.length} parameter{func.inputs.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Selected Function Display */}
      {selectedFunction && selectedFunctionType && (
        <div className="function-selected-display">
          <div className="function-selected-header">
            <span className="function-selected-label">Selected:</span>
            <span className="function-selected-name">{selectedFunction}</span>
            <Badge 
              variant={selectedFunctionType === 'read' ? 'info' : 'warning'} 
              size="sm"
            >
              {selectedFunctionType}
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
};

export default FunctionSelector;