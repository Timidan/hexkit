import React from 'react';

interface ABIInput {
  name: string;
  type: string;
  internalType?: string;
  components?: ABIInput[];
}

interface ContractDataDisplayProps {
  data: any;
  abiDefinition: ABIInput;
  mode?: 'compact' | 'expanded';
  nestingLevel?: number;
}

const ContractDataDisplay: React.FC<ContractDataDisplayProps> = ({
  data,
  abiDefinition,
  mode = 'compact',
  nestingLevel = 0
}) => {
  const renderValue = (value: any, definition: ABIInput, level: number): JSX.Element => {
    const fieldName = definition.name || 'value';
    const fieldType = definition.type;

    // Handle null/undefined values
    if (value === null || value === undefined) {
      return (
        <div className="field-container" style={{ marginLeft: level * 16 }}>
          <span className="field-name">{fieldName}</span>
          <span className="field-type">({fieldType})</span>
          <span className="field-separator">:</span>
          <span className="field-value null-value">null</span>
        </div>
      );
    }

    // Handle arrays
    if (fieldType.endsWith('[]')) {
      const baseType = fieldType.replace('[]', '');
      const arrayData = Array.isArray(value) ? value : [];
      
      return (
        <div className="field-container" style={{ marginLeft: level * 16 }}>
          <span className="field-name">{fieldName}</span>
          <span className="field-type">({fieldType})</span>
          <span className="field-separator">:</span>
          <div className="array-container">
            <span className="array-bracket">[</span>
            {arrayData.map((item, index) => {
              const itemDefinition: ABIInput = {
                name: `[${index}]`,
                type: baseType,
                components: definition.components
              };
              return (
                <div key={index} className="array-item">
                  {renderValue(item, itemDefinition, level + 1)}
                </div>
              );
            })}
            <span className="array-bracket">]</span>
          </div>
        </div>
      );
    }

    // Handle tuples/structs
    if (fieldType === 'tuple' && definition.components) {
      return (
        <div className="field-container" style={{ marginLeft: level * 16 }}>
          <span className="field-name">{fieldName}</span>
          <span className="field-type">({fieldType})</span>
          <span className="field-separator">:</span>
          <div className="tuple-container">
            <span className="tuple-bracket">{'{'}</span>
            {definition.components.map((component, index) => {
              let componentValue;
              
              // Try to get value by name first, then by index
              if (typeof value === 'object' && value !== null) {
                componentValue = value[component.name] !== undefined 
                  ? value[component.name] 
                  : Array.isArray(value) ? value[index] : undefined;
              } else {
                componentValue = Array.isArray(value) ? value[index] : undefined;
              }

              return (
                <div key={component.name || index}>
                  {renderValue(componentValue, component, level + 1)}
                </div>
              );
            })}
            <span className="tuple-bracket">{'}'}</span>
          </div>
        </div>
      );
    }

    // Handle basic types
    const formattedValue = formatBasicValue(value, fieldType);
    
    return (
      <div className="field-container" style={{ marginLeft: level * 16 }}>
        <span className="field-name">{fieldName}</span>
        <span className="field-type">({fieldType})</span>
        <span className="field-separator">:</span>
        <span className={`field-value ${getValueTypeClass(fieldType)}`}>
          {formattedValue}
        </span>
      </div>
    );
  };

  return (
    <div className="contract-data-display">
      {renderValue(data, abiDefinition, nestingLevel)}
    </div>
  );
};

// Helper functions
const formatBasicValue = (value: any, type: string): string => {
  if (value === null || value === undefined) return 'null';
  
  if (type.includes('uint') || type.includes('int')) {
    // Handle BigNumber objects
    if (value && value._hex !== undefined) {
      return value.toString();
    }
    return String(value);
  }
  
  if (type === 'bool') {
    return String(value);
  }
  
  if (type === 'address') {
    return String(value);
  }
  
  if (type.startsWith('bytes') || type === 'string') {
    return String(value);
  }
  
  return String(value);
};

const getValueTypeClass = (type: string): string => {
  if (type.includes('uint') || type.includes('int')) return 'number-value';
  if (type === 'bool') return 'bool-value';
  if (type === 'address') return 'address-value';
  if (type.startsWith('bytes')) return 'bytes-value';
  if (type === 'string') return 'string-value';
  return 'default-value';
};

export default ContractDataDisplay;
export type { ABIInput, ContractDataDisplayProps };