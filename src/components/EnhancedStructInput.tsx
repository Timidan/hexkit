import React, { useState, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, XCloseIcon } from './icons/IconLibrary';
import InlineActionButton from './ui/InlineActionButton';
import { UIIcons } from './icons/IconMap';

interface StructField {
  name: string;
  type: string;
  value: any;
  components?: StructField[]; // For nested structs
  isArray?: boolean;
  baseType?: string; // For arrays, the base type
}

interface EnhancedStructInputProps {
  abi?: any[];
  functionName?: string;
  onDataChange: (data: any[]) => void;
  initialData?: any[];
}

const EnhancedStructInput: React.FC<EnhancedStructInputProps> = ({
  abi,
  functionName,
  onDataChange,
  initialData = []
}) => {
  const [fieldData, setFieldData] = useState<Record<string, any>>({});
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Extract function inputs from ABI
  const functionInputs = useMemo(() => {
    if (!abi || !functionName) return [];
    
    const func = abi.find(f => f.name === functionName && f.type === 'function');
    return func?.inputs || [];
  }, [abi, functionName]);

  const toggleSection = (path: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedSections(newExpanded);
  };

  const updateFieldValue = useCallback((path: string, value: any) => {
    const newData = { ...fieldData };
    const pathParts = path.split('.');
    
    let current = newData;
    for (let i = 0; i < pathParts.length - 1; i++) {
      if (!current[pathParts[i]]) {
        current[pathParts[i]] = {};
      }
      current = current[pathParts[i]];
    }
    current[pathParts[pathParts.length - 1]] = value;
    
    setFieldData(newData);
    
    // Convert to array format for encoding
    const arrayData = functionInputs.map((input: any, idx: number) => {
      return newData[input.name] ?? getDefaultValue(input.type);
    });
    
    onDataChange(arrayData);
  }, [fieldData, functionInputs, onDataChange]);

  const getDefaultValue = (type: string): any => {
    if (type === 'bool') return false;
    if (type.includes('uint') || type.includes('int')) return '0';
    if (type === 'address') return ethers.constants.AddressZero;
    if (type.includes('bytes')) return '0x';
    if (type.includes('[]')) return [];
    if (type.includes('tuple')) return {};
    return '';
  };

  const renderField = (input: any, path: string, level = 0): React.ReactNode => {
    const fieldPath = path ? `${path}.${input.name}` : input.name;
    const currentValue = getNestedValue(fieldData, fieldPath);
    const isExpanded = expandedSections.has(fieldPath);

    // Handle tuple/struct types
    if (input.type === 'tuple' || input.components) {
      return (
        <div key={fieldPath} className={`struct-field level-${level}`}>
          <div 
            className="struct-header clickable"
            onClick={() => toggleSection(fieldPath)}
          >
            <span className="expand-icon">
              {isExpanded ? <ChevronDownIcon width={12} height={12} /> : <ChevronRightIcon width={12} height={12} />}
            </span>
            <span className="field-icon">{UIIcons.struct}</span>
            <span className="field-name">{input.name}</span>
            <span className="field-type">({input.type})</span>
            {input.components && (
              <span className="field-count">
                {input.components.length} fields
              </span>
            )}
          </div>
          
          {isExpanded && input.components && (
            <div className="struct-content">
              {input.components.map((component: any, idx: number) => 
                renderField(component, fieldPath, level + 1)
              )}
            </div>
          )}
        </div>
      );
    }

    // Handle array types
    if (input.type.includes('[]')) {
      const baseType = input.type.replace('[]', '');
      const arrayValue = currentValue || [];
      
      return (
        <div key={fieldPath} className={`array-field level-${level}`}>
          <div 
            className="array-header clickable"
            onClick={() => toggleSection(fieldPath)}
          >
            <span className="expand-icon">
              {isExpanded ? <ChevronDownIcon width={12} height={12} /> : <ChevronRightIcon width={12} height={12} />}
            </span>
            <span className="field-icon">{UIIcons.array}</span>
            <span className="field-name">{input.name}</span>
            <span className="field-type">({input.type})</span>
            <span className="array-length">
              [{Array.isArray(arrayValue) ? arrayValue.length : 0}]
            </span>
          </div>

          {isExpanded && (
            <div className="array-content">
              <div className="array-controls">
                <InlineActionButton
                  className="add-array-item"
                  ariaLabel="Add array item"
                  tooltip="Add array item"
                  icon={<PlusIcon width={16} height={16} />}
                  onClick={() => addArrayItem(fieldPath, baseType)}
                  stopPropagation
                />
              </div>
              
              {Array.isArray(arrayValue) && arrayValue.map((item: any, idx: number) => (
                <div key={idx} className="array-item">
                  <div className="array-item-header">
                    <span className="array-index">[{idx}]</span>
                    <InlineActionButton
                      className="remove-array-item"
                      ariaLabel={`Remove item ${idx}`}
                      tooltip="Remove item"
                      icon={<XCloseIcon width={16} height={16} />}
                      onClick={() => removeArrayItem(fieldPath, idx)}
                      stopPropagation
                    />
                  </div>
                  <div className="array-item-value">
                    {renderSimpleInput(`${fieldPath}.${idx}`, baseType, item)}
                  </div>
                </div>
              ))}
              
              {(!Array.isArray(arrayValue) || arrayValue.length === 0) && (
                <div className="empty-array">
                  <p>Array is empty. Click "Add Item" to add elements.</p>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    // Handle simple types
    return (
      <div key={fieldPath} className={`simple-field level-${level}`}>
        <div className="field-header">
          <span className="field-icon">{getTypeIcon(input.type)}</span>
          <span className="field-name">{input.name}</span>
          <span className="field-type">({input.type})</span>
        </div>
        <div className="field-input">
          {renderSimpleInput(fieldPath, input.type, currentValue)}
        </div>
      </div>
    );
  };

  const renderSimpleInput = (path: string, type: string, value: any) => {
    const commonProps = {
      value: value || '',
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => 
        updateFieldValue(path, e.target.value),
      className: `type-input type-${type.replace('[]', '')}`,
    };

    switch (true) {
      case type === 'bool':
        return (
          <select
            {...commonProps}
            value={value ? 'true' : 'false'}
            onChange={(e) => updateFieldValue(path, e.target.value === 'true')}
            className="bool-select"
          >
            <option value="false">false</option>
            <option value="true">true</option>
          </select>
        );

      case type === 'address':
        return (
          <div className="address-input-group">
            <input
              {...commonProps}
              type="text"
              placeholder="0x..."
              pattern="^0x[a-fA-F0-9]{40}$"
            />
            <button
              className="validate-address"
              onClick={() => validateAddress(path, value)}
              title="Validate address"
            >
              
            </button>
          </div>
        );

      case type.includes('uint') || type.includes('int'):
        return (
          <input
            {...commonProps}
            type="text"
            placeholder="0"
            pattern="^[0-9]+$"
          />
        );

      case type.includes('bytes'):
        return (
          <div className="bytes-input-group">
            <textarea
              {...commonProps}
              rows={2}
              placeholder="0x..."
              className="bytes-textarea"
            />
            <div className="bytes-info">
              {value && typeof value === 'string' && value.startsWith('0x') && (
                <span>Length: {(value.length - 2) / 2} bytes</span>
              )}
            </div>
          </div>
        );

      default:
        return (
          <input
            {...commonProps}
            type="text"
            placeholder={`Enter ${type} value`}
          />
        );
    }
  };

  const getNestedValue = (obj: any, path: string): any => {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  };

  const getTypeIcon = (type: string): React.ReactNode => {
    if (type === 'address') return UIIcons.address;
    if (type === 'bool') return UIIcons.boolean;
    if (type.includes('uint') || type.includes('int')) return UIIcons.number;
    if (type.includes('bytes')) return UIIcons.bytes;
    if (type.includes('[]')) return UIIcons.array;
    if (type === 'tuple') return UIIcons.struct;
    return UIIcons.info;
  };

  const addArrayItem = (path: string, baseType: string) => {
    const currentArray = getNestedValue(fieldData, path) || [];
    const newArray = [...currentArray, getDefaultValue(baseType)];
    updateFieldValue(path, newArray);
    
    // Auto-expand the array to show the new item
    setExpandedSections(prev => new Set(prev).add(path));
  };

  const removeArrayItem = (path: string, index: number) => {
    const currentArray = getNestedValue(fieldData, path) || [];
    const newArray = currentArray.filter((_: any, idx: number) => idx !== index);
    updateFieldValue(path, newArray);
  };

  const validateAddress = (path: string, address: string) => {
    try {
      if (ethers.utils.isAddress(address)) {
        // Valid address - could add visual feedback
        console.log('Valid address');
      } else {
        alert('Invalid Ethereum address');
      }
    } catch (error) {
      alert('Invalid Ethereum address');
    }
  };

  const clearAllFields = () => {
    setFieldData({});
    onDataChange([]);
  };

  const loadSampleData = () => {
    // Load some sample data based on function inputs
    const sampleData: Record<string, any> = {};
    
    functionInputs.forEach((input: any) => {
      sampleData[input.name] = getSampleValue(input.type);
    });
    
    setFieldData(sampleData);
    
    const arrayData = functionInputs.map((input: any) => 
      sampleData[input.name]
    );
    
    onDataChange(arrayData);
  };

  const getSampleValue = (type: string): any => {
    if (type === 'address') return '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7';
    if (type === 'bool') return true;
    if (type.includes('uint')) return '1000000000000000000'; // 1 ETH in wei
    if (type === 'string') return 'Sample string';
    if (type.includes('bytes')) return '0x1234567890abcdef';
    if (type.includes('[]')) return [];
    return '';
  };

  if (!functionInputs.length) {
    return (
      <div className="no-inputs">
        <p>No inputs required for this function.</p>
      </div>
    );
  }

  return (
    <div className="enhanced-struct-input">
      <div className="struct-input-header">
        <h3>Function Parameters</h3>
        <div className="input-actions">
          <button onClick={loadSampleData} className="sample-btn">
            Load Sample
          </button>
          <button onClick={clearAllFields} className="clear-btn">
            Clear All
          </button>
        </div>
      </div>

      <div className="struct-fields">
        {functionInputs.map((input: any) => 
          renderField(input, '', 0)
        )}
      </div>

      <div className="input-summary">
        <div className="summary-header">
          <h4>Parameter Summary</h4>
        </div>
        <div className="summary-content">
          <p>{functionInputs.length} parameters configured</p>
          <p>
            Types: {Array.from(new Set(functionInputs.map((i: any) => i.type))).join(', ')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default EnhancedStructInput;
