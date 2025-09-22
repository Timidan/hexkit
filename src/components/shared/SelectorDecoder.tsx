import React, { useState, useEffect } from 'react';
import { Search, Hash, Database, AlertCircle } from 'lucide-react';
import {
  lookupFunctionSignatures,
  getCachedSignatures,
  getCustomSignatures,
  type SignatureResponse
} from '../../utils/signatureDatabase';

export interface DecodedSelector {
  selector: string;
  signature: string;
  source: 'custom' | 'cached' | 'openchain';
  confidence: 'high' | 'medium' | 'low';
}

export interface SelectorDecoderProps {
  selectors: string[];
  onDecoded?: (results: DecodedSelector[]) => void;
  onError?: (error: string) => void;
  showProgress?: boolean;
  className?: string;
}

const SelectorDecoder: React.FC<SelectorDecoderProps> = ({
  selectors,
  onDecoded,
  onError,
  showProgress = true,
  className = ''
}) => {
  const [isDecoding, setIsDecoding] = useState(false);
  const [decodedResults, setDecodedResults] = useState<DecodedSelector[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    if (selectors.length > 0) {
      decodeSelectors();
    }
  }, [selectors]);

  const decodeSelectors = async () => {
    if (selectors.length === 0) return;

    setIsDecoding(true);
    setProgress({ current: 0, total: selectors.length });
    const results: DecodedSelector[] = [];

    try {
      for (let i = 0; i < selectors.length; i++) {
        const selector = selectors[i];
        setProgress({ current: i + 1, total: selectors.length });

        const decoded = await decodeSingleSelector(selector);
        if (decoded) {
          results.push(decoded);
        }
      }

      setDecodedResults(results);
      onDecoded?.(results);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to decode selectors';
      onError?.(errorMessage);
    } finally {
      setIsDecoding(false);
    }
  };

  const decodeSingleSelector = async (selector: string): Promise<DecodedSelector | null> => {
    // Ensure selector is properly formatted
    const cleanSelector = selector.startsWith('0x') ? selector : `0x${selector}`;
    
    // 1. Try custom signatures first (highest confidence)
    const customSignatures = getCustomSignatures();
    const customMatch = customSignatures.find(sig => sig.signature.includes(cleanSelector));
    if (customMatch) {
      return {
        selector: cleanSelector,
        signature: customMatch.signature,
        source: 'custom',
        confidence: 'high'
      };
    }

    // 2. Try cached signatures (medium-high confidence)
    const cachedFunctions = getCachedSignatures('function');
    if (cachedFunctions[cleanSelector]) {
      const cached = cachedFunctions[cleanSelector];
      return {
        selector: cleanSelector,
        signature: cached.name || 'Unknown Function',
        source: 'cached',
        confidence: 'high'
      };
    }

    // 3. Try OpenChain lookup (medium confidence)
    try {
      const openChainResult: SignatureResponse = await lookupFunctionSignatures([cleanSelector]);
      const signatures = openChainResult.result?.function?.[cleanSelector];
      
      if (signatures && signatures.length > 0) {
        // Use the first signature (most common)
        const signature = signatures[0];
        return {
          selector: cleanSelector,
          signature: typeof signature === 'string' ? signature : signature.name,
          source: 'openchain',
          confidence: signatures.length > 1 ? 'medium' : 'high'
        };
      }
    } catch (error) {
      console.warn(`Failed to lookup selector ${cleanSelector}:`, error);
    }

    return null;
  };

  if (!showProgress && !isDecoding && decodedResults.length === 0) {
    return null;
  }

  return (
    <div className={`selector-decoder ${className}`}>
      {showProgress && isDecoding && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px',
          background: 'rgba(33, 150, 243, 0.1)',
          border: '1px solid rgba(33, 150, 243, 0.3)',
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          <Search size={16} className="animate-spin" />
          <span style={{ fontSize: '14px', color: '#64b5f6' }}>
            Decoding selectors... ({progress.current}/{progress.total})
          </span>
        </div>
      )}

      {decodedResults.length > 0 && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '8px',
          padding: '16px'
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
            <Database size={16} />
            Decoded Functions ({decodedResults.length})
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {decodedResults.map((result, index) => (
              <div key={index} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '6px',
                fontSize: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Hash size={12} style={{ color: '#888' }} />
                  <code style={{ 
                    color: '#64b5f6',
                    fontFamily: "'SF Mono', 'Monaco', 'Consolas', monospace"
                  }}>
                    {result.selector}
                  </code>
                </div>
                
                <div style={{ 
                  flex: 1,
                  margin: '0 12px',
                  color: '#fff',
                  fontWeight: '500'
                }}>
                  {result.signature}
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '10px',
                  color: result.confidence === 'high' ? '#22c55e' : 
                        result.confidence === 'medium' ? '#f59e0b' : '#ef4444'
                }}>
                  <div style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: 'currentColor'
                  }} />
                  {result.source}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SelectorDecoder;