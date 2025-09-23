import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { Search, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { Card, Button, LoadingSpinner, ErrorDisplay, Badge } from '../shared';
import ContractAddressInput from './ContractAddressInput';
import { fetchContractInfoComprehensive } from '../../utils/comprehensiveContractFetcher';
import { detectTokenType } from '../../utils/universalTokenDetector';
import { SUPPORTED_CHAINS, getChainById } from '../../utils/chains';
import type { Chain, ContractInfo } from '../../types';
import '../../styles/ContractComponents.css';

export interface ContractConnectorProps {
  /** Initial contract address */
  initialAddress?: string;
  /** Initial selected network */
  initialNetwork?: Chain;
  /** Callback when contract is successfully connected */
  onContractConnected?: (contractInfo: ContractConnectorResult) => void;
  /** Callback when connection fails */
  onConnectionError?: (error: string) => void;
  /** Whether to show advanced features like token detection */
  showAdvancedFeatures?: boolean;
  /** Custom supported chains (defaults to SUPPORTED_CHAINS) */
  supportedChains?: Chain[];
  /** Additional CSS classes */
  className?: string;
}

export interface ContractConnectorResult {
  address: string;
  chain: Chain;
  abi: any[];
  contractName?: string;
  abiSource?:
    | 'sourcify'
    | 'blockscout'
    | 'etherscan'
    | 'blockscout-bytecode'
    | 'manual';
  tokenInfo?: {
    type?: string;
    symbol?: string;
    name?: string;
    decimals?: number;
    confidence?: number;
  };
  readFunctions: ethers.utils.FunctionFragment[];
  writeFunctions: ethers.utils.FunctionFragment[];
  interface: ethers.utils.Interface;
}

export interface SearchProgress {
  source: string;
  status: 'searching' | 'found' | 'not_found' | 'error';
  message?: string;
}

const ContractConnector: React.FC<ContractConnectorProps> = ({
  initialAddress = '',
  initialNetwork,
  onContractConnected,
  onConnectionError,
  showAdvancedFeatures = true,
  supportedChains = SUPPORTED_CHAINS,
  className = ''
}) => {
  const [contractAddress, setContractAddress] = useState(initialAddress);
  const [selectedNetwork, setSelectedNetwork] = useState<Chain | null>(
    initialNetwork || supportedChains[0]
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchProgress, setSearchProgress] = useState<SearchProgress | null>(null);
  
  // Contract info state
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  const [abiSource, setAbiSource] = useState<
    | 'sourcify'
    | 'blockscout'
    | 'etherscan'
    | 'blockscout-bytecode'
    | 'manual'
    | null
  >(null);
  const [contractName, setContractName] = useState<string>('');
  const [tokenInfo, setTokenInfo] = useState<{
    type?: string;
    symbol?: string;
    name?: string;
    decimals?: number;
    confidence?: number;
  } | null>(null);
  
  // Function categorization
  const [readFunctions, setReadFunctions] = useState<ethers.utils.FunctionFragment[]>([]);
  const [writeFunctions, setWriteFunctions] = useState<ethers.utils.FunctionFragment[]>([]);
  const [contractInterface, setContractInterface] = useState<ethers.utils.Interface | null>(null);

  // Update address when prop changes
  useEffect(() => {
    setContractAddress(initialAddress);
  }, [initialAddress]);

  // Update network when prop changes
  useEffect(() => {
    if (initialNetwork) {
      setSelectedNetwork(initialNetwork);
    }
  }, [initialNetwork]);

  const resetState = useCallback(() => {
    setError(null);
    setSearchProgress(null);
    setContractInfo(null);
    setAbiSource(null);
    setContractName('');
    setTokenInfo(null);
    setReadFunctions([]);
    setWriteFunctions([]);
    setContractInterface(null);
  }, []);

  const categorizeABIFunctions = useCallback((abi: any[]): {
    readFunctions: ethers.utils.FunctionFragment[];
    writeFunctions: ethers.utils.FunctionFragment[];
  } => {
    const iface = new ethers.utils.Interface(abi);
    const functions = Object.values(iface.functions);
    
    const readFuncs: ethers.utils.FunctionFragment[] = [];
    const writeFuncs: ethers.utils.FunctionFragment[] = [];
    
    functions.forEach((func) => {
      if (func.stateMutability === 'view' || func.stateMutability === 'pure') {
        readFuncs.push(func);
      } else {
        writeFuncs.push(func);
      }
    });
    
    return { readFunctions: readFuncs, writeFunctions: writeFuncs };
  }, []);

  const detectAndFetchTokenInfo = useCallback(async (
    address: string,
    chain: Chain,
    abi: any[],
    preserveName = false
  ) => {
    if (!showAdvancedFeatures) return;
    
    try {
      // Create provider for token detection
      const provider = new ethers.providers.JsonRpcProvider(chain.rpcUrl);
      const tokenResult = await detectTokenType(provider, address);
      
      if (tokenResult.type !== 'unknown') {
        setTokenInfo({
          type: tokenResult.type,
          symbol: tokenResult.symbol,
          name: preserveName ? contractName : (tokenResult.name || contractName),
          decimals: tokenResult.decimals,
          confidence: tokenResult.confidence
        });
        
        // Update contract name if we got a better one from token detection
        if (!preserveName && tokenResult.name) {
          setContractName(tokenResult.name);
        }
      }
    } catch (error) {
      console.warn('Token detection failed:', error);
    }
  }, [showAdvancedFeatures, contractName]);

  const fetchABI = useCallback(async () => {
    if (!contractAddress || !selectedNetwork) {
      setError('Please enter a contract address and select a network');
      return;
    }

    if (!ethers.utils.isAddress(contractAddress)) {
      setError('Invalid contract address format');
      return;
    }

    setIsLoading(true);
    resetState();

    try {
      // Use checksum address for better compatibility
      const checksumAddress = ethers.utils.getAddress(contractAddress);
      
      setSearchProgress({
        source: 'Comprehensive Search',
        status: 'searching',
        message: 'Searching multiple sources...'
      });

      const chainConfig =
        getChainById(selectedNetwork?.id || 0) || selectedNetwork;

      const result = await fetchContractInfoComprehensive(
        checksumAddress,
        chainConfig
      );

      if (result.success && result.abi) {
        const parsedABI = JSON.parse(result.abi);
        const iface = new ethers.utils.Interface(parsedABI);
        const { readFunctions: reads, writeFunctions: writes } = categorizeABIFunctions(parsedABI);
        
        // Update state
        setContractInterface(iface);
        setReadFunctions(reads);
        setWriteFunctions(writes);
        setAbiSource(
          result.source as
            | 'sourcify'
            | 'blockscout'
            | 'etherscan'
            | 'blockscout-bytecode'
        );
        
        // Set contract name
        const extractedName = result.contractName || 'Unknown Contract';
        setContractName(extractedName);
        
        // Create contract info
        const info: ContractInfo = {
          address: checksumAddress,
          chain: chainConfig,
          abi: result.abi,
          name: extractedName,
          verified: true
        };
        setContractInfo(info);
        
        setSearchProgress({
          source: result.source || 'Unknown',
          status: 'found',
          message: `Found contract: ${extractedName}`
        });

        // Detect token information
        await detectAndFetchTokenInfo(
          checksumAddress,
          selectedNetwork,
          parsedABI,
          result.source === 'sourcify' // Preserve Sourcify names
        );

        // Call success callback
        if (onContractConnected) {
          const connectorResult: ContractConnectorResult = {
            address: checksumAddress,
            chain: chainConfig,
            abi: parsedABI,
            contractName: extractedName,
            abiSource: result.source as
              | 'sourcify'
              | 'blockscout'
              | 'etherscan'
              | 'blockscout-bytecode'
              | 'manual',
            tokenInfo: tokenInfo || undefined,
            readFunctions: reads,
            writeFunctions: writes,
            interface: iface
          };
          onContractConnected(connectorResult);
        }

      } else {
        const errorMsg = result.error || 'Could not fetch ABI from any source';
        setError(errorMsg);
        setSearchProgress({
          source: 'All Sources',
          status: 'not_found',
          message: errorMsg
        });
        
        if (onConnectionError) {
          onConnectionError(errorMsg);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch contract ABI';
      setError(errorMessage);
      setSearchProgress({
        source: 'Error',
        status: 'error',
        message: errorMessage
      });
      
      if (onConnectionError) {
        onConnectionError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  }, [contractAddress, selectedNetwork, onContractConnected, onConnectionError, resetState, categorizeABIFunctions, detectAndFetchTokenInfo, tokenInfo]);

  return (
    <div className={`contract-connector ${className}`}>
      <Card title="Contract Connection" variant="default">
        {/* Address Input */}
        <ContractAddressInput
          contractAddress={contractAddress}
          onAddressChange={setContractAddress}
          selectedNetwork={selectedNetwork}
          onNetworkChange={setSelectedNetwork}
          supportedChains={supportedChains}
          isLoading={isLoading}
          error={error}
          onFetchABI={fetchABI}
          contractName={contractName}
          abiSource={abiSource}
          tokenInfo={tokenInfo}
        />

        {/* Search Progress */}
        {searchProgress && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Card variant="glass" padding="sm">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                {searchProgress.status === 'searching' && <LoadingSpinner size="sm" />}
                {searchProgress.status === 'found' && <CheckCircle size={16} style={{ color: 'var(--success)' }} />}
                {searchProgress.status === 'error' && <AlertTriangle size={16} style={{ color: 'var(--error)' }} />}
                
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-medium)' }}>
                    {searchProgress.source}
                  </div>
                  {searchProgress.message && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      {searchProgress.message}
                    </div>
                  )}
                </div>
                
                <Badge 
                  variant={
                    searchProgress.status === 'found' ? 'success' :
                    searchProgress.status === 'error' ? 'error' :
                    searchProgress.status === 'searching' ? 'info' : 'default'
                  }
                  size="sm"
                >
                  {searchProgress.status}
                </Badge>
              </div>
            </Card>
          </div>
        )}

        {/* Contract Summary */}
        {contractInfo && !error && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Card title="Contract Summary" variant="accent" padding="md">
              <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                <div>
                  <span style={{ fontWeight: 'var(--font-weight-medium)' }}>Functions:</span>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
                    <Badge variant="info" size="sm">
                      {readFunctions.length} Read
                    </Badge>
                    <Badge variant="warning" size="sm">
                      {writeFunctions.length} Write
                    </Badge>
                  </div>
                </div>
                
                {tokenInfo && tokenInfo.type !== 'unknown' && (
                  <div>
                    <span style={{ fontWeight: 'var(--font-weight-medium)' }}>Token Type:</span>
                    <div style={{ marginTop: 'var(--space-1)' }}>
                      <Badge variant="success" size="sm">
                        {tokenInfo.type?.toUpperCase()}
                      </Badge>
                      {tokenInfo.confidence && (
                        <span style={{ 
                          fontSize: 'var(--text-xs)', 
                          color: 'var(--text-muted)', 
                          marginLeft: 'var(--space-2)' 
                        }}>
                          {Math.round(tokenInfo.confidence * 100)}% confidence
                        </span>
                      )}
                    </div>
                  </div>
                )}
                
                <div>
                  <span style={{ fontWeight: 'var(--font-weight-medium)' }}>Status:</span>
                  <div style={{ marginTop: 'var(--space-1)' }}>
                    <Badge variant="success" size="sm">
                      Connected & Verified
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ContractConnector;
