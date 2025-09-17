import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { CheckCircle, XCircle, Copy, ChevronDown, ChevronRight } from 'lucide-react';
import { Input, Button, LoadingSpinner, ErrorDisplay, Card } from '../shared';
import {
  lookupFunctionSignatures,
  getCachedSignatures,
  getCustomSignatures,
  type SignatureResponse,
  type CustomSignature
} from '../../utils/signatureDatabase';
import { 
  decodeWithHeuristics,
  type HeuristicDecodingResult,
  type DecodedParameter 
} from '../../utils/advancedDecoder';
import '../../styles/SharedComponents.css';

export interface CalldataDecoderProps {
  /** Input calldata to decode */
  calldata?: string;
  /** Callback when calldata is decoded successfully */
  onDecoded?: (result: DecodingResult) => void;
  /** Callback when decoding fails */
  onError?: (error: string) => void;
  /** Whether to show advanced decoding options */
  showAdvancedOptions?: boolean;
  /** Custom ABI to use for decoding */
  customABI?: string;
  /** Contract address for ABI fetching */
  contractAddress?: string;
  /** Additional CSS classes */
  className?: string;
}

export interface DecodingResult {
  success: boolean;
  functionName?: string;
  signature?: string;
  selector?: string;
  args?: any[];
  decodedData?: any;
  source?: 'custom' | 'openchain' | 'manual' | 'heuristic';
  steps?: string[];
}

