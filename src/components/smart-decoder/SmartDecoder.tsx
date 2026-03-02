import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { animate } from 'animejs';
import {
  CheckCircle,
  Sparkles,
  Settings2,
  Loader2,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { useToolkit } from '../../contexts/ToolkitContext';
import { parseFunctionSignatureParameters } from '../../utils/solidityTypes';
import { EXTENDED_NETWORKS, type ExtendedChain } from '../shared/NetworkSelector';
import type { ProxyInfo } from '../../utils/resolver';
import type { ParameterDisplayEntry as OverviewParameterEntry } from '../StackedOverview';
import type { HeuristicDecodingResult } from '../../utils/advancedDecoder';

// Sub-modules
import type {
  AbiAcquisitionMode,
  DecoderViewMode,
  LookupMode,
  CachedAbiEntry,
  AbiSourceType,
  ContractConfirmationState,
} from './types';
import {
  getParameterType,
} from './utils';
import DecoderOutputPanel from './DecoderOutputPanel';
import DecoderSettingsDialog from './DecoderSettingsDialog';
import {
  EnrichModal,
  ContractConfirmationDialog,
  SearchProgress,
  ErrorDisplay,
} from './DecoderDialogs';
import { useDecodeHandlers } from './useDecodeHandlers';
import ArgsOnlyInput, { type ArgsOnlyParam } from './ArgsOnlyInput';

type DecodeMode = 'calldata' | 'args-only';

interface AbiInputLike {
  name?: string;
  type?: string;
  components?: OverviewParameterEntry["components"];
}

interface AbiItemLike {
  type?: string;
  name?: string;
  inputs?: AbiInputLike[];
  [key: string]: unknown;
}

interface DecodedResultState {
  name?: string;
  signature?: string;
  args?: unknown[];
  selector?: string;
  [key: string]: unknown;
}

interface ContractMetadataState {
  name?: string;
  source?: string;
  functions?: number;
  events?: number;
  contractName?: string;
  metadata?: { name?: string };
}

const SmartDecoder: React.FC = () => {
  const toolkit = useToolkit();
  const [decodeMode, setDecodeMode] = useState<DecodeMode>('calldata');
  const [argsOnlyData, setArgsOnlyData] = useState('');
  const [argsOnlyParams, setArgsOnlyParams] = useState<ArgsOnlyParam[]>([
    { type: 'address', name: '' },
    { type: 'uint256', name: '' },
  ]);
  const [calldata, setCalldata] = useState('');
  const [decodedResult, setDecodedResult] = useState<DecodedResultState | null>(null);
  const [isDecoding, setIsDecoding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decodingSteps, setDecodingSteps] = useState<string[]>([]);

  const [showFallbackOptions, setShowFallbackOptions] = useState(false);
  const [showEnrichModal, setShowEnrichModal] = useState(false);
  const [contractAddress, setContractAddress] = useState('');
  const [lookupMode, setLookupMode] = useState<LookupMode>('multi');
  const [selectedLookupNetwork, setSelectedLookupNetwork] = useState<ExtendedChain | null>(null);
  const [isFetchingABI, setIsFetchingABI] = useState(false);
  const [manualABI, setManualABI] = useState('');
  const [abiAcquisitionMode, setAbiAcquisitionMode] = useState<AbiAcquisitionMode>('address');
  const [uploadedABIFileName, setUploadedABIFileName] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<DecoderViewMode>('overview');
  const [contractConfirmation, setContractConfirmation] = useState<ContractConfirmationState>(null);
  const [currentSearchProgress, setCurrentSearchProgress] = useState<string[]>([]);
  const [expandedValues, setExpandedValues] = useState<Set<string>>(new Set());

  const [heuristicResult, setHeuristicResult] = useState<HeuristicDecodingResult | null>(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [enableHeuristics, setEnableHeuristics] = useState(true);
  const [enableSignatureLookup, setEnableSignatureLookup] = useState(true);
  const [showAlternativeResults, setShowAlternativeResults] = useState(false);

  const [contractABI, setContractABI] = useState<AbiItemLike[] | null>(null);
  const [contractMetadata, setContractMetadata] = useState<ContractMetadataState | null>(null);
  const [abiSource, setAbiSource] = useState<AbiSourceType>(null);

  const [proxyInfo, setProxyInfo] = useState<ProxyInfo | null>(null);
  const [implementationAbiUsed, setImplementationAbiUsed] = useState(false);
  const [resolvedImplementationAddress, setResolvedImplementationAddress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fallbackSectionRef = useRef<HTMLDivElement | null>(null);
  const abiContractInputRef = useRef<HTMLInputElement | null>(null);
  const abiSourceSectionRef = useRef<HTMLDivElement | null>(null);
  const lookupAbortRef = useRef<AbortController | null>(null);
  const abiCacheRef = useRef<Map<string, CachedAbiEntry>>(new Map());
  const [showAbiSourceSection, setShowAbiSourceSection] = useState(false);
  const prevDecodedResultRef = useRef<DecodedResultState | null>(null);

  const cancelActiveLookup = useCallback(() => {
    if (lookupAbortRef.current) {
      lookupAbortRef.current.abort();
      lookupAbortRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (lookupMode === 'single' && !selectedLookupNetwork) {
      const defaultNetwork = EXTENDED_NETWORKS.find((network) => !network.isTestnet) ?? null;
      setSelectedLookupNetwork(defaultNetwork);
    }
  }, [lookupMode, selectedLookupNetwork]);

  useEffect(() => {
    return () => cancelActiveLookup();
  }, [cancelActiveLookup]);

  useEffect(() => {
    if (decodedResult && !prevDecodedResultRef.current && showFallbackOptions && abiSourceSectionRef.current) {
      setShowAbiSourceSection(true);
      animate(abiSourceSectionRef.current, {
        translateY: [-20, 0],
        opacity: [0, 1],
        duration: 400,
        ease: 'outCubic'
      });
    }
    prevDecodedResultRef.current = decodedResult;
  }, [decodedResult, showFallbackOptions]);

  const addDecodingStep = useCallback((step: string) => {
    setDecodingSteps(prev => [...prev, step]);
  }, []);

  const functionCount = useMemo(() => {
    if (typeof contractMetadata?.functions === 'number') return contractMetadata.functions;
    if (Array.isArray(contractABI)) return contractABI.filter((item) => item?.type === 'function').length;
    return 0;
  }, [contractMetadata, contractABI]);

  const eventCount = useMemo(() => {
    if (typeof contractMetadata?.events === 'number') return contractMetadata.events;
    if (Array.isArray(contractABI)) return contractABI.filter((item) => item?.type === 'event').length;
    return 0;
  }, [contractMetadata, contractABI]);

  const getParameterInfoFromABI = (
    functionName: string
  ): Array<{ name: string; type: string; components?: OverviewParameterEntry["components"] }> => {
    try {
      if (contractABI && functionName) {
        const matchingFunction = contractABI.find((item) =>
          item.type === 'function' && item.name === functionName
        );
        if (matchingFunction?.inputs) {
          return matchingFunction.inputs.map((input: AbiInputLike) => ({
            name: input.name || 'param',
            type: input.type || 'unknown',
            components: input.components
          }));
        }
      }

      const toolkitTransaction = toolkit.lastDecodedTransaction;
      if (toolkitTransaction?.abi && functionName) {
        const abi = toolkitTransaction.abi;
        const matchingFunction = abi.find((item: AbiItemLike) =>
          item.type === 'function' && item.name === functionName
        );
        if (matchingFunction?.inputs) {
          return matchingFunction.inputs.map((input: AbiInputLike) => ({
            name: input.name || 'param',
            type: input.type || 'unknown',
            components: input.components
          }));
        }
      }

      if (manualABI && functionName) {
        const abi = JSON.parse(manualABI) as AbiItemLike[];
        const matchingFunction = abi.find((item) =>
          item.type === 'function' && item.name === functionName
        );
        if (matchingFunction?.inputs) {
          return matchingFunction.inputs.map((input: AbiInputLike) => ({
            name: input.name || 'param',
            type: input.type || 'unknown',
            components: input.components
          }));
        }
      }
    } catch {
      // Could not extract parameter info from ABI
    }

    return [];
  };

  const resetDecodingState = useCallback(() => {
    setDecodedResult(null);
    setError(null);
    setDecodingSteps([]);
    setShowFallbackOptions(false);
    setContractAddress('');
    setManualABI('');
    setContractABI(null);
    setContractMetadata(null);
    setAbiSource(null);
  }, []);

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
      parameterData = toolkitParams.map((param: any, index: number) => ({
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
      parameterData = decodedResult.args.map((arg: unknown, index: number) => ({
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

  // --- Args-only helpers ---
  const addArgsOnlyParam = () => setArgsOnlyParams(prev => [...prev, { type: 'uint256', name: '' }]);
  const removeArgsOnlyParam = (i: number) => setArgsOnlyParams(prev => prev.filter((_, idx) => idx !== i));
  const updateArgsOnlyParam = (i: number, field: 'type' | 'name', val: string) => {
    setArgsOnlyParams(prev => {
      const updated = [...prev];
      updated[i] = { ...updated[i], [field]: val };
      return updated;
    });
  };

  // --- Decode handlers (extracted) ---
  const {
    handleSmartDecode,
    handleContractABIDecode,
    handleManualABIDecode,
    handleArgsOnlyDecode,
    handleAbiFileSelection,
  } = useDecodeHandlers({
    calldata, contractAddress, lookupMode, selectedLookupNetwork, manualABI,
    contractABI, contractMetadata, enableHeuristics, enableSignatureLookup,
    argsOnlyData, argsOnlyParams,
    setDecodedResult, setError, setIsDecoding, setShowFallbackOptions,
    setContractAddress, setManualABI, setContractABI, setContractMetadata,
    setAbiSource, setIsFetchingABI, setCurrentSearchProgress, setContractConfirmation,
    setProxyInfo, setImplementationAbiUsed, setResolvedImplementationAddress,
    setHeuristicResult, setShowAlternativeResults,
    setAbiAcquisitionMode, setUploadedABIFileName,
    lookupAbortRef, abiCacheRef,
    toolkit, addDecodingStep, cancelActiveLookup, resetDecodingState,
  });

  return (
    <div className="bg-background p-4 w-full max-w-5xl mx-auto">
      {/* Settings gear */}
      <div className="mb-3 flex justify-end">
        <Button
          type="button"
          variant="icon-ghost"
          size="icon-sm"
          className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          onClick={() => setShowAdvancedOptions(true)}
          aria-label="Open decoder settings"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Mode Toggle */}
      <Tabs value={decodeMode} onValueChange={(v) => { setDecodeMode(v as DecodeMode); resetDecodingState(); }} className="mb-2">
        <div className="flex justify-center">
          <TabsList className="tool-pill-tabs h-auto w-auto bg-transparent p-0">
            <TabsTrigger value="calldata" className="tool-pill-tab">
              Function Calldata
            </TabsTrigger>
            <TabsTrigger value="args-only" className="tool-pill-tab">
              Args Only
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      {/* Main Input Section */}
      <div className="border border-border/50 rounded-lg p-3 space-y-3">
        {decodeMode === 'calldata' ? (
          <>
            <div className="space-y-1 min-w-0 overflow-hidden">
              <Textarea
                id="calldata"
                value={calldata}
                onChange={(e) => setCalldata(e.target.value)}
                placeholder="0xa9059cbb000000000000000000000000..."
                rows={2}
                className="font-mono text-sm resize-none break-all w-full min-w-0 max-h-20 overflow-y-auto"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Raw calldata with or without 0x prefix</p>
                <div className="flex items-center gap-2">
                  {calldata.length > 100 && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {calldata.slice(0, 6)}...{calldata.slice(-4)} ({calldata.length} chars)
                    </span>
                  )}
                  {!contractABI && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowEnrichModal(true)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded transition-colors"
                    >
                      <Sparkles className="h-3 w-3" />
                      Enrich
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* ABI Indicator */}
            {contractABI && (
              <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/30">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span className="text-xs text-emerald-400">Using {contractMetadata?.name || 'verified'} ABI</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setContractABI(null); setContractMetadata(null); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear
                </Button>
              </div>
            )}

            {/* Fallback suggestion */}
            {showFallbackOptions && decodedResult && !contractABI && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                fullWidth
                onClick={() => setShowEnrichModal(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded border bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/15 transition-colors text-left"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-xs text-amber-400 font-medium">Improve parameter names</span>
                <span className="text-xs text-muted-foreground">- click to provide verified ABI</span>
              </Button>
            )}

            {/* Hidden file input */}
            <input ref={fileInputRef} type="file" accept=".json,.abi" onChange={handleAbiFileSelection} className="hidden" />
          </>
        ) : (
          /* Args-Only Mode */
          <ArgsOnlyInput
            argsOnlyData={argsOnlyData}
            setArgsOnlyData={setArgsOnlyData}
            argsOnlyParams={argsOnlyParams}
            addArgsOnlyParam={addArgsOnlyParam}
            removeArgsOnlyParam={removeArgsOnlyParam}
            updateArgsOnlyParam={updateArgsOnlyParam}
          />
        )}

        {/* Decode Button */}
        <div className="flex justify-center w-full">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={decodeMode === 'calldata' ? handleSmartDecode : handleArgsOnlyDecode}
            disabled={isDecoding}
            className="relative inline-flex items-center justify-center h-8 px-4 text-sm font-medium text-foreground hover:text-foreground/80 hover:border-foreground transition-all duration-200 disabled:cursor-wait bg-transparent border border-solid border-border overflow-hidden"
          >
            <span className={`inline-flex items-center gap-1.5 transition-all duration-200 ${isDecoding ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>Decode</span>
            <span className={`absolute inset-0 inline-flex items-center justify-center gap-1.5 transition-all duration-200 ${isDecoding ? 'opacity-100 scale-100' : 'opacity-0 scale-105'}`}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />Decoding...
            </span>
          </Button>
        </div>
      </div>

      {/* Enrich Modal */}
      <EnrichModal
        open={showEnrichModal}
        onOpenChange={setShowEnrichModal}
        manualABI={manualABI}
        setManualABI={setManualABI}
        contractAddress={contractAddress}
        setContractAddress={setContractAddress}
        selectedLookupNetwork={selectedLookupNetwork}
        setSelectedLookupNetwork={setSelectedLookupNetwork}
        isFetchingABI={isFetchingABI}
        fileInputRef={fileInputRef}
        onApplyManualABI={() => { handleManualABIDecode(); setShowEnrichModal(false); }}
        onFetchABI={() => { handleContractABIDecode(); setShowEnrichModal(false); }}
      />

      {/* Settings Dialog */}
      <DecoderSettingsDialog
        open={showAdvancedOptions}
        onOpenChange={setShowAdvancedOptions}
        lookupMode={lookupMode}
        setLookupMode={setLookupMode}
        enableHeuristics={enableHeuristics}
        setEnableHeuristics={setEnableHeuristics}
        enableSignatureLookup={enableSignatureLookup}
        setEnableSignatureLookup={setEnableSignatureLookup}
        showAlternativeResults={showAlternativeResults}
        setShowAlternativeResults={setShowAlternativeResults}
      />

      {/* Output Panel */}
      <DecoderOutputPanel
        decodedResult={decodedResult}
        viewMode={viewMode}
        setViewMode={setViewMode}
        showFallbackOptions={showFallbackOptions}
        fallbackSectionRef={fallbackSectionRef}
        contractMetadata={contractMetadata}
        contractAddress={contractAddress}
        functionCount={functionCount}
        eventCount={eventCount}
        abiSource={abiSource}
        proxyInfo={proxyInfo}
        implementationAbiUsed={implementationAbiUsed}
        resolvedImplementationAddress={resolvedImplementationAddress}
        heuristicResult={heuristicResult}
        showAlternativeResults={showAlternativeResults}
        getParameterDisplayData={getParameterDisplayData}
      />

      {/* Contract Confirmation Dialog */}
      <ContractConfirmationDialog
        state={contractConfirmation}
        onOpenChange={() => setContractConfirmation(null)}
      />

      {/* Search Progress */}
      <SearchProgress steps={currentSearchProgress} />

      {/* Error Display */}
      <ErrorDisplay error={error} />
    </div>
  );
};

export default SmartDecoder;
