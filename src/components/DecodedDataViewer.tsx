import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';
import { JsonEditor } from 'json-edit-react';

interface DecodedDataViewerProps {
  data: any[];
  types?: string[];
  paramNames?: string[];
  functionName?: string;
  compact?: boolean;
}

interface ParsedGroup {
  pattern: string;
  count: number;
  items: ParsedItem[];
  startIndex: number;
}

interface ParsedItem {
  index: number;
  values: any[];
  decoded: {
    [key: string]: {
      value: any;
      type: string;
      displayValue: string;
    }
  };
}

const DecodedDataViewer: React.FC<DecodedDataViewerProps> = ({
  data,
  types = [],
  paramNames = [],
  functionName = 'Function',
  compact = false
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set([0]));
  const [showRawData, setShowRawData] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editableRawData, setEditableRawData] = useState<any>(null);

  // All helper functions must be declared first due to hoisting
  const sanitizeValue = useCallback((value: any): any => {
    try {
      // Handle ethers BigNumber objects
      if (value && typeof value === 'object' && value._isBigNumber) {
        return value.toString();
      }
      
      // Handle ethers objects with toNumber/toString methods
      if (value && typeof value === 'object' && typeof value.toString === 'function') {
        return value.toString();
      }
      
      // Handle arrays
      if (Array.isArray(value)) {
        return value.map((item) => sanitizeValue(item));
      }
      
      // Handle regular objects
      if (value && typeof value === 'object' && value.constructor === Object) {
        const sanitized: any = {};
        for (const [key, val] of Object.entries(value)) {
          sanitized[key] = sanitizeValue(val);
        }
        return sanitized;
      }
      
      return value;
    } catch (error) {
      console.warn('Error sanitizing value:', error);
      return String(value);
    }
  }, []);

  // Initialize editable raw data when component mounts or data changes
  useEffect(() => {
    if (data && data.length > 0) {
      // Create sanitized version for editing
      const sanitizedData = data.map(sanitizeValue);
      setEditableRawData(sanitizedData);
    }
  }, [data, sanitizeValue]);

  const detectValueType = useCallback((value: any): string => {
    if (typeof value === 'boolean') return 'bool';
    if (typeof value === 'string') {
      if (value.startsWith('0x')) {
        if (value.length === 42) return 'address';
        return 'bytes';
      }
      if (/^\d+$/.test(value)) return 'uint';
    }
    if (typeof value === 'number') return 'uint';
    return 'string';
  }, []);

  const decodeHexString = useCallback((hex: string): string | null => {
    try {
      if (!hex.startsWith('0x') || hex.length <= 10) return null;
      
      const cleanHex = hex.slice(2);
      if (cleanHex.length % 2 !== 0) return null;
      
      const bytes = cleanHex.match(/.{1,2}/g);
      if (!bytes) return null;
      
      const decoded = bytes
        .map(byte => String.fromCharCode(parseInt(byte, 16)))
        .join('')
        .replace(/\0/g, '');
      
      // Only return if it looks like readable text
      if (/^[a-zA-Z0-9\s\-_.,!@#$%^&*()]+$/.test(decoded) && decoded.length > 2) {
        return decoded;
      }
    } catch (error) {
      // Not decodeable, return null
    }
    return null;
  }, []);

  const formatDisplayValue = useCallback((value: any, type: string): string => {
    try {
      if (value === null || value === undefined) return 'null';

      const strValue = String(value);

      // Handle hex string decoding
      if (typeof value === 'string' && value.startsWith('0x') && value.length > 10) {
        const decoded = decodeHexString(value);
        if (decoded) {
          return `"${decoded}"`;
        }
      }

      // Handle addresses
      if (type === 'address' || (typeof value === 'string' && value.length === 42 && value.startsWith('0x'))) {
        return strValue;
      }

      // Handle large numbers
      if (type.includes('uint') || type.includes('int')) {
        try {
          const bn = ethers.BigNumber.from(value);
          const stringValue = bn.toString();
          
          // Check for timestamp
          if (bn.gte(1000000000) && bn.lt(Date.now() / 1000 + 86400 * 365)) {
            const date = new Date(parseInt(stringValue) * 1000);
            return `${date.toLocaleString()} (${stringValue})`;
          }
          
          // Format large numbers
          if (bn.gt(ethers.BigNumber.from(10).pow(15))) {
            try {
              const eth = ethers.utils.formatEther(stringValue);
              return `${eth} ETH (${stringValue})`;
            } catch {
              return stringValue.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            }
          }
          
          return stringValue;
        } catch {
          return strValue;
        }
      }

      // Handle booleans
      if (type === 'bool' || typeof value === 'boolean') {
        return value ? 'true' : 'false';
      }

      return strValue;
    } catch (error) {
      console.warn('Error formatting display value:', error);
      return String(value || 'unknown');
    }
  }, [decodeHexString]);

  const detectPatternSize = useCallback((data: any[]): number => {
    if (data.length < 6) return 1;

    // Try different pattern sizes, starting with most likely ones
    const patternSizesToTry: number[] = [];
    
    // Add common pattern sizes first
    [2, 3, 4, 5, 6, 8].forEach(size => {
      if (size <= Math.floor(data.length / 2)) {
        patternSizesToTry.push(size);
      }
    });
    
    // Add other sizes
    for (let size = 2; size <= Math.floor(data.length / 3); size++) {
      if (!patternSizesToTry.includes(size)) {
        patternSizesToTry.push(size);
      }
    }

    for (const patternSize of patternSizesToTry) {
      // Allow for some flexibility - patterns don't need to divide evenly
      const fullPatterns = Math.floor(data.length / patternSize);
      if (fullPatterns < 2) continue;
      
      let isRepeatingPattern = true;
      const firstPattern = data.slice(0, patternSize);
      
      // Check at least 2 complete patterns
      for (let i = 1; i < Math.min(fullPatterns, 4); i++) {
        const startIdx = i * patternSize;
        const currentPattern = data.slice(startIdx, startIdx + patternSize);
        
        // Check if the pattern structure is similar (not exact values)
        let matchingTypes = 0;
        for (let j = 0; j < patternSize; j++) {
          const firstType = detectValueType(firstPattern[j]);
          const currentType = detectValueType(currentPattern[j]);
          
          if (firstType === currentType) {
            matchingTypes++;
          }
        }
        
        // Allow for 80% type matching to be considered a pattern
        if (matchingTypes / patternSize < 0.8) {
          isRepeatingPattern = false;
          break;
        }
      }
      
      if (isRepeatingPattern) {
        return patternSize;
      }
    }

    return 1;
  }, [detectValueType]);

  const generatePatternDescription = useCallback((types: string[]): string => {
    const typeGroups = types.reduce((acc, type) => {
      const baseType = detectValueType(type);
      acc[baseType] = (acc[baseType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const description = Object.entries(typeGroups)
      .map(([type, count]) => count > 1 ? `${count}x ${type}` : type)
      .join(', ');

    return `Pattern: ${description}`;
  }, [detectValueType]);

  const parseValues = useCallback((values: any[], types: string[]) => {
    const decoded: { [key: string]: { value: any; type: string; displayValue: string } } = {};

    values.forEach((value, index) => {
      try {
        const sanitizedValue = sanitizeValue(value);
        const type = types[index] || detectValueType(sanitizedValue);
        const name = paramNames[index] || `param${index}`;
        
        decoded[name] = {
          value: sanitizedValue,
          type,
          displayValue: formatDisplayValue(sanitizedValue, type)
        };
      } catch (error) {
        console.warn(`Error parsing value at index ${index}:`, error);
        const name = paramNames[index] || `param${index}`;
        decoded[name] = {
          value: String(value),
          type: 'unknown',
          displayValue: String(value)
        };
      }
    });

    return decoded;
  }, [sanitizeValue, detectValueType, formatDisplayValue, paramNames]);

  // Parse the data into meaningful groups
  const parsedGroups = useMemo(() => {
    if (!data || data.length === 0) return [];

    try {
      // Sanitize data first - convert ethers objects to plain values
      const sanitizedData = data.map(sanitizeValue);
      
      const groups: ParsedGroup[] = [];
      let currentIndex = 0;

      // Detect repeating patterns in the data
      const patternSize = detectPatternSize(sanitizedData);
      
      if (patternSize > 1 && sanitizedData.length >= patternSize * 2) {
        // Group by pattern
        while (currentIndex < sanitizedData.length) {
          const remainingItems = sanitizedData.length - currentIndex;
          const itemsInThisGroup = Math.min(patternSize, remainingItems);
          
          const groupData = sanitizedData.slice(currentIndex, currentIndex + itemsInThisGroup);
          const groupTypes = types.slice(currentIndex, currentIndex + itemsInThisGroup);
          
          const items: ParsedItem[] = [];
          for (let i = 0; i < groupData.length; i += patternSize) {
            const itemData = groupData.slice(i, i + patternSize);
            const itemTypes = groupTypes.slice(i, i + patternSize);
            
            if (itemData.length > 0) {
              items.push({
                index: Math.floor((currentIndex + i) / patternSize),
                values: itemData,
                decoded: parseValues(itemData, itemTypes)
              });
            }
          }
          
          if (items.length > 0) {
            groups.push({
              pattern: generatePatternDescription(groupTypes),
              count: items.length,
              items,
              startIndex: currentIndex
            });
          }
          
          currentIndex += itemsInThisGroup;
        }
      } else {
        // Treat as single group
        const items: ParsedItem[] = [{
          index: 0,
          values: sanitizedData,
          decoded: parseValues(sanitizedData, types)
        }];

        groups.push({
          pattern: 'Mixed Parameters',
          count: 1,
          items,
          startIndex: 0
        });
      }

      return groups;
    } catch (error) {
      console.error('Error parsing decoded data:', error);
      // Return fallback single group with error handling
      return [{
        pattern: 'Raw Data (parsing failed)',
        count: 1,
        items: [{
          index: 0,
          values: data,
          decoded: data.reduce((acc, value, index) => {
            acc[`param${index}`] = {
              value: sanitizeValue(value),
              type: types[index] || 'unknown',
              displayValue: String(sanitizeValue(value))
            };
            return acc;
          }, {} as any)
        }],
        startIndex: 0
      }];
    }
  }, [data, types, sanitizeValue, detectPatternSize, generatePatternDescription, parseValues]);

  const toggleGroup = (groupIndex: number) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupIndex)) {
      newExpanded.delete(groupIndex);
    } else {
      newExpanded.add(groupIndex);
    }
    setExpandedGroups(newExpanded);
  };

  const expandAll = () => {
    setExpandedGroups(new Set(parsedGroups.map((_, index) => index)));
  };

  const collapseAll = () => {
    setExpandedGroups(new Set());
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleRawDataChange = (newData: any) => {
    setEditableRawData(newData);
  };

  const resetRawData = () => {
    if (data && data.length > 0) {
      const sanitizedData = data.map(sanitizeValue);
      setEditableRawData(sanitizedData);
    }
  };

  const exportEditedData = () => {
    const exportData = {
      functionName,
      originalData: data,
      editedData: editableRawData,
      timestamp: new Date().toISOString()
    };
    
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${functionName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_edited_data.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsJSON = () => {
    const exportData = {
      functionName,
      totalParameters: data.length,
      groups: parsedGroups.map(group => ({
        pattern: group.pattern,
        count: group.count,
        items: group.items.map(item => item.decoded)
      }))
    };
    
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${functionName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_decoded.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredGroups = useMemo(() => {
    if (!searchTerm) return parsedGroups;

    return parsedGroups.map(group => ({
      ...group,
      items: group.items.filter(item =>
        Object.entries(item.decoded).some(([key, value]: [string, any]) =>
          key.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (value as any).displayValue.toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    })).filter(group => group.items.length > 0);
  }, [parsedGroups, searchTerm]);

  if (!data || data.length === 0) {
    return <div className="decoded-data-viewer empty">No data to display</div>;
  }

  // Safety check - if parsing failed completely, show raw data
  if (parsedGroups.length === 0) {
    return (
      <div className={`decoded-data-viewer ${compact ? 'compact' : ''}`}>
        <div className="viewer-header">
          <h3>⚠️ Raw Data (parsing failed)</h3>
        </div>
        <div className="raw-data-content">
          {data.map((item, index) => (
            <div key={index} className="raw-item">
              <span className="item-index">[{index}]:</span>
              <span className="item-value">{String(sanitizeValue(item))}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`decoded-data-viewer ${compact ? 'compact' : ''}`}>
      <div className="viewer-header">
        <div className="header-info">
          <h3>{functionName} Parameters</h3>
          <div className="param-stats">
            <span className="stat">📊 {data.length} parameters</span>
            <span className="stat">🔍 {parsedGroups.length} groups</span>
          </div>
        </div>
        
        <div className="header-controls">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search parameters..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          
          <div className="control-buttons">
            <button onClick={expandAll} className="control-btn">
              📂 Expand All
            </button>
            <button onClick={collapseAll} className="control-btn">
              📁 Collapse All
            </button>
            <button 
              onClick={() => setShowRawData(!showRawData)} 
              className={`control-btn ${showRawData ? 'active' : ''}`}
            >
              🔢 Raw Data
            </button>
            <button onClick={exportAsJSON} className="control-btn export">
              💾 Export JSON
            </button>
          </div>
        </div>
      </div>

      {showRawData && (
        <div className="raw-data-section">
          <div className="raw-data-header">
            <h4>🔧 Interactive Raw Data Editor</h4>
            <div className="raw-data-controls">
              <button 
                onClick={() => copyToClipboard(JSON.stringify(editableRawData, null, 2))}
                className="control-btn"
              >
                📋 Copy Edited
              </button>
              <button 
                onClick={resetRawData}
                className="control-btn"
              >
                🔄 Reset
              </button>
              <button 
                onClick={exportEditedData}
                className="control-btn export"
              >
                💾 Export Edited
              </button>
            </div>
          </div>
          <div className="json-editor-wrapper">
            {editableRawData && (
              <JsonEditor
                data={editableRawData}
                setData={handleRawDataChange}
                showStringQuotes={true}
                showCollectionCount={true}
                enableClipboard={true}
                showArrayIndices={true}
                rootName="rawData"
              />
            )}
          </div>
          <div className="editor-help">
            <small>
              💡 <strong>Tips:</strong> Double-click to edit values • Tab/Shift-Tab to navigate • 
              Drag & drop to reorder • Right-click for context menu • Escape to cancel editing
            </small>
          </div>
        </div>
      )}

      <div className="groups-container">
        {filteredGroups.map((group, groupIndex) => (
          <div key={groupIndex} className="parameter-group">
            <div 
              className="group-header"
              onClick={() => toggleGroup(groupIndex)}
            >
              <div className="group-info">
                <span className="toggle-icon">
                  {expandedGroups.has(groupIndex) ? '🔽' : '▶️'}
                </span>
                <span className="group-title">{group.pattern}</span>
                <span className="group-count">({group.count} items)</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const groupData = group.items.map(item => item.decoded);
                  copyToClipboard(JSON.stringify(groupData, null, 2));
                }}
                className="copy-group-btn"
              >
                📋
              </button>
            </div>

            {expandedGroups.has(groupIndex) && (
              <div className="group-content">
                {group.items.map((item, itemIndex) => (
                  <div key={itemIndex} className="parameter-item">
                    <div className="item-header">
                      <span className="item-index">#{item.index}</span>
                    </div>
                    <div className="item-parameters">
                      {Object.entries(item.decoded).map(([paramName, param], paramIndex) => {
                        const typedParam = param as { value: any; type: string; displayValue: string };
                        return (
                          <div key={paramIndex} className="parameter">
                            <div className="param-info">
                              <span className="param-name">{paramName}</span>
                              <span className="param-type">({typedParam.type})</span>
                            </div>
                            <div className="param-value">
                              <span className="display-value">{typedParam.displayValue}</span>
                              {typedParam.displayValue !== String(typedParam.value) && (
                                <span className="raw-value">{String(typedParam.value)}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DecodedDataViewer;