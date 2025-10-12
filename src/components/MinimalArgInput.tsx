import React, { useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';
import '../styles/CompactArrayStyles.css';
import { PlusIcon, MinusIcon, TrashIcon, ShuffleIcon, Icon, AlertTriangleIcon } from './icons/IconLibrary';
import InlineActionButton from './ui/InlineActionButton';

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
    console.log(`[MinimalArgInput] FUNCTION INPUTS for ${functionName}:`, inputs);
    inputs.forEach((input: any, idx: number) => {
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

  // Universal Solidity Type System
  const SolidityTypes = {
    // Primitive type definitions with validation and formatting rules
    getTypeInfo: (type: string) => {
      const baseType = type.replace(/\[\]$/, ''); // Remove array suffix
      const isArray = type.includes('[]');
      
      if (baseType === 'bool') {
        return {
          primitive: 'bool',
          defaultValue: false,
          arrayDefaultValue: [],
          validator: (value: any) => typeof value === 'boolean' || value === 'true' || value === 'false',
          formatter: (value: any) => value === 'true' || value === true,
          placeholder: 'true/false',
          inputType: 'select'
        };
      }
      
      if (baseType.match(/^u?int(\d+)?$/)) {
        return {
          primitive: 'integer',
          defaultValue: '',
          arrayDefaultValue: [],
          validator: (value: string) => !isNaN(Number(value)) && Number(value) >= 0,
          formatter: (value: string) => {
            const cleaned = value.replace(/[^0-9.eE+-]/g, '');
            // Convert to number for proper type handling
            const num = Number(cleaned);
            return isNaN(num) ? cleaned : num;
          },
          placeholder: '0',
          inputType: 'text'
        };
      }
      
      if (baseType === 'address') {
        return {
          primitive: 'address',
          defaultValue: '',
          arrayDefaultValue: [],
          validator: (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value),
          formatter: (value: string) => {
            try {
              return ethers.utils.getAddress(value);
            } catch {
              return value;
            }
          },
          placeholder: '0x...',
          inputType: 'text'
        };
      }
      
      if (baseType.includes('bytes')) {
        return {
          primitive: 'bytes',
          defaultValue: '',
          arrayDefaultValue: [],
          validator: (value: string) => /^0x[a-fA-F0-9]*$/.test(value),
          formatter: (value: string) => {
            if (!value.startsWith('0x')) value = '0x' + value.replace(/^0x/, '');
            return value.toLowerCase();
          },
          placeholder: '0x...',
          inputType: 'text'
        };
      }
      
      if (baseType === 'string') {
        return {
          primitive: 'string',
          defaultValue: '',
          arrayDefaultValue: [],
          validator: (value: string) => true, // Strings are always valid
          formatter: (value: string) => value,
          placeholder: 'Enter text',
          inputType: 'text'
        };
      }
      
      if (baseType === 'tuple') {
        return {
          primitive: 'tuple',
          defaultValue: {},
          arrayDefaultValue: [],
          validator: (value: any) => typeof value === 'object',
          formatter: (value: any) => value,
          placeholder: 'Struct object',
          inputType: 'struct'
        };
      }
      
      // Fallback
      return {
        primitive: 'unknown',
        defaultValue: '',
        arrayDefaultValue: [],
        validator: (value: any) => true,
        formatter: (value: any) => value,
        placeholder: `Enter ${baseType}`,
        inputType: 'text'
      };
    }
  };

  const getDefaultValue = (type: string): any => {
    const typeInfo = SolidityTypes.getTypeInfo(type);
    return type.includes('[]') ? typeInfo.arrayDefaultValue : typeInfo.defaultValue;
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

  // Helper to check if a struct is populated with valid data (for " Filled" indicator)
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

  // Universal input validation using the type system
  const validateAndFormatInput = (value: any, type: string): { isValid: boolean; formattedValue: any; error?: string } => {
    // Handle non-string values (objects, arrays, etc.)
    if (typeof value !== 'string') {
      return { isValid: true, formattedValue: value };
    }
    
    if (!value || value === '') return { isValid: true, formattedValue: value };

    const typeInfo = SolidityTypes.getTypeInfo(type);
    
    try {
      const isValid = typeInfo.validator(value);
      const formattedValue = typeInfo.formatter(value);
      
      if (!isValid) {
        return { 
          isValid: false, 
          formattedValue: value, 
          error: `Invalid ${typeInfo.primitive} format` 
        };
      }
      
      return { isValid: true, formattedValue };
    } catch (error) {
      return { 
        isValid: false, 
        formattedValue: value, 
        error: `Invalid ${typeInfo.primitive}` 
      };
    }
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
          <InlineActionButton
            className="remove-struct-btn"
            ariaLabel="Remove struct"
            tooltip="Remove struct"
            icon={<XCloseIcon width={14} height={14} />}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            size={28}
            stopPropagation
          />
        )}
        {!isArrayItem && (
          <InlineActionButton
            className="clear-struct-btn"
            ariaLabel="Reset struct"
            tooltip="Reset struct"
            icon={<TrashIcon width={14} height={14} />}
            onClick={(e) => {
              e.stopPropagation();
              const emptyStruct: any = {};
              components?.forEach((comp: any) => {
                emptyStruct[comp.name] = getDefaultValue(comp.type);
              });
              onChange(emptyStruct);
            }}
            size={28}
            stopPropagation
          />
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
                  <AlertTriangleIcon width={14} height={14} style={{ marginRight: '4px' }} />Tuple structure not available in ABI. You can manually edit the raw data:
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
    
    // Handle tuple arrays (tuple[]) - should use array rendering logic
    if (field.type.includes('tuple[]') || (field.type.includes('[]') && field.type.includes('tuple'))) {
      console.log(`[MinimalArgInput] STRUCT FIELD TUPLE ARRAY: ${field.name} (${field.type})`, {
        hasComponents: !!field.components,
        components: field.components
      });
      
      const arrayValue = Array.isArray(value) ? value : [];
      const components = field.components || [];
      
      return (
        <div className="nested-tuple-array">
          <div className="nested-struct-header">
            <span className="field-name">{field.name}</span>
            <span className="field-type" style={{ color: typeColor }}>({field.type})</span>
          </div>
          <div className="struct-array-container">
            <div className="struct-array-header">
              <span className="array-count">{arrayValue.length} structs</span>
              <InlineActionButton
                ariaLabel="Add struct"
                tooltip="Add struct"
                icon={<PlusIcon width={16} height={16} />}
                onClick={() => {
                  const newStruct: any = {};
                  if (components && components.length > 0) {
                    components.forEach((comp: any) => {
                      newStruct[comp.name] = getDefaultValue(comp.type);
                    });
                  }
                  onChange([...arrayValue, newStruct]);
                }}
                size={30}
                stopPropagation
              />
            </div>
            
            {arrayValue.map((structValue: any, structIdx: number) => {
              const structId = `nested-${field.name}-${structIdx}`;
              return (
                <div key={structIdx}>
                  {renderStructHelper(
                    structValue,
                    components,
                    (newValue: any) => {
                      const newArray = [...arrayValue];
                      newArray[structIdx] = newValue;
                      onChange(newArray);
                    },
                    structId,
                    true, // isArrayItem
                    structIdx, // arrayIndex
                    () => {
                      const newArray = arrayValue.filter((_: any, i: number) => i !== structIdx);
                      onChange(newArray);
                    }
                  )}
                </div>
              );
            })}
            
            {arrayValue.length === 0 && (
              <div className="empty-array">
                <p>No structs added. Use the add button to create one.</p>
              </div>
            )}
          </div>
        </div>
      );
    }
    
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
              {validation.error || 'Invalid input'}
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
    console.log(`[MinimalArgInput] INPUT: ${input.name} (${input.type})`, {
      hasComponents: !!input.components,
      componentsLength: input.components?.length,
      isArray: input.type.includes('[]'),
      isTuple: input.type.includes('tuple'),
      components: input.components
    });
    
    if (input.type.includes('tuple')) {
      console.log(`[MinimalArgInput] TUPLE DEBUG: ${input.name} (${input.type})`, {
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
      console.log(`[MinimalArgInput] Array field: ${input.name} (${input.type}), baseType: ${baseType}, hasComponents: ${!!input.components}, components:`, input.components);
      
      // Handle arrays of structs/tuples - improved detection
      // For tuple arrays, always show struct interface even without components
      if (baseType === 'tuple' || input.type.includes('tuple[]')) {
        console.log(` TREATING AS STRUCT ARRAY: ${input.name} (${input.type})`);
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
                <InlineActionButton
                  ariaLabel="Add struct"
                  tooltip="Add struct"
                  icon={<PlusIcon width={16} height={16} />}
                  onClick={() => {
                    const newStruct: any = {};
                    if (components && components.length > 0) {
                      components.forEach((comp: any) => {
                        newStruct[comp.name] = getDefaultValue(comp.type);
                      });
                    } else {
                      console.warn(`No components found for ${input.name} (${input.type}). Creating empty tuple.`);
                    }
                    updateArg(index, [...arrayValue, newStruct]);
                  }}
                  size={32}
                  stopPropagation
                />
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
                  <p>No structs added. Use the add button to create one.</p>
                </div>
              )}
            </div>
          </div>
        );
      }
      
      // Handle nested arrays (uint256[][], etc.) - simplified for now
      if (baseType.includes('[]')) {
        console.log(`[MinimalArgInput] NESTED ARRAY: ${input.name} (${input.type}) - fallback text input`);
        return (
          <div key={index} className="arg-row">
            <div className="arg-label">
              <span className="arg-name">{input.name}</span>
              <span className="arg-type" style={{ color: typeColor }}>{input.type}</span>
            </div>
            <div style={{ padding: '8px', background: 'rgba(255, 193, 7, 0.1)', border: '1px solid #ffc107', borderRadius: '4px' }}>
              <p style={{ fontSize: '12px', color: '#ffc107', margin: '0 0 8px 0' }}>
                <AlertTriangleIcon width={14} height={14} style={{ marginRight: '4px' }} />Nested arrays require manual JSON input for now
              </p>
              <textarea
                value={JSON.stringify(value || [], null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    updateArg(index, parsed);
                  } catch (error) {
                    // Keep the raw input for user to fix
                  }
                }}
                placeholder={`Enter JSON array like: [["item1", "item2"], ["item3"]]`}
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '8px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid #555',
                  borderRadius: '4px',
                  color: '#fff',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  resize: 'vertical'
                }}
              />
            </div>
          </div>
        );
      }
      
      // Handle simple arrays with compact UI and preview
      return (
        <div key={index} className="arg-row simple-array-row">
          <div className="arg-label">
            <span className="arg-name">{input.name}</span>
            <span className="arg-type" style={{ color: typeColor }}>{input.type}</span>
          </div>
          
          {/* Compact array preview */}
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
          
          {/* Compact input controls */}
          <div className="compact-array-controls">
            <div className="array-input-row" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <InlineActionButton
                ariaLabel="Add item"
                tooltip="Add item"
                icon={<PlusIcon width={16} height={16} />}
                onClick={() => {
                  const typeInfo = SolidityTypes.getTypeInfo(baseType);
                  const defaultValue = typeInfo.defaultValue;
                  updateArg(index, [...arrayValue, defaultValue]);
                }}
                size={30}
              />

              {arrayValue.length > 0 && (
                <InlineActionButton
                  ariaLabel="Remove last item"
                  tooltip="Remove last item"
                  icon={<MinusIcon width={16} height={16} />}
                  onClick={() => {
                    const newArray = [...arrayValue];
                    newArray.pop();
                    updateArg(index, newArray);
                  }}
                  size={30}
                />
              )}

              {arrayValue.length > 0 && (
                <InlineActionButton
                  ariaLabel="Clear items"
                  tooltip="Clear items"
                  icon={<TrashIcon width={16} height={16} />}
                  onClick={() => {
                    updateArg(index, []);
                  }}
                  size={30}
                />
              )}
              
              {arrayValue.length > 1 && (
                <div
                  onClick={() => {
                    // Shuffle array for fun
                    const shuffled = [...arrayValue].sort(() => Math.random() - 0.5);
                    updateArg(index, shuffled);
                  }}
                  title="Shuffle items"
                  style={{ 
                    cursor: 'pointer', 
                    color: '#8b5cf6', 
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '8px',
                    borderRadius: '12px',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    background: 'rgba(139, 92, 246, 0.12)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(139, 92, 246, 0.25)',
                    boxShadow: '0 8px 32px rgba(139, 92, 246, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                    opacity: 0.9
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  <ShuffleIcon width={16} height={16} />
                </div>
              )}
            </div>
            
            {/* Individual inputs in a compact grid */}
            {arrayValue.length > 0 && (
              <div className="compact-inputs-grid">
                {arrayValue.map((itemValue: any, itemIdx: number) => {
                  const typeInfo = SolidityTypes.getTypeInfo(baseType);
                  const validation = validateAndFormatInput(itemValue?.toString() || '', baseType);
                  const hasError = !validation.isValid && itemValue && itemValue !== '';
                  
                  return (
                    <div key={itemIdx} className="compact-input-item">
                      <label className="compact-input-label">[{itemIdx}]</label>
                      {typeInfo.inputType === 'select' ? (
                        <select
                          value={itemValue ? 'true' : 'false'}
                          onChange={(e) => {
                            const newArray = [...arrayValue];
                            newArray[itemIdx] = typeInfo.formatter(e.target.value);
                            updateArg(index, newArray);
                          }}
                          className="compact-input"
                        >
                          <option value="false">false</option>
                          <option value="true">true</option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={itemValue || ''}
                          onChange={(e) => {
                            const newArray = [...arrayValue];
                            // For integer types, convert to number if it's a valid number
                            if (baseType.match(/^u?int(\d+)?$/)) {
                              const value = e.target.value;
                              const num = Number(value);
                              newArray[itemIdx] = (!isNaN(num) && value !== '') ? num : value;
                            } else {
                              newArray[itemIdx] = e.target.value;
                            }
                            updateArg(index, newArray);
                          }}
                          onBlur={(e) => {
                            const validation = validateAndFormatInput(e.target.value, baseType);
                            if (validation.formattedValue !== e.target.value) {
                              const newArray = [...arrayValue];
                              newArray[itemIdx] = validation.formattedValue;
                              updateArg(index, newArray);
                            }
                          }}
                          placeholder={typeInfo.placeholder}
                          className={`compact-input ${hasError ? 'error' : ''}`}
                        />
                      )}
                      <button
                        onClick={() => {
                          const newArray = arrayValue.filter((_: any, i: number) => i !== itemIdx);
                          updateArg(index, newArray);
                        }}
                        className="compact-remove-item-btn"
                        title="Remove this item"
                      >
                        ×
                      </button>
                      {hasError && (
                        <div className="compact-error">
                          {validation.error || 'Invalid'}
                        </div>
                      )}
                    </div>
                  );
                })}
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

    // Handle simple types with universal type system
    const typeInfo = SolidityTypes.getTypeInfo(input.type);
    
    // Skip validation for array types in simple types section (they're handled above)
    const validation = input.type.includes('[]') ? 
      { isValid: true, formattedValue: value || '', error: undefined } : 
      validateAndFormatInput(value || '', input.type);
    const hasError = !validation.isValid && value && value !== '';

    return (
      <div key={index} className="arg-row">
        <div className="arg-label">
          <span className="arg-name">{input.name}</span>
          <span className="arg-type" style={{ color: typeColor }}>{input.type}</span>
        </div>
        <div className="input-with-validation">
          {typeInfo.inputType === 'select' ? (
            <select
              value={value ? 'true' : 'false'}
              onChange={(e) => updateArg(index, typeInfo.formatter(e.target.value))}
              className="arg-input"
            >
              <option value="false">false</option>
              <option value="true">true</option>
            </select>
          ) : (
            <input
              type="text"
              value={value || ''}
              onChange={(e) => updateArg(index, e.target.value)}
              onBlur={(e) => {
                if (!input.type.includes('[]')) {
                  const validation = validateAndFormatInput(e.target.value, input.type);
                  if (validation.formattedValue !== e.target.value) {
                    updateArg(index, validation.formattedValue);
                  }
                }
              }}
              placeholder={typeInfo.placeholder}
              className={`arg-input ${hasError ? 'validation-error' : ''}`}
            />
          )}
          {hasError && (
            <div className="validation-error-message">
              {validation.error || 'Invalid input'}
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
            <Icon icon={TrashIcon} size={12} />
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
