import React, { useState } from 'react';
import { Clock, Hash, TrendingUp, AlertTriangle } from 'lucide-react';
import { SUPPORTED_CHAINS } from '../../utils/chains';
import type { Chain } from '../../types';
import SelectorDecoder, { type DecodedSelector } from './SelectorDecoder';

export interface AnalyzedFunction {
  selector: string;
  signature?: string;
  callCount: number;
  lastUsed: Date;
  confidence: 'high' | 'medium' | 'low';
  transactionHashes: string[];
}

export interface TransactionHistoryAnalyzerProps {
  contractAddress: string;
  chain: Chain;
  onAnalyzed?: (functions: AnalyzedFunction[]) => void;
  onError?: (error: string) => void;
  maxTransactions?: number;
  className?: string;
}

const TransactionHistoryAnalyzer: React.FC<TransactionHistoryAnalyzerProps> = ({
  contractAddress,
  chain,
  onAnalyzed,
  onError,
  maxTransactions = 100,
  className = ''
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzedFunctions, setAnalyzedFunctions] = useState<AnalyzedFunction[]>([]);
  const [uniqueSelectors, setUniqueSelectors] = useState<string[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const analyzeTransactionHistory = async () => {
    setIsAnalyzing(true);
    setProgress({ current: 0, total: maxTransactions });

    try {
      // Use Blockscout API to fetch transaction history
      const transactions = await fetchTransactionHistory();
      
      if (transactions.length === 0) {
        onError?.('No transactions found for this contract');
        return;
      }

      // Extract and analyze function selectors
      const selectorMap = new Map<string, {
        count: number;
        lastUsed: Date;
        transactions: string[];
      }>();

      transactions.forEach((tx: any, index: number) => {
        setProgress({ current: index + 1, total: transactions.length });
        
        if (tx.input && tx.input.length >= 10) {
          const selector = tx.input.slice(0, 10);
          const timestamp = new Date(tx.timeStamp * 1000);
          
          if (selectorMap.has(selector)) {
            const existing = selectorMap.get(selector)!;
            existing.count++;
            existing.transactions.push(tx.hash);
            if (timestamp > existing.lastUsed) {
              existing.lastUsed = timestamp;
            }
          } else {
            selectorMap.set(selector, {
              count: 1,
              lastUsed: timestamp,
              transactions: [tx.hash]
            });
          }
        }
      });

      // Convert to analyzed functions
      const functions: AnalyzedFunction[] = Array.from(selectorMap.entries())
        .map(([selector, data]) => ({
          selector,
          callCount: data.count,
          lastUsed: data.lastUsed,
          confidence: (data.count > 5 ? 'high' : data.count > 2 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
          transactionHashes: data.transactions.slice(0, 5) // Keep only first 5 for display
        }))
        .sort((a, b) => b.callCount - a.callCount); // Sort by usage frequency

      setAnalyzedFunctions(functions);
      setUniqueSelectors(functions.map(f => f.selector));
      onAnalyzed?.(functions);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to analyze transaction history';
      onError?.(errorMessage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const fetchTransactionHistory = async () => {
    const baseUrl = getBlockscoutBaseUrl(chain);
    if (!baseUrl) {
      throw new Error(`Blockscout not available for chain ${chain.name}`);
    }

    const response = await fetch(
      `${baseUrl}/api?module=account&action=txlist&address=${contractAddress}&startblock=0&endblock=latest&page=1&offset=${maxTransactions}&sort=desc`,
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Blockscout API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.status !== '1') {
      throw new Error(data.message || 'Failed to fetch transactions from Blockscout');
    }

    return data.result || [];
  };

  const getBlockscoutBaseUrl = (chain: Chain): string | null => {
    // Map chain IDs to Blockscout instances
    const blockscoutUrls: Record<number, string> = {
      1: 'https://blockscout.com/eth/mainnet',
      137: 'https://polygon.blockscout.com',
      8453: 'https://base.blockscout.com',
      42161: 'https://arbitrum.blockscout.com',
      10: 'https://optimism.blockscout.com',
      100: 'https://gnosis.blockscout.com',
      // Add more as needed
    };

    return blockscoutUrls[chain.id] || null;
  };

  const handleSelectorDecoded = (decodedResults: DecodedSelector[]) => {
    // Update analyzed functions with decoded signatures
    const updatedFunctions = analyzedFunctions.map(func => {
      const decoded = decodedResults.find(d => d.selector === func.selector);
      return {
        ...func,
        signature: decoded?.signature || func.signature
      };
    });
    
    setAnalyzedFunctions(updatedFunctions);
    onAnalyzed?.(updatedFunctions);
  };

  return (
    <div className={`transaction-history-analyzer ${className}`}>
      {/* Analysis Controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '14px',
          fontWeight: '600',
          color: '#fff'
        }}>
          <Clock size={16} />
          Transaction History Analysis
        </div>
        
        <button
          onClick={analyzeTransactionHistory}
          disabled={isAnalyzing}
          style={{
            padding: '8px 16px',
            background: isAnalyzing ? 'rgba(255, 255, 255, 0.1)' : '#007bff',
            border: 'none',
            borderRadius: '6px',
            color: '#fff',
            fontSize: '12px',
            cursor: isAnalyzing ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          {isAnalyzing ? 'Analyzing...' : 'Analyze Functions'}
        </button>
      </div>

      {/* Progress Indicator */}
      {isAnalyzing && (
        <div style={{
          padding: '12px',
          background: 'rgba(33, 150, 243, 0.1)',
          border: '1px solid rgba(33, 150, 243, 0.3)',
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: '#64b5f6'
          }}>
            <TrendingUp size={14} />
            Processing transactions... ({progress.current}/{progress.total})
          </div>
        </div>
      )}

      {/* Selector Decoder */}
      {uniqueSelectors.length > 0 && (
        <SelectorDecoder
          selectors={uniqueSelectors}
          onDecoded={handleSelectorDecoded}
          onError={onError}
          showProgress={false}
        />
      )}

      {/* Results Display */}
      {analyzedFunctions.length > 0 && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '8px',
          padding: '16px',
          marginTop: '16px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px',
            fontSize: '14px',
            fontWeight: '600',
            color: '#fff'
          }}>
            <Hash size={16} />
            Discovered Functions ({analyzedFunctions.length})
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {analyzedFunctions.map((func, index) => (
              <div key={index} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '6px'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#fff',
                    marginBottom: '4px'
                  }}>
                    {func.signature || 'Unknown Function'}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    fontFamily: "'SF Mono', 'Monaco', 'Consolas', monospace",
                    color: '#888'
                  }}>
                    {func.selector}
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  fontSize: '11px'
                }}>
                  <div style={{ color: '#64b5f6' }}>
                    {func.callCount} calls
                  </div>
                  <div style={{ color: '#888' }}>
                    {func.lastUsed.toLocaleDateString()}
                  </div>
                  <div style={{
                    color: func.confidence === 'high' ? '#22c55e' : 
                          func.confidence === 'medium' ? '#f59e0b' : '#ef4444'
                  }}>
                    {func.confidence}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionHistoryAnalyzer;