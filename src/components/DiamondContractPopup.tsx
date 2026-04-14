import React, { useState, useEffect } from 'react';
import { MagnifyingGlass, Warning, ArrowSquareOut, Diamond, Copy, CaretDown, CaretUp } from '@phosphor-icons/react';
import { useNotifications } from './NotificationManager';
import type { DiamondFacet } from '../utils/diamondFacetFetcher';
import SelectorDecoder, { type DecodedSelector } from './shared/SelectorDecoder';
import { ethers } from 'ethers';
import type { Chain } from '../types';
import { CopyButton } from './ui/copy-button';
import { copyTextToClipboard } from '../utils/clipboard';
import { useNetworkConfig } from '../contexts/NetworkConfigContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { cn } from '@/lib/utils';

interface DiamondContractPopupProps {
  isOpen: boolean;
  onClose: () => void;
  contractAddress: string;
  facets: DiamondFacet[];
  networkName: string;
  blockExplorerUrl?: string;
  chain?: Chain;
}

interface FacetFunction {
  name: string;
  selector: string;
  type: 'function' | 'fallback' | 'receive';
  stateMutability?: string;
  inputs?: any[];
  outputs?: any[];
}

const DiamondContractPopup: React.FC<DiamondContractPopupProps> = ({
  isOpen,
  onClose,
  contractAddress,
  facets,
  networkName,
  blockExplorerUrl,
  chain
}) => {
  const { resolveRpcUrl } = useNetworkConfig();
  const { showSuccess, showError } = useNotifications();
  const [selectedFacetIndex, setSelectedFacetIndex] = useState<number>(0);
  const [expandedABI, setExpandedABI] = useState<boolean>(false);
  const [expandedFunctions, setExpandedFunctions] = useState<boolean>(false);
  const [facetSelectors, setFacetSelectors] = useState<{[facetAddress: string]: string[]}>({});
  const [isLoadingSelectors, setIsLoadingSelectors] = useState<{[facetAddress: string]: boolean}>({});
  const [decodedSelectors, setDecodedSelectors] = useState<{[facetAddress: string]: DecodedSelector[]}>({});

  useEffect(() => {
    if (isOpen) {
      setSelectedFacetIndex(0);
      setExpandedABI(false);
      loadUnverifiedFacetSelectors();
    }
  }, [isOpen, facets]);

  const loadUnverifiedFacetSelectors = async () => {
    if (!chain) return;

    const unverifiedFacets = facets.filter(facet => !facet.isVerified);

    for (const facet of unverifiedFacets) {
      if (facetSelectors[facet.address]) continue;

      setIsLoadingSelectors(prev => ({ ...prev, [facet.address]: true }));

      try {
        const selectors = await fetchFacetFunctionSelectors(contractAddress, facet.address, chain);
        setFacetSelectors(prev => ({ ...prev, [facet.address]: selectors }));
      } catch (error) {
        console.warn(`Failed to load selectors for facet ${facet.address}:`, error);
      } finally {
        setIsLoadingSelectors(prev => ({ ...prev, [facet.address]: false }));
      }
    }
  };

  const fetchFacetFunctionSelectors = async (diamondAddress: string, facetAddress: string, chain: Chain): Promise<string[]> => {
    const rpcUrl = resolveRpcUrl(chain.id, chain.rpcUrl).url;
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

    const diamondABI = [
      "function facetFunctionSelectors(address facet) external view returns (bytes4[] memory)"
    ];

    const diamondContract = new ethers.Contract(diamondAddress, diamondABI, provider);
    const selectors: string[] = await diamondContract.facetFunctionSelectors(facetAddress);
    return selectors.map((selector: string) => selector.toLowerCase());
  };

  const handleCopyWithToast = async (text: string, label: string) => {
    try {
      await copyTextToClipboard(text);
      showSuccess('Copied!', `${label} copied to clipboard`);
    } catch (err) {
      showError('Copy Failed', 'Failed to copy to clipboard');
    }
  };

  const handleSelectorDecoded = (facetAddress: string, decodedResults: DecodedSelector[]) => {
    setDecodedSelectors(prev => ({ ...prev, [facetAddress]: decodedResults }));
  };

  const selectedFacet = facets[selectedFacetIndex];

  const calculateFunctionSelector = (functionSignature: string): string => {
    try {
      const hash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(functionSignature));
      return hash.slice(0, 10);
    } catch (error) {
      let hash = 0;
      for (let i = 0; i < functionSignature.length; i++) {
        const char = functionSignature.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return `0x${(Math.abs(hash) >>> 0).toString(16).slice(0, 8).padStart(8, '0')}`;
    }
  };

  const getFacetFunctions = (facet: DiamondFacet): FacetFunction[] => {
    if (facet.isVerified && facet.abi && facet.abi.length > 0) {
      const functions: FacetFunction[] = [];
      facet.abi.forEach((item: any) => {
        if (item.type === 'function') {
          const inputTypes = item.inputs?.map((input: any) => input.type).join(',') || '';
          const signature = `${item.name}(${inputTypes})`;
          const selector = calculateFunctionSelector(signature);

          functions.push({
            name: item.name,
            selector,
            type: item.type,
            stateMutability: item.stateMutability,
            inputs: item.inputs,
            outputs: item.outputs
          });
        }
      });
      return functions;
    }

    if (!facet.isVerified) {
      const rawSelectors = facetSelectors[facet.address] || [];
      const decodedResults = decodedSelectors[facet.address] || [];

      if (rawSelectors.length > 0) {
        return rawSelectors.map((selector: string) => {
          const decoded = decodedResults.find(d => d.selector.toLowerCase() === selector.toLowerCase());

          return {
            name: decoded?.signature || `Unknown Function (${selector})`,
            selector: selector,
            type: 'function' as const,
            stateMutability: 'unknown' as any
          };
        });
      }
    }

    if (!facet.abi || facet.abi.length === 0) {
      const allFunctions: FacetFunction[] = [];

      if (facet.functions?.read) {
        facet.functions.read.forEach((func: any) => {
          const functionName = func.name || 'unknownFunction';
          const inputTypes = func.inputs?.map((input: any) => input.type).join(',') || '';
          const signature = `${functionName}(${inputTypes})`;

          allFunctions.push({
            name: functionName,
            selector: calculateFunctionSelector(signature),
            type: 'function' as const,
            stateMutability: 'view'
          });
        });
      }

      if (facet.functions?.write) {
        facet.functions.write.forEach((func: any) => {
          const functionName = func.name || 'unknownFunction';
          const inputTypes = func.inputs?.map((input: any) => input.type).join(',') || '';
          const signature = `${functionName}(${inputTypes})`;

          allFunctions.push({
            name: functionName,
            selector: calculateFunctionSelector(signature),
            type: 'function' as const,
            stateMutability: func.stateMutability || 'nonpayable'
          });
        });
      }

      if (allFunctions.length > 0) return allFunctions;
    }

    return [{
      name: 'No Functions Available',
      selector: '0x00000000',
      type: 'function' as const
    }];
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-5 pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Diamond className="h-6 w-6 text-blue-500" />
              <div>
                <DialogTitle className="text-lg">Diamond Contract Details</DialogTitle>
                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground font-mono">
                  {contractAddress}
                  <CopyButton
                    value={contractAddress}
                    ariaLabel="Copy contract address"
                    iconSize={14}
                    onCopySuccess={() => showSuccess('Copied!', 'Contract address copied to clipboard')}
                    onCopyError={() => showError('Copy Failed', 'Failed to copy to clipboard')}
                  />
                </div>
              </div>
            </div>

            {blockExplorerUrl && (
              <a
                href={`${blockExplorerUrl}/address/${contractAddress}`}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-lg text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 transition-colors"
              >
                <ArrowSquareOut className="h-4 w-4" />
              </a>
            )}
          </div>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden min-h-[500px]">
          {/* Facet List Sidebar */}
          <div className="w-[280px] border-r border-border bg-muted/30 overflow-auto">
            <div className="p-4">
              <h3 className="text-sm font-semibold mb-3">Facets ({facets.length})</h3>

              <div className="space-y-2">
                {facets.map((facet, index) => (
                  <button
                    type="button"
                    key={index}
                    onClick={() => setSelectedFacetIndex(index)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border transition-all cursor-pointer",
                      selectedFacetIndex === index
                        ? "border-blue-500/30 bg-blue-500/10"
                        : "border-border hover:border-border hover:bg-muted/50"
                    )}
                  >
                    <div className="text-sm font-medium truncate">
                      {facet.name || 'Unknown Facet'}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-1">
                      {facet.address.slice(0, 10)}...{facet.address.slice(-8)}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-muted-foreground">
                        {getFacetFunctions(facet).length} functions
                      </span>
                      <Badge variant={facet.isVerified ? "success" : "warning"} size="sm">
                        {facet.isVerified ? 'Verified' : 'Unverified'}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-5">
            {selectedFacet && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold">
                      {selectedFacet.name || 'Unknown Facet'}
                    </h3>
                    <Badge variant={selectedFacet.isVerified ? "success" : "warning"} size="sm">
                      {selectedFacet.isVerified ? 'Verified' : 'Unverified'}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
                    {selectedFacet.address}
                    <CopyButton
                      value={selectedFacet.address}
                      ariaLabel="Copy facet address"
                      iconSize={14}
                      onCopySuccess={() => showSuccess('Copied!', 'Facet address copied to clipboard')}
                      onCopyError={() => showError('Copy Failed', 'Failed to copy to clipboard')}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold">
                      Functions ({getFacetFunctions(selectedFacet).length})
                    </h4>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setExpandedFunctions(!expandedFunctions)}
                    >
                      {expandedFunctions ? (
                        <>
                          <CaretUp className="h-3 w-3 mr-1" />
                          Collapse
                        </>
                      ) : (
                        <>
                          <CaretDown className="h-3 w-3 mr-1" />
                          Expand
                        </>
                      )}
                    </Button>
                  </div>

                  {!selectedFacet.isVerified && isLoadingSelectors[selectedFacet.address] && (
                    <Alert className="mb-4 bg-blue-500/10 border-blue-500/30">
                      <MagnifyingGlass className="h-4 w-4 animate-spin" />
                      <AlertDescription className="text-blue-400">
                        Loading function selectors...
                      </AlertDescription>
                    </Alert>
                  )}

                  {!selectedFacet.isVerified && facetSelectors[selectedFacet.address]?.length > 0 && (
                    <div className="mb-4">
                      <SelectorDecoder
                        selectors={facetSelectors[selectedFacet.address]}
                        onDecoded={(results) => handleSelectorDecoded(selectedFacet.address, results)}
                        onError={(error) => showError('Decoder Error', error)}
                        showProgress={false}
                        className="facet-selector-decoder"
                      />
                    </div>
                  )}

                  {!selectedFacet.isVerified && (
                    <Alert className="mb-4 bg-amber-500/10 border-amber-500/30">
                      <Warning className="h-4 w-4 text-amber-500" />
                      <AlertDescription className="text-amber-400">
                        Unverified Facet - Function names resolved using signature database
                      </AlertDescription>
                    </Alert>
                  )}

                  <div
                    className={cn(
                      "rounded-lg border border-border bg-muted/30 overflow-auto transition-all",
                      expandedFunctions ? "max-h-[400px]" : "max-h-0 border-0"
                    )}
                  >
                    {getFacetFunctions(selectedFacet).map((func, index) => (
                      <div
                        key={index}
                        className={cn(
                          "px-4 py-3",
                          index < getFacetFunctions(selectedFacet).length - 1 && "border-b border-border"
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">{func.name}</span>
                          {func.stateMutability && (
                            <Badge
                              variant={func.stateMutability === 'view' || func.stateMutability === 'pure' ? 'info' : 'error'}
                              size="sm"
                            >
                              {func.stateMutability}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                          {func.selector}
                          <CopyButton
                            value={func.selector}
                            ariaLabel={`Copy selector for ${func.name}`}
                            iconSize={12}
                            onCopySuccess={() => showSuccess('Copied!', 'Function selector copied to clipboard')}
                            onCopyError={() => showError('Copy Failed', 'Failed to copy selector')}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedFacet.abi && selectedFacet.abi.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold">ABI</h4>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setExpandedABI(!expandedABI)}
                        >
                          {expandedABI ? (
                            <>
                              <CaretUp className="h-3 w-3 mr-1" />
                              Collapse
                            </>
                          ) : (
                            <>
                              <CaretDown className="h-3 w-3 mr-1" />
                              Expand
                            </>
                          )}
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyWithToast(JSON.stringify(selectedFacet.abi, null, 2), 'Facet ABI')}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy ABI
                        </Button>
                      </div>
                    </div>

                    <div
                      className={cn(
                        "rounded-lg border border-border bg-muted/30 overflow-auto transition-all",
                        expandedABI ? "max-h-[400px]" : "max-h-[120px]"
                      )}
                    >
                      <pre className="p-4 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
                        {JSON.stringify(selectedFacet.abi, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DiamondContractPopup;
