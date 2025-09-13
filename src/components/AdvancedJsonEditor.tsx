import React, { useState, useCallback, useMemo } from 'react';
import { JsonEditor } from 'json-edit-react';
import { ethers } from 'ethers';
import { 
  FileText, 
  Target, 
  Trash2, 
  Copy, 
  BarChart3, 
  Search, 
  Maximize, 
  Minimize,
  Settings,
  TrendingUp
} from 'lucide-react';

interface AdvancedJsonEditorProps {
  data: any[];
  onChange: (newData: any[]) => void;
  functionInputs?: any[];
  title?: string;
  className?: string;
}

const AdvancedJsonEditor: React.FC<AdvancedJsonEditorProps> = ({
  data = [],
  onChange,
  functionInputs = [],
  title = "Function Parameters",
  className = ""
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedLevel, setExpandedLevel] = useState(2);

  // Convert array data to object with parameter names for better editing experience
  const editorData = useMemo(() => {
    if (!functionInputs.length) {
      // If no function inputs, just use array indices
      return data.reduce((acc, item, index) => {
        acc[`param_${index}`] = item;
        return acc;
      }, {} as Record<string, any>);
    }

    // Map array data to named parameters
    const namedData: Record<string, any> = {};
    functionInputs.forEach((input, index) => {
      namedData[input.name || `param_${index}`] = data[index] ?? getDefaultValue(input.type);
    });
    return namedData;
  }, [data, functionInputs]);

  const getDefaultValue = (type: string): any => {
    if (type === 'bool') return false;
    if (type.includes('uint') || type.includes('int')) return "0";
    if (type === 'address') return ethers.constants.AddressZero;
    if (type.includes('bytes')) return "0x";
    if (type.includes('[]')) return [];
    if (type.includes('tuple')) return {};
    return "";
  };

  const handleDataChange = useCallback((updatedData: any) => {
    // Convert back to array format
    let arrayData: any[];
    
    if (functionInputs.length) {
      // Map named parameters back to array
      arrayData = functionInputs.map((input, index) => {
        const paramName = input.name || `param_${index}`;
        return updatedData[paramName] ?? getDefaultValue(input.type);
      });
    } else {
      // Convert object back to array using param_ keys
      const keys = Object.keys(updatedData).sort((a, b) => {
        const aIndex = parseInt(a.replace('param_', ''));
        const bIndex = parseInt(b.replace('param_', ''));
        return aIndex - bIndex;
      });
      arrayData = keys.map(key => updatedData[key]);
    }
    
    onChange(arrayData);
  }, [functionInputs, onChange]);

  // Custom theme for the JSON editor
  const customTheme = {
    displayObjectSize: true,
    displayArraySize: true,
    enableClipboard: true,
    indent: 3,
    nestedObjectLimit: 10,
    nestedArrayLimit: 10,
    theme: 'dark_vscode_tribute',
    iconSize: '16px',
    fontSize: '14px',
  };

  const mapSolidityTypeToJsonType = (solidityType: string): string[] => {
    if (solidityType === 'bool') return ['boolean'];
    if (solidityType.includes('uint') || solidityType.includes('int')) return ['string', 'number'];
    if (solidityType === 'address') return ['string'];
    if (solidityType.includes('bytes')) return ['string'];
    if (solidityType.includes('[]')) return ['array'];
    if (solidityType.includes('tuple')) return ['object'];
    return ['string'];
  };

  // Custom restrictions and validations
  const restrictions = useMemo(() => {
    const restrictionsObj: Record<string, any> = {};
    
    functionInputs.forEach((input, index) => {
      const paramName = input.name || `param_${index}`;
      restrictionsObj[paramName] = {
        type: mapSolidityTypeToJsonType(input.type),
        required: true,
        description: `${input.type} parameter`
      };
    });

    return restrictionsObj;
  }, [functionInputs]);

  // Custom validation function
  const validateData = useCallback((path: string, value: any, type: string) => {
    // Find the corresponding input for this path
    const pathParts = path.split('.');
    const paramName = pathParts[0];
    const input = functionInputs.find(inp => inp.name === paramName);
    
    if (!input) return true;

    try {
      switch (true) {
        case input.type === 'address':
          if (typeof value === 'string' && value.startsWith('0x')) {
            return ethers.utils.isAddress(value);
          }
          return false;

        case input.type.includes('uint'):
          if (typeof value === 'string' || typeof value === 'number') {
            const bn = ethers.BigNumber.from(value.toString());
            return bn.gte(0);
          }
          return false;

        case input.type.includes('int'):
          if (typeof value === 'string' || typeof value === 'number') {
            ethers.BigNumber.from(value.toString());
            return true;
          }
          return false;

        case input.type === 'bool':
          return typeof value === 'boolean';

        case input.type.includes('bytes'):
          return typeof value === 'string' && value.startsWith('0x');

        case input.type.includes('[]'):
          return Array.isArray(value);

        default:
          return true;
      }
    } catch (error) {
      return false;
    }
  }, [functionInputs]);

  // Generate sample data for quick testing
  const generateSampleData = useCallback(() => {
    const sampleData: Record<string, any> = {};
    
    functionInputs.forEach((input, index) => {
      const paramName = input.name || `param_${index}`;
      sampleData[paramName] = getSampleValue(input.type, index);
    });

    handleDataChange(sampleData);
  }, [functionInputs, handleDataChange]);

  const getSampleValue = (type: string, index: number): any => {
    switch (true) {
      case type === 'address':
        const addresses = [
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7',
          '0xA0b86a33E6441e5Bb8A2Fe5e3eE8b6c8EeE91234',
          '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
        ];
        return addresses[index % addresses.length];

      case type === 'bool':
        return index % 2 === 0;

      case type.includes('uint256'):
        const amounts = [
          ethers.utils.parseEther('1').toString(),
          ethers.utils.parseEther('0.5').toString(),
          ethers.utils.parseEther('10').toString()
        ];
        return amounts[index % amounts.length];

      case type.includes('uint'):
        return (100 * (index + 1)).toString();

      case type === 'string':
        return `Sample string ${index + 1}`;

      case type.includes('bytes32'):
        return ethers.utils.formatBytes32String(`item-${index}`);

      case type.includes('bytes'):
        return `0x${(index + 1).toString(16).padStart(8, '0')}`;

      case type.includes('[]'):
        if (type.includes('uint')) {
          return ['100', '200', '300'];
        } else if (type.includes('address')) {
          return [
            '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7',
            '0xA0b86a33E6441e5Bb8A2Fe5e3eE8b6c8EeE91234'
          ];
        }
        return ['sample1', 'sample2'];

      case type.includes('tuple'):
        return {
          field1: 'sample value',
          field2: 123,
          field3: true
        };

      default:
        return `Sample value ${index + 1}`;
    }
  };

  const clearAllData = useCallback(() => {
    const emptyData: Record<string, any> = {};
    functionInputs.forEach((input, index) => {
      const paramName = input.name || `param_${index}`;
      emptyData[paramName] = getDefaultValue(input.type);
    });
    handleDataChange(emptyData);
  }, [functionInputs, handleDataChange]);

  // Filter data based on search term
  const filteredData = useMemo(() => {
    if (!searchTerm) return editorData;
    
    const filtered: Record<string, any> = {};
    Object.keys(editorData).forEach(key => {
      if (key.toLowerCase().includes(searchTerm.toLowerCase()) ||
          JSON.stringify(editorData[key]).toLowerCase().includes(searchTerm.toLowerCase())) {
        filtered[key] = editorData[key];
      }
    });
    return filtered;
  }, [editorData, searchTerm]);

  return (
    <div className={`advanced-json-editor ${className} ${isFullscreen ? 'fullscreen' : ''}`}>
      {/* Header Controls */}
      <div className="json-editor-header">
        <div className="header-left">
          <h3><FileText size={20} className="inline mr-2" /> {title}</h3>
          <span className="param-count">
            {functionInputs.length} parameters
          </span>
        </div>
        
        <div className="header-controls">
          <input
            type="text"
            placeholder="Search parameters..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          
          <select
            value={expandedLevel}
            onChange={(e) => setExpandedLevel(Number(e.target.value))}
            className="expand-control"
          >
            <option value={1}>Collapse All</option>
            <option value={2}>Expand 2 Levels</option>
            <option value={3}>Expand 3 Levels</option>
            <option value={99}>Expand All</option>
          </select>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="fullscreen-btn"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="json-editor-actions">
        <button onClick={generateSampleData} className="sample-btn">
          <Target size={16} className="inline mr-2" />Generate Sample Data
        </button>
        
        <button onClick={clearAllData} className="clear-btn">
          <Trash2 size={16} className="inline mr-2" />Clear All
        </button>

        <button
          onClick={() => navigator.clipboard.writeText(JSON.stringify(data, null, 2))}
          className="copy-btn"
        >
          <Copy size={16} className="inline mr-2" />Copy JSON
        </button>
        
        <div className="data-stats">
          <span><BarChart3 size={16} className="inline mr-2" />{Object.keys(filteredData).length} visible parameters</span>
        </div>
      </div>

      {/* Function Signature Display */}
      {functionInputs.length > 0 && (
        <div className="function-signature">
          <div className="signature-header"><Settings size={16} className="inline mr-2" />Function Signature:</div>
          <code className="signature-code">
            function({functionInputs.map(input => `${input.type} ${input.name}`).join(', ')})
          </code>
        </div>
      )}

      {/* Main JSON Editor */}
      <div className="json-editor-container">
        <div style={{
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '8px',
          minHeight: '300px',
          maxHeight: isFullscreen ? 'calc(100vh - 200px)' : '600px',
          overflow: 'auto',
          padding: '16px'
        }}>
          <JsonEditor
            data={filteredData}
            setData={handleDataChange}
            collapse={expandedLevel}
          />
        </div>
      </div>

      {/* Footer Stats */}
      <div className="json-editor-footer">
        <div className="footer-stats">
          <span><TrendingUp size={16} className="inline mr-2" />Data Size: {JSON.stringify(data).length} chars</span>
          <span><FileText size={16} className="inline mr-2" />Parameters: {data.length}</span>
          <span><Search size={16} className="inline mr-2" />Search: {searchTerm ? `"${searchTerm}"` : 'None'}</span>
        </div>
        
        {functionInputs.length > 0 && (
          <div className="type-summary">
            Types: {Array.from(new Set(functionInputs.map((i: any) => i.type))).join(', ')}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdvancedJsonEditor;