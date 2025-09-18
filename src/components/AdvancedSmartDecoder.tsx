import React, { useState } from 'react';
import type { JSX } from 'react';
import { ethers } from 'ethers';
import { SettingsIcon, ChevronDownIcon, ChevronRightIcon, CheckCircleIcon, XCircleIcon, SearchIcon, CopyIcon } from './icons/IconLibrary';
import { 
  FileText, 
  Target, 
  BarChart3, 
  RotateCw,
  Building2
} from 'lucide-react';
import {
  lookupFunctionSignatures,
  getCachedSignatures,
  getCustomSignatures,
  type SignatureResponse
} from '../utils/signatureDatabase';
import { 
  decodeWithHeuristics, 
  detectStructPattern,
  type HeuristicDecodingResult,
  type DecodedParameter 
} from '../utils/advancedDecoder';
import { 
  formatEventLogValue,
  getEventDescription,
  type DecodedEventLog,
  type EventFilterCriteria 
} from '../utils/eventLogDecoder';
import DecodedDataViewer from './DecodedDataViewer';
import AdvancedJsonEditor from './AdvancedJsonEditor';
import { useToolkit } from '../contexts/ToolkitContext';
import '../styles/AdvancedJsonEditor.css';

const AdvancedSmartDecoder: React.FC = () => {
  const toolkit = useToolkit();
  
  // Main decoding state
  const [activeTab, setActiveTab] = useState<'calldata' | 'events'>('calldata');
  const [calldata, setCalldata] = useState('');
  const [decodedResult, setDecodedResult] = useState<any>(null);
  const [heuristicResult, setHeuristicResult] = useState<HeuristicDecodingResult | null>(null);
  const [isDecoding, setIsDecoding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decodingSteps, setDecodingSteps] = useState<string[]>([]);
  
  // Advanced options
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [enableHeuristics, setEnableHeuristics] = useState(true);
  const [enableStructVisualization, setEnableStructVisualization] = useState(true);
  const [enableArrayHelpers, setEnableArrayHelpers] = useState(true);
  
  // Event filtering state
  const [eventLogs] = useState<DecodedEventLog[]>([]);
  const [eventFilter, setEventFilter] = useState<EventFilterCriteria>({});
  
  // Expandable values state
  const [expandedValues, setExpandedValues] = useState<Set<string>>(new Set());
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  
  // View mode for decoded results
  const [viewMode, setViewMode] = useState<'advanced' | 'legacy' | 'simple'>('advanced');
  
  // Transfer options state  
  const [showTransferOptions, setShowTransferOptions] = useState(false);

  const addDecodingStep = (step: string) => {
    setDecodingSteps(prev => [...prev, step]);
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
      console.log(`Copied ${label} to clipboard`);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const resetDecodingState = () => {
    setDecodedResult(null);
    setHeuristicResult(null);
    setError(null);
    setDecodingSteps([]);
    setShowTransferOptions(false);
  };

  const shouldUseComplexViewer = (args: any[]): boolean => {
    // Use complex viewer if:
    // 1. More than 3 parameters
    // 2. Any parameter is an array
    // 3. Any parameter looks like encoded data (long hex strings)
    // 4. Combined string length of all parameters > 150 characters
    
    if (args.length > 3) return true;
    
    const totalStringLength = args.reduce((acc, arg) => {
      return acc + String(arg).length;
    }, 0);
    
    if (totalStringLength > 150) return true;
    
    return args.some(arg => {
      // Check if it's an array
      if (Array.isArray(arg)) return true;
      
      // Check for long hex strings (likely encoded data)
      const str = String(arg);
      if (str.startsWith('0x') && str.length > 50) return true;
      
      // Check if it looks like a long comma-separated list
      if (str.includes(',') && str.split(',').length > 6) return true;
      
      return false;
    });
  };

  const handleTransferToBuilder = () => {
    if (toolkit.lastDecodedTransaction) {
      toolkit.transferToTransactionBuilder(toolkit.lastDecodedTransaction);
      setShowTransferOptions(false);
      addDecodingStep('✓ Transaction data transferred to Transaction Builder!');
    }
  };

  // Helper function to detect parameter type from value
  const getParameterType = (value: any, knownType?: string): string => {
    if (knownType && knownType !== 'unknown') return knownType;
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
  const formatParameterValueEtherscan = (value: any): string => {
    if (value === null || value === undefined) return 'null';
    
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
    
    // Format bytes data
    if (str.startsWith('0x') && str.length > 42) {
      return `${str.slice(0, 10)}...${str.slice(-8)} (${(str.length - 2) / 2} bytes)`;
    }
    
    // Format arrays
    if (Array.isArray(value)) {
      if (value.length <= 3) {
        return `[${value.map(v => String(v)).join(', ')}]`;
      } else {
        return `[${value.slice(0, 2).map(v => String(v)).join(', ')}, ... +${value.length - 2} more]`;
      }
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

  const handleAdvancedDecode = async () => {
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

      // Step 1: Check custom/cached signatures
      addDecodingStep('Searching custom signatures...');
      const customSignature = searchCustomSignatures(selector);
      if (customSignature) {
        addDecodingStep(`✓ Found in custom signatures: ${customSignature}`);
        const decoded = decodeWithSignature(calldata.trim(), customSignature);
        
        // Enhanced parameter visualization
        const enhancedParams = enhanceParameterVisualization(decoded, customSignature);
        setDecodedResult({ ...decoded, enhancedParams });
        
        // Share decoded data with toolkit context
        toolkit.setDecodedTransaction({
          functionName: decoded.name,
          functionSignature: customSignature,
          parameters: enhancedParams,
          calldata: calldata.trim()
        });
        
        setShowTransferOptions(true);
        return;
      }

      // Step 2: Search OpenChain
      addDecodingStep('🌐 Searching OpenChain database...');
      try {
        const openChainResult: SignatureResponse = await lookupFunctionSignatures([selector]);
        const signatures = openChainResult.result?.function?.[selector];
        
        if (signatures && signatures.length > 0) {
          const signature = signatures[0].name;
          addDecodingStep(`✓ Found on OpenChain: ${signature}`);
          const decoded = decodeWithSignature(calldata.trim(), signature);
          
          // Enhanced parameter visualization
          const enhancedParams = enhanceParameterVisualization(decoded, signature);
          setDecodedResult({ ...decoded, enhancedParams });
          
          // Share decoded data with toolkit context
          toolkit.setDecodedTransaction({
            functionName: decoded.name,
            functionSignature: signature,
            parameters: enhancedParams,
            calldata: calldata.trim()
          });
          
          setShowTransferOptions(true);
          return;
        }
      } catch (openChainError) {
        addDecodingStep(`✗ OpenChain lookup failed: ${openChainError}`);
      }

      // Step 3: Use heuristic decoding if enabled
      if (enableHeuristics) {
        addDecodingStep('🧠 Attempting heuristic decoding...');
        try {
          const heuristicResults = decodeWithHeuristics(calldata.trim());
          setHeuristicResult(heuristicResults);
          
          if (heuristicResults && heuristicResults.bestGuess) {
            addDecodingStep(`Best guess: ${heuristicResults.bestGuess.description} (confidence: ${(heuristicResults.bestGuess.confidence * 100).toFixed(1)}%)`);
          }
          
          addDecodingStep(`Generated ${heuristicResults?.decodedAttempts?.length || 0} possible decodings`);
        } catch (heuristicError) {
          console.error('Heuristic decoding error:', heuristicError);
          addDecodingStep(`✗ Heuristic decoding failed: ${String(heuristicError)}`);
          setHeuristicResult(null);
        }
      }

      // Step 4: Show message if no results
      if (!heuristicResult?.bestGuess) {
        addDecodingStep('❓ Function signature not found in databases - try heuristic results above');
      }
      
    } catch (err: any) {
      console.error('Advanced decode error:', err);
      setError(err.message || String(err));
      if (err.message && err.message.includes('Cannot read prop')) {
        setComponentError('Component state error - please refresh');
      }
    } finally {
      setIsDecoding(false);
    }
  };

  const enhanceParameterVisualization = (decoded: any, signature: string): DecodedParameter[] => {
    if (!decoded.args) return [];

    // Parse function signature to get parameter names and types
    const parameterInfo = parseSignatureParameters(signature);
    
    return decoded.args.map((arg: any, index: number) => {
      const paramInfo = parameterInfo[index] || { name: `arg${index}`, type: 'unknown' };
      const isArray = Array.isArray(arg);
      
      const param: DecodedParameter = {
        name: paramInfo.name,
        type: paramInfo.type,
        value: arg,
        rawValue: arg?.toString(),
        isArray,
        arrayLength: isArray ? arg.length : undefined
      };

      // Detect if this might be a struct
      if (enableStructVisualization && detectStructPattern([arg], [paramInfo.type])) {
        // This is a simplified struct detection - in practice you'd need ABI info
        param.struct = [{
          name: 'value',
          type: paramInfo.type,
          value: arg
        }];
      }

      return param;
    });
  };

  const renderHeuristicResults = () => {
    if (!heuristicResult || !heuristicResult.decodedAttempts) return null;

    return (
      <div className="heuristic-results">
        <h4>🧠 Heuristic Analysis</h4>
        
        {heuristicResult.bestGuess && (
          <div className="best-guess">
            <h5><Target size={16} className="inline mr-2" />Best Guess ({(heuristicResult.bestGuess.confidence * 100).toFixed(1)}% confidence)</h5>
            <div className="guess-details">
              <div><strong>Description:</strong> {heuristicResult.bestGuess.description}</div>
              <div><strong>Types:</strong> [{(heuristicResult.bestGuess.types || []).join(', ')}]</div>
              <div className="decoded-values">
                <strong>Values:</strong>
                {shouldUseComplexViewer(heuristicResult.bestGuess.values || []) ? (
                  <DecodedDataViewer
                    data={heuristicResult.bestGuess.values || []}
                    types={heuristicResult.bestGuess.types || []}
                    functionName="Best Guess"
                    compact={true}
                  />
                ) : (
                  (heuristicResult.bestGuess.values || []).map((value, index) => (
                    <div key={index} className="decoded-value">
                      <span style={{ color: '#6b7280', fontWeight: '500' }}>[{index}]: </span>
                      {Array.isArray(value) && value.length > 0 ? 
                        renderExpandableArray(value, `heuristic-best-${index}`, heuristicResult.bestGuess!.types?.[index] || 'unknown') :
                        <code>{formatParameterValue(value, heuristicResult.bestGuess!.types?.[index] || 'unknown')}</code>
                      }
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <div className="all-attempts">
          <h5>🎲 Other Possibilities</h5>
          {(heuristicResult.decodedAttempts || []).slice(1).map((attempt, index) => (
            <details key={index} className="attempt-details">
              <summary>
                {attempt.description} ({(attempt.confidence * 100).toFixed(1)}% confidence)
              </summary>
              <div className="attempt-content">
                <div><strong>Types:</strong> [{(attempt.types || []).join(', ')}]</div>
                <div className="decoded-values">
                  <strong>Values:</strong>
                  {shouldUseComplexViewer(attempt.values || []) ? (
                    <DecodedDataViewer
                      data={attempt.values || []}
                      types={attempt.types || []}
                      functionName={`Attempt ${index + 2}`}
                      compact={true}
                    />
                  ) : (
                    (attempt.values || []).map((value, idx) => (
                      <div key={idx} className="decoded-value">
                        <span style={{ color: '#6b7280', fontWeight: '500' }}>[{idx}]: </span>
                        {Array.isArray(value) && value.length > 0 ? 
                          renderExpandableArray(value, `heuristic-attempt-${index}-${idx}`, attempt.types?.[idx] || 'unknown') :
                          <code>{formatParameterValue(value, attempt.types?.[idx] || 'unknown')}</code>
                        }
                      </div>
                    ))
                  )}
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>
    );
  };

  // Component for rendering expandable arrays with copy functionality
  const renderExpandableArray = (value: any[], valueId: string, type?: string): JSX.Element => {
    const isExpanded = expandedValues.has(valueId);
    const showExpandButton = value.length > 3;
    
    if (!showExpandButton) {
      // Small arrays - show all items with copy button
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>
            [{value.map(v => Array.isArray(v) ? `[Array of ${v.length} items]` : formatSingleValue(v, type?.replace('[]', '') || '')).join(', ')}]
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
            <CopyIcon width={12} height={12} />
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
            {isExpanded ? <ChevronDownIcon width={12} height={12} /> : <ChevronRightIcon width={12} height={12} />}
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
            <CopyIcon width={12} height={12} />
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
                  {Array.isArray(item) ? `[Array of ${item.length} items]` : formatSingleValue(item, type?.replace('[]', '') || '')}
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
                  <CopyIcon width={10} height={10} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: '12px', fontFamily: 'Monaco, Menlo, monospace' }}>
            [{value.slice(0, 2).map(v => Array.isArray(v) ? `[Array of ${v.length} items]` : formatSingleValue(v, type?.replace('[]', '') || '')).join(', ')}, ... +{value.length - 2} more]
          </span>
        )}
      </div>
    );
  };

  const formatParameterValue = (value: any, type: string): string => {
    if (enableArrayHelpers && Array.isArray(value)) {
      if (value.length <= 3) {
        return `[${value.map(v => formatSingleValue(v, type.replace('[]', ''))).join(', ')}]`;
      } else {
        return `[${value.slice(0, 2).map(v => formatSingleValue(v, type.replace('[]', ''))).join(', ')}, ... +${value.length - 2} more]`;
      }
    }
    
    return formatSingleValue(value, type);
  };

  const formatSingleValue = (value: any, type: string): string => {
    try {
      if (value === null || value === undefined) return 'null';
      
      if (type === 'address') {
        return value.toString();
      }
      
      if (type.includes('uint') || type.includes('int')) {
        try {
          const bn = ethers.BigNumber.from(value);
          const valueStr = bn.toString();
          
          // Check if it might be a timestamp
          const now = Math.floor(Date.now() / 1000);
          if (bn.gte(1000000000) && bn.lt(now + 86400 * 365)) {
            const date = new Date(parseInt(valueStr) * 1000);
            return `${valueStr} (${date.toISOString()})`;
          }
          
          return valueStr;
        } catch (bnError) {
          return value.toString();
        }
      }
      
      if (type.includes('bytes')) {
        const str = value.toString();
        if (str.length > 42) {
          return `${str.slice(0, 42)}... (${(str.length - 2) / 2} bytes)`;
        }
        return str;
      }
      
      return value.toString();
    } catch (error) {
      console.warn('Error formatting value:', error);
      return String(value || 'unknown');
    }
  };

  // Event log functionality would go here - simplified for space
  const handleEventSearch = async () => {
    // Implementation for event log search
    setIsLoadingEvents(true);
    // ... event search logic
    setIsLoadingEvents(false);
  };

  // Error boundary check
  const [componentError, setComponentError] = useState<string | null>(null);
  
  if (componentError) {
    return (
      <div className="advanced-smart-decoder">
        <h2>🧠 Advanced Smart Decoder</h2>
        <div className="error-message">
          <XCircleIcon width={16} height={16} className="inline mr-2 text-red-500" />Component error: {componentError}
          <br />
          <button onClick={() => { setComponentError(null); window.location.reload(); }}>
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="advanced-smart-decoder">
      <h2>🧠 Advanced Smart Decoder</h2>
      <p>Enhanced decoder with heuristic analysis, struct visualization, and event log filtering.</p>

      <nav className="decoder-tabs">
        <button
          className={activeTab === 'calldata' ? 'active' : ''}
          onClick={() => setActiveTab('calldata')}
        >
          Calldata Decoding
        </button>
        <button
          className={activeTab === 'events' ? 'active' : ''}
          onClick={() => setActiveTab('events')}
        >
          Event Log Analysis
        </button>
      </nav>

      {activeTab === 'calldata' && (
        <div className="calldata-decoder">
          {/* Form Section - Organized Layout */}
          <div className="form-section">
            <h3>Advanced Calldata Decoder</h3>
            
            {/* Advanced Options in Horizontal Pane */}
            <div className="action-bar">
              <span className="title">Advanced Options</span>
              <div className="actions">
                <button 
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                  className="control-btn"
                >
                  <SettingsIcon width={16} height={16} style={{ marginRight: '6px' }} />Settings {showAdvancedOptions ? <ChevronDownIcon width={12} height={12} /> : <ChevronRightIcon width={12} height={12} />}
                </button>
              </div>
            </div>

            {showAdvancedOptions && (
              <div className="grid-container grid-3-col">
                <label>
                  <input
                    type="checkbox"
                    checked={enableHeuristics}
                    onChange={(e) => setEnableHeuristics(e.target.checked)}
                  />
                  Enable heuristic decoding without ABI
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={enableStructVisualization}
                    onChange={(e) => setEnableStructVisualization(e.target.checked)}
                  />
                  Enhanced struct visualization
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={enableArrayHelpers}
                    onChange={(e) => setEnableArrayHelpers(e.target.checked)}
                  />
                  Advanced array and mapping helpers
                </label>
              </div>
            )}

            <div className="input-group vertical">
              <label>Transaction Calldata</label>
              <textarea
                value={calldata}
                onChange={(e) => setCalldata(e.target.value)}
                placeholder="0xa9059cbb000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb70000000000000000000000000000000000000000000000000de0b6b3a7640000"
                rows={3}
              />
              <small>Paste transaction calldata for advanced analysis</small>
            </div>

            <div className="button-group center">
              <button 
                onClick={handleAdvancedDecode} 
                disabled={isDecoding}
                className="decode-btn advanced-decode-btn"
              >
                {isDecoding ? '🔄 Analyzing...' : '🧠 Advanced Decode'}
              </button>
            </div>
          </div>

          {/* Decoding Steps */}
          {decodingSteps.length > 0 && (
            <div className="decoding-steps">
              <h4><SearchIcon width={16} height={16} style={{display: 'inline', marginRight: '8px'}} />Analysis Process:</h4>
              <ul>
                {decodingSteps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Standard Decode Results */}
          {decodedResult && (
            <div className="decode-result">
              <h3><CheckCircleIcon width={20} height={20} className="inline mr-2 text-green-500" />Successfully Decoded</h3>
              <div className="result-section">
                <div className="result-field">
                  <label>Function:</label>
                  <code>{decodedResult.name}</code>
                </div>
                <div className="result-field">
                  <label>Signature:</label>
                  <code>{decodedResult.signature}</code>
                </div>
                {decodedResult.enhancedParams && decodedResult.enhancedParams.length > 0 ? (
                  <div className="result-field">
                    <div className="action-bar">
                      <span className="title">Enhanced Parameters</span>
                      <div className="actions button-group">
                        <button
                          className={viewMode === 'advanced' ? 'active' : ''}
                          onClick={() => setViewMode('advanced')}
                        >
                          <FileText size={16} className="inline mr-2" />JSON Editor
                        </button>
                        <button
                          className={viewMode === 'legacy' ? 'active' : ''}
                          onClick={() => setViewMode('legacy')}
                        >
                          <Building2 size={16} className="inline mr-2" />Structure View
                        </button>
                        <button
                          className={viewMode === 'simple' ? 'active' : ''}
                          onClick={() => setViewMode('simple')}
                        >
                          <CopyIcon width={16} height={16} style={{display: 'inline', marginRight: '8px'}} />Simple List
                        </button>
                      </div>
                    </div>

                    {viewMode === 'advanced' && (
                      <AdvancedJsonEditor
                        data={decodedResult.enhancedParams?.map((param: DecodedParameter) => param.value) || []}
                        onChange={() => {}} // Read-only for decoder results
                        functionInputs={decodedResult.enhancedParams?.map((param: DecodedParameter) => ({
                          name: param.name,
                          type: param.type
                        }))}
                        title="Enhanced Parameters"
                        className="decoder-json-editor"
                      />
                    )}

                    {viewMode === 'legacy' && (
                      <div className="enhanced-params">
                        <DecodedDataViewer
                          data={decodedResult.enhancedParams.map((param: DecodedParameter) => param.value)}
                          types={decodedResult.enhancedParams.map((param: DecodedParameter) => param.type)}
                          paramNames={decodedResult.enhancedParams.map((param: DecodedParameter) => param.name)}
                          functionName={decodedResult.name}
                          compact={false}
                        />
                      </div>
                    )}

                    {viewMode === 'simple' && (
                      <div className="etherscan-args-display">
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
                        {decodedResult.enhancedParams.map((param: DecodedParameter, index: number) => (
                          <div key={index} className="arg-row" style={{ 
                            display: 'grid', 
                            gridTemplateColumns: '120px 80px 1fr', 
                            gap: '12px',
                            padding: '8px 0',
                            borderBottom: '1px solid rgba(59, 130, 246, 0.1)',
                            alignItems: 'center',
                            fontSize: '13px'
                          }}>
                            <span style={{ color: '#3b82f6', fontWeight: '500' }}>
                              {param.name || `param_${index}`}
                            </span>
                            <span style={{ 
                              color: '#9ca3af',
                              fontSize: '12px',
                              background: 'rgba(59, 130, 246, 0.1)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontFamily: 'monospace'
                            }}>
                              {getParameterType(param.value, param.type)}
                            </span>
                            <code style={{ 
                              background: 'rgba(59, 130, 246, 0.05)', 
                              padding: '4px 8px', 
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontFamily: 'Monaco, Menlo, monospace',
                              wordBreak: 'break-all',
                              color: '#f9fafb'
                            }}>
                              {Array.isArray(param.value) && param.value.length > 0 ? 
                                renderExpandableArray(param.value, `decoded-param-${index}`, param.type) :
                                formatParameterValueEtherscan(param.value)
                              }
                            </code>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : decodedResult.args && decodedResult.args.length > 0 && (
                  <div className="result-field">
                    <div className="action-bar">
                      <span className="title">Function Arguments</span>
                      <div className="actions button-group">
                        <button
                          className={viewMode === 'advanced' ? 'active' : ''}
                          onClick={() => setViewMode('advanced')}
                        >
                          <FileText size={16} className="inline mr-2" />JSON Editor
                        </button>
                        <button
                          className={viewMode === 'legacy' ? 'active' : ''}
                          onClick={() => setViewMode('legacy')}
                        >
                          <Building2 size={16} className="inline mr-2" />Structure View
                        </button>
                        <button
                          className={viewMode === 'simple' ? 'active' : ''}
                          onClick={() => setViewMode('simple')}
                        >
                          <CopyIcon width={16} height={16} style={{display: 'inline', marginRight: '8px'}} />Simple List
                        </button>
                      </div>
                    </div>

                    {viewMode === 'advanced' && (
                      <AdvancedJsonEditor
                        data={decodedResult.args || []}
                        onChange={() => {}} // Read-only for decoder results
                        functionInputs={[]}
                        title="Function Arguments"
                        className="decoder-json-editor"
                      />
                    )}

                    {viewMode === 'legacy' && (
                    <div className="function-arguments">
                      {shouldUseComplexViewer(decodedResult.args) ? (
                        <div className="complex-viewer-wrapper">
                          <DecodedDataViewer
                            data={decodedResult.args}
                            functionName={decodedResult.name}
                            compact={false}
                          />
                        </div>
                      ) : (
                        <div className="simple-args">
                          {decodedResult.args.map((arg: any, index: number) => (
                            <div key={index} className="simple-arg">
                              <span className="arg-index">[{index}]</span>
                              <code className="arg-value">{formatSingleValue(arg, 'unknown')}</code>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    )}

                    {viewMode === 'simple' && (
                      <div className="etherscan-args-display">
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
                        {decodedResult.args.map((arg: any, index: number) => (
                          <div key={index} className="arg-row" style={{ 
                            display: 'grid', 
                            gridTemplateColumns: '120px 80px 1fr', 
                            gap: '12px',
                            padding: '8px 0',
                            borderBottom: '1px solid rgba(59, 130, 246, 0.1)',
                            alignItems: 'center',
                            fontSize: '13px'
                          }}>
                            <span style={{ color: '#3b82f6', fontWeight: '500' }}>
                              param_{index}
                            </span>
                            <span style={{ 
                              color: '#9ca3af',
                              fontSize: '12px',
                              background: 'rgba(59, 130, 246, 0.1)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontFamily: 'monospace'
                            }}>
                              {getParameterType(arg)}
                            </span>
                            <code style={{ 
                              background: 'rgba(59, 130, 246, 0.05)', 
                              padding: '4px 8px', 
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontFamily: 'Monaco, Menlo, monospace',
                              wordBreak: 'break-all',
                              color: '#f9fafb'
                            }}>
                              {Array.isArray(arg) && arg.length > 0 ? 
                                renderExpandableArray(arg, `decoded-arg-${index}`, 'unknown') :
                                formatParameterValueEtherscan(arg)
                              }
                            </code>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Heuristic Results */}
          {renderHeuristicResults()}

          {/* Transfer Options */}
          {showTransferOptions && (
            <div className="form-section">
              <h3>🔗 Use This Data</h3>
              <p>Transfer decoded data to other tools:</p>
              <div className="horizontal-pane center">
                <button 
                  onClick={handleTransferToBuilder}
                  className="sample-btn"
                >
                  🔨 Send to Transaction Builder
                </button>
                <small>Create a similar transaction with modified parameters</small>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="error-message">
              <XCircleIcon width={16} height={16} className="inline mr-2 text-red-500" />{error}
            </div>
          )}
        </div>
      )}

      {activeTab === 'events' && (
        <div className="event-decoder">
          <div className="form-section">
            <h3><FileText size={20} className="inline mr-2" />Event Log Analysis</h3>
            <p>Search and decode event logs from smart contracts.</p>
            
            <div className="input-group horizontal">
              <div className="form-group">
                <label>Contract Address</label>
                <input
                  type="text"
                  value={eventFilter.contractAddress || ''}
                  onChange={(e) => setEventFilter({...eventFilter, contractAddress: e.target.value})}
                  placeholder="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7"
                />
              </div>
              
              <button 
                onClick={handleEventSearch}
                disabled={isLoadingEvents}
                className="event-search-btn"
              >
                {isLoadingEvents ? <><RotateCw size={16} className="inline mr-2 animate-spin" />Searching...</> : <><SearchIcon width={16} height={16} style={{display: 'inline', marginRight: '8px'}} />Search Events</>}
              </button>
            </div>
          </div>

          {eventLogs.length > 0 && (
            <div className="event-results">
              <h4><BarChart3 size={16} className="inline mr-2" />Found {eventLogs.length} Events</h4>
              {eventLogs.map((log, index) => (
                <div key={index} className="event-log">
                  <div className="event-header">
                    <span className="event-name">{log.eventName}</span>
                    <span className="event-block">Block {log.blockNumber}</span>
                  </div>
                  <div className="event-description">
                    {getEventDescription(log.eventName, log.args)}
                  </div>
                  <div className="event-args">
                    {log.args.map((arg, argIndex) => (
                      <div key={argIndex} className="event-arg">
                        <span className="arg-name">{arg.name} ({arg.indexed ? 'indexed' : 'data'}):</span>
                        <code className="arg-value">{formatEventLogValue(arg.value, arg.type)}</code>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdvancedSmartDecoder;