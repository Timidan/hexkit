/**
 * useDecodeHandlers – decode handler logic extracted from SmartDecoder.tsx.
 * Pure structural split – no behaviour changes.
 */
import { useCallback, type MutableRefObject } from 'react';
import { ethers } from 'ethers';
import {
  lookupFunctionSignatures,
  type SignatureResponse,
} from '../../utils/signatureDatabase';
import {
  decodeWithHeuristics,
  type HeuristicDecodingResult,
} from '../../utils/advancedDecoder';
import { parseFunctionSignatureParameters } from '../../utils/solidityTypes';
import { resolveContractContext, type ProxyInfo } from '../../utils/resolver';
import type { Chain } from '../../types';
import { getChainById } from '../../utils/chains';
import type { ExtendedChain } from '../shared/NetworkSelector';

import type {
  AbiAcquisitionMode,
  LookupMode,
  CachedAbiEntry,
  AbiSourceType,
} from './types';
import { ETHERSCAN_INSTANCES, BLOCKSCOUT_INSTANCES } from './types';
import {
  shortenAddress,
  getAbiCacheKey,
  isAbortError,
  sanitizeDecodedValue,
  extractFunctionSelector,
  suggestFunctionSignature,
  searchCustomSignatures,
  findMatchingFunctionInABI,
  formatProxyType,
  decodeWithSignature,
} from './utils';
import {
  fetchABIFromEtherscanInstances,
  fetchABIFromBlockscoutInstances,
  fetchContractNameFromEtherscanInstances,
  fetchContractNameFromBlockscoutInstances,
} from './useAbiLookup';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AbiItemLike {
  type?: string;
  name?: string;
  inputs?: Array<{ name?: string; type?: string; components?: any }>;
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

interface ContractConfirmationState {
  show: boolean;
  contractInfo: any;
  abi: any;
  onConfirm: () => void;
  onContinueSearch: () => void;
}

interface ArgsOnlyParam {
  type: string;
  name: string;
}

export interface DecodeHandlersDeps {
  // State getters
  calldata: string;
  contractAddress: string;
  lookupMode: LookupMode;
  selectedLookupNetwork: ExtendedChain | null;
  manualABI: string;
  contractABI: AbiItemLike[] | null;
  contractMetadata: ContractMetadataState | null;
  enableHeuristics: boolean;
  enableSignatureLookup: boolean;
  argsOnlyData: string;
  argsOnlyParams: ArgsOnlyParam[];

  // State setters
  setDecodedResult: (v: DecodedResultState | null) => void;
  setError: (v: string | null) => void;
  setIsDecoding: (v: boolean) => void;
  setShowFallbackOptions: (v: boolean) => void;
  setContractAddress: (v: string) => void;
  setManualABI: (v: string) => void;
  setContractABI: (v: AbiItemLike[] | null) => void;
  setContractMetadata: (v: ContractMetadataState | null) => void;
  setAbiSource: (v: AbiSourceType) => void;
  setIsFetchingABI: (v: boolean) => void;
  setCurrentSearchProgress: (v: string[] | ((prev: string[]) => string[])) => void;
  setContractConfirmation: (v: ContractConfirmationState | null) => void;
  setProxyInfo: (v: ProxyInfo | null) => void;
  setImplementationAbiUsed: (v: boolean) => void;
  setResolvedImplementationAddress: (v: string | null) => void;
  setHeuristicResult: (v: HeuristicDecodingResult | null) => void;
  setShowAlternativeResults: (v: boolean) => void;
  setAbiAcquisitionMode: (v: AbiAcquisitionMode) => void;
  setUploadedABIFileName: (v: string | null) => void;

  // Refs
  lookupAbortRef: MutableRefObject<AbortController | null>;
  abiCacheRef: MutableRefObject<Map<string, CachedAbiEntry>>;

  // Toolkit
  toolkit: {
    lastDecodedTransaction?: any;
    setDecodedTransaction: (v: any) => void;
  };

  // Helpers
  addDecodingStep: (step: string) => void;
  cancelActiveLookup: () => void;
  resetDecodingState: () => void;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useDecodeHandlers(deps: DecodeHandlersDeps) {
  const {
    calldata, contractAddress, lookupMode, selectedLookupNetwork, manualABI,
    contractABI, contractMetadata, enableHeuristics, enableSignatureLookup,
    argsOnlyData, argsOnlyParams,
    setDecodedResult, setError, setIsDecoding, setShowFallbackOptions,
    setContractABI, setContractMetadata, setAbiSource, setIsFetchingABI,
    setCurrentSearchProgress, setContractConfirmation,
    setProxyInfo, setImplementationAbiUsed, setResolvedImplementationAddress,
    setHeuristicResult, setShowAlternativeResults,
    setAbiAcquisitionMode, setUploadedABIFileName,
    lookupAbortRef, abiCacheRef,
    toolkit, addDecodingStep, cancelActiveLookup, resetDecodingState,
  } = deps;

  // --- ABI confirmation flow (fetchABIWithConfirmation) ---
  const fetchABIWithConfirmation = useCallback(async (address: string): Promise<AbiItemLike[]> => {
    return new Promise((resolve, reject) => {
      cancelActiveLookup();
      const controller = new AbortController();
      lookupAbortRef.current = controller;
      const { signal } = controller;
      const clearAbort = () => {
        if (lookupAbortRef.current === controller) lookupAbortRef.current = null;
      };
      let currentSourceIndex = 0;
      const chainIdForLookup =
        lookupMode === 'single' && selectedLookupNetwork
          ? String(selectedLookupNetwork.id)
          : undefined;
      const networkLabel = chainIdForLookup ? selectedLookupNetwork?.name : undefined;
      const cacheKey = getAbiCacheKey(address, chainIdForLookup);
      const cached = abiCacheRef.current.get(cacheKey);
      if (cached) {
        const cachedName =
          cached.contractName || contractMetadata?.name || contractMetadata?.contractName ||
          contractMetadata?.metadata?.name || `Contract ${shortenAddress(address)}`;
        setContractABI(cached.abi);
        setContractMetadata({ name: cachedName, source: cached.sourceLabel, functions: cached.functionCount, events: cached.eventCount });
        setAbiSource(cached.kind === 'blockscout' ? 'blockscout' : 'etherscan');
        setCurrentSearchProgress([]);
        clearAbort();
        resolve(cached.abi);
        return;
      }

      const searchSources: Array<{ name: string; fetch: () => Promise<any>; kind: 'etherscan' | 'blockscout' }> = [];

      if (chainIdForLookup) {
        const etherscanMatches = ETHERSCAN_INSTANCES.filter((i) => i.chainId === chainIdForLookup);
        const blockscoutMatches = BLOCKSCOUT_INSTANCES.filter((i) => i.chainId === chainIdForLookup);
        if (etherscanMatches.length > 0) {
          searchSources.push({ name: `Etherscan • ${etherscanMatches[0].name}`, fetch: () => fetchABIFromEtherscanInstances(address, chainIdForLookup, signal, addDecodingStep), kind: 'etherscan' });
        }
        if (blockscoutMatches.length > 0) {
          searchSources.push({ name: `Blockscout • ${blockscoutMatches[0].name}`, fetch: () => fetchABIFromBlockscoutInstances(address, chainIdForLookup, signal, addDecodingStep), kind: 'blockscout' });
        }
      } else {
        searchSources.push(
          { name: 'Etherscan (multi)', fetch: () => fetchABIFromEtherscanInstances(address, undefined, signal, addDecodingStep), kind: 'etherscan' },
          { name: 'Blockscout (multi)', fetch: () => fetchABIFromBlockscoutInstances(address, undefined, signal, addDecodingStep), kind: 'blockscout' }
        );
      }

      if (searchSources.length === 0) {
        setCurrentSearchProgress([]);
        clearAbort();
        reject(new Error('The selected network does not have an explorer integration yet. Try multi-network lookup or paste an ABI manually.'));
        return;
      }

      const errors: string[] = [];
      const prefetched = searchSources.map((source) =>
        source.fetch().then((result) => ({ status: "fulfilled" as const, result, source })).catch((error) => ({ status: "rejected" as const, error, source }))
      );

      const searchNext = async () => {
        if (currentSourceIndex >= searchSources.length) {
          setCurrentSearchProgress([]); clearAbort();
          reject(new Error(`Could not retrieve ABI from any block explorer: ${errors.join(' | ')}`));
          return;
        }
        if (signal.aborted) {
          setCurrentSearchProgress([]); clearAbort();
          reject(new DOMException('Lookup cancelled', 'AbortError'));
          return;
        }

        const source = searchSources[currentSourceIndex];
        try {
          if (currentSourceIndex === 0) {
            setCurrentSearchProgress([chainIdForLookup ? `Targeting ${networkLabel || 'selected'} network explorers...` : 'Starting multi-network search...']);
          }
          setCurrentSearchProgress(prev => [...prev, `Searching ${source.name}...`]);
          const result = await prefetched[currentSourceIndex];

          if (result.status === "fulfilled" && Array.isArray(result.result?.abi)) {
            let abi = result.result.abi;
            const resolvedChainId = result.result.chainId || chainIdForLookup;
            const resolvedChain = resolvedChainId ? getChainById(parseInt(resolvedChainId, 10)) : null;
            setCurrentSearchProgress(prev => [...prev, `Found verified contract on ${source.name}!`]);

            const fallbackContractName = contractMetadata?.name ?? contractMetadata?.contractName ?? contractMetadata?.metadata?.name ?? `Contract ${shortenAddress(address)}`;
            let resolvedContractNameForModal = fallbackContractName;
            try {
              let fetchedDisplayName: string | null = null;
              if (source.kind === 'blockscout') {
                fetchedDisplayName = await fetchContractNameFromBlockscoutInstances(address, chainIdForLookup, signal);
                if (!fetchedDisplayName) fetchedDisplayName = await fetchContractNameFromEtherscanInstances(address, chainIdForLookup, signal);
              } else {
                fetchedDisplayName = await fetchContractNameFromEtherscanInstances(address, chainIdForLookup, signal);
                if (!fetchedDisplayName) fetchedDisplayName = await fetchContractNameFromBlockscoutInstances(address, chainIdForLookup, signal);
              }
              if (fetchedDisplayName) resolvedContractNameForModal = fetchedDisplayName;
            } catch {
              // Unable to resolve contract name during lookup
            }

            setContractConfirmation({
              show: true,
              contractInfo: {
                name: resolvedContractNameForModal, address, source: source.name,
                functions: abi.filter((item: any) => item.type === 'function').length,
                events: abi.filter((item: any) => item.type === 'event').length
              },
              abi,
              onConfirm: async () => {
                setContractConfirmation(null);
                setCurrentSearchProgress([]);
                let finalAbi = abi;
                let finalName = resolvedContractNameForModal;
                if (resolvedChain) {
                  try {
                    addDecodingStep(` Resolving proxy on ${resolvedChain.name}...`);
                    const ctx = await resolveContractContext(address, resolvedChain, { abi: true, proxy: true });
                    if (ctx.proxyInfo?.isProxy) {
                      setProxyInfo(ctx.proxyInfo);
                      if (ctx.implementationAddress) setResolvedImplementationAddress(ctx.implementationAddress);
                      if (ctx.implementationAbi) { setImplementationAbiUsed(true); addDecodingStep(' Using merged implementation + proxy ABI'); }
                    }
                    if (ctx.abi && ctx.abi.length > 0) finalAbi = ctx.abi;
                    if (ctx.name) finalName = ctx.name;
                  } catch { /* Proxy resolution failed */ }
                }

                const fc = finalAbi.filter((item: any) => item.type === 'function').length;
                const ec = finalAbi.filter((item: any) => item.type === 'event').length;
                setContractABI(finalAbi);
                setContractMetadata({ name: finalName, source: source.name, functions: fc, events: ec });
                setAbiSource(source.kind === 'blockscout' ? 'blockscout' : 'etherscan');
                const resolvedCacheKey = getAbiCacheKey(address, resolvedChainId);
                const cacheEntry = { abi: finalAbi, sourceLabel: source.name, kind: source.kind, contractName: finalName, functionCount: fc, eventCount: ec, chainId: resolvedChainId };
                abiCacheRef.current.set(resolvedCacheKey, cacheEntry);
                if (resolvedCacheKey !== cacheKey) abiCacheRef.current.set(cacheKey, cacheEntry);
                clearAbort();
                resolve(finalAbi);
              },
              onContinueSearch: () => { setContractConfirmation(null); currentSourceIndex++; searchNext(); }
            });
            return;
          }
          if (result.status === "fulfilled") throw new Error("Invalid ABI format");
          throw result.error;
        } catch (error: any) {
          if (isAbortError(error)) { setCurrentSearchProgress([]); clearAbort(); reject(error); return; }
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${source.name}: ${message}`);
          setCurrentSearchProgress(prev => [...prev, `${source.name}: ${message}`]);
        }
        currentSourceIndex++;
        searchNext();
      };

      searchNext().catch((error) => { setCurrentSearchProgress([]); clearAbort(); reject(error); });
    });
  }, [
    lookupMode, selectedLookupNetwork, contractMetadata,
    cancelActiveLookup, addDecodingStep,
    setContractABI, setContractMetadata, setAbiSource, setCurrentSearchProgress,
    setContractConfirmation, setProxyInfo, setImplementationAbiUsed, setResolvedImplementationAddress,
  ]);

  // --- Contract ABI Decode ---
  const handleContractABIDecode = useCallback(async () => {
    if (!contractAddress.trim()) { setError('Please enter a contract address'); return; }
    if (lookupMode === 'single' && !selectedLookupNetwork) { addDecodingStep(' Select a network before starting a targeted lookup.'); setError('Select a network to target before decoding.'); return; }
    if (lookupMode === 'single' && selectedLookupNetwork) {
      const chainId = String(selectedLookupNetwork.id);
      const hasExplorerSupport = ETHERSCAN_INSTANCES.some((i) => i.chainId === chainId) || BLOCKSCOUT_INSTANCES.some((i) => i.chainId === chainId);
      if (!hasExplorerSupport) { addDecodingStep(` Selected network ${selectedLookupNetwork.name} is not supported by our explorer integrations yet.`); setError('Selected network is not supported for automatic lookup yet. Try multi-network search or provide an ABI manually.'); return; }
    }

    cancelActiveLookup();
    setIsFetchingABI(true);
    setError(null);

    try {
      const selector = extractFunctionSelector(calldata);
      if (!selector) throw new Error('Invalid calldata format');

      if (lookupMode === 'single' && selectedLookupNetwork) {
        addDecodingStep(` Targeted lookup on ${selectedLookupNetwork.name} (${selectedLookupNetwork.isTestnet ? 'testnet' : 'mainnet'})`);
      } else {
        addDecodingStep(' Multi-network lookup enabled (Etherscan + Blockscout)');
      }

      setProxyInfo(null); setImplementationAbiUsed(false); setResolvedImplementationAddress(null);
      let abi: any[];

      if (lookupMode === 'single' && selectedLookupNetwork) {
        addDecodingStep(' Resolving contract (ABI + proxy detection)...');
        const resolvedChain = getChainById(selectedLookupNetwork.id);
        const chain: Chain = resolvedChain || { id: selectedLookupNetwork.id, name: selectedLookupNetwork.name, rpcUrl: '', explorerUrl: '', blockExplorer: '', apiUrl: '', explorers: [], nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 } };
        const ctx = await resolveContractContext(contractAddress.trim(), chain, { abi: true, proxy: true, onProgress: (step, detail) => { addDecodingStep(` ${step}${detail ? ` (${detail})` : ''}`); } });
        if (ctx.proxyInfo?.isProxy) {
          setProxyInfo(ctx.proxyInfo);
          if (ctx.implementationAddress) { setResolvedImplementationAddress(ctx.implementationAddress); addDecodingStep(` ${formatProxyType(ctx.proxyInfo.proxyType)} detected`); addDecodingStep(` Implementation: ${ctx.implementationAddress.slice(0, 10)}...${ctx.implementationAddress.slice(-6)}`); }
          if (ctx.implementationAbi) { setImplementationAbiUsed(true); addDecodingStep(' Using merged implementation + proxy ABI'); }
        } else { addDecodingStep(' Not a proxy contract'); }
        if (ctx.abi && ctx.abi.length > 0) { abi = ctx.abi; addDecodingStep(` ABI resolved: ${abi.filter((i: any) => i.type === 'function').length} functions`); }
        else { addDecodingStep(' Unified resolver found no ABI, trying legacy lookup...'); abi = await fetchABIWithConfirmation(contractAddress.trim()); }
      } else {
        addDecodingStep(` Fetching ABI for contract: ${contractAddress}`);
        abi = await fetchABIWithConfirmation(contractAddress.trim());
      }

      addDecodingStep('ABI fetched, searching for matching function...');
      const matchingFunction = findMatchingFunctionInABI(abi, selector);

      if (matchingFunction) {
        addDecodingStep(` Found matching function: ${matchingFunction.signature}`);
        const decoded = decodeWithSignature(calldata, matchingFunction.signature, addDecodingStep);
        const sanitizedArgs = sanitizeDecodedValue(decoded.args);
        const sanitizedDecoded = { ...decoded, args: sanitizedArgs };
        setDecodedResult(sanitizedDecoded);
        setShowFallbackOptions(false);
        toolkit.setDecodedTransaction({
          functionName: sanitizedDecoded.name, functionSignature: matchingFunction.signature, contractAddress: contractAddress.trim(),
          parameters: matchingFunction.inputs ? matchingFunction.inputs.map((input: any, index: number) => ({ name: input.name, type: input.type, value: sanitizedArgs ? sanitizedArgs[index] : undefined })) : [],
          abi, calldata: calldata.trim()
        });
      } else {
        const availableFunctions = abi.filter((item: any) => item.type === 'function' && item.name).map((item: any) => {
          try { const inputs = item.inputs?.map((input: any) => input.type).join(',') || ''; const signature = `${item.name}(${inputs})`; const hash = ethers.utils.id(signature); const computedSelector = hash.slice(0, 10); return `${signature} → ${computedSelector}`; }
          catch { return `${item.name} → (invalid signature)`; }
        });
        const suggestion = suggestFunctionSignature(selector);
        throw new Error(`No function with selector ${selector} found in contract ABI.\n\nLooking for: ${suggestion}\n\nAvailable functions in fetched ABI:\n${availableFunctions.map((f: any) => `• ${f}`).join('\n')}\n\nThis might mean:\n• The calldata is for a different contract\n• The contract has multiple implementations\n• The function is from a proxy or delegated contract`);
      }
    } catch (err: any) {
      setError(err.message);
      addDecodingStep(` Contract ABI decode failed: ${err.message}`);
    } finally {
      setIsFetchingABI(false);
    }
  }, [
    calldata, contractAddress, lookupMode, selectedLookupNetwork,
    fetchABIWithConfirmation, cancelActiveLookup, addDecodingStep, toolkit,
    setDecodedResult, setError, setShowFallbackOptions, setIsFetchingABI,
    setProxyInfo, setImplementationAbiUsed, setResolvedImplementationAddress,
  ]);

  // --- Manual ABI Decode ---
  const handleManualABIDecode = useCallback(() => {
    if (!manualABI.trim()) { setError('Please provide an ABI'); return; }
    try {
      const selector = extractFunctionSelector(calldata);
      if (!selector) throw new Error('Invalid calldata format');
      const abi = JSON.parse(manualABI);
      addDecodingStep('Using manual ABI, searching for matching function...');
      setContractABI(abi);
      setContractMetadata({ name: 'Manual ABI', source: 'Manual ABI', functions: abi.filter((item: any) => item.type === 'function').length, events: abi.filter((item: any) => item.type === 'event').length });
      setAbiSource('manual');
      const matchingFunction = findMatchingFunctionInABI(abi, selector);
      if (matchingFunction) {
        addDecodingStep(` Found matching function: ${matchingFunction.signature}`);
        const decoded = decodeWithSignature(calldata, matchingFunction.signature, addDecodingStep);
        const sanitizedArgs = sanitizeDecodedValue(decoded.args);
        const sanitizedDecoded = { ...decoded, args: sanitizedArgs };
        setDecodedResult(sanitizedDecoded);
        setShowFallbackOptions(false);
        toolkit.setDecodedTransaction({
          functionName: sanitizedDecoded.name, functionSignature: matchingFunction.signature,
          parameters: matchingFunction.inputs ? matchingFunction.inputs.map((input: any, index: number) => ({ name: input.name, type: input.type, value: sanitizedArgs ? sanitizedArgs[index] : undefined })) : [],
          abi, calldata: calldata.trim()
        });
      } else {
        const availableFunctions = abi.filter((item: any) => item.type === 'function' && item.name).map((item: any) => {
          try { const inputs = item.inputs?.map((input: any) => input.type).join(',') || ''; const signature = `${item.name}(${inputs})`; const hash = ethers.utils.id(signature); const computedSelector = hash.slice(0, 10); return `${signature} → ${computedSelector}`; }
          catch { return `${item.name} → (invalid signature)`; }
        });
        const suggestion = suggestFunctionSignature(selector);
        throw new Error(`No function with selector ${selector} found in provided ABI.\n\nLooking for: ${suggestion}\n\nAvailable functions in ABI:\n${availableFunctions.map((f: any) => `• ${f}`).join('\n')}\n\nMake sure you're using the correct ABI that contains the function you're trying to decode.`);
      }
    } catch (err: any) {
      setError(err.message);
      addDecodingStep(` Manual ABI decode failed: ${err.message}`);
    }
  }, [calldata, manualABI, addDecodingStep, toolkit, setDecodedResult, setError, setShowFallbackOptions, setContractABI, setContractMetadata, setAbiSource]);

  // --- ABI File Selection ---
  const handleAbiFileSelection = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) { setUploadedABIFileName(null); return; }
    try {
      const text = await file.text();
      deps.setManualABI(text);
      setAbiAcquisitionMode('paste');
      setUploadedABIFileName(file.name);
      setError(null);
    } catch {
      setError('Could not read the selected ABI file. Please try another file.');
      setUploadedABIFileName(null);
    }
  }, [setError, setUploadedABIFileName, setAbiAcquisitionMode]);

  // --- Args-only decode ---
  const handleArgsOnlyDecode = useCallback(() => {
    if (!argsOnlyData.trim()) { setError('Please enter hex-encoded data to decode'); return; }
    const validParams = argsOnlyParams.filter(p => p.type.trim());
    if (validParams.length === 0) { setError('Please add at least one parameter type'); return; }

    setIsDecoding(true);
    resetDecodingState();

    try {
      let hex = argsOnlyData.trim();
      if (!hex.startsWith('0x')) hex = '0x' + hex;
      if (!/^0x[0-9a-fA-F]*$/.test(hex)) throw new Error('Invalid hex string');
      if (hex.length % 2 !== 0) throw new Error('Hex string must have even length');

      const types = validParams.map(p => p.type.trim());
      addDecodingStep(` Decoding args-only with types: (${types.join(', ')})`);

      const decoded = ethers.utils.defaultAbiCoder.decode(types, hex);
      const sanitizedArgs = sanitizeDecodedValue(Array.from(decoded));

      addDecodingStep(` Successfully decoded ${sanitizedArgs.length} parameters`);

      const result = {
        name: 'abi.decode',
        signature: `abi.decode(${types.join(',')})`,
        args: sanitizedArgs,
      };

      setDecodedResult(result);
      setAbiSource('manual');

      toolkit.setDecodedTransaction({
        functionName: 'abi.decode',
        functionSignature: `abi.decode(${types.join(',')})`,
        parameters: sanitizedArgs.map((arg: any, index: number) => ({
          name: validParams[index]?.name?.trim() || `param_${index}`,
          type: types[index],
          value: arg,
        })),
        calldata: hex,
      });
    } catch (err: any) {
      setError(err.message);
      addDecodingStep(` Args-only decode failed: ${err.message}`);
    } finally {
      setIsDecoding(false);
    }
  }, [argsOnlyData, argsOnlyParams, addDecodingStep, toolkit, resetDecodingState, setDecodedResult, setError, setIsDecoding, setAbiSource]);

  // --- Smart Decode (main handler) ---
  const handleSmartDecode = useCallback(async () => {
    if (!calldata.trim()) { setError('Please enter calldata to decode'); return; }
    setIsDecoding(true);
    resetDecodingState();

    try {
      const selector = extractFunctionSelector(calldata.trim());
      if (!selector) throw new Error('Invalid calldata format');
      addDecodingStep(` Extracted function selector: ${selector}`);

      if (contractAddress.trim()) {
        addDecodingStep(` Contract address provided: ${contractAddress.trim()}`);
        try { await handleContractABIDecode(); return; } catch { addDecodingStep(`Contract ABI lookup failed, continuing with signature search...`); }
      }

      addDecodingStep(' Searching custom signatures...');
      const customSignature = searchCustomSignatures(selector);
      if (customSignature) {
        addDecodingStep(` Found in custom signatures: ${customSignature}`);
        const decoded = decodeWithSignature(calldata.trim(), customSignature, addDecodingStep);
        const sanitizedArgs = sanitizeDecodedValue(decoded.args);
        const sanitizedDecoded = { ...decoded, args: sanitizedArgs };
        setDecodedResult(sanitizedDecoded);
        setAbiSource('signatures');
        const parameterInfo = parseFunctionSignatureParameters(customSignature);
        toolkit.setDecodedTransaction({
          functionName: sanitizedDecoded.name, functionSignature: customSignature,
          parameters: sanitizedArgs ? sanitizedArgs.map((arg: any, index: number) => ({ name: parameterInfo[index]?.name || `param_${index}`, type: parameterInfo[index]?.type || 'unknown', value: arg })) : [],
          calldata: calldata.trim()
        });
        return;
      }

      if (enableSignatureLookup) {
        addDecodingStep(' Searching OpenChain database...');
        try {
          const openChainResult: SignatureResponse = await lookupFunctionSignatures([selector]);
          const signatures = openChainResult.result?.function?.[selector];
          if (signatures && signatures.length > 0) {
            const signature = signatures[0].name;
            addDecodingStep(` Found on OpenChain: ${signature}`);
            addDecodingStep(`Note: OpenChain only provides parameter types, not names`);
            const decoded = decodeWithSignature(calldata.trim(), signature, addDecodingStep);
            const sanitizedArgs = sanitizeDecodedValue(decoded.args);
            const sanitizedDecoded = { ...decoded, args: sanitizedArgs };
            setDecodedResult(sanitizedDecoded);
            setAbiSource('signatures');
            const parameterInfo = parseFunctionSignatureParameters(signature);
            toolkit.setDecodedTransaction({
              functionName: sanitizedDecoded.name, functionSignature: signature,
              parameters: sanitizedArgs ? sanitizedArgs.map((arg: any, index: number) => ({ name: parameterInfo[index]?.name || `param_${index}`, type: parameterInfo[index]?.type || 'unknown', value: arg })) : [],
              calldata: calldata.trim()
            });
            setShowFallbackOptions(true);
            return;
          }
        } catch (openChainError) {
          addDecodingStep(` OpenChain lookup failed: ${openChainError}`);
        }
      } else {
        addDecodingStep(' Signature database lookup disabled - enable in advanced options');
      }

      if (enableHeuristics) {
        addDecodingStep(' Attempting heuristic decoding...');
        try {
          const heuristicResults = decodeWithHeuristics(calldata.trim());
          setHeuristicResult(heuristicResults);
          if (heuristicResults && heuristicResults.bestGuess) {
            addDecodingStep(` Heuristic analysis complete (confidence: ${(heuristicResults.bestGuess.confidence * 100).toFixed(1)}%)`);
            addDecodingStep(`Best guess: ${heuristicResults.bestGuess.description}`);
            setDecodedResult({ name: heuristicResults.bestGuess.description.split('(')[0].trim(), signature: `${heuristicResults.bestGuess.description}`, args: heuristicResults.bestGuess.values || [] });
            setAbiSource('heuristic');
            if (heuristicResults.bestGuess) {
              toolkit.setDecodedTransaction({
                functionName: heuristicResults.bestGuess.description.split('(')[0].trim(), functionSignature: heuristicResults.bestGuess.description,
                parameters: (heuristicResults.bestGuess.values || []).map((arg: any, index: number) => ({ name: `param_${index}`, type: heuristicResults.bestGuess?.types?.[index] || 'unknown', value: arg })),
                calldata: calldata.trim()
              });
            }
            if (heuristicResults.decodedAttempts && heuristicResults.decodedAttempts.length > 1) {
              setShowAlternativeResults(true);
              addDecodingStep(` Found ${heuristicResults.decodedAttempts.length} alternative interpretations`);
            }
            setShowFallbackOptions(true);
            return;
          }
          addDecodingStep('Heuristic analysis found no confident matches');
        } catch (heuristicError) {
          addDecodingStep(` Heuristic decoding failed: ${String(heuristicError)}`);
        }
      } else {
        addDecodingStep(' Heuristic decoding disabled - enable in advanced options');
      }

      addDecodingStep(' No confident matches found - try manual ABI or adjust settings');
      setShowFallbackOptions(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsDecoding(false);
    }
  }, [
    calldata, contractAddress, enableHeuristics, enableSignatureLookup,
    handleContractABIDecode, resetDecodingState, addDecodingStep, toolkit,
    setDecodedResult, setError, setIsDecoding, setShowFallbackOptions,
    setAbiSource, setHeuristicResult, setShowAlternativeResults,
  ]);

  return {
    handleSmartDecode,
    handleContractABIDecode,
    handleManualABIDecode,
    handleArgsOnlyDecode,
    handleAbiFileSelection,
    fetchABIWithConfirmation,
  };
}
