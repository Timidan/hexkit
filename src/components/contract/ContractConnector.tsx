import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { Search, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { Card, Button, LoadingSpinner, ErrorDisplay, Badge } from '../shared';
import ContractAddressInput from './ContractAddressInput';
import { fetchContractInfoComprehensive } from '../../utils/comprehensiveContractFetcher';
import { detectTokenType } from '../../utils/universalTokenDetector';
import { SUPPORTED_CHAINS, getChainById } from '../../utils/chains';
import { getSharedProvider } from '../../utils/providerPool';
import { userRpcManager } from '../../utils/userRpc';
import type { Chain, ContractInfo } from '../../types';
import type { ContractInfoResult, ContractSearchProgress } from '../../types/contractInfo';
import '../../styles/ContractComponents.css';

const CONTRACT_RESULT_CACHE_TTL_MS = 2 * 60 * 1000;
const contractResultCache = new Map<
  string,
  { timestamp: number; result: ContractInfoResult }
>();

export interface ContractConnectorProps {
  /** Initial contract address */
  initialAddress?: string;
  /** Initial selected network */
  initialNetwork?: Chain;
  /** Callback when contract is successfully connected */
  onContractConnected?: (contractInfo: ContractConnectorResult) => void;
  /** Callback when connection fails */
  onConnectionError?: (error: string) => void;
  /** Callback for consumers who need loading state updates */
  onLoadingChange?: (isLoading: boolean) => void;
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
  onLoadingChange,
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
  const [searchTimeline, setSearchTimeline] = useState<Array<{
    source: string;
    status: 'searching' | 'found' | 'not_found' | 'error';
    message?: string;
  }> | null>(null);
  
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

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

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
    setSearchTimeline(null);
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

  const resolveTokenInfo = useCallback(
    async (
      address: string,
      chain: Chain,
      abi: any[],
      currentName: string,
      preserveName: boolean
    ): Promise<
      | {
          info: NonNullable<ContractConnectorResult['tokenInfo']>;
          name?: string;
        }
      | null
    > => {
      if (!showAdvancedFeatures) return null;

      try {
        const provider = getSharedProvider(chain);
        const tokenResult = await detectTokenType(provider, address);

        if (tokenResult.type !== 'unknown') {
          const resolvedName =
            preserveName || !tokenResult.name
              ? undefined
              : tokenResult.name;

          return {
            info: {
              type: tokenResult.type,
              symbol: tokenResult.symbol,
              name: preserveName
                ? currentName
                : tokenResult.name || currentName,
              decimals: tokenResult.decimals,
              confidence: tokenResult.confidence,
            },
            name: resolvedName,
          };
        }
      } catch (error) {
        console.warn('Token detection failed:', error);
      }

      return null;
    },
    [showAdvancedFeatures]
  );

  const fetchABI = useCallback(async () => {
    if (!contractAddress || !selectedNetwork) {
      setError('Please enter a contract address and select a network');
      return;
    }

    if (!ethers.utils.isAddress(contractAddress)) {
      setError('Invalid contract address format');
      return;
    }

    const checksumAddress = ethers.utils.getAddress(contractAddress);
    const chainConfig =
      getChainById(selectedNetwork?.id || 0) || selectedNetwork;
    const cacheKey = `${chainConfig.id}:${checksumAddress}`;

    const hydrateResult = async (
      lookupResult: ContractInfoResult,
      options: { fromCache: boolean }
    ) => {
      if (!lookupResult.abi) {
        throw new Error('Lookup returned an empty ABI payload');
      }

      let parsedAbi: any[];
      try {
        parsedAbi =
          typeof lookupResult.abi === 'string'
            ? JSON.parse(lookupResult.abi)
            : lookupResult.abi;
      } catch (parseError) {
        throw new Error(
          `Failed to parse ABI from ${lookupResult.source || 'lookup'}`
        );
      }

      const iface = new ethers.utils.Interface(parsedAbi);
      const { readFunctions: reads, writeFunctions: writes } =
        categorizeABIFunctions(parsedAbi);

      let finalName = lookupResult.contractName || 'Unknown Contract';
      let finalTokenInfo =
        lookupResult.tokenInfo && Object.keys(lookupResult.tokenInfo).length
          ? lookupResult.tokenInfo
          : null;

      if (!finalTokenInfo) {
        const resolution = await resolveTokenInfo(
          checksumAddress,
          chainConfig,
          parsedAbi,
          finalName,
          lookupResult.source === 'sourcify'
        );
        if (resolution) {
          finalTokenInfo = resolution.info;
          if (resolution.name) {
            finalName = resolution.name;
          }
        }
      }

      setTokenInfo(finalTokenInfo);
      setContractName(finalName);
      setContractInterface(iface);
      setReadFunctions(reads);
      setWriteFunctions(writes);
      setAbiSource(
        (lookupResult.source as ContractConnectorResult['abiSource']) ?? 'manual'
      );
      setContractInfo({
        address: checksumAddress,
        chain: chainConfig,
        abi:
          typeof lookupResult.abi === 'string'
            ? lookupResult.abi
            : JSON.stringify(lookupResult.abi),
        name: finalName,
        verified: Boolean(lookupResult.success),
      });
      setSearchProgress({
        source: options.fromCache
          ? 'Cache'
          : lookupResult.source || 'Unknown',
        status: 'found',
        message: options.fromCache
          ? `Loaded cached contract: ${finalName}`
          : `Found contract: ${finalName}`,
      });
      setSearchTimeline(lookupResult.searchProgress || []);

      if (onContractConnected) {
        onContractConnected({
          address: checksumAddress,
          chain: chainConfig,
          abi: parsedAbi,
          contractName: finalName,
          abiSource:
            (lookupResult.source as ContractConnectorResult['abiSource']) ??
            'manual',
          tokenInfo: finalTokenInfo || undefined,
          readFunctions: reads,
          writeFunctions: writes,
          interface: iface,
        });
      }
    };

    setIsLoading(true);
    resetState();

    try {
      const cached = contractResultCache.get(cacheKey);
      if (
        cached &&
        Date.now() - cached.timestamp < CONTRACT_RESULT_CACHE_TTL_MS
      ) {
        await hydrateResult(cached.result, { fromCache: true });
        return;
      }

      setSearchProgress({
        source: 'Comprehensive Search',
        status: 'searching',
        message: 'Searching multiple sources...',
      });
      setSearchTimeline(null);

      const progressEvents: ContractSearchProgress[] = [];

      const result = await fetchContractInfoComprehensive(
        checksumAddress,
        chainConfig,
        (progress) => {
          progressEvents.push(progress);
          setSearchTimeline([...progressEvents]);
          setSearchProgress({
            source: progress.source,
            status: progress.status,
            message: progress.message,
          });
        },
        {
          etherscanApiKey: userRpcManager.getEtherscanKey(),
        }
      );

      if (result.success && result.abi) {
        contractResultCache.set(cacheKey, {
          timestamp: Date.now(),
          result,
        });
        await hydrateResult(result, { fromCache: false });
      } else {
        setSearchTimeline(result.searchProgress || []);
        const errorMsg =
          result.error || 'Could not fetch ABI from any explorer';
        setError(errorMsg);
        setSearchProgress({
          source: 'All Sources',
          status: 'not_found',
          message: errorMsg,
        });

        if (onConnectionError) {
          onConnectionError(errorMsg);
        }
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch contract ABI';
      setError(errorMessage);
      setSearchProgress({
        source: 'Error',
        status: 'error',
        message: errorMessage,
      });
      setSearchTimeline(null);

      if (onConnectionError) {
        onConnectionError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    contractAddress,
    selectedNetwork,
    onContractConnected,
    onConnectionError,
    resetState,
    categorizeABIFunctions,
    resolveTokenInfo,
  ]);

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

        {searchTimeline && searchTimeline.length > 0 && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <Card title="Lookup Trace" variant="default" padding="sm">
              <ol style={{ listStyle: 'decimal', paddingLeft: '1.25rem', margin: 0 }}>
                {searchTimeline.map((entry, index) => {
                  const color =
                    entry.status === 'found'
                      ? 'var(--success)'
                      : entry.status === 'searching'
                        ? 'var(--info)'
                        : entry.status === 'not_found'
                          ? 'var(--warning)'
                          : 'var(--error)';
                  return (
                    <li
                      key={`${entry.source}-${index}`}
                      style={{ marginBottom: index === searchTimeline.length - 1 ? 0 : '0.35rem' }}
                    >
                      <span style={{ fontWeight: 500, color }}>
                        {entry.source} &mdash; {entry.status}
                      </span>
                      {entry.message && (
                        <span
                          style={{
                            display: 'block',
                            fontSize: 'var(--text-xs)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {entry.message}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
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
