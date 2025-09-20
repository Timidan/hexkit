import React, { useState, useEffect, useCallback } from 'react';
import '../styles/CompactArrayStyles.css';
import { PlusIcon, XCloseIcon } from './icons/IconLibrary';

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

  // Initialize array items for array types
  useEffect(() => {
    if (inputDefinition.type.endsWith('[]')) {
      const initialItems: ArrayItem[] = [];
      if (Array.isArray(value) && value.length > 0) {
        value.forEach((item, index) => {
          initialItems.push({
            id: `item-${index}-${Date.now()}`,
            value: item
          });
        });
      } else {
        // Start with one empty item
        initialItems.push({
          id: `item-0-${Date.now()}`,
          value: getDefaultValue(inputDefinition.type.replace('[]', ''))
        });
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
    console.log(`🎯 [HandleValueChange] ${inputDefinition.name} (${inputDefinition.type})`);
    console.log(`🎯 [HandleValueChange] NewValue:`, newValue, typeof newValue);
    
    setCurrentValue(newValue);
    const validation = validateValue(newValue);
    console.log(`🎯 [HandleValueChange] Validation:`, validation);
    
    setIsValid(validation.isValid);
    setErrorMessage(validation.error);
    
    if (onChange) {
      console.log(`🎯 [HandleValueChange] Calling onChange with:`, newValue, validation.isValid);
      onChange(newValue, validation.isValid);
    }
  }, [validateValue, onChange, inputDefinition.name, inputDefinition.type]);

  const handleBasicInputChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const rawValue = event.target.value;
    const parsedValue = parseValueForType(rawValue, inputDefinition.type);
    handleValueChange(parsedValue);
  };

  const handleArrayItemChange = (itemId: string, newValue: any) => {
    console.log(`🔍 [ArrayItemChange] Starting for ${inputDefinition.name}[${itemId}]`);
    console.log(`🔍 [ArrayItemChange] Input type: ${inputDefinition.type}`);
    console.log(`🔍 [ArrayItemChange] Received newValue:`, newValue, typeof newValue);
    
    // Parse the value for the base type to ensure proper type conversion
    const baseType = inputDefinition.type.replace('[]', '');
    console.log(`🔍 [ArrayItemChange] BaseType: ${baseType}`);
    
    const parsedValue = typeof newValue === 'string' ? parseValueForType(newValue, baseType) : newValue;
    console.log(`🔍 [ArrayItemChange] ParsedValue:`, parsedValue, typeof parsedValue);
    
    const updatedItems = arrayItems.map(item => 
      item.id === itemId ? { ...item, value: parsedValue } : item
    );
    console.log(`🔍 [ArrayItemChange] Updated items:`, updatedItems);
    
    setArrayItems(updatedItems);
    
    const arrayValue = updatedItems.map(item => item.value);
    console.log(`🔍 [ArrayItemChange] Final array value:`, arrayValue);
    console.log(`🔍 [ArrayItemChange] Array value types:`, arrayValue.map(v => typeof v));
    console.log(`🔍 [ArrayItemChange] CRITICAL: Is this an array?`, Array.isArray(arrayValue));
    console.log(`🔍 [ArrayItemChange] CRITICAL: Array length:`, arrayValue.length);
    console.log(`🔍 [ArrayItemChange] CRITICAL: JSON stringify:`, JSON.stringify(arrayValue));
    
    handleValueChange(arrayValue);
  };

  const addArrayItem = () => {
    const newItem: ArrayItem = {
      id: `item-${arrayItems.length}-${Date.now()}`,
      value: getDefaultValue(inputDefinition.type.replace('[]', ''))
    };
    const updatedItems = [...arrayItems, newItem];
    setArrayItems(updatedItems);
    
    const arrayValue = updatedItems.map(item => item.value);
    handleValueChange(arrayValue);
  };

  const removeArrayItem = (itemId: string) => {
    if (arrayItems.length <= 1) return; // Keep at least one item
    
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
      fontSize: '14px',
      fontFamily: 'inherit'
    };

    if (type === 'bool') {
      return (
        <select
          style={inputStyle}
          value={currentValue?.toString() || ''}
          onChange={handleBasicInputChange}
        >
          <option value="">Select...</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    } else {
      const placeholder = getPlaceholderForType(type);
      return (
        <input
          type="text"
          style={inputStyle}
          placeholder={placeholder}
          value={currentValue?.toString() || ''}
          onChange={handleBasicInputChange}
        />
      );
    }
  };

  const renderArrayInput = () => {
    const baseType = inputDefinition.type.replace('[]', '');
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
              fontSize: '12px',
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
            <button
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#dc3545'
              }}
              onClick={() => removeArrayItem(item.id)}
              disabled={arrayItems.length <= 1}
            >
              <XCloseIcon width={16} height={16} />
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
          <button
            onClick={addArrayItem}
            title="Add item"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#28a745'
            }}
          >
            <PlusIcon width={20} height={20} />
          </button>
          {arrayItems.length > 1 && (
            <button
              onClick={() => removeArrayItem(arrayItems[arrayItems.length - 1].id)}
              title="Remove last item"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#dc3545'
              }}
            >
              <XCloseIcon width={20} height={20} />
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderStructInput = () => {
    if (!inputDefinition.components) {
      return (
        <div style={{ color: '#ef4444', fontSize: '12px' }}>
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
    
    if (type.endsWith('[]')) {
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
        fontSize: '14px',
        fontWeight: 500,
        marginBottom: '5px'
      }}>
        {inputDefinition.name || 'parameter'}{' '}
        <span style={{
          color: '#06b6d4',
          fontFamily: 'Monaco, Menlo, monospace',
          fontSize: '12px'
        }}>
          ({inputDefinition.type})
        </span>
      </label>
      
      {renderInput()}
      
      {!isValid && errorMessage && (
        <div style={{
          color: '#ef4444',
          fontSize: '12px',
          marginTop: '5px'
        }}>
          {errorMessage}
        </div>
      )}
    </div>
  );
};

// Utility functions
function getDefaultValue(type: string): any {
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