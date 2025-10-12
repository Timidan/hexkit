import React, { useState, useCallback } from 'react';

interface StructInputHelperProps {
  name: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

interface StructField {
  name: string;
  type: string;
  value: string;
}

const StructInputHelper: React.FC<StructInputHelperProps> = ({
  name,
  type,
  value,
  onChange,
  placeholder = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [structFields, setStructFields] = useState<StructField[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  // Detect if this is likely a struct/tuple type
  const isStructType = type.includes('tuple') || 
                       type.includes('[]') && value.length > 50 ||
                       (value.startsWith('[') && value.includes(',')) ||
                       (value.startsWith('{') && value.includes(':'));

  // Parse array input and detect if it looks like struct data
  const detectStructPattern = useCallback((inputValue: string): boolean => {
    if (!inputValue) return false;
    
    try {
      // Try to parse as JSON array
      const parsed = JSON.parse(inputValue);
      if (Array.isArray(parsed) && parsed.length > 5) {
        // If array has more than 5 elements, it might be a struct
        return true;
      }
      
      // Check if it's an object with multiple properties
      if (typeof parsed === 'object' && parsed !== null) {
        return Object.keys(parsed).length > 3;
      }
    } catch (error) {
      // Not valid JSON, check other patterns
    }

    // Check for comma-separated values that might be struct fields
    if (inputValue.includes(',') && inputValue.split(',').length > 5) {
      return true;
    }

    // Check for hex patterns that might be encoded structs
    if (inputValue.startsWith('0x') && inputValue.length > 100) {
      return true;
    }

    return false;
  }, []);

  // Parse the input into structured fields for better editing
  const parseIntoStructFields = useCallback((inputValue: string): StructField[] => {
    if (!inputValue) return [];
    
    try {
      // Try parsing as JSON first
      const parsed = JSON.parse(inputValue);
      
      if (Array.isArray(parsed)) {
        return parsed.map((item, index) => ({
          name: `field${index}`,
          type: detectFieldType(item),
          value: String(item)
        }));
      }
      
      if (typeof parsed === 'object' && parsed !== null) {
        return Object.entries(parsed).map(([key, val]) => ({
          name: key,
          type: detectFieldType(val),
          value: String(val)
        }));
      }
    } catch (error) {
      // Fall back to comma-separated parsing
      if (inputValue.includes(',')) {
        return inputValue.split(',').map((item, index) => ({
          name: `param${index}`,
          type: detectFieldType(item.trim()),
          value: item.trim()
        }));
      }
    }
    
    return [];
  }, []);

  const detectFieldType = (value: any): string => {
    if (typeof value === 'boolean') return 'bool';
    if (typeof value === 'number') return 'uint256';
    if (typeof value === 'string') {
      if (value.startsWith('0x')) {
        if (value.length === 42) return 'address';
        return 'bytes';
      }
      if (/^\d+$/.test(value)) return 'uint256';
    }
    return 'string';
  };

  const handleStructFieldChange = (index: number, newValue: string) => {
    const updated = [...structFields];
    updated[index] = { ...updated[index], value: newValue };
    setStructFields(updated);
    
    // Convert back to string format
    const stringValue = JSON.stringify(updated.map(field => {
      if (field.type === 'uint256') {
        return parseInt(field.value) || 0;
      }
      if (field.type === 'bool') {
        return field.value === 'true';
      }
      return field.value;
    }));
    
    onChange(stringValue);
  };

  const toggleStructMode = () => {
    if (!isExpanded) {
      const fields = parseIntoStructFields(value);
      setStructFields(fields);
    }
    setIsExpanded(!isExpanded);
  };

  const addStructField = () => {
    const newField: StructField = {
      name: `field${structFields.length}`,
      type: 'string',
      value: ''
    };
    setStructFields([...structFields, newField]);
  };

  const removeStructField = (index: number) => {
    const updated = structFields.filter((_, i) => i !== index);
    setStructFields(updated);
    
    const stringValue = JSON.stringify(updated.map(field => field.value));
    onChange(stringValue);
  };

  const formatPreview = (inputValue: string): string => {
    if (inputValue.length <= 100) return inputValue;
    
    try {
      const parsed = JSON.parse(inputValue);
      if (Array.isArray(parsed)) {
        return `Array[${parsed.length}]: [${parsed.slice(0, 3).map(String).join(', ')}${parsed.length > 3 ? '...' : ''}]`;
      }
    } catch (error) {
      // Not JSON, just truncate
    }
    
    return `${inputValue.slice(0, 50)}... (${inputValue.length} chars)`;
  };

  const shouldShowStructHelper = isStructType || detectStructPattern(value);

  return (
    <div className="struct-input-helper">
      <div className="input-wrapper">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={shouldShowStructHelper && !isExpanded ? 2 : 4}
          className={`struct-input ${shouldShowStructHelper ? 'has-struct-helper' : ''}`}
          onFocus={() => setShowPreview(true)}
          onBlur={() => setShowPreview(false)}
        />
        
        {shouldShowStructHelper && (
          <div className="struct-helper-actions">
            <button
              type="button"
              onClick={toggleStructMode}
              className={`struct-toggle-btn ${isExpanded ? 'expanded' : ''}`}
              title={isExpanded ? 'Switch to text input' : 'Edit as structured fields'}
            >
              {isExpanded ? ' Text' : ' Struct'}
            </button>
          </div>
        )}
      </div>

      {showPreview && value && !isExpanded && (
        <div className="input-preview">
          <div className="preview-label">Preview:</div>
          <div className="preview-content">{formatPreview(value)}</div>
        </div>
      )}

      {isExpanded && shouldShowStructHelper && (
        <div className="struct-fields-editor">
          <div className="struct-editor-header">
            <h4> Struct Fields</h4>
            <button
              type="button"
              onClick={addStructField}
              className="add-field-btn"
            >
               Add Field
            </button>
          </div>

          <div className="struct-fields">
            {structFields.map((field, index) => (
              <div key={index} className="struct-field-row">
                <div className="field-header">
                  <input
                    type="text"
                    value={field.name}
                    onChange={(e) => {
                      const updated = [...structFields];
                      updated[index] = { ...updated[index], name: e.target.value };
                      setStructFields(updated);
                    }}
                    className="field-name-input"
                    placeholder={`field${index}`}
                  />
                  <select
                    value={field.type}
                    onChange={(e) => {
                      const updated = [...structFields];
                      updated[index] = { ...updated[index], type: e.target.value };
                      setStructFields(updated);
                    }}
                    className="field-type-select"
                  >
                    <option value="string">string</option>
                    <option value="uint256">uint256</option>
                    <option value="address">address</option>
                    <option value="bool">bool</option>
                    <option value="bytes">bytes</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeStructField(index)}
                    className="remove-field-btn"
                    title="Remove field"
                  >
                    
                  </button>
                </div>
                <input
                  type="text"
                  value={field.value}
                  onChange={(e) => handleStructFieldChange(index, e.target.value)}
                  className="field-value-input"
                  placeholder={`Enter ${field.type} value`}
                />
              </div>
            ))}
          </div>

          {structFields.length === 0 && (
            <div className="empty-struct">
              <p>No fields defined. Click "Add Field" to start building your struct.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StructInputHelper;
