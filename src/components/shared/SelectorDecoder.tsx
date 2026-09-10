import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MagnifyingGlass, Hash, Database, WarningCircle } from '@phosphor-icons/react';
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

  const selectorsKey = useMemo(() => JSON.stringify(selectors), [selectors]);

  const decodeSelectors = useCallback(async () => {
    if (selectors.length === 0) return;

    setIsDecoding(true);
    setProgress({ current: 0, total: selectors.length });
    const results: (DecodedSelector | null)[] = [];

    try {
      // Pass 1: resolve every selector against local sources (custom + cache)
      // synchronously. Selectors that need a network lookup are collected as
      // misses (preserving order via placeholder slots in `results`).
      const customSignatures = getCustomSignatures();
      const cachedFunctions = getCachedSignatures('function');
      const misses: { cleanSelector: string; slot: number }[] = [];

      for (let i = 0; i < selectors.length; i++) {
        const selector = selectors[i];
        setProgress({ current: i + 1, total: selectors.length });

        const local = decodeLocalSelector(selector, customSignatures, cachedFunctions);
        if (local) {
          results.push(local);
        } else {
          const cleanSelector = selector.startsWith('0x') ? selector : `0x${selector}`;
          misses.push({ cleanSelector, slot: results.length });
          results.push(null);
        }
      }

      // Pass 2: resolve misses against OpenChain in chunks (comma-joined per
      // chunk). Chunking bounds the request URL length for large facets, and a
      // failed chunk falls back to per-selector lookups so one failure can't drop
      // every result (the pre-batch serial path could partially succeed).
      if (misses.length > 0) {
        const SELECTOR_LOOKUP_CHUNK = 50;
        const CIRCUIT_BREAK_FAILURES = 3; // consecutive failures ⇒ OpenChain is down
        const functionMap: SignatureResponse['result']['function'] = {};
        // Circuit breaker: once OpenChain looks down, stop issuing requests so a
        // failed chunk's per-selector fallback can't fan out into N serial failures.
        let consecutiveFailures = 0;
        let circuitOpen = false;

        for (let c = 0; c < misses.length && !circuitOpen; c += SELECTOR_LOOKUP_CHUNK) {
          const chunk = misses
            .slice(c, c + SELECTOR_LOOKUP_CHUNK)
            .map(m => m.cleanSelector);
          try {
            const openChainResult = await lookupFunctionSignatures(chunk);
            Object.assign(functionMap, openChainResult.result?.function ?? {});
            consecutiveFailures = 0;
          } catch (error) {
            console.warn('Batched selector lookup failed; retrying this chunk per-selector:', error);
            for (const sel of chunk) {
              if (circuitOpen) break;
              try {
                const single = await lookupFunctionSignatures([sel]);
                Object.assign(functionMap, single.result?.function ?? {});
                consecutiveFailures = 0;
              } catch {
                // leave this selector unresolved
                consecutiveFailures += 1;
                if (consecutiveFailures >= CIRCUIT_BREAK_FAILURES) {
                  circuitOpen = true; // give up the remaining lookups
                }
              }
            }
          }
        }

        for (const { cleanSelector, slot } of misses) {
          const signatures = functionMap[cleanSelector];
          if (signatures && signatures.length > 0) {
            const signature = signatures[0];
            results[slot] = {
              selector: cleanSelector,
              signature: typeof signature === 'string' ? signature : signature.name,
              source: 'openchain',
              confidence: signatures.length > 1 ? 'medium' : 'high'
            };
          }
        }
      }

      // Drop unresolved placeholder slots, preserving original order.
      const finalResults = results.filter((r): r is DecodedSelector => r != null);

      setDecodedResults(finalResults);
      onDecoded?.(finalResults);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to decode selectors';
      onError?.(errorMessage);
    } finally {
      setIsDecoding(false);
    }
  }, [onDecoded, onError, selectors]);

  useEffect(() => {
    if (selectors.length > 0) {
      decodeSelectors();
    }
  }, [selectorsKey, decodeSelectors]);

  // Resolve a single selector against local sources only (no network). Returns
  // null when the selector must fall through to the batched OpenChain lookup.
  const decodeLocalSelector = (
    selector: string,
    customSignatures: ReturnType<typeof getCustomSignatures>,
    cachedFunctions: ReturnType<typeof getCachedSignatures>
  ): DecodedSelector | null => {
    // Ensure selector is properly formatted
    const cleanSelector = selector.startsWith('0x') ? selector : `0x${selector}`;

    // 1. Try custom signatures first (highest confidence)
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
    if (cachedFunctions[cleanSelector]) {
      const cached = cachedFunctions[cleanSelector];
      return {
        selector: cleanSelector,
        signature: cached.name || 'Unknown Function',
        source: 'cached',
        confidence: 'high'
      };
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
          <MagnifyingGlass size={16} className="animate-spin" />
          <span style={{ fontSize: '15px', color: '#64b5f6' }}>
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
            fontSize: '15px',
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
                fontSize: '13px'
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
                  fontSize: '11px',
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