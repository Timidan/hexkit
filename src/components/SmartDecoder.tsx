import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { JSX } from 'react';
import { ethers } from 'ethers';
import {
  CheckCircle,
  XCircle,
  Search,
  FileText,
  Sparkles,
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
import AdvancedJsonEditor from './AdvancedJsonEditor';
import AnimatedInput from './ui/AnimatedInput';
import AnimatedButton from './ui/AnimatedButton';
import GlassButton from './ui/GlassButton';
import { CopyIcon } from './icons/IconLibrary';
import InlineActionButton from './ui/InlineActionButton';
import { copyTextToClipboard } from '../utils/clipboard';
import StackedOverview, { type ParameterDisplayEntry as OverviewParameterEntry } from './StackedOverview';
import { parseFunctionSignatureParameters } from '../utils/solidityTypes';
import SegmentedControl from './shared/SegmentedControl';
import RawJsonView from './RawJsonView';
import NetworkSelector, { EXTENDED_NETWORKS, type ExtendedChain } from './shared/NetworkSelector';
import '../styles/AdvancedJsonEditor.css';
import '../styles/AnimatedInput.css';
import '../styles/AnimatedButton.css';

const ETHERSCAN_INSTANCES = [
  { name: 'Ethereum Mainnet', url: 'https://api.etherscan.io', chainId: '1', apiKeyParam: 'etherscan' },
  { name: 'Polygon', url: 'https://api.polygonscan.com', chainId: '137', apiKeyParam: 'polygonscan' },
  { name: 'BSC', url: 'https://api.bscscan.com', chainId: '56', apiKeyParam: 'bscscan' },
  { name: 'Arbitrum One', url: 'https://api.arbiscan.io', chainId: '42161', apiKeyParam: 'arbiscan' },
  { name: 'Optimism', url: 'https://api-optimistic.etherscan.io', chainId: '10', apiKeyParam: 'optimism' },
  { name: 'Base Mainnet', url: 'https://api.basescan.org', chainId: '8453', apiKeyParam: 'basescan' },
  { name: 'Avalanche', url: 'https://api.snowtrace.io', chainId: '43114', apiKeyParam: 'snowtrace' },
  { name: 'Fantom', url: 'https://api.ftmscan.com', chainId: '250', apiKeyParam: 'ftmscan' },
];

const BLOCKSCOUT_INSTANCES = [
  { name: 'Ethereum Mainnet', url: 'https://eth.blockscout.com', chainId: '1' },
  { name: 'Base Mainnet', url: 'https://base.blockscout.com', chainId: '8453' },
  { name: 'Arbitrum One', url: 'https://arbitrum.blockscout.com', chainId: '42161' },
  { name: 'Optimism', url: 'https://optimism.blockscout.com', chainId: '10' },
  { name: 'Polygon', url: 'https://polygon.blockscout.com', chainId: '137' },
  { name: 'Gnosis Chain', url: 'https://gnosis.blockscout.com', chainId: '100' },
  { name: 'BSC', url: 'https://bsc.blockscout.com', chainId: '56' },
  { name: 'Ethereum Classic', url: 'https://etc.blockscout.com', chainId: '61' },
];

const shortenAddress = (address?: string | null) => {
  if (!address) return '—';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
};

type AbiAcquisitionMode = 'address' | 'paste';
type DecoderViewMode = 'overview' | 'raw';

interface AbiSourceOption {
  value: AbiAcquisitionMode;
  label: React.ReactNode;
  description: string;
}

interface DecoderViewOption {
  value: DecoderViewMode;
  title: string;
  helper: string;
  tooltip: string;
}

const ABI_SOURCE_OPTIONS: AbiSourceOption[] = [
  {
    value: 'address',
    label: (
      <span className="abi-segment-label">
        <strong>Fetch by Address</strong>
        <small>Explorer lookup</small>
      </span>
    ),
    description: 'Query verified explorers automatically',
  },
  {
    value: 'paste',
    label: (
      <span className="abi-segment-label">
        <strong>Paste JSON</strong>
        <small>Manual override</small>
      </span>
    ),
    description: 'Paste JSON or drop a file',
  },
];

const DECODER_VIEW_OPTIONS: DecoderViewOption[] = [
  {
    value: 'overview',
    title: 'Overview',
    helper: 'Summary mode',
    tooltip: 'High-level cards with decoded arguments.',
  },
  {
    value: 'raw',
    title: 'Raw JSON',
    helper: 'Exact payload',
    tooltip: 'Direct JSON output of the decoded arguments.',
  },
];

type LookupMode = 'multi' | 'single';

const LOOKUP_MODE_OPTIONS: Array<{
  value: LookupMode;
  title: string;
  helper: string;
  tooltip: string;
}> = [
  {
    value: 'multi',
    title: 'Multi Network',
    helper: 'All explorers',
    tooltip: 'Search all supported mainnet explorers for a verified ABI.',
  },
  {
    value: 'single',
    title: 'Targeted',
    helper: 'Choose network',
    tooltip: 'Specify a single network explorer to speed up lookup (supports testnets).',
  },
];

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
  const [lookupMode, setLookupMode] = useState<LookupMode>('multi');
  const [selectedLookupNetwork, setSelectedLookupNetwork] = useState<ExtendedChain | null>(null);
  const [isFetchingABI, setIsFetchingABI] = useState(false);
  const [manualABI, setManualABI] = useState('');
  const [abiAcquisitionMode, setAbiAcquisitionMode] = useState<AbiAcquisitionMode>('address');
  const [uploadedABIFileName, setUploadedABIFileName] = useState<string | null>(null);
  const [showTransferOptions, setShowTransferOptions] = useState(false);
  const [viewMode, setViewMode] = useState<DecoderViewMode>('overview');
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
  
  // Contract information for enhanced display
  const [contractABI, setContractABI] = useState<any[] | null>(null);
  const [contractMetadata, setContractMetadata] = useState<any>(null);
  const [abiSource, setAbiSource] = useState<'sourcify' | 'blockscout' | 'etherscan' | 'manual' | 'signatures' | 'heuristic' | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fallbackSectionRef = useRef<HTMLDivElement | null>(null);
  const abiContractInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (lookupMode === 'single' && !selectedLookupNetwork) {
      const defaultNetwork = EXTENDED_NETWORKS.find((network) => !network.isTestnet) ?? null;
      setSelectedLookupNetwork(defaultNetwork);
    }
  }, [lookupMode, selectedLookupNetwork]);

  const handleScrollToFallback = useCallback(() => {
    setAbiAcquisitionMode('address');
    const target = fallbackSectionRef.current;
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      abiContractInputRef.current?.focus({ preventScroll: true });
    }, 320);
  }, []);

  const resolvedContractName = useMemo(() => {
    const candidate = [
      contractMetadata?.name,
      contractMetadata?.contractName,
      contractMetadata?.metadata?.name,
    ]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .find((value) => value);

    if (candidate) {
      return candidate;
    }

    if (contractAddress) {
      return `Contract ${shortenAddress(contractAddress)}`;
    }

    return 'Contract';
  }, [contractMetadata, contractAddress]);

  const functionCount = useMemo(() => {
    if (typeof contractMetadata?.functions === 'number') {
      return contractMetadata.functions;
    }
    if (Array.isArray(contractABI)) {
      return contractABI.filter((item: any) => item?.type === 'function').length;
    }
    return 0;
  }, [contractMetadata, contractABI]);

  const eventCount = useMemo(() => {
    if (typeof contractMetadata?.events === 'number') {
      return contractMetadata.events;
    }
    if (Array.isArray(contractABI)) {
      return contractABI.filter((item: any) => item?.type === 'event').length;
    }
    return 0;
  }, [contractMetadata, contractABI]);

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

  // Enhanced function to get real parameter names from ABI
  const getParameterInfoFromABI = (
    functionName: string
  ): Array<{ name: string; type: string; components?: any[] }> => {
    try {
      // Try to get from stored contract ABI first
      if (contractABI && functionName) {
        const matchingFunction = contractABI.find((item: any) => 
          item.type === 'function' && item.name === functionName
        );
        if (matchingFunction?.inputs) {
          return matchingFunction.inputs.map((input: any) => ({
            name: input.name || 'param',
            type: input.type || 'unknown',
            components: input.components
          }));
        }
      }

      // Fallback to toolkit context
      const toolkitTransaction = toolkit.lastDecodedTransaction;
      if (toolkitTransaction?.abi && functionName) {
        const abi = toolkitTransaction.abi;
        const matchingFunction = abi.find((item: any) => 
          item.type === 'function' && item.name === functionName
        );
        if (matchingFunction?.inputs) {
          return matchingFunction.inputs.map((input: any) => ({
            name: input.name || 'param',
            type: input.type || 'unknown',
            components: input.components
          }));
        }
      }

      // Fallback to manual ABI if available
      if (manualABI && functionName) {
        const abi = JSON.parse(manualABI);
        const matchingFunction = abi.find((item: any) => 
          item.type === 'function' && item.name === functionName
        );
        if (matchingFunction?.inputs) {
          return matchingFunction.inputs.map((input: any) => ({
            name: input.name || 'param',
            type: input.type || 'unknown',
            components: input.components
          }));
        }
      }
    } catch (error) {
      console.log('Could not extract parameter info from ABI:', error);
    }
    
    return [];
  };

  // Component for rendering ABI source badges
  const renderAbiSourceBadge = () => {
    if (!abiSource) return null;
    
    const badges = {
      sourcify: { 
        text: 'Sourcify', 
        color: 'rgba(34, 197, 94, 0.8)', 
        icon: '', 
        description: 'Verified on Sourcify' 
      },
      blockscout: { 
        text: 'Blockscout', 
        color: 'rgba(59, 130, 246, 0.8)', 
        icon: '', 
        description: 'Verified on Blockscout' 
      },
      etherscan: { 
        text: 'Etherscan', 
        color: 'rgba(99, 102, 241, 0.8)', 
        icon: '', 
        description: 'Verified on Etherscan' 
      },
      manual: { 
        text: 'Manual ABI', 
        color: 'rgba(245, 158, 11, 0.8)', 
        icon: '', 
        description: 'User-provided ABI' 
      },
      signatures: { 
        text: 'Signature DB', 
        color: 'rgba(168, 85, 247, 0.8)', 
        icon: '', 
        description: 'Function signature database' 
      },
      heuristic: { 
        text: 'Heuristic', 
        color: 'rgba(239, 68, 68, 0.8)', 
        icon: '', 
        description: 'Pattern-based analysis' 
      }
    };
    
    const badge = badges[abiSource];
    if (!badge) return null;
    
    return (
      <div 
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          background: badge.color,
          color: 'white',
          padding: '4px 8px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: '600',
          marginLeft: '8px',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}
        title={badge.description}
      >
        <span style={{ fontSize: '10px' }}>{badge.icon}</span>
        {badge.text}
      </div>
    );
  };

  const copyToClipboard = async (text: string, label: string) => {
    if (!text) return;
    try {
      await copyTextToClipboard(text);
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
    setContractABI(null);
    setContractMetadata(null);
    setAbiSource(null);
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
      console.log(` Detected potential calldata: ${cleanValue.slice(0, 20)}...`);
      console.log(` Attempting to decode selector: ${selector}`);
      
      // Try custom signatures first
      const customSignature = searchCustomSignatures(selector);
      if (customSignature) {
        console.log(` Found in custom signatures: ${customSignature}`);
        const decoded = decodeWithSignature(cleanValue, customSignature);
        const sanitizedArgs = sanitizeDecodedValue(decoded.args);
        return {
          type: 'decoded_calldata',
          selector,
          signature: customSignature,
          functionName: decoded.name,
          args: sanitizedArgs,
          source: 'custom'
        };
      }
      
      // Try OpenChain lookup
      const openChainResult: SignatureResponse = await lookupFunctionSignatures([selector]);
      const signatures = openChainResult.result?.function?.[selector];
      
      if (signatures && signatures.length > 0) {
        const signature = signatures[0].name;
        console.log(` Found on OpenChain: ${signature}`);
        const decoded = decodeWithSignature(cleanValue, signature);
        const sanitizedArgs = sanitizeDecodedValue(decoded.args);
        return {
          type: 'decoded_calldata',
          selector,
          signature,
          functionName: decoded.name,
          args: sanitizedArgs,
          source: 'openchain'
        };
      }
      
      console.log(` Could not decode calldata with selector ${selector}`);
      return null;
      
    } catch (error) {
      console.log(`Error decoding potential calldata:`, error);
      return null;
    }
  };

  // Enhanced component for rendering expandable arrays with liquid glass styling
  const renderExpandableArray = (value: any[], valueId: string, paramType?: string): JSX.Element => {
    const isExpanded = expandedValues.has(valueId);
    const showExpandButton = value.length > 3;
    
    if (!showExpandButton) {
      // Small arrays - show all items with enhanced liquid glass copy button
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>
            [{value.map(v => Array.isArray(v) ? `[Array of ${v.length} items]` : formatParameterValue(v)).join(', ')}]
          </span>
          <button
            onClick={() => copyToClipboard(JSON.stringify(value, null, 2), 'array')}
            style={{
              background: 'rgba(0, 255, 255, 0.1)',
              border: '1px solid rgba(0, 255, 255, 0.3)',
              borderRadius: '6px',
              padding: '6px 8px',
              cursor: 'pointer',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              transition: 'all 0.2s ease',
              backdropFilter: 'blur(10px)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0, 255, 255, 0.2)';
              e.currentTarget.style.borderColor = 'rgba(0, 255, 255, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(0, 255, 255, 0.3)';
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
              background: 'rgba(0, 255, 255, 0.1)',
              border: '1px solid rgba(0, 255, 255, 0.3)',
              borderRadius: '6px',
              padding: '6px 12px',
              cursor: 'pointer',
              color: '#ffffff',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
              backdropFilter: 'blur(10px)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0, 255, 255, 0.2)';
              e.currentTarget.style.borderColor = 'rgba(0, 255, 255, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(0, 255, 255, 0.3)';
            }}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {isExpanded ? 'Collapse' : 'Show All'} ({value.length} items)
          </button>
          
          <button
            onClick={() => copyToClipboard(JSON.stringify(value, null, 2), 'array')}
            style={{
              background: 'rgba(0, 255, 255, 0.1)',
              border: '1px solid rgba(0, 255, 255, 0.3)',
              borderRadius: '6px',
              padding: '6px 8px',
              cursor: 'pointer',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              transition: 'all 0.2s ease',
              backdropFilter: 'blur(10px)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0, 255, 255, 0.2)';
              e.currentTarget.style.borderColor = 'rgba(0, 255, 255, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(0, 255, 255, 0.3)';
            }}
            title="Copy full array"
          >
            <CopyIcon width={12} height={12} />
          </button>
        </div>

        {isExpanded ? (
          <div style={{
            background: 'rgba(0, 255, 255, 0.05)',
            border: '1px solid rgba(0, 255, 255, 0.2)',
            borderRadius: '8px',
            padding: '16px',
            maxHeight: '300px',
            overflow: 'auto',
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{ fontSize: '12px', color: '#ffffff', marginBottom: '12px', fontWeight: '600', opacity: 0.8 }}>
              All {value.length} items:
            </div>
            {value.map((item, index) => (
              <div key={index} style={{
                marginBottom: '6px',
                fontSize: '13px',
                fontFamily: 'Monaco, Menlo, monospace',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '4px 0'
              }}>
                <span style={{ color: '#00ffff', minWidth: '35px', fontWeight: '500' }}>[{index}]:</span>
                <span style={{ 
                  flex: 1, 
                  wordBreak: 'break-all', 
                  color: '#ffffff',
                  background: 'rgba(0, 255, 255, 0.08)',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid rgba(0, 255, 255, 0.15)'
                }}>
                  {Array.isArray(item) ? `[Array of ${item.length} items]` : formatParameterValue(item)}
                </span>
                <button
                  onClick={() => copyToClipboard(String(item), `item ${index}`)}
                  style={{
                    background: 'rgba(0, 255, 255, 0.1)',
                    border: '1px solid rgba(0, 255, 255, 0.3)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: '#ffffff',
                    padding: '4px 6px',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'all 0.2s ease',
                    backdropFilter: 'blur(10px)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 255, 255, 0.2)';
                    e.currentTarget.style.borderColor = 'rgba(0, 255, 255, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 255, 255, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(0, 255, 255, 0.3)';
                  }}
                  title={`Copy item ${index}`}
                >
                  <CopyIcon width={11} height={11} />
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
              Nested Calldata: {decodedCalldata.functionName}()
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
              (potential calldata)
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

  const handleTransferToBuilder = () => {
    if (toolkit.lastDecodedTransaction) {
      // Transfer data and auto-navigate
      toolkit.transferToTransactionBuilder(toolkit.lastDecodedTransaction);
      setShowTransferOptions(false);
      addDecodingStep(' Transaction data transferred to Transaction Builder!');
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
      const hasStructuredChildren = value.some(
        (item) =>
          Array.isArray(item) ||
          (item &&
            typeof item === 'object' &&
            !ethers.BigNumber.isBigNumber(item) &&
            !(item instanceof Uint8Array))
      );
      if (hasStructuredChildren) {
        return 'tuple[]';
      }
      return 'array';
    }
    
    return 'string';
  };

  const sanitizeDecodedValue = (value: any): any => {
    if (Array.isArray(value)) {
      return Array.from(value, sanitizeDecodedValue);
    }

    if (value && typeof value === 'object') {
      if (ethers.BigNumber.isBigNumber(value)) {
        return value.toString();
      }

      if (value instanceof Uint8Array) {
        return ethers.utils.hexlify(value);
      }
    }

    return value;
  };

  // Helper function to format parameter values nicely
  const formatParameterValue = (
    value: any,
    paramType?: string,
    options?: { full?: boolean }
  ): string => {
    const full = options?.full ?? false;
    if (value === null || value === undefined) return 'null';
    
    // Handle arrays (including tuple arrays)
    if (Array.isArray(value)) {
      if (full) {
        try {
          return JSON.stringify(value);
        } catch {
          return `[${value.map(v => formatParameterValue(v, undefined, { full: true })).join(', ')}]`;
        }
      }

      const hasComplexChildren = value.some(
        (item) =>
          Array.isArray(item) ||
          (item && typeof item === 'object' && !item._isBigNumber && !(item instanceof Uint8Array))
      );

      if (!full && (paramType?.includes('tuple') || hasComplexChildren)) {
        let preview = '';
        if (value.length > 0 && Array.isArray(value[0])) {
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

    if (value && typeof value === 'object') {
      if (full) {
        try {
          return JSON.stringify(value);
        } catch {
          return String(value);
        }
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
      if (full) {
        return str;
      }
      return `${str.slice(0, 10)}...${str.slice(-8)} (${(str.length - 2) / 2} bytes)`;
    }
    
    return str;
  };

  const inferValueType = (value: any): string => {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return `tuple(${value.length})`;
    if (value && typeof value === 'object') {
      if (value._isBigNumber) return 'uint';
      return 'object';
    }
    if (typeof value === 'boolean') return 'bool';
    if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float';
    if (typeof value === 'string') {
      if (/^0x[a-fA-F0-9]+$/.test(value)) {
        const byteLength = value.length > 2 ? (value.length - 2) / 2 : 0;
        return byteLength ? `bytes${byteLength}` : 'bytes';
      }
      return 'string';
    }
    return typeof value;
  };

  const getAbiSourceLabel = (): string => {
    if (!abiSource) {
      return decodedResult ? 'Signature lookup / heuristic' : '—';
    }

    const labels: Record<NonNullable<typeof abiSource>, string> = {
      sourcify: 'Sourcify (verified ABI)',
      blockscout: 'Blockscout (verified ABI)',
      etherscan: 'Etherscan (verified ABI)',
      manual: 'Manual ABI',
      signatures: 'Signature database',
      heuristic: 'Heuristic analysis'
    };

    return labels[abiSource] ?? abiSource;
  };

  const getParameterDisplayData = (): {
    parameterData: OverviewParameterEntry[];
    hasGenericNames: boolean;
    hasRealNames: boolean;
  } => {
    if (!decodedResult?.args) {
      return { parameterData: [], hasGenericNames: false, hasRealNames: false };
    }

    const abiParameterInfo = decodedResult.name ? getParameterInfoFromABI(decodedResult.name) : [];
    const signatureParameterInfo = decodedResult.signature
      ? parseFunctionSignatureParameters(decodedResult.signature)
      : [];
    let parameterData: OverviewParameterEntry[] = [];
    const toolkitParams = toolkit.lastDecodedTransaction?.parameters;

    if (toolkitParams && toolkitParams.length > 0) {
      parameterData = toolkitParams.map((param, index) => ({
        name: param.name,
        type:
          abiParameterInfo[index]?.type ||
          signatureParameterInfo[index]?.type ||
          param.type,
        value: param.value,
        components:
          abiParameterInfo[index]?.components ??
          signatureParameterInfo[index]?.components ??
          null
      }));
    } else {
      parameterData = decodedResult.args.map((arg: any, index: number) => ({
        name:
          abiParameterInfo[index]?.name ||
          signatureParameterInfo[index]?.name ||
          `param_${index}`,
        type:
          abiParameterInfo[index]?.type ||
          signatureParameterInfo[index]?.type ||
          getParameterType(arg),
        value: arg,
        components:
          abiParameterInfo[index]?.components ??
          signatureParameterInfo[index]?.components ??
          null
      }));
    }

    const hasGenericNames = parameterData.some((param) => param.name?.startsWith('param_'));
    const hasRealNames = parameterData.some((param) => param.name && !param.name.startsWith('param_'));

    return { parameterData, hasGenericNames, hasRealNames };
  };

  // Legacy parameter overview table replaced by StackedOverview component.

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

  const normalizeCalldataHex = (calldataHex: string): string => {
    const trimmed = calldataHex.trim();

    if (!trimmed) {
      throw new Error('Calldata is empty.');
    }

    const withoutWhitespace = trimmed
      .replace(/\s+/g, '')
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');

    if (!withoutWhitespace) {
      throw new Error('Calldata is empty.');
    }

    let prefixed = withoutWhitespace;
    if (!(prefixed.startsWith('0x') || prefixed.startsWith('0X'))) {
      addDecodingStep('Added missing 0x prefix to calldata input.');
      prefixed = `0x${prefixed}`;
    }

    const rawHexBody = prefixed.slice(2);
    let sanitizedHexBody = '';
    let removedInvalid = 0;

    for (const char of rawHexBody) {
      if (/^[0-9a-fA-F]$/.test(char)) {
        sanitizedHexBody += char;
      } else {
        removedInvalid++;
      }
    }

    if (!sanitizedHexBody) {
      throw new Error('Calldata must contain hexadecimal characters (0-9, a-f).');
    }

    if (removedInvalid > 0) {
      addDecodingStep(`Removed ${removedInvalid} non-hex character${removedInvalid === 1 ? '' : 's'} from calldata input.`);
    }

    if (sanitizedHexBody.length % 2 !== 0) {
      const selectorPart = sanitizedHexBody.slice(0, 8);
      let parameterPart = sanitizedHexBody.slice(8);

      if (!parameterPart) {
        sanitizedHexBody = sanitizedHexBody + '0';
      } else {
        parameterPart = `${parameterPart}0`;
        sanitizedHexBody = selectorPart + parameterPart;
      }

      addDecodingStep('Calldata length was odd; appended a 0 nibble to parameter data to restore 32-byte alignment.');
    }

    return `0x${sanitizedHexBody}`;
  };

  const decodeWithSignature = (calldataHex: string, signature: string): any => {
    try {
      const abi = [`function ${signature}`];
      const iface = new ethers.utils.Interface(abi);
      const normalizedCalldata = normalizeCalldataHex(calldataHex);
      return iface.parseTransaction({ data: normalizedCalldata });
    } catch (error: any) {
      const reason = typeof error?.reason === 'string' ? error.reason : undefined;
      const message = typeof error?.message === 'string' ? error.message : undefined;

      if (reason && reason.includes('hex data is odd-length')) {
        throw new Error('Calldata hex must contain an even number of characters after the 0x prefix.');
      }

      if (message && message.includes('hex data is odd-length')) {
        throw new Error('Calldata hex must contain an even number of characters after the 0x prefix.');
      }

      throw new Error(`Failed to decode with signature ${signature}: ${message ?? error}`);
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
  const fetchABIFromEtherscanInstances = async (address: string, chainId?: string): Promise<any> => {
    const errors: string[] = [];

    const instances = chainId
      ? ETHERSCAN_INSTANCES.filter((instance) => instance.chainId === String(chainId))
      : ETHERSCAN_INSTANCES;

    if (!instances.length) {
      throw new Error('No Etherscan-style explorer configured for the selected network');
    }

    for (const instance of instances) {
      try {
        addDecodingStep(` Searching ${instance.name} (Etherscan)...`);
        
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
                addDecodingStep(` Found verified contract on ${instance.name} (Etherscan)!`);
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

  const fetchABIFromBlockscoutInstances = async (address: string, chainId?: string): Promise<any> => {
    const errors: string[] = [];

    const instances = chainId
      ? BLOCKSCOUT_INSTANCES.filter((instance) => instance.chainId === String(chainId))
      : BLOCKSCOUT_INSTANCES;

    if (!instances.length) {
      throw new Error('No Blockscout explorer configured for the selected network');
    }

    for (const instance of instances) {
      try {
        addDecodingStep(` Searching ${instance.name}...`);
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
            addDecodingStep(` Found verified contract on ${instance.name}!`);
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

  const fetchContractNameFromEtherscanInstances = async (address: string, chainId?: string): Promise<string | null> => {
    const instances = chainId
      ? ETHERSCAN_INSTANCES.filter((instance) => instance.chainId === String(chainId))
      : ETHERSCAN_INSTANCES;

    for (const instance of instances) {
      try {
        let apiKey = 'YourApiKeyToken';
        try {
          const stored = localStorage.getItem(`apiKey_${instance.apiKeyParam}`);
          if (stored) apiKey = stored;
        } catch {
          // ignore storage errors
        }

        const response = await fetch(
          `${instance.url}/api?module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`,
          {
            headers: {
              Accept: 'application/json',
            },
          }
        );

        if (!response.ok) {
          continue;
        }

        const data = await response.json();
        if (data.status === '1' && Array.isArray(data.result) && data.result.length > 0) {
          const record = data.result[0];
          const contractName = record.ContractName || record.contractName;
          if (contractName && contractName !== '0') {
            return contractName;
          }
        }
      } catch {
        continue;
      }
    }

    return null;
  };

  const fetchContractNameFromBlockscoutInstances = async (address: string, chainId?: string): Promise<string | null> => {
    const instances = chainId
      ? BLOCKSCOUT_INSTANCES.filter((instance) => instance.chainId === String(chainId))
      : BLOCKSCOUT_INSTANCES;

    for (const instance of instances) {
      try {
        const response = await fetch(
          `${instance.url}/api/v2/smart-contracts/${address}`,
          {
            headers: {
              Accept: 'application/json',
            },
          }
        );

        if (!response.ok) {
          continue;
        }

        const data = await response.json();
        const candidate = data?.name || data?.contract_name;
        if (data?.is_verified && typeof candidate === 'string' && candidate.trim()) {
          return candidate.trim();
        }
      } catch {
        continue;
      }
    }

    return null;
  };

  const fetchABIFromContract = async (address: string): Promise<any> => {
    try {
      addDecodingStep(` Searching across multiple block explorers...`);
      
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
      const chainIdForLookup =
        lookupMode === 'single' && selectedLookupNetwork
          ? String(selectedLookupNetwork.id)
          : undefined;
      const networkLabel = chainIdForLookup ? selectedLookupNetwork?.name : undefined;
      
      // Define search sources based on lookup mode
      const searchSources: Array<{
        name: string;
        fetch: () => Promise<any>;
        kind: 'etherscan' | 'blockscout';
      }> = [];

      if (chainIdForLookup) {
        const etherscanMatches = ETHERSCAN_INSTANCES.filter(
          (instance) => instance.chainId === chainIdForLookup
        );
        const blockscoutMatches = BLOCKSCOUT_INSTANCES.filter(
          (instance) => instance.chainId === chainIdForLookup
        );

        if (etherscanMatches.length > 0) {
          searchSources.push({
            name: `Etherscan • ${etherscanMatches[0].name}`,
            fetch: () => fetchABIFromEtherscanInstances(address, chainIdForLookup),
            kind: 'etherscan'
          });
        }

        if (blockscoutMatches.length > 0) {
          searchSources.push({
            name: `Blockscout • ${blockscoutMatches[0].name}`,
            fetch: () => fetchABIFromBlockscoutInstances(address, chainIdForLookup),
            kind: 'blockscout'
          });
        }
      } else {
        searchSources.push(
          {
            name: 'Etherscan (multi)',
            fetch: () => fetchABIFromEtherscanInstances(address),
            kind: 'etherscan'
          },
          {
            name: 'Blockscout (multi)',
            fetch: () => fetchABIFromBlockscoutInstances(address),
            kind: 'blockscout'
          }
        );
      }

      if (searchSources.length === 0) {
        setCurrentSearchProgress([]);
        reject(
          new Error(
            'The selected network does not have an explorer integration yet. Try multi-network lookup or paste an ABI manually.'
          )
        );
        return;
      }
      
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
            setCurrentSearchProgress([
              chainIdForLookup
                ? `Targeting ${networkLabel || 'selected'} network explorers...`
                : 'Starting multi-network search...'
            ]);
          }
          setCurrentSearchProgress(prev => [...prev, `Searching ${source.name}...`]);
          
          const abi = await source.fetch();
          
          if (Array.isArray(abi)) {
            setCurrentSearchProgress(prev => [...prev, `Found verified contract on ${source.name}!`]);
            
            const fallbackContractName =
              contractMetadata?.name ??
              contractMetadata?.contractName ??
              contractMetadata?.metadata?.name ??
              `Contract ${shortenAddress(address)}`;

            let resolvedContractNameForModal = fallbackContractName;
            try {
              let fetchedDisplayName: string | null = null;
              if (source.kind === 'blockscout') {
                fetchedDisplayName = await fetchContractNameFromBlockscoutInstances(address, chainIdForLookup);
                if (!fetchedDisplayName) {
                  fetchedDisplayName = await fetchContractNameFromEtherscanInstances(address, chainIdForLookup);
                }
              } else {
                fetchedDisplayName = await fetchContractNameFromEtherscanInstances(address, chainIdForLookup);
                if (!fetchedDisplayName) {
                  fetchedDisplayName = await fetchContractNameFromBlockscoutInstances(address, chainIdForLookup);
                }
              }

              if (fetchedDisplayName) {
                resolvedContractNameForModal = fetchedDisplayName;
              }
            } catch (metadataError) {
              console.warn('Unable to resolve contract name during lookup', metadataError);
            }

            // Show confirmation dialog
            setContractConfirmation({
              show: true,
              contractInfo: {
                name: resolvedContractNameForModal,
                address,
                source: source.name,
                functions: abi.filter((item: any) => item.type === 'function').length,
                events: abi.filter((item: any) => item.type === 'event').length
              },
              abi,
              onConfirm: () => {
                setContractConfirmation(null);
                setCurrentSearchProgress([]);
                // Store ABI and contract metadata for enhanced display
                setContractABI(abi);
                setContractMetadata({
                  name: resolvedContractNameForModal,
                  source: source.name,
                  functions: abi.filter((item: any) => item.type === 'function').length,
                  events: abi.filter((item: any) => item.type === 'event').length
                });
                // Set ABI source based on the source name
                if (source.kind === 'blockscout') {
                  setAbiSource('blockscout');
                } else if (source.kind === 'etherscan') {
                  setAbiSource('etherscan');
                } else {
                  setAbiSource('etherscan'); // Default fallback
                }
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
          setCurrentSearchProgress(prev => [...prev, `${source.name}: ${error.message}`]);
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
    console.log(' Searching ABI for selector:', selector);
    console.log(' ABI contains', abi.length, 'items');
    
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
          
          console.log(` Function: ${signature} → Selector: ${computedSelector}`);
          
          if (computedSelector.toLowerCase() === selector.toLowerCase()) {
            console.log(' MATCH FOUND!', signature);
            return { ...item, signature };
          }
        } catch (error) {
          console.warn('Error processing ABI item:', item, error);
          continue;
        }
      }
    }
    
    console.log(' No matching function found in ABI');
    console.log(' Functions found in ABI:');
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

      addDecodingStep(` Extracted function selector: ${selector}`);

      // Step 1: If we have a contract address, try ABI-based decoding first (highest quality)
      if (contractAddress.trim()) {
        addDecodingStep(` Contract address provided: ${contractAddress.trim()}`);
        try {
          await handleContractABIDecode();
          return; // If successful, we're done with high-quality ABI decoding
        } catch (error: any) {
          addDecodingStep(`Contract ABI lookup failed, continuing with signature search...`);
        }
      }

      // Step 2: Check custom/cached signatures
      addDecodingStep(' Searching custom signatures...');
      const customSignature = searchCustomSignatures(selector);
      if (customSignature) {
        addDecodingStep(` Found in custom signatures: ${customSignature}`);
        const decoded = decodeWithSignature(calldata.trim(), customSignature);
        const sanitizedArgs = sanitizeDecodedValue(decoded.args);
        const sanitizedDecoded = { ...decoded, args: sanitizedArgs };
        setDecodedResult(sanitizedDecoded);
        setAbiSource('signatures');

        // Extract parameter names from signature if available
        const parameterInfo = parseFunctionSignatureParameters(customSignature);

        // Share decoded data with toolkit context
        toolkit.setDecodedTransaction({
          functionName: sanitizedDecoded.name,
          functionSignature: customSignature,
          parameters: sanitizedArgs ? sanitizedArgs.map((arg: any, index: number) => ({
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
        addDecodingStep(' Searching OpenChain database...');
        try {
          const openChainResult: SignatureResponse = await lookupFunctionSignatures([selector]);
          const signatures = openChainResult.result?.function?.[selector];
          
          if (signatures && signatures.length > 0) {
            const signature = signatures[0].name;
            addDecodingStep(` Found on OpenChain: ${signature}`);
            addDecodingStep(`Note: OpenChain only provides parameter types, not names`);

            const decoded = decodeWithSignature(calldata.trim(), signature);
            const sanitizedArgs = sanitizeDecodedValue(decoded.args);
            const sanitizedDecoded = { ...decoded, args: sanitizedArgs };
            setDecodedResult(sanitizedDecoded);
            setAbiSource('signatures');

            // Extract parameter names from signature if available (will be generic for OpenChain)
            const parameterInfo = parseFunctionSignatureParameters(signature);

            // Share decoded data with toolkit context
            toolkit.setDecodedTransaction({
              functionName: sanitizedDecoded.name,
              functionSignature: signature,
              parameters: sanitizedArgs ? sanitizedArgs.map((arg: any, index: number) => ({
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
          addDecodingStep(` OpenChain lookup failed: ${openChainError}`);
        }
      } else {
        addDecodingStep(' Signature database lookup disabled - enable in advanced options');
      }

      // Step 4: Try heuristic decoding if enabled
      if (enableHeuristics) {
        addDecodingStep(' Attempting heuristic decoding...');
        try {
          const heuristicResults = decodeWithHeuristics(calldata.trim());
          setHeuristicResult(heuristicResults);
          
          if (heuristicResults && heuristicResults.bestGuess) {
            addDecodingStep(` Heuristic analysis complete (confidence: ${(heuristicResults.bestGuess.confidence * 100).toFixed(1)}%)`);
            addDecodingStep(`Best guess: ${heuristicResults.bestGuess.description}`);
            
            // Set the best guess as the decoded result
            setDecodedResult({
              name: heuristicResults.bestGuess.description.split('(')[0].trim(),
              signature: `${heuristicResults.bestGuess.description}`,
              args: heuristicResults.bestGuess.values || []
            });
            setAbiSource('heuristic');

            // Share with toolkit context
            if (heuristicResults.bestGuess) {
              toolkit.setDecodedTransaction({
                functionName: heuristicResults.bestGuess.description.split('(')[0].trim(),
                functionSignature: heuristicResults.bestGuess.description,
                parameters: (heuristicResults.bestGuess.values || []).map((arg: any, index: number) => ({
                  name: `param_${index}`,
                  type: heuristicResults.bestGuess?.types?.[index] || 'unknown',
                  value: arg
                })),
                calldata: calldata.trim()
              });
            }
            
            if (heuristicResults.decodedAttempts && heuristicResults.decodedAttempts.length > 1) {
              setShowAlternativeResults(true);
              addDecodingStep(` Found ${heuristicResults.decodedAttempts.length} alternative interpretations`);
            }
            
            setShowFallbackOptions(true);
            setShowTransferOptions(true);
            return;
          }
          
          addDecodingStep('Heuristic analysis found no confident matches');
        } catch (heuristicError) {
          console.error('Heuristic decoding error:', heuristicError);
          addDecodingStep(` Heuristic decoding failed: ${String(heuristicError)}`);
        }
      } else {
        addDecodingStep(' Heuristic decoding disabled - enable in advanced options');
      }

      // Step 5: No automatic match found, show fallback options
      addDecodingStep(' No confident matches found - try manual ABI or adjust settings');
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

    if (lookupMode === 'single' && !selectedLookupNetwork) {
      addDecodingStep(' Select a network before starting a targeted lookup.');
      setError('Select a network to target before decoding.');
      return;
    }

    if (lookupMode === 'single' && selectedLookupNetwork) {
      const chainId = String(selectedLookupNetwork.id);
      const hasExplorerSupport =
        ETHERSCAN_INSTANCES.some((instance) => instance.chainId === chainId) ||
        BLOCKSCOUT_INSTANCES.some((instance) => instance.chainId === chainId);

      if (!hasExplorerSupport) {
        addDecodingStep(` Selected network ${selectedLookupNetwork.name} is not supported by our explorer integrations yet.`);
        setError('Selected network is not supported for automatic lookup yet. Try multi-network search or provide an ABI manually.');
        return;
      }
    }

    setIsFetchingABI(true);
    setError(null);
    
    try {
      const selector = extractFunctionSelector(calldata);
      if (!selector) {
        throw new Error('Invalid calldata format');
      }

      if (lookupMode === 'single' && selectedLookupNetwork) {
        addDecodingStep(
          ` Targeted lookup on ${selectedLookupNetwork.name} (${selectedLookupNetwork.isTestnet ? 'testnet' : 'mainnet'})`
        );
      } else {
        addDecodingStep(' Multi-network lookup enabled (Etherscan + Blockscout)');
      }

      addDecodingStep(` Fetching ABI for contract: ${contractAddress}`);
      const abi = await fetchABIWithConfirmation(contractAddress.trim());
      
      addDecodingStep('ABI fetched, searching for matching function...');
      const matchingFunction = findMatchingFunctionInABI(abi, selector);
      
      if (matchingFunction) {
        addDecodingStep(` Found matching function: ${matchingFunction.signature}`);
        const decoded = decodeWithSignature(calldata, matchingFunction.signature);
        const sanitizedArgs = sanitizeDecodedValue(decoded.args);
        const sanitizedDecoded = { ...decoded, args: sanitizedArgs };
        setDecodedResult(sanitizedDecoded);
        setShowFallbackOptions(false);

        // Share decoded data with toolkit context including contract address and ABI
        toolkit.setDecodedTransaction({
          functionName: sanitizedDecoded.name,
          functionSignature: matchingFunction.signature,
          contractAddress: contractAddress.trim(),
          parameters: matchingFunction.inputs ? matchingFunction.inputs.map((input: any, index: number) => ({
            name: input.name,
            type: input.type,
            value: sanitizedArgs ? sanitizedArgs[index] : undefined
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
          `Available functions in fetched ABI:\n${availableFunctions.map((f: any) => `• ${f}`).join('\n')}\n\n` +
          `This might mean:\n` +
          `• The calldata is for a different contract\n` +
          `• The contract has multiple implementations\n` +
          `• The function is from a proxy or delegated contract`;
        
        throw new Error(errorMsg);
      }
      
    } catch (err: any) {
      setError(err.message);
      addDecodingStep(` Contract ABI decode failed: ${err.message}`);
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
      
      // Store manual ABI and metadata for enhanced display
      setContractABI(abi);
      setContractMetadata({
        name: 'Manual ABI',
        source: 'Manual ABI',
        functions: abi.filter((item: any) => item.type === 'function').length,
        events: abi.filter((item: any) => item.type === 'event').length
      });
      setAbiSource('manual');
      
      const matchingFunction = findMatchingFunctionInABI(abi, selector);
      if (matchingFunction) {
        addDecodingStep(` Found matching function: ${matchingFunction.signature}`);
        const decoded = decodeWithSignature(calldata, matchingFunction.signature);
        const sanitizedArgs = sanitizeDecodedValue(decoded.args);
        const sanitizedDecoded = { ...decoded, args: sanitizedArgs };
        setDecodedResult(sanitizedDecoded);
        setShowFallbackOptions(false);

        // Share decoded data with toolkit context
        toolkit.setDecodedTransaction({
          functionName: sanitizedDecoded.name,
          functionSignature: matchingFunction.signature,
          parameters: matchingFunction.inputs ? matchingFunction.inputs.map((input: any, index: number) => ({
            name: input.name,
            type: input.type,
            value: sanitizedArgs ? sanitizedArgs[index] : undefined
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
          `Available functions in ABI:\n${availableFunctions.map((f: any) => `• ${f}`).join('\n')}\n\n` +
          `Make sure you're using the correct ABI that contains the function you're trying to decode.`;
        
        throw new Error(errorMsg);
      }
    } catch (err: any) {
      setError(err.message);
      addDecodingStep(` Manual ABI decode failed: ${err.message}`);
    }
  };

  const handleAbiFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setUploadedABIFileName(null);
      return;
    }

    try {
      const text = await file.text();
      setManualABI(text);
      setAbiAcquisitionMode('paste');
      setUploadedABIFileName(file.name);
      setError(null);
    } catch (err) {
      console.error('Failed to read ABI file', err);
      setError('Could not read the selected ABI file. Please try another file.');
      setUploadedABIFileName(null);
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
        <div className="decoder-header">
          <div className="decoder-headline">
            <h2>Smart Transaction Decoder</h2>
            <p>Automatically finds function signatures and decodes calldata with multi-chain ABI lookup.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdvancedOptions(true)}
            className="decoder-settings-trigger"
            aria-label="Open decoder settings"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1.12V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1.12-.33H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.05-.05a2 2 0 1 1 2.83-2.83l.05.05A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1.12V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05A1.65 1.65 0 0 0 19.4 9c.26.4.4.87.33 1.34a1.65 1.65 0 0 0 .6 1 1.65 1.65 0 0 0 1.12.33H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.12.33 1.65 1.65 0 0 0-.39 1.3Z" />
            </svg>
          </button>
        </div>

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

        {!decodedResult ? (
          <div className="form-group">
            <label>Contract Address (optional, for better parameter names)</label>
            <div className={`decoder-address-wrapper${lookupMode === 'single' ? ' has-selector' : ''}`}>
              <div className="decoder-address-field">
                <input
                  type="text"
                  value={contractAddress}
                  onChange={(e) => setContractAddress(e.target.value)}
                  placeholder="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7"
                  className="decoder-address-field__input"
                />
                {lookupMode === 'single' ? (
                  <NetworkSelector
                    selectedNetwork={selectedLookupNetwork}
                    onNetworkChange={(network) => setSelectedLookupNetwork(network)}
                    size="sm"
                    variant="input"
                    showTestnets={true}
                    className="decoder-address-field__selector"
                  />
                ) : (
                  <span className="decoder-address-field__badge">All explorers</span>
                )}
              </div>
            </div>
            <small>If provided, we'll fetch the verified ABI first for real parameter names</small>
          </div>
        ) : showFallbackOptions ? (
          <div className="decoder-address-nudge" role="note">
            <div className="decoder-address-nudge__text">
              <strong>Improve parameter names</strong>
              <span>Add a contract address or ABI below to replace generic labels.</span>
            </div>
            <button
              type="button"
              className="decoder-address-nudge__button"
              onClick={handleScrollToFallback}
            >
              Add contract or ABI
              <ChevronDown size={16} />
            </button>
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
          <GlassButton
            onClick={handleSmartDecode}
            disabled={isDecoding}
            variant="primary"
            size="lg"
          >
            <Zap size={18} style={{ marginRight: '8px' }} />
            {isDecoding ? 'Decoding...' : 'Decode Input Data'}
          </GlassButton>
        </div>
      </div>

      {showAdvancedOptions && (
        <div
          className="decoder-settings-overlay active"
          onClick={() => setShowAdvancedOptions(false)}
        >
          <div
            className="decoder-settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="decoder-settings-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="decoder-settings-modal-header">
              <div>
                <p id="decoder-settings-title">Advanced Decoder Settings</p>
                <span>Adjust optional heuristics and lookup behaviour.</span>
              </div>
              <button
                type="button"
                className="decoder-settings-close"
                aria-label="Close settings"
                onClick={() => setShowAdvancedOptions(false)}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="decoder-advanced-panel">
              <label className="decoder-advanced-toggle">
                <span className="decoder-advanced-icon">
                  <span className="decoder-segmented-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="6" rx="2" />
                      <rect x="3" y="14" width="18" height="6" rx="2" />
                      <circle cx="9" cy="7" r="2" />
                      <circle cx="15" cy="17" r="2" />
                    </svg>
                  </span>
                </span>
                <span className="decoder-advanced-text">
                  <strong>Default explorer mode</strong>
                  <small>Decide whether we search all explorers or target one network.</small>
                </span>
                <SegmentedControl
                  className="abi-source-segmented decoder-lookup-segmented"
                  ariaLabel="ABI lookup mode selector"
                  value={lookupMode}
                  onChange={(next) => setLookupMode(next as LookupMode)}
                  options={LOOKUP_MODE_OPTIONS.map((option) => ({
                    value: option.value,
                    label: (
                      <span className="abi-segment-label" title={option.tooltip}>
                        <strong>{option.title}</strong>
                        <small>{option.helper}</small>
                      </span>
                    )
                  }))}
                />
              </label>

              <label className="decoder-advanced-toggle">
                <input
                  type="checkbox"
                  checked={enableHeuristics}
                  onChange={(e) => setEnableHeuristics(e.target.checked)}
                />
                <span className="decoder-advanced-icon">
                  <Sparkles size={14} />
                </span>
                <span className="decoder-advanced-text">
                  <strong>Heuristic decoding</strong>
                  <small>Try pattern-based decoding when ABI is missing.</small>
                </span>
              </label>

              <label className="decoder-advanced-toggle">
                <input
                  type="checkbox"
                  checked={enableSignatureLookup}
                  onChange={(e) => setEnableSignatureLookup(e.target.checked)}
                />
                <span className="decoder-advanced-icon">
                  <Search size={14} />
                </span>
                <span className="decoder-advanced-text">
                  <strong>Signature databases</strong>
                  <small>Query public signature registries when ABI is unavailable.</small>
                </span>
              </label>

              <label className="decoder-advanced-toggle">
                <input
                  type="checkbox"
                  checked={showAlternativeResults}
                  onChange={(e) => setShowAlternativeResults(e.target.checked)}
                />
                <span className="decoder-advanced-icon">
                  <Building2 size={14} />
                </span>
                <span className="decoder-advanced-text">
                  <strong>Alternative attempts</strong>
                  <small>Display lower-confidence matches for manual inspection.</small>
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Fallback Options */}
      {showFallbackOptions && (
        <div className="panel" ref={fallbackSectionRef}>
          <h3>{decodedResult ? 'Improve Parameter Names' : 'Additional Decoding Options'}</h3>
          {decodedResult ? (
            <div
              style={{
                background: 'rgba(251, 146, 60, 0.1)',
                border: '1px solid rgba(251, 146, 60, 0.3)',
                borderRadius: '6px',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '13px',
                color: '#fb923c'
              }}
            >
              <strong>Info:</strong> Function decoded successfully! We currently only have parameter types from the signature database.
              Supply a verified ABI to replace generic labels like `param_0` with descriptive names.
            </div>
          ) : (
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
              Function signature not found automatically. Choose how you want to provide an ABI and retry decoding.
            </p>
          )}

          <div className="abi-inline-shell">
            <p className="abi-inline-shell__copy">
              Select how you’d like to provide an ABI source. Swap modes any time while we keep your progress cached.
            </p>
            <div className="abi-inline-shell__selector">
              <SegmentedControl
                className="abi-source-segmented"
                ariaLabel="ABI source selector"
                value={abiAcquisitionMode}
                onChange={(newValue) => setAbiAcquisitionMode(newValue as AbiAcquisitionMode)}
                options={ABI_SOURCE_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label
                }))}
              />
            </div>
            <div className="abi-inline-shell__description">
              {ABI_SOURCE_OPTIONS.find((opt) => opt.value === abiAcquisitionMode)?.description}
            </div>

            <div className="abi-inline-shell__body">
              {abiAcquisitionMode === 'address' && (
                <div className="abi-inline-sheet__form">
                  <label className="abi-inline-sheet__label" htmlFor="abi-contract-address">
                    Contract Address
                  </label>
                  <div className="decoder-network-mode">
                    <div className={`decoder-address-wrapper${lookupMode === 'single' ? ' has-selector' : ''}`}>
                      <div className="decoder-address-field decoder-address-field--abi">
                        <input
                          id="abi-contract-address"
                          className="decoder-address-field__input decoder-address-field__input--abi"
                          type="text"
                          value={contractAddress}
                          onChange={(e) => setContractAddress(e.target.value)}
                          placeholder="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7"
                          ref={abiContractInputRef}
                        />
                        {lookupMode === 'single' ? (
                          <NetworkSelector
                            selectedNetwork={selectedLookupNetwork}
                            onNetworkChange={(network) => setSelectedLookupNetwork(network)}
                            size="sm"
                            variant="input"
                            showTestnets={true}
                            className="decoder-address-field__selector"
                          />
                        ) : (
                          <span className="decoder-address-field__badge decoder-address-field__badge--abi">
                            All explorers
                          </span>
                        )}
                      </div>
                    </div>
                    <small className="decoder-network-help">
                      {lookupMode === 'multi'
                        ? 'Searches all supported mainnet explorers (Etherscan + Blockscout). Testnets are not included in this mode.'
                        : 'Target a specific explorer for faster lookups. Testnets are available in the picker.'}
                    </small>
                  </div>
                  <GlassButton
                    onClick={handleContractABIDecode}
                    disabled={isFetchingABI || !contractAddress.trim()}
                    variant={decodedResult ? 'success' : 'decoder'}
                    size="lg"
                    icon={<Search size={18} strokeWidth={1.6} />}
                    style={{ width: '100%' }}
                    className="abi-inline-sheet__button"
                  >
                    {isFetchingABI ? 'Searching...' : decodedResult ? 'Fetch ABI & Re-decode' : 'Search Contract ABI'}
                  </GlassButton>
                  <small className="abi-inline-sheet__hint">
                    Searches verified ABIs across Ethereum, Base, Arbitrum, Optimism, Polygon, BSC, Avalanche, and Fantom (Etherscan & Blockscout).
                  </small>
                </div>
              )}

              {abiAcquisitionMode === 'paste' && (
                <div className="abi-inline-sheet__form">
                  <label className="abi-inline-sheet__label" htmlFor="abi-manual-json">
                    Paste ABI JSON
                  </label>
                  <div className="abi-local-block is-active">
                    <div className="abi-local-header">
                      <span style={{ fontSize: '12px', letterSpacing: '0.05em', textTransform: 'uppercase', color: '#94a3b8' }}>
                        Manual JSON
                      </span>
                      <div className="abi-local-actions">
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          {manualABI.trim() ? `${manualABI.trim().length.toLocaleString()} chars` : 'No JSON provided'}
                        </span>
                        <InlineActionButton
                          ariaLabel="Upload ABI JSON file"
                          title="Upload ABI JSON file"
                          className="abi-inline-upload"
                          size={34}
                          onClick={() => fileInputRef.current?.click()}
                          icon={
                            <svg
                              viewBox="0 0 24 24"
                              width="18"
                              height="18"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                              focusable="false"
                            >
                              <path d="M12 5v10" />
                              <path d="m7 10 5-5 5 5" />
                              <path d="M5 19h14" />
                            </svg>
                          }
                        />
                      </div>
                    </div>
                    <textarea
                      id="abi-manual-json"
                      value={manualABI}
                      onChange={(e) => {
                        setAbiAcquisitionMode('paste');
                        setManualABI(e.target.value);
                      }}
                      placeholder='[{"inputs":[{"name":"to","type":"address"},{"name":"amount","type":"uint256"}],"name":"transfer","type":"function"}]'
                      rows={5}
                      style={{
                        fontFamily: 'monospace',
                        background: 'rgba(15, 23, 42, 0.4)',
                        borderColor: 'rgba(148, 163, 184, 0.25)',
                        resize: 'vertical'
                      }}
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json,application/json"
                      style={{ display: 'none' }}
                      onChange={(event) => {
                        setAbiAcquisitionMode('paste');
                        handleAbiFileSelection(event);
                        if (event.target) {
                          event.target.value = '';
                        }
                      }}
                    />
                    {uploadedABIFileName && (
                      <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px' }}>
                        Selected file: <strong style={{ color: '#e2e8f0' }}>{uploadedABIFileName}</strong>
                      </div>
                    )}
                  </div>

                  {manualABI.trim() && (
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                      Preview:
                      <pre
                        style={{
                          marginTop: '8px',
                          background: 'rgba(15, 23, 42, 0.35)',
                          border: '1px solid rgba(148, 163, 184, 0.2)',
                          borderRadius: '4px',
                          padding: '12px',
                          maxHeight: '200px',
                          overflow: 'auto',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          color: '#e2e8f0'
                        }}
                      >
                        {manualABI}
                      </pre>
                    </div>
                  )}

                  <GlassButton
                    onClick={handleManualABIDecode}
                    variant={decodedResult ? 'success' : 'decoder'}
                    size="lg"
                    disabled={!manualABI.trim()}
                    icon={<FileText size={18} strokeWidth={1.6} />}
                    style={{ width: '100%' }}
                    className="abi-inline-sheet__button"
                  >
                    {decodedResult ? 'Re-decode with ABI' : 'Decode with Manual ABI'}
                  </GlassButton>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Heuristic Results Display */}
      {viewMode !== 'overview' && heuristicResult && renderHeuristicResults()}

      {/* Results */}
      {decodedResult && (
        <div className="panel">
          <h3 style={{ color: '#059669', marginBottom: '16px' }}> Successfully Decoded</h3>
          
          {(contractAddress || contractMetadata || abiSource) && (
            <div className="decoder-contract-meta">
              <span
                className="decoder-contract-name"
                title={contractAddress ? `Contract ${contractAddress}` : 'Contract details unavailable'}
              >
                {resolvedContractName}
              </span>
              {contractMetadata?.source && (
                <span className="decoder-contract-badge decoder-contract-badge--source">
                  {contractMetadata.source}
                </span>
              )}
              {contractAddress && (
                <span className="decoder-contract-badge" title={contractAddress}>
                  {shortenAddress(contractAddress)}
                </span>
              )}
              <span className="decoder-contract-badge" title={`Function entries discovered in ABI`}>
                {functionCount} funcs
              </span>
              <span className="decoder-contract-badge" title={`Event entries discovered in ABI`}>
                {eventCount} events
              </span>
            </div>
          )}
          
          <div className="form-group">
            <label>Function Name:</label>
            <code style={{ 
              background: 'rgba(0, 255, 255, 0.1)', 
              border: '1px solid rgba(0, 255, 255, 0.3)',
              color: '#ffffff',
              padding: '8px 12px', 
              borderRadius: '6px',
              fontSize: '14px',
              display: 'block',
              marginTop: '4px',
              fontFamily: 'monospace'
            }}>{decodedResult.name}</code>
          </div>
          
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center' }}>
              Function Signature:
              {renderAbiSourceBadge()}
            </label>
            <code style={{ 
              background: 'rgba(0, 255, 255, 0.1)', 
              border: '1px solid rgba(0, 255, 255, 0.3)',
              color: '#ffffff',
              padding: '8px 12px', 
              borderRadius: '6px',
              fontSize: '14px',
              display: 'block',
              marginTop: '4px',
              fontFamily: 'monospace'
            }}>{decodedResult.signature}</code>
          </div>

          {decodedResult.args && decodedResult.args.length > 0 && (
            <div className="form-group decoder-view-wrapper">
              <div className="abi-inline-shell decoder-view-shell">
                <SegmentedControl
                  className="abi-source-segmented decoder-view-segmented"
                  ariaLabel="Decoded view selector"
                  value={viewMode}
                  onChange={(next) => setViewMode(next as DecoderViewMode)}
                  options={DECODER_VIEW_OPTIONS.map((option) => ({
                    value: option.value,
                    label: (
                      <span className="abi-segment-label" title={option.tooltip}>
                        <strong>{option.title}</strong>
                        <small>{option.helper}</small>
                      </span>
                    ),
                  }))}
                />
              </div>

              <div className="decoder-view-output">
                {viewMode === 'overview' &&
                  (() => {
                    const { parameterData } = getParameterDisplayData();
                    return <StackedOverview parameterData={parameterData} />;
                  })()}

                {viewMode === 'raw' && (
                  <div className="result-section">
                    {(() => {
                      const { parameterData } = getParameterDisplayData();
                      return <RawJsonView parameters={parameterData} />;
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Enhanced Export and Interoperability Options */}
          {showTransferOptions && (
            <div className="result-section">
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Code2 size={18} />
                Export & Use This Data
              </h4>
              
              <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                {/* Transaction Builder */}
                <GlassButton
                  onClick={handleTransferToBuilder}
                  variant="success"
                  size="md"
                >
                  <Building2 size={16} style={{ marginRight: '8px' }} />
                  Transaction Builder
                </GlassButton>
                
                {/* Copy as JSON */}
                <GlassButton
                  onClick={() => copyToClipboard(JSON.stringify({
                    functionName: decodedResult.name,
                    signature: decodedResult.signature,
                    parameters: decodedResult.args?.map((arg: any, index: number) => {
                      const abiParams = getParameterInfoFromABI(decodedResult.name);
                      return {
                        name: abiParams[index]?.name || `param_${index}`,
                        type: abiParams[index]?.type || 'unknown',
                        value: arg
                      };
                    }) || [],
                    contractAddress: contractAddress || null,
                    abiSource: abiSource
                  }, null, 2), 'decoded data as JSON')}
                  variant="primary"
                  size="md"
                >
                  <CopyIcon width={16} height={16} style={{ marginRight: '8px' }} />
                  Copy JSON
                </GlassButton>
                
                {/* Copy Parameters Only */}
                <GlassButton
                  onClick={() => copyToClipboard(JSON.stringify(decodedResult.args || [], null, 2), 'function parameters')}
                  variant="secondary"
                  size="md"
                >
                  <FileText size={16} style={{ marginRight: '8px' }} />
                  Copy Parameters
                </GlassButton>
                
                {/* Copy Function Signature */}
                <GlassButton
                  onClick={() => copyToClipboard(decodedResult.signature || '', 'function signature')}
                  variant="secondary"
                  size="md"
                >
                  <Code2 size={16} style={{ marginRight: '8px' }} />
                  Copy Signature
                </GlassButton>
              </div>
              
              <div style={{ 
                marginTop: '12px', 
                padding: '12px', 
                background: 'rgba(0, 255, 255, 0.05)', 
                borderRadius: '8px',
                border: '1px solid rgba(0, 255, 255, 0.1)'
              }}>
                <small style={{ 
                  display: 'block', 
                  color: '#ffffff', 
                  opacity: 0.8,
                  lineHeight: '1.4'
                }}>
                  <strong> Export Options:</strong><br />
                  • <strong>Transaction Builder:</strong> Create similar transactions with modified parameters<br />
                  • <strong>JSON:</strong> Complete decoded data for external tools and APIs<br />
                  • <strong>Parameters:</strong> Just the function arguments for quick reference<br />
                  • <strong>Signature:</strong> Function signature for signature databases
                </small>
              </div>
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
            background: 'rgba(13, 23, 44, 0.92)',
            backdropFilter: 'blur(18px)',
            borderRadius: '18px',
            padding: '28px',
            maxWidth: '520px',
            width: '90%',
            boxShadow: '0 28px 60px rgba(5, 12, 28, 0.6)',
            border: '1px solid rgba(59, 130, 246, 0.28)',
            color: '#e2e8f0'
          }}>
            <h3 style={{ 
              color: '#34d399', 
              marginBottom: '18px', 
              fontSize: '20px',
              fontWeight: '600'
            }}>
               Verified Contract Found!
            </h3>
            
            <div style={{
              background: 'rgba(59, 130, 246, 0.12)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: '14px',
              padding: '18px',
              marginBottom: '24px',
              boxShadow: 'inset 0 0 25px rgba(15, 23, 42, 0.45)'
            }}>
              <div style={{ fontSize: '14px', marginBottom: '10px' }}>
                <strong>Name:</strong>
                <span style={{
                  marginLeft: '8px',
                  background: 'rgba(15, 23, 42, 0.55)',
                  padding: '4px 10px',
                  borderRadius: '999px',
                  fontSize: '12px',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  color: '#c7d2fe'
                }}>
                  {contractConfirmation.contractInfo.name || 'Unknown Contract'}
                </span>
              </div>
              <div style={{ fontSize: '14px', marginBottom: '8px' }}>
                <strong>Contract Address:</strong>
                <code style={{ 
                  marginLeft: '8px',
                  background: 'rgba(15, 23, 42, 0.65)',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  color: '#bae6fd'
                }}>
                  {contractConfirmation.contractInfo.address}
                </code>
              </div>
              <div style={{ fontSize: '14px', marginBottom: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                <strong>Found on:</strong> 
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '999px',
                  background: 'rgba(30, 64, 175, 0.35)',
                  border: '1px solid rgba(59, 130, 246, 0.45)',
                  fontSize: '12px',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase'
                }}>
                  {contractConfirmation.contractInfo.source}
                </span>
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
              color: 'rgba(203, 213, 225, 0.85)', 
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
                  background: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  borderRadius: '10px',
                  padding: '10px 18px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  color: 'rgba(226, 232, 240, 0.86)',
                  letterSpacing: '0.04em'
                }}
              >
                Continue Searching
              </button>
              <button
                onClick={contractConfirmation.onConfirm}
                style={{
                  background: 'linear-gradient(135deg, #22d3ee, #6366f1)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '10px',
                  padding: '10px 22px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  color: '#0b1120',
                  fontWeight: '600',
                  boxShadow: '0 12px 28px rgba(56, 189, 248, 0.35)'
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
             Searching Block Explorers...
          </h4>
          {currentSearchProgress.map((step, index) => (
            <div 
              key={index}
              style={{
                fontSize: '13px',
                color: step.startsWith('') ? '#059669' : step.startsWith('') ? '#dc2626' : '#6b7280',
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
