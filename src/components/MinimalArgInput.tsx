import React, { useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';

interface ArgInputProps {
  abi?: any[];
  functionName?: string;
  onDataChange: (data: any[]) => void;
  initialData?: any[];
}

const MinimalArgInput: React.FC<ArgInputProps> = ({
  abi,
  functionName,
  onDataChange,
  initialData = []
}) => {
  const [args, setArgs] = useState<any[]>([]);
  const [collapsedStructs, setCollapsedStructs] = useState<Set<string>>(new Set());

  // Get function inputs
  const functionInputs = React.useMemo(() => {
    if (!abi || !functionName) return [];
    const func = abi.find(f => f.name === functionName && f.type === 'function');
    const inputs = func?.inputs || [];
    
    // Debug function inputs
    console.log(`🔍 FUNCTION INPUTS for ${functionName}:`, inputs);
    inputs.forEach((input, idx) => {
      console.log(`  [${idx}] ${input.name} (${input.type})`, {
        hasComponents: !!input.components,
        components: input.components
      });
    });
    
    return inputs;
  }, [abi, functionName]);

  // Initialize args when function changes
  useEffect(() => {
    if (functionInputs.length === 0) return;
    
    const newArgs = functionInputs.map((input: any, idx: number) => {
      // Use existing arg if available, otherwise use initialData or default
      const existingArg = args[idx];
      const initialValue = initialData[idx];
      
      if (existingArg !== undefined && existingArg !== null && existingArg !== '') {
        return existingArg;
      }
      if (initialValue !== undefined && initialValue !== null && initialValue !== '') {
        return initialValue;
      }
      return getDefaultValue(input.type);
    });
    
    // Only update if args actually changed
    if (JSON.stringify(newArgs) !== JSON.stringify(args)) {
      setArgs(newArgs);
      onDataChange(newArgs);
    }
  }, [functionInputs]);

  // Collapse/expand is purely manual - controlled by user clicks only

  const getDefaultValue = (type: string): any => {
    if (type === 'bool') return false;
    if (type.includes('uint') || type.includes('int')) return '';
    if (type === 'address') return '';
    if (type.includes('bytes')) return '';
    if (type.includes('[]')) return [];
    if (type.includes('tuple')) return {};
    return '';
  };

  const updateArg = useCallback((index: number, value: any) => {
    const newArgs = [...args];
    newArgs[index] = value;
    setArgs(newArgs);
    onDataChange(newArgs);
  }, [args, onDataChange]);

  const getTypeColor = (type: string): string => {
    if (type === 'address') return '#ff6b6b';
    if (type === 'bool') return '#4ecdc4';
    if (type.includes('uint') || type.includes('int')) return '#45b7d1';
    if (type.includes('bytes')) return '#f9ca24';
    if (type.includes('[]')) return '#6c5ce7';
    if (type.includes('tuple')) return '#fd79a8';
    return '#74b9ff';
  };

  // Helper to check if a struct is populated with valid data (for "✅ Filled" indicator)
  const isStructPopulated = (structValue: any, components: any[]): boolean => {
    if (!structValue || !components) return false;
    // ALL fields must be filled with valid data, not just some
    return components.every(comp => {
      const value = structValue[comp.name];
      if (comp.type === 'tuple' && comp.components) {
        return isStructPopulated(value, comp.components);
      }
      if (value === undefined || value === null || value === '') return false;
      // Check if the value is valid for the type
      const validation = validateAndFormatInput(value, comp.type);
      return validation.isValid;
    });
  };

  // Toggle collapse state for a struct
  const toggleStructCollapse = (structId: string) => {
    const newCollapsed = new Set(collapsedStructs);
    if (newCollapsed.has(structId)) {
      newCollapsed.delete(structId);
    } else {
      newCollapsed.add(structId);
    }
    setCollapsedStructs(newCollapsed);
  };

  // Input validation helpers
  const validateAndFormatInput = (value: string, type: string): { isValid: boolean; formattedValue: string; error?: string } => {
    if (!value || value === '') return { isValid: true, formattedValue: value };

    if (type === 'address') {
      try {
        // Check if it's a valid address format
        if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
          return { isValid: false, formattedValue: value, error: 'Invalid address format' };
        }
        // Auto-checksum the address
        const checksummed = ethers.utils.getAddress(value);
        return { isValid: true, formattedValue: checksummed };
      } catch {
        return { isValid: false, formattedValue: value, error: 'Invalid address' };
      }
    }

    if (type.includes('uint') || type.includes('int')) {
      // Remove any non-numeric characters except for scientific notation
      const numericValue = value.replace(/[^0-9.eE+-]/g, '');
      if (numericValue !== value) {
        return { isValid: false, formattedValue: numericValue, error: 'Only numbers allowed' };
      }
      // Check if it's a valid number
      if (isNaN(Number(value))) {
        return { isValid: false, formattedValue: value, error: 'Invalid number' };
      }
      return { isValid: true, formattedValue: value };
    }

    if (type.includes('bytes')) {
      if (!value.startsWith('0x')) {
        return { isValid: false, formattedValue: '0x' + value.replace(/^0x/, ''), error: 'Must start with 0x' };
      }
      if (!/^0x[a-fA-F0-9]*$/.test(value)) {
        return { isValid: false, formattedValue: value, error: 'Invalid hex format' };
      }
      return { isValid: true, formattedValue: value.toLowerCase() };
    }

    return { isValid: true, formattedValue: value };
  };

  // Unified struct helper component for all struct types
  const renderStructHelper = (
    structData: any,
    components: any[],
    onChange: (newValue: any) => void,
    structId: string,
    isArrayItem = false,
    arrayIndex?: number,
    onRemove?: () => void
  ): React.ReactNode => {
    const isPopulated = isStructPopulated(structData, components);
    const isCollapsed = collapsedStructs.has(structId);

    return (
      <div className="struct-item">
        <div className="struct-item-header" onClick={() => toggleStructCollapse(structId)}>
          <div className="struct-header-left">
            <span className="expand-icon">
              {isCollapsed ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              )}
            </span>
            {isArrayItem ? (
              <span className="struct-index">[{arrayIndex}]</span>
            ) : (
              <span className="struct-label">Struct</span>
            )}
            {isPopulated && isCollapsed && (
              <span className="populated-indicator">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
                Filled
              </span>
            )}
          </div>
          {isArrayItem && onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="remove-struct-btn"
              title="Remove struct"
            >
              ×
            </button>
          )}
          {!isArrayItem && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Clear the struct
                const emptyStruct: any = {};
                components?.forEach((comp: any) => {
                  emptyStruct[comp.name] = getDefaultValue(comp.type);
                });
                onChange(emptyStruct);
              }}
              className="clear-struct-btn"
              title="Clear struct"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14ZM10 11v6M14 11v6"/>
              </svg>
            </button>
          )}
        </div>
        {!isCollapsed && (
          <div className="struct-fields">
            {components?.map((component: any, compIdx: number) => (
              <div key={compIdx} className="struct-field">
                {renderStructField(component, structData && structData[component.name], (newValue: any) => {
                  const currentStruct = structData || {};
                  const newStruct = { ...currentStruct, [component.name]: newValue };
                  onChange(newStruct);
                })}
              </div>
            )) || (
              <div className="missing-components-warning">
                <p style={{ color: '#ef4444', fontSize: '12px', padding: '10px' }}>
                  ⚠️ Tuple structure not available in ABI. You can manually edit the raw data:
                </p>
                <textarea
                  value={JSON.stringify(structData || {}, null, 2)}
                  onChange={(e) => {
                    try {
                      const newValue = JSON.parse(e.target.value);
                      onChange(newValue);
                    } catch (error) {
                      console.warn('Invalid JSON:', error);
                    }
                  }}
                  placeholder="Enter JSON object"
                  className="struct-field-input"
                  style={{ minHeight: '80px', fontFamily: 'monospace' }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Helper function to render struct fields recursively
  const renderStructField = (field: any, value: any, onChange: (newValue: any) => void): React.ReactNode => {
    const typeColor = getTypeColor(field.type);
    
    // Handle nested structs/tuples using unified helper
    if (field.type === 'tuple' && field.components) {
      const nestedStructId = `nested-${field.name}-${Date.now()}`;
      return (
        <div className="nested-struct">
          <div className="nested-struct-header">
            <span className="field-name">{field.name}</span>
            <span className="field-type" style={{ color: typeColor }}>({field.type})</span>
          </div>
          {renderStructHelper(
            value,
            field.components,
            onChange,
            nestedStructId,
            false // not array item
          )}
        </div>
      );
    }
    
    // Handle simple fields with validation
    const validation = validateAndFormatInput(value || '', field.type);
    const hasError = !validation.isValid && value && value !== '';
    
    return (
      <>
        <label className="field-label">
          {field.name} <span style={{ color: typeColor }}>({field.type})</span>
        </label>
        <div className="input-with-validation">
          <input
            type="text"
            value={value || ''}
            placeholder={`Enter ${field.type}`}
            className={`struct-field-input ${hasError ? 'validation-error' : ''}`}
            onChange={(e) => {
              const validation = validateAndFormatInput(e.target.value, field.type);
              onChange(validation.formattedValue);
            }}
            onBlur={(e) => {
              // Auto-format on blur (like checksumming addresses)
              const validation = validateAndFormatInput(e.target.value, field.type);
              if (validation.formattedValue !== e.target.value) {
                onChange(validation.formattedValue);
              }
            }}
          />
          {hasError && (
            <div className="validation-error-message">
              {validation.error}
            </div>
          )}
        </div>
      </>
    );
  };

  const renderInput = (input: any, index: number) => {
    const value = args[index] || '';
    const typeColor = getTypeColor(input.type);
    
    // Debug all inputs
    console.log(`🔍 ALL INPUTS: ${input.name} (${input.type})`, {
      hasComponents: !!input.components,
      componentsLength: input.components?.length,
      isArray: input.type.includes('[]'),
      isTuple: input.type.includes('tuple'),
      components: input.components
    });
    
    if (input.type.includes('tuple')) {
      console.log(`🚨 TUPLE DEBUG: ${input.name} (${input.type})`, {
        hasComponents: !!input.components,
        componentsLength: input.components?.length,
        isArray: input.type.includes('[]'),
        components: input.components
      });
    }

    // Handle boolean
    if (input.type === 'bool') {
      return (
        <div key={index} className="arg-row">
          <div className="arg-label">
            <span className="arg-name">{input.name}</span>
            <span className="arg-type" style={{ color: typeColor }}>{input.type}</span>
          </div>
          <select
            value={value ? 'true' : 'false'}
            onChange={(e) => updateArg(index, e.target.value === 'true')}
            className="arg-input bool-input"
          >
            <option value="false">false</option>
            <option value="true">true</option>
          </select>
        </div>
      );
    }

    // Handle arrays - differentiate between simple arrays and struct arrays
    if (input.type.includes('[]')) {
      const baseType = input.type.replace('[]', '');
      const arrayValue = Array.isArray(value) ? value : [];
      
      // Debug logging
      console.log(`🔍 Array field: ${input.name} (${input.type}), baseType: ${baseType}, hasComponents: ${!!input.components}, components:`, input.components);
      
      // Handle arrays of structs/tuples - improved detection
      // For tuple arrays, always show struct interface even without components
      if (baseType === 'tuple' || input.type.includes('tuple[]')) {
        console.log(`✅ TREATING AS STRUCT ARRAY: ${input.name} (${input.type})`);
        // Use empty components array if none provided for tuple[]
        const components = input.components || [];
        return (
          <div key={index} className="arg-row struct-array-row">
            <div className="arg-label">
              <span className="arg-name">{input.name}</span>
              <span className="arg-type" style={{ color: typeColor }}>{input.type}</span>
            </div>
            <div className="struct-array-container">
              <div className="struct-array-header">
                <span className="array-count">{arrayValue.length} structs</span>
                <button
                  onClick={() => {
                    const newStruct: any = {};
                    if (components && components.length > 0) {
                      components.forEach((comp: any) => {
                        newStruct[comp.name] = getDefaultValue(comp.type);
                      });
                    } else {
                      // Fallback for tuple[] without components - create empty object
                      console.warn(`⚠️ No components found for ${input.name} (${input.type}). Creating empty tuple.`);
                    }
                    updateArg(index, [...arrayValue, newStruct]);
                  }}
                  className="add-struct-btn"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                  Add Struct
                </button>
              </div>
              
              {arrayValue.map((structValue: any, structIdx: number) => {
                const structId = `${index}-${structIdx}`;
                return (
                  <div key={structIdx}>
                    {renderStructHelper(
                      structValue,
                      components,
                      (newValue: any) => {
                        const newArray = [...arrayValue];
                        newArray[structIdx] = newValue;
                        updateArg(index, newArray);
                      },
                      structId,
                      true, // isArrayItem
                      structIdx, // arrayIndex
                      () => {
                        const newArray = arrayValue.filter((_: any, i: number) => i !== structIdx);
                        updateArg(index, newArray);
                      }
                    )}
                  </div>
                );
              })}
              
              {arrayValue.length === 0 && (
                <div className="empty-array">
                  <p>No structs added. Click "Add Struct" to create one.</p>
                </div>
              )}
            </div>
          </div>
        );
      }
      
      // Handle arrays of simple types (string[], uint256[], etc.) - use comma separation with validation
      const displayValue = arrayValue.join(', ');
      
      // Validate each array element individually
      const arrayErrors: string[] = [];
      arrayValue.forEach((item, idx) => {
        const validation = validateAndFormatInput(item?.toString() || '', baseType);
        if (!validation.isValid && item && item !== '') {
          arrayErrors.push(`Item ${idx}: ${validation.error}`);
        }
      });
      
      const hasArrayErrors = arrayErrors.length > 0;
      
      return (
        <div key={index} className="arg-row">
          <div className="arg-label">
            <span className="arg-name">{input.name}</span>
            <span className="arg-type" style={{ color: typeColor }}>{input.type}</span>
          </div>
          <div className="input-with-validation">
            <input
              type="text"
              value={displayValue}
              onChange={(e) => {
                const inputValue = e.target.value;
                if (inputValue.trim() === '') {
                  updateArg(index, []);
                } else {
                  // Parse comma-separated values but don't apply formatting during typing
                  const items = inputValue
                    .split(',')
                    .map(item => item.trim())
                    .filter(item => item !== '');
                  updateArg(index, items);
                }
              }}
              onBlur={(e) => {
                // Auto-format all items on blur
                if (arrayValue.length > 0) {
                  const formattedItems = arrayValue.map(item => {
                    const validation = validateAndFormatInput(item?.toString() || '', baseType);
                    return validation.formattedValue;
                  });
                  updateArg(index, formattedItems);
                }
              }}
              placeholder={`Enter ${baseType} values separated by commas (e.g. value1, value2, value3)`}
              className={`arg-input array-input ${hasArrayErrors ? 'validation-error' : ''}`}
            />
            <div className="array-hint">
              <span style={{ fontSize: '11px', color: '#666' }}>
                {arrayValue.length} items • Separate with commas
              </span>
            </div>
            {hasArrayErrors && (
              <div className="validation-error-message">
                {arrayErrors.slice(0, 3).join('; ')}
                {arrayErrors.length > 3 && ` and ${arrayErrors.length - 3} more errors`}
              </div>
            )}
          </div>
        </div>
      );
    }

    // Handle struct/tuple (using unified helper)
    if (input.type === 'tuple' || input.components) {
      const structId = `single-${index}`;

      return (
        <div key={index} className="arg-row tuple-row">
          <div className="arg-label">
            <span className="arg-name">{input.name}</span>
            <span className="arg-type" style={{ color: typeColor }}>{input.type}</span>
          </div>
          <div className="struct-container">
            {renderStructHelper(
              value,
              input.components,
              (newValue: any) => updateArg(index, newValue),
              structId,
              false // not array item
            )}
          </div>
        </div>
      );
    }

    // Handle simple types
    const getInputType = () => {
      if (input.type.includes('uint') || input.type.includes('int')) return 'text';
      return 'text';
    };

    const getPlaceholder = () => {
      if (input.type === 'address') return '0x...';
      if (input.type.includes('uint')) return '0';
      if (input.type.includes('int')) return '0';
      if (input.type.includes('bytes')) return '0x...';
      return `Enter ${input.type}`;
    };

    // Skip validation for array types in simple types section (they're handled above)
    const validation = input.type.includes('[]') ? 
      { isValid: true, formattedValue: value || '' } : 
      validateAndFormatInput(value || '', input.type);
    const hasError = !validation.isValid && value && value !== '';

    return (
      <div key={index} className="arg-row">
        <div className="arg-label">
          <span className="arg-name">{input.name}</span>
          <span className="arg-type" style={{ color: typeColor }}>{input.type}</span>
        </div>
        <div className="input-with-validation">
          <input
            type={getInputType()}
            value={value || ''}
            onChange={(e) => updateArg(index, e.target.value)}
            placeholder={getPlaceholder()}
            className={`arg-input ${hasError ? 'validation-error' : ''}`}
          />
          {hasError && (
            <div className="validation-error-message">
              {validation.error}
            </div>
          )}
        </div>
      </div>
    );
  };


  const clearAll = () => {
    const emptyArgs = functionInputs.map((input: any) => getDefaultValue(input.type));
    setArgs(emptyArgs);
    onDataChange(emptyArgs);
  };

  if (!functionInputs.length) {
    return (
      <div className="no-args">
        <p>No parameters required</p>
      </div>
    );
  }

  return (
    <div className="minimal-arg-input">
      <div className="arg-header">
        <span className="arg-count">{functionInputs.length} parameters</span>
        <div className="arg-actions">
          <button onClick={clearAll} className="clear-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14ZM10 11v6M14 11v6"/>
            </svg>
            Clear
          </button>
        </div>
      </div>
      
      <div className="arg-list">
        {functionInputs.map(renderInput)}
      </div>
    </div>
  );
};

export default MinimalArgInput;