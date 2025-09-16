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
    const newArgs = functionInputs.map((input: any, idx: number) => 
      initialData[idx] ?? getDefaultValue(input.type)
    );
    setArgs(newArgs);
    onDataChange(newArgs);
  }, [functionInputs, initialData, onDataChange]);

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

    // Handle arrays (simplified)
    if (input.type.includes('[]')) {
      const baseType = input.type.replace('[]', '');
      const arrayValue = Array.isArray(value) ? value : [];
      
      return (
        <div key={index} className="arg-row array-row">
          <div className="arg-label">
            <span className="arg-name">{input.name}</span>
            <span className="arg-type" style={{ color: typeColor }}>{input.type}</span>
          </div>
          <div className="array-input">
            <div className="array-items">
              {arrayValue.map((item: any, idx: number) => (
                <div key={idx} className="array-item">
                  <input
                    type="text"
                    value={item || ''}
                    onChange={(e) => {
                      const newArray = [...arrayValue];
                      newArray[idx] = e.target.value;
                      updateArg(index, newArray);
                    }}
                    placeholder={`${baseType} value`}
                    className="array-item-input"
                  />
                  <button
                    onClick={() => {
                      const newArray = arrayValue.filter((_: any, i: number) => i !== idx);
                      updateArg(index, newArray);
                    }}
                    className="remove-item"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                const newArray = [...arrayValue, getDefaultValue(baseType)];
                updateArg(index, newArray);
              }}
              className="add-item"
            >
              + Add {baseType}
            </button>
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
                <label className="tuple-field-label">{component.name}</label>
                <input
                  type="text"
                  placeholder={`${component.type} value`}
                  className="tuple-field-input"
                  onChange={(e) => {
                    const currentTuple = value || {};
                    const newTuple = { ...currentTuple, [component.name]: e.target.value };
                    updateArg(index, newTuple);
                  }}
                />
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
          value={value}
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