const CalldataDecoder: React.FC<CalldataDecoderProps> = ({
  calldata: initialCalldata = '',
  onDecoded,
  onError,
  showAdvancedOptions = false,
  customABI = '',
  contractAddress = '',
  className = ''
}) => {
  const [calldata, setCalldata] = useState(initialCalldata);
  const [isDecoding, setIsDecoding] = useState(false);
  const [decodingResult, setDecodingResult] = useState<DecodingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decodingSteps, setDecodingSteps] = useState<string[]>([]);
  const [expandedValues, setExpandedValues] = useState<Set<string>>(new Set());
  const [enableHeuristics, setEnableHeuristics] = useState(true);
  const [enableSignatureLookup, setEnableSignatureLookup] = useState(true);

  // Update calldata when prop changes
  useEffect(() => {
    setCalldata(initialCalldata);
  }, [initialCalldata]);

  const addDecodingStep = (step: string) => {
    setDecodingSteps(prev => [...prev, step]);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      console.log(`Copied ${label} to clipboard`);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
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

  // Search custom signatures
  const searchCustomSignatures = (selector: string): string | null => {
    try {
      const cached = getCachedSignatures();
      const custom = getCustomSignatures();
      
      // Search cached signatures (if it's an array)
      if (Array.isArray(cached)) {
        for (const sig of cached) {
          if (sig.selector === selector) {
            return sig.signature;
          }
        }
      }
      
      // Search custom signatures
      if (Array.isArray(custom)) {
        for (const sig of custom) {
          if (sig.hash === selector) { // Custom signatures use 'hash' property
            return sig.signature;
          }
        }
      }
    } catch (error) {
      console.warn('Failed to search custom signatures:', error);
    }
    
    return null;
  };

  // Decode with signature
  const decodeWithSignature = (calldata: string, signature: string) => {
    try {
      const iface = new ethers.utils.Interface([`function ${signature}`]);
      const decoded = iface.parseTransaction({ data: calldata });
      return {
        name: decoded.name,
        args: decoded.args
      };
    } catch (error) {
      throw new Error(`Failed to decode with signature "${signature}": ${error}`);
    }
  };

  // Detect and decode calldata
  const detectAndDecodeCalldata = async (calldataInput: string): Promise<DecodingResult> => {
    const cleanCalldata = calldataInput.startsWith('0x') ? calldataInput : `0x${calldataInput}`;
    
    // Validate hex string and minimum length
    if (!/^0x[a-fA-F0-9]{8,}$/.test(cleanCalldata)) {
      throw new Error('Invalid calldata format. Must be a hex string with at least 4 bytes.');
    }
    
    const selector = cleanCalldata.slice(0, 10);
    addDecodingStep(`🎯 Extracted function selector: ${selector}`);
    
    // Try custom signatures first
    if (enableSignatureLookup) {
      addDecodingStep('🔍 Searching custom signatures...');
      const customSignature = searchCustomSignatures(selector);
      if (customSignature) {
        addDecodingStep(`✅ Found in custom signatures: ${customSignature}`);
        try {
          const decoded = decodeWithSignature(cleanCalldata, customSignature);
          return {
            success: true,
            functionName: decoded.name,
            signature: customSignature,
            selector,
            args: Array.from(decoded.args),
            source: 'custom',
            steps: decodingSteps
          };
        } catch (error) {
          addDecodingStep(`❌ Custom signature failed: ${error}`);
        }
      }
    }
    
    // Try OpenChain lookup
    if (enableSignatureLookup) {
      addDecodingStep('🌐 Searching OpenChain database...');
      try {
        const openChainResult: SignatureResponse = await lookupFunctionSignatures([selector]);
        const signatures = openChainResult.result?.function?.[selector];
        
        if (signatures && signatures.length > 0) {
          const signature = signatures[0].name;
          addDecodingStep(`✅ Found on OpenChain: ${signature}`);
          
          try {
            const decoded = decodeWithSignature(cleanCalldata, signature);
            return {
              success: true,
              functionName: decoded.name,
              signature,
              selector,
              args: Array.from(decoded.args),
              source: 'openchain',
              steps: decodingSteps
            };
          } catch (error) {
            addDecodingStep(`❌ OpenChain signature failed: ${error}`);
          }
        } else {
          addDecodingStep('❌ Not found in OpenChain database');
        }
      } catch (error) {
        addDecodingStep(`❌ OpenChain lookup failed: ${error}`);
      }
    }
    
    // Try manual ABI if provided
    if (customABI) {
      addDecodingStep('🔧 Trying custom ABI...');
      try {
        const iface = new ethers.utils.Interface(JSON.parse(customABI));
        const decoded = iface.parseTransaction({ data: cleanCalldata });
        addDecodingStep(`✅ Decoded with custom ABI: ${decoded.name}`);
        
        return {
          success: true,
          functionName: decoded.name,
          selector,
          args: Array.from(decoded.args),
          source: 'manual',
          steps: decodingSteps
        };
      } catch (error) {
        addDecodingStep(`❌ Custom ABI failed: ${error}`);
      }
    }
    
    // Try heuristic decoding
    if (enableHeuristics) {
      addDecodingStep('🧠 Attempting heuristic decoding...');
      try {
        const heuristicResult = await decodeWithHeuristics(cleanCalldata);
        if (heuristicResult.success) { // Use 'success' property instead of 'decoded'
          addDecodingStep('✅ Heuristic decoding successful');
          return {
            success: true,
            decodedData: heuristicResult,
            selector,
            source: 'heuristic',
            steps: decodingSteps
          };
        }
      } catch (error) {
        addDecodingStep(`❌ Heuristic decoding failed: ${error}`);
      }
    }
    
    throw new Error(`Could not decode calldata with selector ${selector}. No matching signatures found.`);
  };

  const handleDecode = async () => {
    if (!calldata.trim()) {
      setError('Please enter calldata to decode');
      return;
    }
    
    setIsDecoding(true);
    setError(null);
    setDecodingSteps([]);
    setDecodingResult(null);
    
    try {
      addDecodingStep('🚀 Starting calldata decoding...');
      const result = await detectAndDecodeCalldata(calldata);
      
      setDecodingResult(result);
      addDecodingStep('🎉 Decoding completed successfully!');
      
      if (onDecoded) {
        onDecoded(result);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown decoding error';
      setError(errorMessage);
      addDecodingStep(`💥 Decoding failed: ${errorMessage}`);
      
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setIsDecoding(false);
    }
  };

  // Format parameter value for display
  const formatParameterValue = (value: any): string => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'bigint') return value.toString();
    if (ethers.BigNumber.isBigNumber(value)) return value.toString();
    if (Array.isArray(value)) return `[Array of ${value.length} items]`;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  // Render expandable array
  const renderExpandableArray = (value: any[], valueId: string): React.ReactNode => {
    const isExpanded = expandedValues.has(valueId);
    const showExpandButton = value.length > 3;
    
    if (!showExpandButton) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span>
            [{value.map(v => Array.isArray(v) ? `[Array of ${v.length} items]` : formatParameterValue(v)).join(', ')}]
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyToClipboard(JSON.stringify(value, null, 2), 'array')}
            icon={<Copy size={12} />}
          />
        </div>
      );
    }

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: isExpanded ? 'var(--space-2)' : '0' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleValueExpansion(valueId)}
            icon={isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          >
            {isExpanded ? 'Collapse' : 'Show All'} ({value.length} items)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyToClipboard(JSON.stringify(value, null, 2), 'array')}
            icon={<Copy size={12} />}
          />
        </div>
        
        {isExpanded && (
          <div style={{ marginLeft: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
            {value.map((item, index) => (
              <div key={index} style={{ marginBottom: 'var(--space-1)' }}>
                <span style={{ color: 'var(--text-muted)' }}>[{index}]:</span>{' '}
                {Array.isArray(item) ? renderExpandableArray(item, `${valueId}_${index}`) : formatParameterValue(item)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`calldata-decoder ${className}`}>
      <Card title="Calldata Decoder" variant="default">
        {/* Input Section */}
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Input
            label="Calldata"
            placeholder="0x..."
            value={calldata}
            onChange={(e) => setCalldata(e.target.value)}
            error={error || undefined}
          />
          
          <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)' }}>
            <Button
              onClick={handleDecode}
              loading={isDecoding}
              disabled={!calldata.trim()}
            >
              Decode Calldata
            </Button>
            
            {showAdvancedOptions && (
              <Button
                variant="ghost"
                onClick={() => {
                  setDecodingResult(null);
                  setError(null);
                  setDecodingSteps([]);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Advanced Options */}
        {showAdvancedOptions && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <Card title="Advanced Options" variant="glass" padding="sm">
              <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <input
                    type="checkbox"
                    checked={enableSignatureLookup}
                    onChange={(e) => setEnableSignatureLookup(e.target.checked)}
                  />
                  <span style={{ fontSize: 'var(--text-sm)' }}>Enable Signature Lookup</span>
                </label>
                
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <input
                    type="checkbox"
                    checked={enableHeuristics}
                    onChange={(e) => setEnableHeuristics(e.target.checked)}
                  />
                  <span style={{ fontSize: 'var(--text-sm)' }}>Enable Heuristic Decoding</span>
                </label>
              </div>
              
              {customABI && (
                <Input
                  label="Custom ABI (JSON)"
                  placeholder="Paste ABI JSON here..."
                  value={customABI}
                  variant="ghost"
                />
              )}
            </Card>
          </div>
        )}

        {/* Decoding Steps */}
        {decodingSteps.length > 0 && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <Card title="Decoding Steps" variant="glass" padding="sm">
              <div style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)' }}>
                {decodingSteps.map((step, index) => (
                  <div key={index} style={{ marginBottom: 'var(--space-1)', color: 'var(--text-secondary)' }}>
                    {step}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <ErrorDisplay error={error} variant="banner" />
        )}

        {/* Results */}
        {decodingResult && decodingResult.success && (
          <Card title="Decoded Result" variant="accent" padding="md">
            {decodingResult.functionName && (
              <div style={{ marginBottom: 'var(--space-3)' }}>
                <strong>Function:</strong> <code>{decodingResult.functionName}</code>
                {decodingResult.signature && (
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>
                    Signature: <code>{decodingResult.signature}</code>
                  </div>
                )}
              </div>
            )}
            
            {decodingResult.args && decodingResult.args.length > 0 && (
              <div>
                <strong>Parameters:</strong>
                <div style={{ marginTop: 'var(--space-2)' }}>
                  {decodingResult.args.map((arg, index) => (
                    <div key={index} style={{ marginBottom: 'var(--space-2)' }}>
                      <div style={{ fontWeight: 'var(--font-weight-medium)' }}>
                        [{index}]: {Array.isArray(arg) ? renderExpandableArray(arg, `arg_${index}`) : formatParameterValue(arg)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {decodingResult.decodedData && (
              <div style={{ marginTop: 'var(--space-3)' }}>
                <strong>Heuristic Data:</strong>
                <pre style={{ 
                  fontSize: 'var(--text-sm)', 
                  fontFamily: 'var(--font-mono)',
                  background: 'var(--bg-secondary)',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  marginTop: 'var(--space-2)',
                  overflow: 'auto'
                }}>
                  {JSON.stringify(decodingResult.decodedData, null, 2)}
                </pre>
              </div>
            )}
          </Card>
        )}
      </Card>
    </div>
  );
};

export default CalldataDecoder;