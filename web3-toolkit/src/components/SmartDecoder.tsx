import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { 
  CheckCircle, 
  XCircle, 
  Search, 
  FileText, 
  Settings, 
  Sparkles, 
  Copy,
  Building2,
  Code2,
  Zap,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import {
  lookupFunctionSignatures,
  getCachedSignatures,
  getCustomSignatures,
  type SignatureResponse,
  type CustomSignature
} from '../utils/signatureDatabase';
import { 
  decodeWithHeuristics,
  type HeuristicDecodingResult,
  type DecodedParameter 
} from '../utils/advancedDecoder';
import { useToolkit } from '../contexts/ToolkitContext';
import DecodedDataViewer from './DecodedDataViewer';
import AdvancedJsonEditor from './AdvancedJsonEditor';
import AnimatedInput from './ui/AnimatedInput';
import AnimatedButton from './ui/AnimatedButton';
import '../styles/AdvancedJsonEditor.css';
import '../styles/AnimatedInput.css';
import '../styles/AnimatedButton.css';

const SmartDecoder: React.FC = () => {
  const toolkit = useToolkit();
  const [calldata, setCalldata] = useState('');
  const [decodedResult, setDecodedResult] = useState<any>(null);
  const [isDecoding, setIsDecoding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decodingSteps, setDecodingSteps] = useState<string[]>([]);
  
  // Fallback options state
  const [showFallbackOptions, setShowFallbackOptions] = useState(false);
  const [contractAddress, setContractAddress] = useState('');
  const [isFetchingABI, setIsFetchingABI] = useState(false);
  const [manualABI, setManualABI] = useState('');
  const [showTransferOptions, setShowTransferOptions] = useState(false);
  const [viewMode, setViewMode] = useState<'advanced' | 'legacy' | 'simple'>('advanced');
  const [expandedParams, setExpandedParams] = useState<Set<number>>(new Set());
  const [contractConfirmation, setContractConfirmation] = useState<{
    show: boolean;
    contractInfo: any;
    abi: any;
    onConfirm: () => void;
    onContinueSearch: () => void;
  } | null>(null);
  const [currentSearchProgress, setCurrentSearchProgress] = useState<string[]>([]);
  const [expandedValues, setExpandedValues] = useState<Set<string>>(new Set());
  
  // Advanced decoding features
  const [heuristicResult, setHeuristicResult] = useState<HeuristicDecodingResult | null>(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [enableHeuristics, setEnableHeuristics] = useState(true);
  const [enableSignatureLookup, setEnableSignatureLookup] = useState(true);
  const [showAlternativeResults, setShowAlternativeResults] = useState(false);

  const addDecodingStep = (step: string) => {
    setDecodingSteps(prev => [...prev, step]);
  };

  const toggleParamExpansion = (paramIndex: number) => {
    setExpandedParams(prev => {
      const newSet = new Set(prev);
      if (newSet.has(paramIndex)) {
        newSet.delete(paramIndex);
      } else {
        newSet.add(paramIndex);
      }
      return newSet;
    });
  };

  const toggleValueExpansion = (valueId: string) => {
    setExpandedValues(prev => {
      const newSet = new Set(prev);
      if (newSet.has(valueId)) {
        newSet.delete(valueId);
      } else {
        newSet.add(valueId);
      }
      return newSet;
    });
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Could add a toast notification here
      console.log(`Copied ${label} to clipboard`);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const resetDecodingState = () => {
    setDecodedResult(null);
    setError(null);
    setDecodingSteps([]);
    setShowFallbackOptions(false);
    setShowTransferOptions(false);
    setContractAddress('');
    setManualABI('');
    setExpandedParams(new Set());
  };

  // Detect if a value looks like calldata and attempt to decode it
  const detectAndDecodeCalldata = async (value: any): Promise<any> => {
    if (typeof value !== 'string') return null;
    
    const cleanValue = value.startsWith('0x') ? value : `0x${value}`;
    
    // Must be hex string and at least 10 characters (4-byte selector + some data)
    if (!/^0x[a-fA-F0-9]{8,}$/.test(cleanValue)) return null;
    
    // Must start with what looks like a function selector
    const selector = cleanValue.slice(0, 10);
    
    try {
      console.log(`🔍 Detected potential calldata: ${cleanValue.slice(0, 20)}...`);
      console.log(`🎯 Attempting to decode selector: ${selector}`);
      
      // Try custom signatures first
      const customSignature = searchCustomSignatures(selector);
      if (customSignature) {
        console.log(`✅ Found in custom signatures: ${customSignature}`);
        const decoded = decodeWithSignature(cleanValue, customSignature);
        return {
          type: 'decoded_calldata',
          selector,
          signature: customSignature,
          functionName: decoded.name,
          args: decoded.args,
          source: 'custom'
        };
      }
      
      // Try OpenChain lookup
      const openChainResult: SignatureResponse = await lookupFunctionSignatures([selector]);
      const signatures = openChainResult.result?.function?.[selector];
      
      if (signatures && signatures.length > 0) {
        const signature = signatures[0].name;
        console.log(`✅ Found on OpenChain: ${signature}`);
        const decoded = decodeWithSignature(cleanValue, signature);
        return {
          type: 'decoded_calldata',
          selector,
          signature,
          functionName: decoded.name,
          args: decoded.args,
          source: 'openchain'
        };
      }
      
      console.log(`❌ Could not decode calldata with selector ${selector}`);
      return null;
      
    } catch (error) {
      console.log(`⚠️ Error decoding potential calldata:`, error);
      return null;
    }
  };

  // Component for rendering expandable arrays with copy functionality
  const renderExpandableArray = (value: any[], valueId: string, paramType?: string): JSX.Element => {
    const isExpanded = expandedValues.has(valueId);
    const showExpandButton = value.length > 3;
    
    if (!showExpandButton) {
      // Small arrays - show all items with copy button
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>
            [{value.map(v => Array.isArray(v) ? `[Array of ${v.length} items]` : formatParameterValue(v)).join(', ')}]
          </span>
          <button
            onClick={() => copyToClipboard(JSON.stringify(value, null, 2), 'array')}
            style={{
              background: 'none',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '4px',
              padding: '4px',
              cursor: 'pointer',
              color: '#3b82f6',
              display: 'flex',
              alignItems: 'center'
            }}
            title="Copy full array"
          >
            <Copy size={12} />
          </button>
        </div>
      );
    }

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: isExpanded ? '8px' : '0' }}>
          <button
            onClick={() => toggleValueExpansion(valueId)}
            style={{
              background: 'none',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '4px',
              padding: '4px 8px',
              cursor: 'pointer',
              color: '#3b82f6',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {isExpanded ? 'Collapse' : 'Show All'} ({value.length} items)
          </button>
          
          <button
            onClick={() => copyToClipboard(JSON.stringify(value, null, 2), 'array')}
            style={{
              background: 'none',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '4px',
              padding: '4px',
              cursor: 'pointer',
              color: '#3b82f6',
              display: 'flex',
              alignItems: 'center'
            }}
            title="Copy full array"
          >
            <Copy size={12} />
          </button>
        </div>

        {isExpanded ? (
          <div style={{
            background: 'rgba(59, 130, 246, 0.02)',
            border: '1px solid rgba(59, 130, 246, 0.1)',
            borderRadius: '6px',
            padding: '12px',
            maxHeight: '300px',
            overflow: 'auto'
          }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px', fontWeight: '600' }}>
              All {value.length} items:
            </div>
            {value.map((item, index) => (
              <div key={index} style={{
                marginBottom: '4px',
                fontSize: '12px',
                fontFamily: 'Monaco, Menlo, monospace',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ color: '#6b7280', minWidth: '30px' }}>[{index}]:</span>
                <span style={{ flex: 1, wordBreak: 'break-all' }}>
                  {Array.isArray(item) ? `[Array of ${item.length} items]` : formatParameterValue(item)}
                </span>
                <button
                  onClick={() => copyToClipboard(String(item), `item ${index}`)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#6b7280',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title={`Copy item ${index}`}
                >
                  <Copy size={10} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: '12px', fontFamily: 'Monaco, Menlo, monospace' }}>
            [{value.slice(0, 2).map(v => Array.isArray(v) ? `[Array of ${v.length} items]` : formatParameterValue(v)).join(', ')}, ... +{value.length - 2} more]
          </span>
        )}
      </div>
    );
  };

  // Simple renderer without hooks - we'll detect calldata at a higher level
  const renderValueSimple = (value: any, name?: string, depth: number = 0, decodedCalldata?: any) => {
    const indent = depth * 20;
    
    const baseStyle = {
      marginLeft: `${indent}px`,
      marginBottom: '6px',
      fontSize: '11px'
    };
    
    if (decodedCalldata) {
      return (
        <div style={baseStyle}>
          <div style={{
            border: '2px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '6px',
            padding: '8px',
            background: 'rgba(34, 197, 94, 0.05)'
          }}>
            <div style={{ fontWeight: '600', marginBottom: '4px', color: '#22c55e', fontSize: '12px' }}>
              📞 Nested Calldata: {decodedCalldata.functionName}()
            </div>
            <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '6px' }}>
              Selector: {decodedCalldata.selector} | Source: {decodedCalldata.source}
            </div>
            {decodedCalldata.args && decodedCalldata.args.map((arg: any, argIndex: number) => (
              <div key={argIndex} style={{ marginLeft: '12px', marginBottom: '4px' }}>
                {renderValueSimple(arg, `arg_${argIndex}`, depth + 1)}
              </div>
            ))}
          </div>
        </div>
      );
    }
    
    return (
      <div style={baseStyle}>
        {name && (
          <span style={{ color: '#9ca3af', minWidth: '60px', display: 'inline-block' }}>
            {name}:
          </span>
        )}
        <code style={{ 
          background: 'rgba(59, 130, 246, 0.1)', 
          padding: '2px 4px', 
          borderRadius: '3px',
          fontSize: '10px',
          marginLeft: name ? '8px' : '0'
        }}>
          {formatParameterValue(value)}
          {typeof value === 'string' && value.length > 20 && value.match(/^0x[a-fA-F0-9]{8,}$/) && (
            <span style={{ fontSize: '9px', color: '#22c55e', marginLeft: '4px' }}>
              📞 (potential calldata)
            </span>
          )}
        </code>
      </div>
    );
  };

  // Enhanced tuple renderer with ABI field information
  const renderTupleDetails = (value: any[], paramType: string, depth: number = 0, abiComponents?: any[]) => {
    if (!Array.isArray(value) || !value.length) return null;
    
    const indent = depth * 20;
    
    return (
      <div style={{ marginLeft: `${indent}px`, marginTop: '8px' }}>
        {value.map((item, index) => {
          if (Array.isArray(item)) {
            // This is a struct (tuple) within the array
            return (
              <div key={index} style={{
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '6px',
                padding: '8px',
                marginBottom: '8px',
                background: 'rgba(59, 130, 246, 0.05)'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '6px', fontSize: '12px', color: '#3b82f6' }}>
                  Struct [{index}]
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280' }}>
                  {item.map((field, fieldIndex) => {
                    // Get field info from ABI components if available
                    const fieldInfo = abiComponents && abiComponents[fieldIndex];
                    const fieldName = fieldInfo?.name || `field_${fieldIndex}`;
                    const fieldType = fieldInfo?.type || 'unknown';
                    
                    return (
                      <div key={fieldIndex} style={{ 
                        marginBottom: '6px', 
                        paddingLeft: '12px',
                        borderLeft: '2px solid rgba(59, 130, 246, 0.1)',
                        paddingBottom: '4px'
                      }}>
                        <div style={{ marginBottom: '2px' }}>
                          <span style={{ 
                            color: '#3b82f6', 
                            fontWeight: '500', 
                            fontSize: '11px'
                          }}>
                            {fieldName}
                          </span>
                          <span style={{ 
                            color: '#9ca3af', 
                            fontSize: '10px', 
                            marginLeft: '6px',
                            background: 'rgba(59, 130, 246, 0.1)',
                            padding: '1px 4px',
                            borderRadius: '3px',
                            fontFamily: 'monospace'
                          }}>
                            {fieldType}
                          </span>
                        </div>
                        <div style={{ marginLeft: '4px' }}>
                          {renderValueSimple(field, undefined, depth + 1)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          } else {
            // Simple array item
            return (
              <div key={index} style={{ marginBottom: '4px', fontSize: '12px' }}>
                {renderValueSimple(item, `[${index}]`, depth)}
              </div>
            );
          }
        })}
      </div>
    );
  };

  // JSON-style view with expandable sections like simple view
  const renderSimplifiedJsonView = (data: any[], parameterData: any[]) => {
    const renderValue = (value: any, depth: number = 0): JSX.Element => {
      const indent = depth * 20;
      
      if (Array.isArray(value)) {
        return (
          <div style={{ marginLeft: `${indent}px` }}>
            <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: '4px' }}>
              [{value.length} items]
            </div>
            {value.map((item, index) => (
              <div key={index} style={{ marginBottom: '6px', paddingLeft: '12px' }}>
                <span style={{ color: '#6b7280', fontSize: '11px', minWidth: '30px', display: 'inline-block' }}>
                  [{index}]:
                </span>
                <div style={{ marginLeft: '8px' }}>
                  {renderValue(item, depth + 1)}
                </div>
              </div>
            ))}
          </div>
        );
      }
      
      if (value && typeof value === 'object') {
        return (
          <div style={{ marginLeft: `${indent}px` }}>
            {Object.entries(value).map(([key, val]) => (
              <div key={key} style={{ marginBottom: '4px' }}>
                <span style={{ color: '#3b82f6', fontSize: '11px', fontWeight: '500' }}>
                  {key}:
                </span>
                <div style={{ marginLeft: '12px' }}>
                  {renderValue(val, depth + 1)}
                </div>
              </div>
            ))}
          </div>
        );
      }
      
      return (
        <code style={{
          background: 'rgba(59, 130, 246, 0.1)',
          padding: '2px 6px',
          borderRadius: '3px',
          fontSize: '11px',
          fontFamily: 'Monaco, Menlo, monospace',
          color: '#374151',
          marginLeft: '8px'
        }}>
          {formatParameterValue(value)}
          {typeof value === 'string' && value.length > 20 && value.match(/^0x[a-fA-F0-9]{8,}$/) && (
            <span style={{ fontSize: '9px', color: '#22c55e', marginLeft: '4px' }}>
              📞 (potential calldata)
            </span>
          )}
        </code>
      );
    };

    return (
      <div style={{ 
        background: 'rgba(59, 130, 246, 0.02)', 
        border: '1px solid rgba(59, 130, 246, 0.2)', 
        borderRadius: '6px', 
        padding: '16px',
        fontSize: '12px'
      }}>
        <div style={{ marginBottom: '12px', fontSize: '13px', fontWeight: '600', color: '#374151' }}>
          Decoded Parameters (JSON-style view):
        </div>
        
        {parameterData.map((param: any, index: number) => {
          const isExpandable = Array.isArray(param.value) && 
            (param.type?.includes('tuple') || param.value.some((item: any) => Array.isArray(item)));
          const isExpanded = expandedParams.has(index);
          
          return (
            <div key={index} style={{ marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid rgba(59, 130, 246, 0.1)' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                marginBottom: '4px',
                cursor: isExpandable ? 'pointer' : 'default'
              }} onClick={isExpandable ? () => toggleParamExpansion(index) : undefined}>
                {isExpandable && (
                  <div style={{ marginRight: '8px', color: '#3b82f6' }}>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                )}
                <span style={{ color: '#3b82f6', fontWeight: '600', fontSize: '13px' }}>
                  "{param.name}"
                </span>
                <span style={{ 
                  color: '#6b7280', 
                  fontSize: '11px', 
                  marginLeft: '8px',
                  background: 'rgba(59, 130, 246, 0.1)',
                  padding: '1px 4px',
                  borderRadius: '3px'
                }}>
                  {param.type}
                </span>
              </div>
              
              {/* Show summary or full value */}
              {!isExpandable || !isExpanded ? (
                <div style={{ marginLeft: isExpandable ? '22px' : '0' }}>
                  <code style={{
                    background: 'rgba(59, 130, 246, 0.1)',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontFamily: 'Monaco, Menlo, monospace',
                    color: '#374151',
                    display: 'block',
                    wordBreak: 'break-all'
                  }}>
                    {Array.isArray(param.value) && param.value.length > 0 ? 
                      renderExpandableArray(param.value, `json-param-${index}-value`, param.type) :
                      formatParameterValue(param.value, param.type)
                    }
                    {isExpandable && (
                      <span style={{ 
                        fontSize: '10px', 
                        color: '#6b7280', 
                        marginLeft: '8px',
                        fontStyle: 'italic'
                      }}>
                        (click arrow to expand)
                      </span>
                    )}
                  </code>
                </div>
              ) : null}
              
              {/* Expanded details */}
              {isExpandable && isExpanded && (
                <div style={{
                  marginLeft: '22px',
                  marginTop: '8px',
                  padding: '12px',
                  background: 'rgba(59, 130, 246, 0.02)',
                  border: '1px solid rgba(59, 130, 246, 0.1)',
                  borderRadius: '6px'
                }}>
                  <div style={{ 
                    fontSize: '11px', 
                    color: '#6b7280', 
                    marginBottom: '8px',
                    fontWeight: '600'
                  }}>
                    Detailed Structure:
                  </div>
                  {(() => {
                    // Try to get ABI components for this parameter
                    let abiComponents = null;
                    
                    // Check if we have toolkit context with ABI info
                    const toolkitTransaction = toolkit.lastDecodedTransaction;
                    if (toolkitTransaction?.abi) {
                      try {
                        const abi = toolkitTransaction.abi;
                        // Find the function in the ABI
                        const matchingFunction = abi.find((item: any) => 
                          item.type === 'function' && item.name === toolkitTransaction.functionName
                        );
                        if (matchingFunction?.inputs) {
                          const paramInput = matchingFunction.inputs[index];
                          if (paramInput?.components) {
                            abiComponents = paramInput.components;
                          }
                        }
                      } catch (error) {
                        console.log('Could not extract ABI components:', error);
                      }
                    }
                    
                    return renderTupleDetails(param.value, param.type, 0, abiComponents);
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const shouldUseComplexViewer = (args: any[]): boolean => {
    // Use complex viewer if:
    // 1. More than 4 parameters
    // 2. Any parameter is an array
    // 3. Any parameter looks like encoded data (long hex strings)
    // 4. Combined string length of all parameters > 200 characters
    
    if (args.length > 4) return true;
    
    const totalStringLength = args.reduce((acc, arg) => {
      return acc + String(arg).length;
    }, 0);
    
    if (totalStringLength > 200) return true;
    
    return args.some(arg => {
      // Check if it's an array
      if (Array.isArray(arg)) return true;
      
      // Check for long hex strings (likely encoded data)
      const str = String(arg);
      if (str.startsWith('0x') && str.length > 50) return true;
      
      // Check if it looks like a long comma-separated list
      if (str.includes(',') && str.split(',').length > 8) return true;
      
      return false;
    });
  };

  const handleTransferToBuilder = () => {
    if (toolkit.lastDecodedTransaction) {
      // Transfer data and auto-navigate
      toolkit.transferToTransactionBuilder(toolkit.lastDecodedTransaction);
      setShowTransferOptions(false);
      addDecodingStep('✓ Transaction data transferred to Transaction Builder!');
    }
  };

  // Helper function to detect parameter type from value
  const getParameterType = (value: any): string => {
    if (value === null || value === undefined) return 'unknown';
    
    const str = String(value);
    
    // Check if it's an address (42 character hex starting with 0x)
    if (str.match(/^0x[a-fA-F0-9]{40}$/)) {
      return 'address';
    }
    
    // Check if it's a large number (likely uint256)
    if (str.match(/^\d+$/) && str.length > 10) {
      return 'uint256';
    }
    
    // Check if it's a smaller number
    if (str.match(/^\d+$/) && str.length <= 10) {
      return 'uint32';
    }
    
    // Check if it's bytes data
    if (str.startsWith('0x') && str.length > 2) {
      const hexLength = str.length - 2;
      if (hexLength % 2 === 0) {
        const byteLength = hexLength / 2;
        if (byteLength <= 32) {
          return `bytes${byteLength}`;
        }
        return 'bytes';
      }
    }
    
    // Check if it's boolean
    if (str === 'true' || str === 'false') {
      return 'bool';
    }
    
    // Check if it's an array
    if (Array.isArray(value)) {
      return 'array';
    }
    
    return 'string';
  };

  // Helper function to parse parameter names and types from function signatures
  const parseSignatureParameters = (signature: string): Array<{name: string, type: string}> => {
    try {
      // Extract parameters from signature like "transfer(address to, uint256 amount)"
      const match = signature.match(/\((.*)\)/);
      if (!match || !match[1].trim()) return [];
      
      const paramString = match[1];
      const params = paramString.split(',').map(p => p.trim());
      
      return params.map((param, index) => {
        const parts = param.trim().split(/\s+/);
        if (parts.length >= 2) {
          // Has both type and name: "address to"
          return {
            type: parts[0],
            name: parts[1]
          };
        } else if (parts.length === 1) {
          // Only has type: "address"
          return {
            type: parts[0],
            name: `param_${index}`
          };
        } else {
          // Fallback
          return {
            type: 'unknown',
            name: `param_${index}`
          };
        }
      });
    } catch (error) {
      console.warn('Error parsing signature parameters:', error);
      return [];
    }
  };

  // Helper function to format parameter values nicely
  const formatParameterValue = (value: any, paramType?: string): string => {
    if (value === null || value === undefined) return 'null';
    
    // Handle arrays (including tuple arrays)
    if (Array.isArray(value)) {
      // If it's a tuple array, show expanded structure with preview
      if (paramType?.includes('tuple') || value.some(item => Array.isArray(item))) {
        let preview = '';
        if (value.length > 0 && Array.isArray(value[0])) {
          // Show preview of first struct
          const firstStruct = value[0];
          if (firstStruct.length >= 3) {
            preview = ` (e.g., {${firstStruct[0]}, ${firstStruct[1]}, [${firstStruct[2]?.length || 0} items]})`;
          } else {
            preview = ` (e.g., {${firstStruct.slice(0, 2).join(', ')}${firstStruct.length > 2 ? ', ...' : ''}})`;
          }
        }
        return `Struct Array[${value.length} items]${preview} - Switch to JSON View for full details`;
      }
      
      // Regular arrays
      if (value.length <= 3) {
        return `[${value.map(v => formatParameterValue(v)).join(', ')}]`;
      } else {
        return `[${value.slice(0, 2).map(v => formatParameterValue(v)).join(', ')}, ... +${value.length - 2} more]`;
      }
    }
    
    const str = String(value);
    
    // Format addresses
    if (str.match(/^0x[a-fA-F0-9]{40}$/)) {
      return str;
    }
    
    // Format large numbers with commas and check for timestamps
    if (str.match(/^\d+$/) && str.length > 10) {
      const num = BigInt(str);
      const formatted = num.toLocaleString();
      
      // Check if it could be a timestamp (between 2000 and 2100)
      const timestamp = Number(str);
      if (timestamp > 946684800 && timestamp < 4102444800) {
        const date = new Date(timestamp * 1000);
        return `${formatted} (${date.toISOString().split('T')[0]})`;
      }
      
      return formatted;
    }
    
    // Format bytes data - but don't truncate if it's not actually bytes
    if (str.startsWith('0x') && str.length > 42 && str.match(/^0x[a-fA-F0-9]+$/)) {
      return `${str.slice(0, 10)}...${str.slice(-8)} (${(str.length - 2) / 2} bytes)`;
    }
    
    return str;
  };

  const extractFunctionSelector = (calldataHex: string): string | null => {
    try {
      if (!calldataHex.startsWith('0x')) {
        calldataHex = '0x' + calldataHex;
      }
      if (calldataHex.length < 10) {
        throw new Error('Calldata too short');
      }
      return calldataHex.slice(0, 10);
    } catch {
      return null;
    }
  };

  // Helper to reverse-engineer what function signature should produce a given selector
  const suggestFunctionSignature = (targetSelector: string): string => {
    // Some common function signatures to check
    const commonSignatures = [
      'transfer(address,uint256)',
      'approve(address,uint256)', 
      'transferFrom(address,address,uint256)',
      'mint(address,uint256)',
      'burn(uint256)',
      'deposit()',
      'withdraw(uint256)',
      'execute(bytes)',
      'multicall(bytes[])',
      'diamondCut((address,uint8,bytes4[])[],address,bytes)',
    ];
    
    for (const sig of commonSignatures) {
      const hash = ethers.utils.id(sig);
      const selector = hash.slice(0, 10);
      if (selector.toLowerCase() === targetSelector.toLowerCase()) {
        return sig;
      }
    }
    
    return `Unknown function - selector ${targetSelector}`;
  };

  const searchCustomSignatures = (selector: string): string | null => {
    // Check cached signatures first
    const cachedFunctions = getCachedSignatures('function');
    if (cachedFunctions[selector]) {
      return cachedFunctions[selector].name;
    }

    // Check custom signatures
    const customSignatures = getCustomSignatures();
    for (const customSig of customSignatures) {
      try {
        const hash = ethers.utils.id(customSig.signature);
        const computedSelector = hash.slice(0, 10);
        if (computedSelector.toLowerCase() === selector.toLowerCase()) {
          return customSig.signature;
        }
      } catch {
        continue;
      }
    }

    return null;
  };

  const decodeWithSignature = (calldataHex: string, signature: string): any => {
    try {
      const abi = [`function ${signature}`];
      const iface = new ethers.utils.Interface(abi);
      const decoded = iface.parseTransaction({ data: calldataHex });
      return decoded;
    } catch (error) {
      throw new Error(`Failed to decode with signature ${signature}: ${error}`);
    }
  };

  const fetchContractBytecode = async (address: string): Promise<string> => {
    try {
      // Use web3 RPC to get contract bytecode
      const response = await fetch('https://cloudflare-eth.com/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getCode',
          params: [address, 'latest'],
          id: 1,
        }),
      });
      
      const data = await response.json();
      if (data.result && data.result !== '0x') {
        return data.result;
      } else {
        throw new Error('No contract deployed at this address');
      }
    } catch (error: any) {
      throw new Error(`Failed to fetch contract bytecode: ${error.message}`);
    }
  };

  // Fetch ABI from Etherscan-style APIs
  const fetchABIFromEtherscanInstances = async (address: string): Promise<any> => {
    const etherscanInstances = [
      { name: 'Ethereum Mainnet', url: 'https://api.etherscan.io', chainId: '1', apiKeyParam: 'etherscan' },
      { name: 'Polygon', url: 'https://api.polygonscan.com', chainId: '137', apiKeyParam: 'polygonscan' },
      { name: 'BSC', url: 'https://api.bscscan.com', chainId: '56', apiKeyParam: 'bscscan' },
      { name: 'Arbitrum One', url: 'https://api.arbiscan.io', chainId: '42161', apiKeyParam: 'arbiscan' },
      { name: 'Optimism', url: 'https://api-optimistic.etherscan.io', chainId: '10', apiKeyParam: 'optimism' },
      { name: 'Base Mainnet', url: 'https://api.basescan.org', chainId: '8453', apiKeyParam: 'basescan' },
      { name: 'Avalanche', url: 'https://api.snowtrace.io', chainId: '43114', apiKeyParam: 'snowtrace' },
      { name: 'Fantom', url: 'https://api.ftmscan.com', chainId: '250', apiKeyParam: 'ftmscan' },
    ];

    const errors: string[] = [];

    for (const instance of etherscanInstances) {
      try {
        addDecodingStep(`🔍 Searching ${instance.name} (Etherscan)...`);
        
        // Get API key from localStorage or use a default
        let apiKey = 'YourApiKeyToken'; // Default/demo key
        try {
          const stored = localStorage.getItem(`apiKey_${instance.apiKeyParam}`);
          if (stored) apiKey = stored;
        } catch {
          // Fall back to default
        }

        const response = await fetch(
          `${instance.url}/api?module=contract&action=getabi&address=${address}&apikey=${apiKey}`,
          {
            headers: {
              'Accept': 'application/json',
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          
          if (data.status === '1' && data.result) {
            try {
              const abi = JSON.parse(data.result);
              if (Array.isArray(abi)) {
                addDecodingStep(`✓ Found verified contract on ${instance.name} (Etherscan)!`);
                return abi;
              }
            } catch (parseError) {
              errors.push(`${instance.name}: invalid ABI format`);
            }
          } else {
            errors.push(`${instance.name}: ${data.message || 'contract not verified'}`);
          }
        } else {
          errors.push(`${instance.name}: API error ${response.status}`);
        }
      } catch (error: any) {
        errors.push(`${instance.name}: ${error.message}`);
        continue;
      }
    }

    throw new Error(`Contract not verified on any Etherscan instance: ${errors.join(', ')}`);
  };

  const fetchABIFromBlockscoutInstances = async (address: string): Promise<any> => {
    const blockscoutInstances = [
      { name: 'Ethereum Mainnet', url: 'https://eth.blockscout.com', chainId: '1' },
      { name: 'Base Mainnet', url: 'https://base.blockscout.com', chainId: '8453' },
      { name: 'Arbitrum One', url: 'https://arbitrum.blockscout.com', chainId: '42161' },
      { name: 'Optimism', url: 'https://optimism.blockscout.com', chainId: '10' },
      { name: 'Polygon', url: 'https://polygon.blockscout.com', chainId: '137' },
      { name: 'Gnosis Chain', url: 'https://gnosis.blockscout.com', chainId: '100' },
      { name: 'BSC', url: 'https://bsc.blockscout.com', chainId: '56' },
      { name: 'Ethereum Classic', url: 'https://etc.blockscout.com', chainId: '61' },
    ];

    const errors: string[] = [];

    for (const instance of blockscoutInstances) {
      try {
        addDecodingStep(`🌐 Searching ${instance.name}...`);
        const response = await fetch(
          `${instance.url}/api/v2/smart-contracts/${address}`,
          {
            headers: {
              'Accept': 'application/json',
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          
          if (data.is_verified && data.abi && Array.isArray(data.abi)) {
            addDecodingStep(`✓ Found verified contract on ${instance.name}!`);
            return data.abi;
          } else {
            errors.push(`${instance.name}: contract not verified`);
          }
        } else if (response.status === 404) {
          errors.push(`${instance.name}: contract not found`);
        } else {
          errors.push(`${instance.name}: API error ${response.status}`);
        }
      } catch (error: any) {
        errors.push(`${instance.name}: ${error.message}`);
        continue;
      }
    }

    throw new Error(`Contract not verified on any Blockscout instance: ${errors.join(', ')}`);
  };

  const fetchABIFromContract = async (address: string): Promise<any> => {
    try {
      addDecodingStep(`🌐 Searching across multiple block explorers...`);
      
      // Try both Etherscan and Blockscout in parallel
      const promises = [
        fetchABIFromEtherscanInstances(address).catch((error) => ({ error: error.message, source: 'etherscan' })),
        fetchABIFromBlockscoutInstances(address).catch((error) => ({ error: error.message, source: 'blockscout' }))
      ];
      
      const results = await Promise.allSettled(promises);
      
      // Check if any succeeded
      for (const result of results) {
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
          return result.value;
        }
      }
      
      // If none succeeded, collect all errors
      const errors: string[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.error) {
          errors.push(`${result.value.source}: ${result.value.error}`);
        } else if (result.status === 'rejected') {
          errors.push(`Unknown error: ${result.reason}`);
        }
      }
      
      throw new Error(`Contract not verified on any block explorer: ${errors.join(' | ')}`);
      
    } catch (error: any) {
      throw new Error(`Failed to find verified contract: ${error.message}`);
    }
  };

  // Enhanced ABI fetching with user confirmation
  const fetchABIWithConfirmation = async (address: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      let currentSourceIndex = 0;
      
      // Define search sources in priority order
      const searchSources = [
        { name: 'Etherscan', fetch: () => fetchABIFromEtherscanInstances(address) },
        { name: 'Blockscout', fetch: () => fetchABIFromBlockscoutInstances(address) }
      ];
      
      const errors: string[] = [];

      const searchNext = async () => {
        if (currentSourceIndex >= searchSources.length) {
          setCurrentSearchProgress([]);
          reject(new Error(`Contract not verified on any block explorer: ${errors.join(' | ')}`));
          return;
        }

        const source = searchSources[currentSourceIndex];
        
        try {
          if (currentSourceIndex === 0) {
            setCurrentSearchProgress(['🌐 Starting multi-chain search...']);
          }
          setCurrentSearchProgress(prev => [...prev, `🔍 Searching ${source.name}...`]);
          
          const abi = await source.fetch();
          
          if (Array.isArray(abi)) {
            setCurrentSearchProgress(prev => [...prev, `✓ Found verified contract on ${source.name}!`]);
            
            // Show confirmation dialog
            setContractConfirmation({
              show: true,
              contractInfo: {
                address,
                source: source.name,
                functions: abi.filter((item: any) => item.type === 'function').length,
                events: abi.filter((item: any) => item.type === 'event').length
              },
              abi,
              onConfirm: () => {
                setContractConfirmation(null);
                setCurrentSearchProgress([]);
                resolve(abi);
              },
              onContinueSearch: () => {
                setContractConfirmation(null);
                currentSourceIndex++;
                searchNext();
              }
            });
            
            return; // Wait for user decision
          }
        } catch (error: any) {
          errors.push(`${source.name}: ${error.message}`);
          setCurrentSearchProgress(prev => [...prev, `❌ ${source.name}: ${error.message}`]);
        }
        
        // Move to next source
        currentSourceIndex++;
        searchNext();
      };
      
      searchNext().catch((error) => {
        setCurrentSearchProgress([]);
        reject(error);
      });
    });
  };

  // Helper to expand tuple types with components into full struct signatures
  const expandTupleType = (input: any): string => {
    if (input.type === 'tuple' && input.components) {
      const componentTypes = input.components.map((comp: any) => expandTupleType(comp));
      return `(${componentTypes.join(',')})`;
    } else if (input.type === 'tuple[]' && input.components) {
      const componentTypes = input.components.map((comp: any) => expandTupleType(comp));
      return `(${componentTypes.join(',')})[]`;
    } else {
      return input.type;
    }
  };

  const findMatchingFunctionInABI = (abi: any[], selector: string): any => {
    console.log('🔍 Searching ABI for selector:', selector);
    console.log('📋 ABI contains', abi.length, 'items');
    
    for (const item of abi) {
      if (item.type === 'function' && item.name) {
        try {
          // Only consider public and external functions (or functions without stateMutability specified)
          if (item.stateMutability && !['pure', 'view', 'nonpayable', 'payable'].includes(item.stateMutability)) {
            continue;
          }
          
          // Properly expand tuple types with components
          const inputs = item.inputs?.map((input: any) => expandTupleType(input)).join(',') || '';
          const signature = `${item.name}(${inputs})`;
          const hash = ethers.utils.id(signature);
          const computedSelector = hash.slice(0, 10);
          
          console.log(`🧮 Function: ${signature} → Selector: ${computedSelector}`);
          
          if (computedSelector.toLowerCase() === selector.toLowerCase()) {
            console.log('✅ MATCH FOUND!', signature);
            return { ...item, signature };
          }
        } catch (error) {
          console.warn('⚠️ Error processing ABI item:', item, error);
          continue;
        }
      }
    }
    
    console.log('❌ No matching function found in ABI');
    console.log('🔍 Functions found in ABI:');
    abi.filter(item => item.type === 'function' && item.name).forEach(item => {
      try {
        const inputs = item.inputs?.map((input: any) => expandTupleType(input)).join(',') || '';
        const signature = `${item.name}(${inputs})`;
        const hash = ethers.utils.id(signature);
        const computedSelector = hash.slice(0, 10);
        console.log(`  - ${signature} → ${computedSelector}`);
      } catch (e) {
        console.log(`  - ${item.name} → Error computing selector`);
      }
    });
    
    return null;
  };

  const handleSmartDecode = async () => {
    if (!calldata.trim()) {
      setError('Please enter calldata to decode');
      return;
    }

    setIsDecoding(true);
    resetDecodingState();
    
    try {
      const selector = extractFunctionSelector(calldata.trim());
      if (!selector) {
        throw new Error('Invalid calldata format');
      }

      addDecodingStep(`📍 Extracted function selector: ${selector}`);

      // Step 1: If we have a contract address, try ABI-based decoding first (highest quality)
      if (contractAddress.trim()) {
        addDecodingStep(`🎯 Contract address provided: ${contractAddress.trim()}`);
        try {
          await handleContractABIDecode();
          return; // If successful, we're done with high-quality ABI decoding
        } catch (error: any) {
          addDecodingStep(`⚠️ Contract ABI lookup failed, continuing with signature search...`);
        }
      }

      // Step 2: Check custom/cached signatures
      addDecodingStep('🔍 Searching custom signatures...');
      const customSignature = searchCustomSignatures(selector);
      if (customSignature) {
        addDecodingStep(`✓ Found in custom signatures: ${customSignature}`);
        const decoded = decodeWithSignature(calldata.trim(), customSignature);
        setDecodedResult(decoded);
        
        // Extract parameter names from signature if available
        const parameterInfo = parseSignatureParameters(customSignature);
        
        // Share decoded data with toolkit context
        toolkit.setDecodedTransaction({
          functionName: decoded.name,
          functionSignature: customSignature,
          parameters: decoded.args ? decoded.args.map((arg: any, index: number) => ({
            name: parameterInfo[index]?.name || `param_${index}`,
            type: parameterInfo[index]?.type || 'unknown',
            value: arg
          })) : [],
          calldata: calldata.trim()
        });
        
        setShowTransferOptions(true);
        return;
      }

      // Step 3: Search OpenChain (but we know this gives only types, not parameter names)
      if (enableSignatureLookup) {
        addDecodingStep('🌐 Searching OpenChain database...');
        try {
          const openChainResult: SignatureResponse = await lookupFunctionSignatures([selector]);
          const signatures = openChainResult.result?.function?.[selector];
          
          if (signatures && signatures.length > 0) {
            const signature = signatures[0].name;
            addDecodingStep(`✓ Found on OpenChain: ${signature}`);
            addDecodingStep(`⚠️ Note: OpenChain only provides parameter types, not names`);
            
            const decoded = decodeWithSignature(calldata.trim(), signature);
            setDecodedResult(decoded);
            
            // Extract parameter names from signature if available (will be generic for OpenChain)
            const parameterInfo = parseSignatureParameters(signature);
            
            // Share decoded data with toolkit context
            toolkit.setDecodedTransaction({
              functionName: decoded.name,
              functionSignature: signature,
              parameters: decoded.args ? decoded.args.map((arg: any, index: number) => ({
                name: parameterInfo[index]?.name || `param_${index}`,
                type: parameterInfo[index]?.type || 'unknown',
                value: arg
              })) : [],
              calldata: calldata.trim()
            });
            
            // Show enhanced fallback options with ABI input suggestion
            setShowFallbackOptions(true);
            setShowTransferOptions(true);
            return;
          }
        } catch (openChainError) {
          addDecodingStep(`✗ OpenChain lookup failed: ${openChainError}`);
        }
      } else {
        addDecodingStep('🌐 Signature database lookup disabled - enable in advanced options');
      }

      // Step 4: Try heuristic decoding if enabled
      if (enableHeuristics) {
        addDecodingStep('🧠 Attempting heuristic decoding...');
        try {
          const heuristicResults = decodeWithHeuristics(calldata.trim());
          setHeuristicResult(heuristicResults);
          
          if (heuristicResults && heuristicResults.bestGuess) {
            addDecodingStep(`✓ Heuristic analysis complete (confidence: ${(heuristicResults.bestGuess.confidence * 100).toFixed(1)}%)`);
            addDecodingStep(`Best guess: ${heuristicResults.bestGuess.description}`);
            
            // Set the best guess as the decoded result
            setDecodedResult({
              name: heuristicResults.bestGuess.description.split('(')[0].trim(),
              signature: `${heuristicResults.bestGuess.description}`,
              args: heuristicResults.bestGuess.values || []
            });

            // Share with toolkit context
            toolkit.setDecodedTransaction({
              functionName: heuristicResults.bestGuess.description.split('(')[0].trim(),
              functionSignature: heuristicResults.bestGuess.description,
              parameters: (heuristicResults.bestGuess.values || []).map((arg: any, index: number) => ({
                name: `param_${index}`,
                type: heuristicResults.bestGuess.types?.[index] || 'unknown',
                value: arg
              })),
              calldata: calldata.trim()
            });
            
            if (heuristicResults.decodedAttempts && heuristicResults.decodedAttempts.length > 1) {
              setShowAlternativeResults(true);
              addDecodingStep(`📊 Found ${heuristicResults.decodedAttempts.length} alternative interpretations`);
            }
            
            setShowFallbackOptions(true);
            setShowTransferOptions(true);
            return;
          }
          
          addDecodingStep('⚠️ Heuristic analysis found no confident matches');
        } catch (heuristicError) {
          console.error('Heuristic decoding error:', heuristicError);
          addDecodingStep(`✗ Heuristic decoding failed: ${String(heuristicError)}`);
        }
      } else {
        addDecodingStep('🧠 Heuristic decoding disabled - enable in advanced options');
      }

      // Step 5: No automatic match found, show fallback options
      addDecodingStep('❓ No confident matches found - try manual ABI or adjust settings');
      setShowFallbackOptions(true);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsDecoding(false);
    }
  };

  const handleContractABIDecode = async () => {
    if (!contractAddress.trim()) {
      setError('Please enter a contract address');
      return;
    }

    setIsFetchingABI(true);
    setError(null);
    
    try {
      const selector = extractFunctionSelector(calldata);
      if (!selector) {
        throw new Error('Invalid calldata format');
      }

      addDecodingStep(`🔄 Fetching ABI for contract: ${contractAddress}`);
      const abi = await fetchABIWithConfirmation(contractAddress.trim());
      
      addDecodingStep('ABI fetched, searching for matching function...');
      const matchingFunction = findMatchingFunctionInABI(abi, selector);
      
      if (matchingFunction) {
        addDecodingStep(`✓ Found matching function: ${matchingFunction.signature}`);
        const decoded = decodeWithSignature(calldata, matchingFunction.signature);
        setDecodedResult(decoded);
        setShowFallbackOptions(false);
        
        // Share decoded data with toolkit context including contract address and ABI
        toolkit.setDecodedTransaction({
          functionName: decoded.name,
          functionSignature: matchingFunction.signature,
          contractAddress: contractAddress.trim(),
          parameters: matchingFunction.inputs ? matchingFunction.inputs.map((input: any, index: number) => ({
            name: input.name,
            type: input.type,
            value: decoded.args ? decoded.args[index] : undefined
          })) : [],
          abi,
          calldata: calldata.trim()
        });
        
        setShowTransferOptions(true);
        
      } else {
        // Get all available function signatures from ABI for better error message
        const availableFunctions = abi.filter((item: any) => item.type === 'function' && item.name)
          .map((item: any) => {
            try {
              const inputs = item.inputs?.map((input: any) => input.type).join(',') || '';
              const signature = `${item.name}(${inputs})`;
              const hash = ethers.utils.id(signature);
              const computedSelector = hash.slice(0, 10);
              return `${signature} → ${computedSelector}`;
            } catch {
              return `${item.name} → (invalid signature)`;
            }
          });
        
        const suggestion = suggestFunctionSignature(selector);
        const errorMsg = `No function with selector ${selector} found in contract ABI.\n\n` +
          `Looking for: ${suggestion}\n\n` +
          `Available functions in fetched ABI:\n${availableFunctions.map(f => `• ${f}`).join('\n')}\n\n` +
          `This might mean:\n` +
          `• The calldata is for a different contract\n` +
          `• The contract has multiple implementations\n` +
          `• The function is from a proxy or delegated contract`;
        
        throw new Error(errorMsg);
      }
      
    } catch (err: any) {
      setError(err.message);
      addDecodingStep(`✗ Contract ABI decode failed: ${err.message}`);
    } finally {
      setIsFetchingABI(false);
    }
  };

  const handleManualABIDecode = () => {
    if (!manualABI.trim()) {
      setError('Please provide an ABI');
      return;
    }

    try {
      const selector = extractFunctionSelector(calldata);
      if (!selector) {
        throw new Error('Invalid calldata format');
      }

      const abi = JSON.parse(manualABI);
      addDecodingStep('Using manual ABI, searching for matching function...');
      
      const matchingFunction = findMatchingFunctionInABI(abi, selector);
      if (matchingFunction) {
        addDecodingStep(`✓ Found matching function: ${matchingFunction.signature}`);
        const decoded = decodeWithSignature(calldata, matchingFunction.signature);
        setDecodedResult(decoded);
        setShowFallbackOptions(false);
        
        // Share decoded data with toolkit context
        toolkit.setDecodedTransaction({
          functionName: decoded.name,
          functionSignature: matchingFunction.signature,
          parameters: matchingFunction.inputs ? matchingFunction.inputs.map((input: any, index: number) => ({
            name: input.name,
            type: input.type,
            value: decoded.args ? decoded.args[index] : undefined
          })) : [],
          abi,
          calldata: calldata.trim()
        });
        
        setShowTransferOptions(true);
        
      } else {
        // Get all available function signatures from ABI for better error message
        const availableFunctions = abi.filter((item: any) => item.type === 'function' && item.name)
          .map((item: any) => {
            try {
              const inputs = item.inputs?.map((input: any) => input.type).join(',') || '';
              const signature = `${item.name}(${inputs})`;
              const hash = ethers.utils.id(signature);
              const computedSelector = hash.slice(0, 10);
              return `${signature} → ${computedSelector}`;
            } catch {
              return `${item.name} → (invalid signature)`;
            }
          });
        
        const suggestion = suggestFunctionSignature(selector);
        const errorMsg = `No function with selector ${selector} found in provided ABI.\n\n` +
          `Looking for: ${suggestion}\n\n` +
          `Available functions in ABI:\n${availableFunctions.map(f => `• ${f}`).join('\n')}\n\n` +
          `Make sure you're using the correct ABI that contains the function you're trying to decode.`;
        
        throw new Error(errorMsg);
      }
    } catch (err: any) {
      setError(err.message);
      addDecodingStep(`✗ Manual ABI decode failed: ${err.message}`);
    }
  };

  // Render heuristic analysis results with alternative decodings
  const renderHeuristicResults = () => {
    if (!heuristicResult || !heuristicResult.decodedAttempts) return null;

    return (
      <div style={{
        background: 'rgba(139, 92, 246, 0.05)',
        border: '1px solid rgba(139, 92, 246, 0.2)',
        borderRadius: '8px',
        padding: '16px',
        margin: '16px 0'
      }}>
        <h4 style={{ 
          color: '#8b5cf6', 
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Sparkles size={16} />
          Heuristic Analysis Results
        </h4>
        
        {heuristicResult.bestGuess && (
          <div style={{
            background: 'rgba(34, 197, 94, 0.05)',
            border: '1px solid rgba(34, 197, 94, 0.2)',
            borderRadius: '6px',
            padding: '12px',
            marginBottom: '16px'
          }}>
            <h5 style={{
              color: '#22c55e',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px'
            }}>
              <Zap size={14} />
              Best Guess ({(heuristicResult.bestGuess.confidence * 100).toFixed(1)}% confidence)
            </h5>
            
            <div style={{ marginBottom: '8px' }}>
              <strong style={{ color: '#374151' }}>Description:</strong>{' '}
              <code style={{ 
                background: 'rgba(34, 197, 94, 0.1)', 
                padding: '2px 6px', 
                borderRadius: '3px',
                fontSize: '12px'
              }}>
                {heuristicResult.bestGuess.description}
              </code>
            </div>
            
            <div style={{ marginBottom: '8px' }}>
              <strong style={{ color: '#374151' }}>Types:</strong>{' '}
              <span style={{ fontSize: '12px', color: '#6b7280' }}>
                [{(heuristicResult.bestGuess.types || []).join(', ')}]
              </span>
            </div>
            
            <div>
              <strong style={{ color: '#374151' }}>Values:</strong>
              <div style={{ marginTop: '8px' }}>
                {(heuristicResult.bestGuess.values || []).map((value, index) => (
                  <div key={index} style={{
                    marginBottom: '4px',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{ 
                      color: '#6b7280', 
                      fontWeight: '500',
                      minWidth: '40px'
                    }}>
                      [{index}]:
                    </span>
                    {Array.isArray(value) && value.length > 0 ? 
                      renderExpandableArray(value, `heuristic-best-${index}`, heuristicResult.bestGuess!.types?.[index] || 'unknown') :
                      <code style={{
                        background: 'rgba(34, 197, 94, 0.1)',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontSize: '11px',
                        fontFamily: 'Monaco, Menlo, monospace'
                      }}>
                        {formatParameterValue(value, heuristicResult.bestGuess!.types?.[index] || 'unknown')}
                      </code>
                    }
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {showAlternativeResults && heuristicResult.decodedAttempts && heuristicResult.decodedAttempts.length > 1 && (
          <div>
            <h5 style={{
              color: '#6b7280',
              marginBottom: '12px',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Building2 size={14} />
              Other Possibilities ({heuristicResult.decodedAttempts.length - 1} alternatives)
            </h5>
            
            {heuristicResult.decodedAttempts.slice(1).map((attempt, index) => (
              <details key={index} style={{
                background: 'rgba(107, 114, 128, 0.02)',
                border: '1px solid rgba(107, 114, 128, 0.1)',
                borderRadius: '6px',
                padding: '8px',
                marginBottom: '8px'
              }}>
                <summary style={{
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#6b7280',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span>
                    {attempt.description} ({(attempt.confidence * 100).toFixed(1)}% confidence)
                  </span>
                </summary>
                <div style={{ 
                  marginTop: '8px',
                  paddingLeft: '16px',
                  fontSize: '12px'
                }}>
                  <div style={{ marginBottom: '6px' }}>
                    <strong>Types:</strong> [{(attempt.types || []).join(', ')}]
                  </div>
                  <div>
                    <strong>Values:</strong>
                    <div style={{ marginTop: '4px' }}>
                      {(attempt.values || []).map((value, idx) => (
                        <div key={idx} style={{
                          marginBottom: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          <span style={{ 
                            color: '#9ca3af', 
                            fontWeight: '500',
                            minWidth: '30px'
                          }}>
                            [{idx}]:
                          </span>
                          {Array.isArray(value) && value.length > 0 ? 
                            renderExpandableArray(value, `heuristic-attempt-${index}-${idx}`, attempt.types?.[idx] || 'unknown') :
                            <code style={{
                              background: 'rgba(107, 114, 128, 0.1)',
                              padding: '2px 4px',
                              borderRadius: '3px',
                              fontSize: '10px',
                              fontFamily: 'Monaco, Menlo, monospace'
                            }}>
                              {formatParameterValue(value, attempt.types?.[idx] || 'unknown')}
                            </code>
                          }
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="smart-decoder">
      <div className="panel">
        <h2>Smart Transaction Decoder</h2>
        <p>Automatically finds function signatures and decodes calldata with multi-chain ABI lookup.</p>

        <div className="form-group">
          <label>Transaction Calldata</label>
          <textarea
            value={calldata}
            onChange={(e) => setCalldata(e.target.value)}
            placeholder="0xa9059cbb000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb70000000000000000000000000000000000000000000000000de0b6b3a7640000"
            rows={4}
            className="input-textarea"
          />
          <small>Paste the transaction calldata (with or without 0x prefix)</small>
        </div>

        <div className="form-group">
          <label>Contract Address (optional, for better parameter names)</label>
          <input
            type="text"
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value)}
            placeholder="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7"
            className="input-textarea"
          />
          <small>If provided, we'll fetch the verified ABI first for real parameter names</small>
        </div>

        {/* Advanced Options Panel */}
        <div className="form-group">
          <div className="action-bar" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 0',
            borderBottom: showAdvancedOptions ? '1px solid rgba(59, 130, 246, 0.2)' : 'none',
            marginBottom: showAdvancedOptions ? '12px' : '0'
          }}>
            <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>Advanced Options</span>
            <button 
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              style={{
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                color: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Settings size={14} />
              Settings {showAdvancedOptions ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          </div>

          {showAdvancedOptions && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '12px',
              padding: '12px',
              background: 'rgba(59, 130, 246, 0.02)',
              border: '1px solid rgba(59, 130, 246, 0.1)',
              borderRadius: '6px',
              marginBottom: '16px'
            }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={enableHeuristics}
                  onChange={(e) => setEnableHeuristics(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <Sparkles size={14} style={{ color: '#8b5cf6' }} />
                Enable heuristic decoding without ABI
              </label>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={enableSignatureLookup}
                  onChange={(e) => setEnableSignatureLookup(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <Search size={14} style={{ color: '#059669' }} />
                Enhanced signature database lookup
              </label>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={showAlternativeResults}
                  onChange={(e) => setShowAlternativeResults(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <Building2 size={14} style={{ color: '#dc2626' }} />
                Show alternative decoding results
              </label>
            </div>
          )}
        </div>

        <div className="button-group">
          <button
            onClick={handleSmartDecode}
            disabled={isDecoding}
            className="btn-primary"
          >
            {isDecoding ? 'Decoding...' : 'Decode Input Data'}
          </button>
        </div>
      </div>

      {/* Decoding Steps */}
      {decodingSteps.length > 0 && (
        <div className="result-section">
          <h4>Decoding Process:</h4>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#6b7280' }}>
            {decodingSteps.map((step, index) => (
              <li key={index} style={{ marginBottom: '4px' }}>{step}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Fallback Options */}
      {showFallbackOptions && (
        <div className="panel">
          {decodedResult ? (
            <>
              <h3>🔧 Improve Parameter Names</h3>
              <div style={{
                background: 'rgba(251, 146, 60, 0.1)',
                border: '1px solid rgba(251, 146, 60, 0.3)',
                borderRadius: '6px',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '13px',
                color: '#fb923c'
              }}>
                <strong>ℹ️ Function decoded successfully!</strong> However, we only have parameter types (not names) from the signature database. 
                To get real parameter names like "to", "amount", "spender" etc., provide the contract ABI below.
              </div>
            </>
          ) : (
            <>
              <h3>Additional Decoding Options</h3>
              <p>Function signature not found automatically. Try these options:</p>
            </>
          )}
          
          <div className="clean-card">
            <h4 style={{ fontSize: '14px', margin: '0 0 8px 0', fontWeight: '600' }}>
              {decodedResult ? '🎯 Get Real Parameter Names' : 'Option 1: Contract Address Search'}
            </h4>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 12px 0' }}>
              {decodedResult ? 
                'Enter the contract address to fetch verified ABI with real parameter names:' :
                'Search verified contracts across multiple blockchains:'
              }
            </p>
            <div className="form-group">
              <input
                type="text"
                value={contractAddress}
                onChange={(e) => setContractAddress(e.target.value)}
                placeholder="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7"
              />
            </div>
            <button
              onClick={handleContractABIDecode}
              disabled={isFetchingABI}
              className="btn-secondary"
              style={decodedResult ? { background: '#10b981', color: 'white', borderColor: '#10b981' } : {}}
            >
              {isFetchingABI ? 'Searching...' : decodedResult ? 'Fetch ABI & Re-decode' : 'Search Contract ABI'}
            </button>
            <small>Searches both Etherscan & Blockscout APIs across Ethereum, Base, Arbitrum, Optimism, Polygon, BSC, Avalanche, Fantom</small>
          </div>

          <div className="clean-card">
            <h4 style={{ fontSize: '14px', margin: '0 0 8px 0', fontWeight: '600' }}>
              {decodedResult ? '📋 Or Provide ABI Manually' : 'Option 2: Manual ABI'}
            </h4>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 12px 0' }}>
              {decodedResult ?
                'Paste the contract ABI to get real parameter names:' :
                'Paste the contract ABI JSON:'
              }
            </p>
            <div className="form-group">
              <textarea
                value={manualABI}
                onChange={(e) => setManualABI(e.target.value)}
                placeholder='[{"inputs":[{"name":"to","type":"address"},{"name":"amount","type":"uint256"}],"name":"transfer","type":"function"}]'
                rows={4}
              />
            </div>
            <button
              onClick={handleManualABIDecode}
              className="btn-secondary"
              style={decodedResult ? { background: '#10b981', color: 'white', borderColor: '#10b981' } : {}}
            >
              {decodedResult ? 'Re-decode with ABI' : 'Decode with Manual ABI'}
            </button>
          </div>
        </div>
      )}

      {/* Heuristic Results Display */}
      {heuristicResult && renderHeuristicResults()}

      {/* Results */}
      {decodedResult && (
        <div className="panel">
          <h3 style={{ color: '#059669', marginBottom: '16px' }}>✓ Successfully Decoded</h3>
          
          <div className="form-group">
            <label>Function Name:</label>
            <code style={{ 
              background: '#f3f4f6', 
              padding: '4px 8px', 
              borderRadius: '4px',
              fontSize: '13px',
              display: 'block',
              marginTop: '4px'
            }}>{decodedResult.name}</code>
          </div>
          
          <div className="form-group">
            <label>Function Signature:</label>
            <code style={{ 
              background: '#f3f4f6', 
              padding: '4px 8px', 
              borderRadius: '4px',
              fontSize: '13px',
              display: 'block',
              marginTop: '4px'
            }}>{decodedResult.signature}</code>
          </div>

          {decodedResult.args && decodedResult.args.length > 0 && (
            <div className="form-group">
              <label>Function Arguments:</label>
              
              <div className="button-group" style={{ marginBottom: '12px' }}>
                <button
                  className={viewMode === 'simple' ? 'active' : ''}
                  onClick={() => setViewMode('simple')}
                >
                  Simple View
                </button>
                <button
                  className={viewMode === 'advanced' ? 'active' : ''}
                  onClick={() => setViewMode('advanced')}
                >
                  JSON View
                </button>
                <button
                  className={viewMode === 'legacy' ? 'active' : ''}
                  onClick={() => setViewMode('legacy')}
                >
                  Structured View
                </button>
              </div>

              {viewMode === 'simple' && (
                <div className="etherscan-args-display">
                  {(() => {
                    
                    // Priority logic for parameter data:
                    // 1. ALWAYS use toolkit context data first (contains real ABI parameter names)
                    // 2. Only fallback to generic if toolkit data is missing or incomplete
                    
                    let parameterData: any[] = [];
                    
                    // Check if we have toolkit context data with real parameter names
                    const toolkitParams = toolkit.lastDecodedTransaction?.parameters;
                    if (toolkitParams && toolkitParams.length > 0) {
                      // Use toolkit data - it should have real parameter names from ABI
                      parameterData = toolkitParams;
                    }
                    // Fallback only if no toolkit data available
                    else if (decodedResult?.args) {
                      parameterData = decodedResult.args.map((arg: any, index: number) => ({
                        name: `param_${index}`,
                        type: getParameterType(arg),
                        value: arg
                      }));
                    }
                    
                    // Check if we have generic parameter names vs real names
                    const hasGenericNames = parameterData.some((param: any) => param.name.startsWith('param_'));
                    const hasRealNames = parameterData.some((param: any) => !param.name.startsWith('param_'));
                    
                    return (
                      <>
                        {/* Info header about parameter names */}
                        {hasGenericNames && !hasRealNames && (
                          <div style={{
                            background: 'rgba(251, 146, 60, 0.1)',
                            border: '1px solid rgba(251, 146, 60, 0.3)',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            marginBottom: '12px',
                            fontSize: '12px',
                            color: '#fb923c'
                          }}>
                            <strong>ℹ️ Note:</strong> Parameter names are generic because this was decoded using function signatures only. 
                            For real parameter names, use "Contract Address Search" or "Manual ABI" options above.
                          </div>
                        )}
                        
                        {hasRealNames && (
                          <div style={{
                            background: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid rgba(34, 197, 94, 0.3)',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            marginBottom: '12px',
                            fontSize: '12px',
                            color: '#22c55e'
                          }}>
                            <strong>✅ Great!</strong> Real parameter names detected from contract ABI.
                          </div>
                        )}

                        <div className="args-header" style={{ 
                          display: 'grid', 
                          gridTemplateColumns: '120px 80px 1fr', 
                          gap: '12px',
                          padding: '8px 0',
                          borderBottom: '1px solid rgba(59, 130, 246, 0.2)',
                          marginBottom: '12px',
                          fontSize: '12px',
                          fontWeight: '600',
                          color: '#9ca3af'
                        }}>
                          <span>Parameter Name</span>
                          <span>Type</span>
                          <span>Value</span>
                        </div>
                        
                        {parameterData.map((param: any, index: number) => {
                          const isExpandable = Array.isArray(param.value) && 
                            (param.type?.includes('tuple') || param.value.some((item: any) => Array.isArray(item)));
                          const isExpanded = expandedParams.has(index);
                          
                          return (
                            <div key={index}>
                              <div className="arg-row" style={{ 
                                display: 'grid', 
                                gridTemplateColumns: isExpandable ? '20px 100px 80px 1fr' : '120px 80px 1fr', 
                                gap: '12px',
                                padding: '8px 0',
                                borderBottom: '1px solid rgba(59, 130, 246, 0.1)',
                                alignItems: 'center',
                                fontSize: '13px'
                              }}>
                                {isExpandable && (
                                  <button
                                    onClick={() => toggleParamExpansion(index)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      color: '#3b82f6',
                                      padding: '2px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    }}
                                  >
                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                  </button>
                                )}
                                <span style={{ 
                                  color: param.name.startsWith('param_') ? '#fb923c' : '#3b82f6', 
                                  fontWeight: '500',
                                  fontStyle: param.name.startsWith('param_') ? 'italic' : 'normal'
                                }}>
                                  {param.name}
                                  {param.name.startsWith('param_') && (
                                    <span style={{ fontSize: '10px', marginLeft: '4px', color: '#9ca3af' }}>
                                      (generic)
                                    </span>
                                  )}
                                </span>
                                <span style={{ 
                                  color: '#9ca3af',
                                  fontSize: '12px',
                                  background: 'rgba(59, 130, 246, 0.1)',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontFamily: 'monospace'
                                }}>
                                  {param.type}
                                </span>
                                <div style={{ 
                                  background: 'rgba(59, 130, 246, 0.05)', 
                                  padding: '4px 8px', 
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  fontFamily: 'Monaco, Menlo, monospace',
                                  wordBreak: 'break-all',
                                  color: '#f9fafb'
                                }}>
                                  {Array.isArray(param.value) && param.value.length > 0 ? 
                                    renderExpandableArray(param.value, `param-${index}-value`, param.type) :
                                    formatParameterValue(param.value, param.type)
                                  }
                                  {isExpandable && (
                                    <span style={{ 
                                      fontSize: '10px', 
                                      color: '#9ca3af', 
                                      marginLeft: '8px',
                                      fontStyle: 'italic'
                                    }}>
                                      {isExpanded ? '(expanded below)' : '(click arrow to expand)'}
                                    </span>
                                  )}
                                </div>
                              </div>
                              
                              {/* Expanded details */}
                              {isExpandable && isExpanded && (
                                <div style={{
                                  marginLeft: '20px',
                                  marginTop: '8px',
                                  marginBottom: '12px',
                                  padding: '12px',
                                  background: 'rgba(59, 130, 246, 0.02)',
                                  border: '1px solid rgba(59, 130, 246, 0.1)',
                                  borderRadius: '6px'
                                }}>
                                  <div style={{ 
                                    fontSize: '11px', 
                                    color: '#6b7280', 
                                    marginBottom: '8px',
                                    fontWeight: '600'
                                  }}>
                                    Detailed Structure:
                                  </div>
                                  {(() => {
                                    // Extract ABI components for struct field information
                                    let abiComponents: any[] | undefined = undefined;
                                    
                                    try {
                                      // Try to get matching function from available ABI sources
                                      let matchingFunction: any = null;
                                      
                                      // Check toolkit context first
                                      if (toolkit.lastDecodedTransaction?.abi) {
                                        const abi = toolkit.lastDecodedTransaction.abi;
                                        matchingFunction = abi.find((item: any) => 
                                          item.type === 'function' && item.name === decodedResult.name
                                        );
                                      }
                                      // Fallback to manual ABI if available
                                      else if (manualABI) {
                                        const abi = JSON.parse(manualABI);
                                        matchingFunction = abi.find((item: any) => 
                                          item.type === 'function' && item.name === decodedResult.name
                                        );
                                      }
                                      
                                      if (matchingFunction && matchingFunction.inputs && matchingFunction.inputs[index]) {
                                        const paramInput = matchingFunction.inputs[index];
                                        if (paramInput?.components) {
                                          abiComponents = paramInput.components;
                                        }
                                      }
                                    } catch (error) {
                                      console.log('Could not extract ABI components:', error);
                                    }
                                    
                                    return renderTupleDetails(param.value, param.type, 0, abiComponents);
                                  })()}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              )}

              {viewMode === 'advanced' && (
                <div className="result-section">
                  {(() => {
                    // Get the same parameter data as simple view for consistency
                    let parameterData: any[] = [];
                    const toolkitParams = toolkit.lastDecodedTransaction?.parameters;
                    if (toolkitParams && toolkitParams.length > 0) {
                      // Use toolkit data - it should have real parameter names from ABI
                      parameterData = toolkitParams;
                    } else if (decodedResult?.args) {
                      parameterData = decodedResult.args.map((arg: any, index: number) => ({
                        name: `param_${index}`,
                        type: getParameterType(arg),
                        value: arg
                      }));
                    }
                    
                    return renderSimplifiedJsonView(decodedResult.args || [], parameterData);
                  })()}
                </div>
              )}

              {viewMode === 'legacy' && shouldUseComplexViewer(decodedResult.args) && (
                <div className="result-section">
                  {(() => {
                    // Get parameter data with proper names and types for structured view
                    let parameterData: any[] = [];
                    let paramNames: string[] = [];
                    let paramTypes: string[] = [];
                    
                    // Check if we have toolkit context data with real parameter names
                    const toolkitParams = toolkit.lastDecodedTransaction?.parameters;
                    if (toolkitParams && toolkitParams.length > 0) {
                      // Use toolkit data - it should have real parameter names from ABI
                      parameterData = toolkitParams.map(p => p.value);
                      paramNames = toolkitParams.map(p => p.name);
                      paramTypes = toolkitParams.map(p => p.type);
                    }
                    // Fallback to decodedResult args with generic names
                    else if (decodedResult?.args) {
                      parameterData = decodedResult.args;
                      paramNames = decodedResult.args.map((_: any, index: number) => `param_${index}`);
                      paramTypes = decodedResult.args.map((arg: any) => getParameterType(arg));
                    }
                    
                    return (
                      <DecodedDataViewer
                        data={parameterData}
                        paramNames={paramNames}
                        types={paramTypes}
                        functionName={decodedResult.name}
                        compact={true}
                      />
                    );
                  })()}
                </div>
              )}
            </div>
          )}
          
          {/* Transfer Options */}
          {showTransferOptions && (
            <div className="result-section">
              <h4>Use This Data</h4>
              <button 
                onClick={handleTransferToBuilder}
                className="btn-secondary"
                style={{ marginBottom: '8px' }}
              >
                Send to Transaction Builder
              </button>
              <small style={{ display: 'block', color: '#6b7280' }}>Create a similar transaction with modified parameters</small>
            </div>
          )}
        </div>
      )}

      {/* Contract Confirmation Dialog */}
      {contractConfirmation?.show && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(59, 130, 246, 0.2)'
          }}>
            <h3 style={{ 
              color: '#059669', 
              marginBottom: '16px', 
              fontSize: '18px',
              fontWeight: '600'
            }}>
              ✓ Verified Contract Found!
            </h3>
            
            <div style={{
              background: 'rgba(59, 130, 246, 0.05)',
              border: '1px solid rgba(59, 130, 246, 0.1)',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '20px'
            }}>
              <div style={{ fontSize: '14px', marginBottom: '8px' }}>
                <strong>Contract Address:</strong>
                <code style={{ 
                  marginLeft: '8px',
                  background: 'rgba(0, 0, 0, 0.1)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '12px'
                }}>
                  {contractConfirmation.contractInfo.address}
                </code>
              </div>
              <div style={{ fontSize: '14px', marginBottom: '8px' }}>
                <strong>Found on:</strong> {contractConfirmation.contractInfo.source}
              </div>
              <div style={{ fontSize: '14px', marginBottom: '8px' }}>
                <strong>Functions:</strong> {contractConfirmation.contractInfo.functions}
              </div>
              <div style={{ fontSize: '14px' }}>
                <strong>Events:</strong> {contractConfirmation.contractInfo.events}
              </div>
            </div>
            
            <p style={{ 
              fontSize: '14px', 
              color: '#6b7280', 
              marginBottom: '20px',
              lineHeight: '1.5'
            }}>
              Is this the contract you're looking for? Click "Use This Contract" to proceed with decoding, 
              or "Continue Searching" to check other block explorers.
            </p>
            
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={contractConfirmation.onContinueSearch}
                style={{
                  background: 'rgba(107, 114, 128, 0.1)',
                  border: '1px solid rgba(107, 114, 128, 0.3)',
                  borderRadius: '6px',
                  padding: '10px 16px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  color: '#6b7280'
                }}
              >
                Continue Searching
              </button>
              <button
                onClick={contractConfirmation.onConfirm}
                style={{
                  background: '#059669',
                  border: '1px solid #059669',
                  borderRadius: '6px',
                  padding: '10px 20px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  color: 'white',
                  fontWeight: '500'
                }}
              >
                Use This Contract
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Progress Display */}
      {currentSearchProgress.length > 0 && (
        <div style={{
          background: 'rgba(59, 130, 246, 0.05)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          borderRadius: '8px',
          padding: '16px',
          marginTop: '16px'
        }}>
          <h4 style={{ 
            color: '#3b82f6', 
            margin: '0 0 12px 0',
            fontSize: '14px',
            fontWeight: '600'
          }}>
            🔍 Searching Block Explorers...
          </h4>
          {currentSearchProgress.map((step, index) => (
            <div 
              key={index}
              style={{
                fontSize: '13px',
                color: step.startsWith('✓') ? '#059669' : step.startsWith('❌') ? '#dc2626' : '#6b7280',
                marginBottom: '4px',
                fontFamily: 'monospace'
              }}
            >
              {step}
            </div>
          ))}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="result-section" style={{ 
          background: '#fef2f2', 
          border: '1px solid #fecaca', 
          color: '#dc2626' 
        }}>
          <h4 style={{ color: '#dc2626', margin: '0 0 8px 0' }}>Error</h4>
          <p style={{ margin: 0, fontSize: '14px' }}>{error}</p>
        </div>
      )}
    </div>
  );
};

export default SmartDecoder;