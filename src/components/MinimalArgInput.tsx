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

  // Get function inputs
  const functionInputs = React.useMemo(() => {
    if (!abi || !functionName) return [];
    const func = abi.find(f => f.name === functionName && f.type === 'function');
    return func?.inputs || [];
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

  // Helper function to render struct fields recursively
  const renderStructField = (field: any, value: any, onChange: (newValue: any) => void): React.ReactNode => {
    const typeColor = getTypeColor(field.type);
    
    // Handle nested structs/tuples
    if (field.type === 'tuple' && field.components) {
      return (
        <div className="nested-struct">
          <div className="nested-struct-header">
            <span className="field-name">{field.name}</span>
            <span className="field-type" style={{ color: typeColor }}>({field.type})</span>
          </div>
          <div className="nested-struct-fields">
            {field.components.map((component: any, idx: number) => (
              <div key={idx} className="nested-field">
                {renderStructField(component, value && value[component.name], (newValue: any) => {
                  const newStructValue = { ...value };
                  newStructValue[component.name] = newValue;
                  onChange(newStructValue);
                })}
              </div>
            ))}
          </div>
        </div>
      );
    }
    
    // Handle simple fields
    return (
      <>
        <label className="field-label">
          {field.name} <span style={{ color: typeColor }}>({field.type})</span>
        </label>
        <input
          type="text"
          value={value || ''}
          placeholder={`Enter ${field.type}`}
          className="struct-field-input"
          onChange={(e) => onChange(e.target.value)}
        />
      </>
    );
  };

  const renderInput = (input: any, index: number) => {
    const value = args[index] || '';
    const typeColor = getTypeColor(input.type);

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
      
      // Handle arrays of structs/tuples
      if (baseType === 'tuple' || input.components) {
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
                    const newStruct = {};
                    input.components?.forEach((comp: any) => {
                      newStruct[comp.name] = getDefaultValue(comp.type);
                    });
                    updateArg(index, [...arrayValue, newStruct]);
                  }}
                  className="add-struct-btn"
                >
                  + Add Struct
                </button>
              </div>
              
              {arrayValue.map((structValue: any, structIdx: number) => (
                <div key={structIdx} className="struct-item">
                  <div className="struct-item-header">
                    <span className="struct-index">[{structIdx}]</span>
                    <button
                      onClick={() => {
                        const newArray = arrayValue.filter((_: any, i: number) => i !== structIdx);
                        updateArg(index, newArray);
                      }}
                      className="remove-struct-btn"
                    >
                      ×
                    </button>
                  </div>
                  <div className="struct-fields">
                    {input.components?.map((component: any, compIdx: number) => (
                      <div key={compIdx} className="struct-field">
                        {renderStructField(component, structValue && structValue[component.name], (newValue: any) => {
                          const newArray = [...arrayValue];
                          const newStruct = { ...newArray[structIdx] };
                          newStruct[component.name] = newValue;
                          newArray[structIdx] = newStruct;
                          updateArg(index, newArray);
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              
              {arrayValue.length === 0 && (
                <div className="empty-array">
                  <p>No structs added. Click "Add Struct" to create one.</p>
                </div>
              )}
            </div>
          </div>
        );
      }
      
      // Handle arrays of simple types (string[], uint256[], etc.) - use comma separation
      const displayValue = arrayValue.join(', ');
      return (
        <div key={index} className="arg-row">
          <div className="arg-label">
            <span className="arg-name">{input.name}</span>
            <span className="arg-type" style={{ color: typeColor }}>{input.type}</span>
          </div>
          <div className="array-input-wrapper">
            <input
              type="text"
              value={displayValue}
              onChange={(e) => {
                const inputValue = e.target.value;
                if (inputValue.trim() === '') {
                  updateArg(index, []);
                } else {
                  // Parse comma-separated values
                  const items = inputValue
                    .split(',')
                    .map(item => item.trim())
                    .filter(item => item !== '');
                  updateArg(index, items);
                }
              }}
              placeholder={`Enter ${baseType} values separated by commas (e.g. value1, value2, value3)`}
              className="arg-input array-input"
            />
            <div className="array-hint">
              <span style={{ fontSize: '11px', color: '#666' }}>
                {arrayValue.length} items • Separate with commas
              </span>
            </div>
          </div>
        </div>
      );
    }

    // Handle struct/tuple (simplified)
    if (input.type === 'tuple' || input.components) {
      return (
        <div key={index} className="arg-row tuple-row">
          <div className="arg-label">
            <span className="arg-name">{input.name}</span>
            <span className="arg-type" style={{ color: typeColor }}>{input.type}</span>
          </div>
          <div className="tuple-inputs">
            {input.components?.map((component: any, componentIdx: number) => (
              <div key={componentIdx} className="tuple-field">
                {renderStructField(component, value && value[component.name], (newValue: any) => {
                  const currentTuple = value || {};
                  const newTuple = { ...currentTuple, [component.name]: newValue };
                  updateArg(index, newTuple);
                })}
              </div>
            ))}
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

    return (
      <div key={index} className="arg-row">
        <div className="arg-label">
          <span className="arg-name">{input.name}</span>
          <span className="arg-type" style={{ color: typeColor }}>{input.type}</span>
        </div>
        <input
          type={getInputType()}
          value={value || ''}
          onChange={(e) => updateArg(index, e.target.value)}
          placeholder={getPlaceholder()}
          className="arg-input"
        />
      </div>
    );
  };

  const loadSample = () => {
    const sampleArgs = functionInputs.map((input: any) => {
      if (input.type === 'address') return '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7';
      if (input.type === 'bool') return true;
      if (input.type.includes('uint')) return '1000000000000000000';
      if (input.type === 'string') return 'Sample string';
      if (input.type.includes('bytes')) return '0x1234567890abcdef';
      if (input.type.includes('[]')) return ['sample1', 'sample2'];
      return 'sample';
    });
    setArgs(sampleArgs);
    onDataChange(sampleArgs);
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
          <button onClick={loadSample} className="sample-btn">Sample</button>
          <button onClick={clearAll} className="clear-btn">Clear</button>
        </div>
      </div>
      
      <div className="arg-list">
        {functionInputs.map(renderInput)}
      </div>
    </div>
  );
};

export default MinimalArgInput;