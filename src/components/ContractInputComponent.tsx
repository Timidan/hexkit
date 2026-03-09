import React, { useState, useEffect, useCallback } from 'react';
import '../styles/CompactArrayStyles.css';
import { PlusIcon, XCloseIcon } from './icons/IconLibrary';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface ABIInput {
  name: string;
  type: string;
  internalType?: string;
  components?: ABIInput[];
}

interface ContractInputComponentProps {
  inputDefinition: ABIInput;
  value?: any;
  onChange?: (value: any, isValid: boolean) => void;
  nestingLevel?: number;
  parentPath?: string;
}

interface ArrayItem {
  id: string;
  value: any;
}

const ContractInputComponent: React.FC<ContractInputComponentProps> = ({
  inputDefinition,
  value,
  onChange,
  nestingLevel = 0,
  parentPath = ''
}) => {
  const [currentValue, setCurrentValue] = useState<any>(value || getDefaultValue(inputDefinition.type));
  const [isValid, setIsValid] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [arrayItems, setArrayItems] = useState<ArrayItem[]>([]);

  // Sync currentValue when value prop changes (for restoration)
  useEffect(() => {
    if (value !== undefined && value !== null && value !== '' && value !== currentValue) {
      setCurrentValue(value);
    }
  }, [value, inputDefinition.name]);

  // Initialize array items for array types (both dynamic and fixed-size)
  useEffect(() => {
    if (inputDefinition.type.endsWith('[]') || /\[\d+\]$/.test(inputDefinition.type)) {
      const initialItems: ArrayItem[] = [];
      if (Array.isArray(value) && value.length > 0) {
        value.forEach((item, index) => {
          initialItems.push({
            id: `item-${index}-${Date.now()}`,
            value: item
          });
        });
      } else {
        // For fixed-size arrays, initialize with the required number of items
        const fixedSizeMatch = inputDefinition.type.match(/\[(\d+)\]$/);
        const arraySize = fixedSizeMatch ? parseInt(fixedSizeMatch[1]) : 1;
        const baseType = inputDefinition.type.replace(/\[\d*\]$/, '');
        
        for (let i = 0; i < arraySize; i++) {
          initialItems.push({
            id: `item-${i}-${Date.now()}`,
            value: getDefaultValue(baseType)
          });
        }
      }
      setArrayItems(initialItems);
    }
  }, [inputDefinition.type, value]);

  const validateValue = useCallback((val: any): { isValid: boolean; error: string } => {
    const type = inputDefinition.type;
    
    try {
      if (type.endsWith('[]')) {
        if (!Array.isArray(val)) {
          return { isValid: false, error: 'Must be an array' };
        }
        // Validate each array item
        const baseType = type.replace('[]', '');
        for (let i = 0; i < val.length; i++) {
          const itemValidation = validateSingleValue(val[i], baseType);
          if (!itemValidation.isValid) {
            return { isValid: false, error: `Item ${i}: ${itemValidation.error}` };
          }
        }
        return { isValid: true, error: '' };
      } else if (type === 'tuple') {
        if (!val || typeof val !== 'object') {
          return { isValid: false, error: 'Must be an object' };
        }
        // Validate each struct field
        if (inputDefinition.components) {
          for (const component of inputDefinition.components) {
            const fieldValue = val[component.name];
            const fieldValidation = validateSingleValue(fieldValue, component.type);
            if (!fieldValidation.isValid) {
              return { isValid: false, error: `Field ${component.name}: ${fieldValidation.error}` };
            }
          }
        }
        return { isValid: true, error: '' };
      } else {
        return validateSingleValue(val, type);
      }
    } catch (error) {
      return { isValid: false, error: 'Validation error' };
    }
  }, [inputDefinition]);

  const handleValueChange = useCallback((newValue: any) => {
    setCurrentValue(newValue);
    const validation = validateValue(newValue);

    setIsValid(validation.isValid);
    setErrorMessage(validation.error);

    if (onChange) {
      onChange(newValue, validation.isValid);
    }
  }, [validateValue, onChange]);

  const handleBasicInputChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const rawValue = event.target.value;
    const parsedValue = parseValueForType(rawValue, inputDefinition.type);
    handleValueChange(parsedValue);
  };

  const handleArrayItemChange = (itemId: string, newValue: any) => {
    const baseType = inputDefinition.type.replace('[]', '');
    const parsedValue = typeof newValue === 'string' ? parseValueForType(newValue, baseType) : newValue;

    const updatedItems = arrayItems.map(item =>
      item.id === itemId ? { ...item, value: parsedValue } : item
    );

    setArrayItems(updatedItems);

    const arrayValue = updatedItems.map(item => item.value);
    handleValueChange(arrayValue);
  };

  const addArrayItem = () => {
    // Check if this is a fixed-size array and if we've reached the limit
    const fixedSizeMatch = inputDefinition.type.match(/\[(\d+)\]$/);
    if (fixedSizeMatch) {
      const maxSize = parseInt(fixedSizeMatch[1]);
      if (arrayItems.length >= maxSize) {
        return; // Don't add more items for fixed-size arrays
      }
    }
    
    const baseType = inputDefinition.type.replace(/\[\d*\]$/, '');
    const newItem: ArrayItem = {
      id: `item-${arrayItems.length}-${Date.now()}`,
      value: getDefaultValue(baseType)
    };
    const updatedItems = [...arrayItems, newItem];
    setArrayItems(updatedItems);
    
    const arrayValue = updatedItems.map(item => item.value);
    handleValueChange(arrayValue);
  };

  const removeArrayItem = (itemId: string) => {
    // For fixed-size arrays, don't allow removing items below the required size
    const fixedSizeMatch = inputDefinition.type.match(/\[(\d+)\]$/);
    const minSize = fixedSizeMatch ? parseInt(fixedSizeMatch[1]) : 1;
    
    if (arrayItems.length <= minSize) return; // Keep required number of items
    
    const updatedItems = arrayItems.filter(item => item.id !== itemId);
    setArrayItems(updatedItems);
    
    const arrayValue = updatedItems.map(item => item.value);
    handleValueChange(arrayValue);
  };

  const handleStructFieldChange = (fieldName: string, fieldValue: any) => {
    const updatedStruct = {
      ...currentValue,
      [fieldName]: fieldValue
    };
    handleValueChange(updatedStruct);
  };

  const renderBasicInput = () => {
    const type = inputDefinition.type;
    const inputStyle: React.CSSProperties = {
      width: '100%',
      background: '#111',
      border: `1px solid ${isValid ? '#333' : '#ef4444'}`,
      borderRadius: '6px',
      padding: '8px 12px',
      color: '#fff',
      fontSize: '15px',
      fontFamily: 'inherit'
    };

    // Use value prop directly to make input controlled
    // Fall back to currentValue for internal state updates
    const displayValue = value !== undefined && value !== null && value !== '' 
      ? value 
      : currentValue;

    if (type === 'bool') {
      return (
        <Select
          value={displayValue?.toString() || ''}
          onValueChange={(v) => {
            const syntheticEvent = { target: { value: v } } as React.ChangeEvent<HTMLSelectElement>;
            handleBasicInputChange(syntheticEvent as any);
          }}
        >
          <SelectTrigger
            className="w-full font-inherit"
            style={{
              background: '#1a1a2e',
              border: `1px solid ${isValid ? '#333' : '#ef4444'}`,
              borderRadius: '6px',
              padding: '8px 12px',
              color: '#fff',
              fontSize: '15px',
            }}
          >
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">true</SelectItem>
            <SelectItem value="false">false</SelectItem>
          </SelectContent>
        </Select>
      );
    } else {
      const placeholder = getPlaceholderForType(type);
      return (
        <input
          type="text"
          style={inputStyle}
          placeholder={placeholder}
          value={displayValue?.toString() || ''}
          onChange={handleBasicInputChange}
        />
      );
    }
  };

  const renderArrayInput = () => {
    // Handle both dynamic arrays (uint256[]) and fixed-size arrays (uint256[4])
    const baseType = inputDefinition.type.replace(/\[\d*\]$/, '');
    const arrayValue = arrayItems.map(item => item.value);
    
    return (
      <div style={{
        border: '1px solid #444',
        borderRadius: '6px',
        padding: '15px',
        background: '#151515'
      }}>
        {/* Array Preview */}
        <div className="array-preview">
          <div className="array-preview-content">
            <span className="preview-label">Current: </span>
            <code className="preview-value">
              [{arrayValue.map((v, i) => 
                typeof v === 'string' && v.length > 20 ? `${v.slice(0, 20)}...` : v
              ).join(', ')}]
            </code>
            <span className="array-count-badge">({arrayValue.length} items)</span>
          </div>
        </div>
        
        {arrayItems.map((item, index) => (
          <div key={item.id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: index === arrayItems.length - 1 ? '0' : '10px'
          }}>
            <span style={{
              color: '#9ca3af',
              fontSize: '13px',
              width: '30px',
              textAlign: 'center'
            }}>
              [{index}]
            </span>
            <div style={{ flex: 1 }}>
              <ContractInputComponent
                inputDefinition={{
                  ...inputDefinition,
                  name: `${inputDefinition.name}[${index}]`,
                  type: baseType
                }}
                value={item.value}
                onChange={(newValue) => handleArrayItemChange(item.id, newValue)}
                nestingLevel={nestingLevel + 1}
                parentPath={`${parentPath}.${inputDefinition.name}`}
              />
            </div>
            <Button
              variant="icon-ghost"
              size="icon-inline"
              className="compact-array-remove"
              aria-label={`Remove item ${index}`}
              title="Remove item"
              onClick={(e) => { e.stopPropagation(); removeArrayItem(item.id); }}
              disabled={(() => {
                const fixedSizeMatch = inputDefinition.type.match(/\[(\d+)\]$/);
                const minSize = fixedSizeMatch ? parseInt(fixedSizeMatch[1]) : 1;
                return arrayItems.length <= minSize;
              })()}
            >
              <XCloseIcon width={16} height={16} />
            </Button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
          {(() => {
            const fixedSizeMatch = inputDefinition.type.match(/\[(\d+)\]$/);
            const maxSize = fixedSizeMatch ? parseInt(fixedSizeMatch[1]) : Infinity;
            return arrayItems.length < maxSize;
          })() && (
            <Button
              variant="icon-ghost"
              size="icon-inline"
              aria-label="Add item"
              title="Add item"
              onClick={addArrayItem}
            >
              <PlusIcon width={18} height={18} />
            </Button>
          )}
          {(() => {
            const fixedSizeMatch = inputDefinition.type.match(/\[(\d+)\]$/);
            const minSize = fixedSizeMatch ? parseInt(fixedSizeMatch[1]) : 1;
            return arrayItems.length > minSize;
          })() && (
            <Button
              variant="icon-ghost"
              size="icon-inline"
              aria-label="Remove last item"
              title="Remove last item"
              onClick={() => removeArrayItem(arrayItems[arrayItems.length - 1].id)}
            >
              <XCloseIcon width={18} height={18} />
            </Button>
          )}
        </div>
      </div>
    );
  };

  const renderStructInput = () => {
    if (!inputDefinition.components) {
      return (
        <div style={{ color: '#ef4444', fontSize: '13px' }}>
          Struct definition missing components
        </div>
      );
    }

    return (
      <div style={{
        border: '1px solid #444',
        borderRadius: '6px',
        padding: '15px',
        background: '#151515'
      }}>
        {inputDefinition.components.map((component, index) => (
          <div key={component.name} style={{
            marginBottom: index === inputDefinition.components!.length - 1 ? '0' : '12px'
          }}>
            <ContractInputComponent
              inputDefinition={component}
              value={currentValue?.[component.name]}
              onChange={(fieldValue) => handleStructFieldChange(component.name, fieldValue)}
              nestingLevel={nestingLevel + 1}
              parentPath={`${parentPath}.${inputDefinition.name}`}
            />
          </div>
        ))}
      </div>
    );
  };

  const renderInput = () => {
    const type = inputDefinition.type;
    
    // Check for both dynamic arrays (uint256[]) and fixed-size arrays (uint256[4])
    if (type.endsWith('[]') || /\[\d+\]$/.test(type)) {
      return renderArrayInput();
    } else if (type === 'tuple') {
      return renderStructInput();
    } else {
      return renderBasicInput();
    }
  };

  const nestingClass = nestingLevel > 0 ? `nested-level-${Math.min(nestingLevel, 2)}` : '';
  const nestingStyle: React.CSSProperties = nestingLevel > 0 ? {
    marginLeft: '20px',
    borderLeft: `2px solid ${nestingLevel === 1 ? '#333' : '#444'}`,
    paddingLeft: '15px'
  } : {};

  return (
    <div style={{ marginBottom: '15px', ...nestingStyle }} className={nestingClass}>
      <label style={{
        display: 'block',
        color: '#9ca3af',
        fontSize: '15px',
        fontWeight: 500,
        marginBottom: '5px'
      }}>
        {inputDefinition.name || 'parameter'}{' '}
        <span style={{
          color: '#06b6d4',
          fontFamily: 'Monaco, Menlo, monospace',
          fontSize: '13px'
        }}>
          ({inputDefinition.type})
        </span>
      </label>
      
      {renderInput()}
      
      {!isValid && errorMessage && (
        <div style={{
          color: '#ef4444',
          fontSize: '13px',
          marginTop: '5px'
        }}>
          {errorMessage}
        </div>
      )}
    </div>
  );
};

// Utility functions
export function getDefaultValue(type: string): any {
  if (type.endsWith('[]')) {
    return [];
  } else if (type === 'tuple') {
    return {};
  } else if (type.includes('uint') || type.includes('int')) {
    return '';
  } else if (type === 'bool') {
    return '';
  } else if (type === 'address') {
    return '';
  } else {
    return '';
  }
}

function getPlaceholderForType(type: string): string {
  if (type.includes('uint') || type.includes('int')) {
    return type.includes('uint') ? 'Enter positive integer' : 'Enter integer';
  } else if (type === 'address') {
    return '0x...';
  } else if (type === 'string') {
    return 'Enter string';
  } else if (type.startsWith('bytes')) {
    return '0x...';
  } else {
    return `Enter ${type}`;
  }
}

function parseValueForType(value: string, type: string): any {
  const trimmedValue = value.trim();
  
  if (!trimmedValue) {
    return getDefaultValue(type);
  }
  
  if (type.includes('uint') || type.includes('int')) {
    const num = parseInt(trimmedValue, 10);
    return isNaN(num) ? trimmedValue : num;
  } else if (type === 'bool') {
    return trimmedValue === 'true';
  } else {
    return trimmedValue;
  }
}

function validateSingleValue(value: any, type: string): { isValid: boolean; error: string } {
  if (value === null || value === undefined || value === '') {
    if (type.includes('uint') || type.includes('int')) {
      return { isValid: true, error: '' }; // Empty is OK, will default to 0
    }
    return { isValid: true, error: '' };
  }
  
  if (type.includes('uint') || type.includes('int')) {
    const num = typeof value === 'number' ? value : parseInt(value.toString(), 10);
    if (isNaN(num)) {
      return { isValid: false, error: `Invalid ${type}: must be a number` };
    }
    if (type.includes('uint') && num < 0) {
      return { isValid: false, error: `Invalid ${type}: must be non-negative` };
    }
    return { isValid: true, error: '' };
  } else if (type === 'address') {
    const addr = value.toString();
    if (!addr.startsWith('0x') || addr.length !== 42) {
      return { isValid: false, error: 'Invalid address: must be 42 characters starting with 0x' };
    }
    return { isValid: true, error: '' };
  } else if (type === 'bool') {
    if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
      return { isValid: false, error: 'Invalid bool: must be true or false' };
    }
    return { isValid: true, error: '' };
  }
  
  return { isValid: true, error: '' };
}

export default ContractInputComponent;
export type { ABIInput, ContractInputComponentProps };
