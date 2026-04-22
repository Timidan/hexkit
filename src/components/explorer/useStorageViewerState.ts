import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { Chain } from '../../types';
import { getExplorerChains, getChainById } from '../../utils/chains';
import { useStorageEvidence } from './storage-viewer/useStorageEvidence';
import { fetchStorageLayout as fetchLayoutDirect } from './storage-viewer/fetchStorageLayout';
import { useSlotResolution } from './storage-viewer/useSlotResolution';
import { useAutoDiscovery } from './storage-viewer/useAutoDiscovery';
import { useDebug } from '../../contexts/DebugContext';
import {
  computeMappingSlot,
  computeArrayElementSlot,
  formatSlotHex,
  ZERO_WORD,
} from '../../utils/storageSlotCalculator';
import { resolveContractContext } from '../../utils/resolver/contractContext';
import { resolveLeafValueType } from '../../utils/storageLayoutResolver';
import type { ProxyInfo } from '../../utils/resolver/types';
import type {
  ViewFilter,
  StorageIconState,
  ResolvedSlot,
  PathSegment,
  DiscoveredMappingKey,
} from './storageViewerTypes';
import { shortHex, storageKeyType } from './storageViewerHelpers';
import { useGridCharLimits } from './storageViewerHooks';
import { useStorageViewerData } from './useStorageViewerData';
import { useStorageProbe } from './useStorageProbe';
import { useStorageAutoDiscoveryScan } from './useStorageAutoDiscoveryScan';
import { useStorageUrlSync } from './useStorageUrlSync';

export function useStorageViewerState() {
  const { session } = useDebug();

  const [contractAddress, setContractAddress] = useState('');
  const [selectedChain, setSelectedChain] = useState<Chain>(
    () => getChainById(1) || getExplorerChains()[0],
  );

  const [contractMeta, setContractMeta] = useState<{
    name: string | null;
    compilerVersion: string | null;
    proxyInfo: ProxyInfo | null;
  } | null>(null);

  const [userFilter, setUserFilter] = useState<ViewFilter>('resolved');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);
  const [treeExpandedGroups, setTreeExpandedGroups] = useState<Set<string>>(new Set(['variables', 'mappings', 'arrays']));
  const [treeOpen, setTreeOpen] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setTreeOpen(false); };
    if (mql.matches) setTreeOpen(false);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const [pathSegments, setPathSegments] = useState<PathSegment[]>([]);
  const [postLoadResolving, setPostLoadResolving] = useState(false);
  const [isFetchPending, setIsFetchPending] = useState(false);

  const {
    evidence,
    layout,
    layoutConfidence,
    isLoading,
    loadingPhase,
    error,
    loadStorageForContract,
    cancelLoad,
    seedFromLayout,
    seedDiamondNamespace,
    addManualSlot,
    readAndUpdateSlot,
    readSlotFromEdb,
    readSlotFromRpc,
  } = useStorageEvidence();

  const contextAbortRef = useRef<AbortController | null>(null);

  // Computed filter: during loading (before layout arrives), force 'all' so
  // RPC-seeded slots are immediately visible instead of an empty 'resolved' view.
  const filter = useMemo<ViewFilter>(() => {
    if (!layoutConfidence && isLoading) return 'all';
    return userFilter;
  }, [userFilter, layoutConfidence, isLoading]);

  const {
    resolvedSlots,
    getResolved,
    getUnknown,
    getChanged,
    getNonZero,
    getMappingEntries,
    getMappingEntriesImmediate,
    isLayoutPending,
  } = useSlotResolution(evidence, layout);

  const mappingEntries = useMemo(() => getMappingEntries(), [getMappingEntries]);
  const mappingEntriesForDiscovery = useMemo(() => getMappingEntriesImmediate(), [getMappingEntriesImmediate]);

  const mappingEntriesBySlot = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getMappingEntries>[number]>();
    for (const entry of mappingEntries) {
      map.set(entry.baseSlot.toLowerCase(), entry);
    }
    return map;
  }, [mappingEntries]);

  const [manualKeys, setManualKeys] = useState<Map<string, DiscoveredMappingKey[]>>(new Map());
  const [keyInput, setKeyInput] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [slotGraphOpen, setSlotGraphOpen] = useState(false);

  const discovery = useAutoDiscovery();
  const lookbackBlocks = 20_000;

  const sessionId = session?.sessionId ?? null;
  const chainId = selectedChain.id;
  const isMappingView = pathSegments.length > 0;

  const tableHeaderRef = useRef<HTMLDivElement | null>(null);
  const viewKey = isMappingView ? 'mapping' : 'standard';
  const charLimits = useGridCharLimits(tableHeaderRef, viewKey);

  const mergedKeys = useMemo(() => {
    return discovery.mergeWithManualKeys(manualKeys);
  }, [manualKeys, discovery]);

  const keyBySlot = useMemo(() => {
    if (!isMappingView) return new Map<string, DiscoveredMappingKey>();
    const currentSegment = pathSegments[pathSegments.length - 1];
    const bucketKey = currentSegment.baseSlot.toLowerCase();
    const keyRows = mergedKeys.get(bucketKey) || [];
    const map = new Map<string, DiscoveredMappingKey>();
    for (const kr of keyRows) {
      map.set(kr.derivedSlot.toLowerCase(), kr);
    }
    return map;
  }, [isMappingView, pathSegments, mergedKeys]);

  // Slot-probe form state + derived slot + commit action.
  const {
    probeMode, setProbeMode,
    baseSlotInput, setBaseSlotInput,
    mappingKey, setMappingKey,
    arrayIndex, setArrayIndex,
    nestedKeys, addNestedKey, removeNestedKey, updateNestedKey,
    manualSlotReading, computedSlot, handleProbeSlot,
  } = useStorageProbe({
    contractAddress, chainId, sessionId, session,
    pathSegments, setPathSegments,
    mappingEntriesBySlot, setManualKeys,
    addManualSlot, readAndUpdateSlot, readSlotFromRpc, readSlotFromEdb,
  });

  const { stats, filteredSlots, displayRows, treeGroups } = useStorageViewerData({
    resolvedSlots,
    filter,
    searchQuery,
    getResolved,
    getUnknown,
    getChanged,
    getNonZero,
    pathSegments,
    mergedKeys,
    contractAddress,
    mappingEntriesBySlot,
    layout,
  });

  // Auto-trigger the event scanner once a layout is ready; expose manual
  // start/rescan for the discovery toolbar.
  const {
    handleStartDiscovery,
    handleRescanDiscovery,
    resetAutoScanTrigger,
  } = useStorageAutoDiscoveryScan({
    discovery, layout, contractAddress, chainId,
    mappingEntriesForDiscovery, isLoading, lookbackBlocks,
  });

  const handleCancel = useCallback(() => {
    contextAbortRef.current?.abort();
    contextAbortRef.current = null;
    cancelLoad();
    setIsFetchPending(false);
    setPostLoadResolving(false);
    discovery.stopScan();
  }, [cancelLoad, discovery]);

  const handleFetch = useCallback(async () => {
    const addr = contractAddress.trim();
    if (!addr) return;

    contextAbortRef.current?.abort();
    const controller = new AbortController();
    contextAbortRef.current = controller;

    setIsFetchPending(true);

    performance.mark('storage-fetch-start');

    setPathSegments([]);
    setExpandedSlot(null);
    setManualKeys(new Map());
    setContractMeta(null);
    discovery.stopScan();
    resetAutoScanTrigger();

    let proxyType: import('../../utils/resolver/types').ProxyType | undefined;
    let diamondFacets: import('../../utils/resolver/types').FacetInfo[] | null = null;
    let implAddresses: string[] = [];
    let sourceBundle: { files: Record<string, string>; contractName?: string; compilerVersion?: string } | undefined;
    const chain = getChainById(chainId);
    if (chain) {
      try {
        if (controller.signal.aborted) return;
        const ctx = await resolveContractContext(addr, chain, {
          abi: true,
          proxy: true,
          token: false,
          diamond: true,
          signal: controller.signal,
        });

        const name = ctx.implementationName || ctx.name;
        const compilerVersion =
          ctx.implementationMetadata?.compilerVersion ||
          ctx.metadata?.compilerVersion ||
          null;

        setContractMeta({
          name: name || null,
          compilerVersion,
          proxyInfo: ctx.proxyInfo || null,
        });

        const metaForSources = ctx.implementationMetadata || ctx.metadata;
        if (metaForSources?.sources && Object.keys(metaForSources.sources).length > 0) {
          sourceBundle = {
            files: metaForSources.sources,
            contractName: ctx.implementationName || ctx.name || undefined,
            compilerVersion: metaForSources.compilerVersion || undefined,
          };
        }

        if (ctx.proxyInfo?.isProxy && ctx.proxyInfo.proxyType) {
          proxyType = ctx.proxyInfo.proxyType;
        } else {
          proxyType = 'unknown';
        }
        if (ctx.diamondInfo?.facets) {
          diamondFacets = ctx.diamondInfo.facets;
        }
        if (ctx.proxyInfo?.implementationAddress) {
          implAddresses.push(ctx.proxyInfo.implementationAddress);
        }
        if (ctx.proxyInfo?.implementations) {
          for (const impl of ctx.proxyInfo.implementations) {
            if (impl && !implAddresses.some(a => a.toLowerCase() === impl.toLowerCase())) {
              implAddresses.push(impl);
            }
          }
        }
      } catch {
        // Context resolve error
      }
    }

    const fallbackAddresses: string[] = [];
    if (diamondFacets) {
      fallbackAddresses.push(...diamondFacets.map(f => f.address).filter(Boolean));
    }
    if (!diamondFacets && implAddresses.length > 0) {
      for (const impl of implAddresses) {
        if (!fallbackAddresses.some(a => a.toLowerCase() === impl.toLowerCase())) {
          fallbackAddresses.push(impl);
        }
      }
    }

    setIsFetchPending(false);
    if (controller.signal.aborted) return;
    await loadStorageForContract({
      chainId,
      address: addr,
      sessionId: sessionId ?? undefined,
      proxyType,
      sourceBundle,
      fallbackAddresses,
    });

    setPostLoadResolving(true);
    try {
      let facetSelectors: Map<string, string[]> | undefined;
      if (diamondFacets) {
        facetSelectors = new Map<string, string[]>();
        for (const facet of diamondFacets) {
          if (facet.selectors.length > 0) {
            facetSelectors.set(facet.address, facet.selectors);
          }
        }
        if (facetSelectors.size === 0) facetSelectors = undefined;
      }
      const nsResult = await seedDiamondNamespace(chainId, addr, facetSelectors);

      if (nsResult?.confirmed && nsResult.facetAddresses.length > 0) {
        try {
          const facetLayout = await fetchLayoutDirect(chainId, addr, {
            fallbackAddresses: nsResult.facetAddresses,
          });
          if (facetLayout) {
            let namespaceOffset: bigint | undefined;

            if (nsResult.namespaceRoot) {
              const probeEntries = facetLayout.layout.storage
                .filter((e) => BigInt(e.slot) < 256n)
                .slice(0, 5);

              if (probeEntries.length > 0) {
                let rawHits = 0;
                let nsHits = 0;
                const probes = await Promise.allSettled(
                  probeEntries.flatMap((entry) => {
                    const rawSlot = formatSlotHex(BigInt(entry.slot));
                    const nsSlot = formatSlotHex(BigInt(entry.slot) + nsResult.namespaceRoot!);
                    return [
                      readSlotFromRpc(chainId, addr, rawSlot).then((v) => ({ kind: 'raw' as const, v })),
                      readSlotFromRpc(chainId, addr, nsSlot).then((v) => ({ kind: 'ns' as const, v })),
                    ];
                  }),
                );
                for (const p of probes) {
                  if (p.status !== 'fulfilled') continue;
                  if (p.value.v && p.value.v !== ZERO_WORD) {
                    if (p.value.kind === 'raw') rawHits++;
                    else nsHits++;
                  }
                }
                namespaceOffset = nsHits > rawHits ? nsResult.namespaceRoot : undefined;
              }
            }

            seedFromLayout(facetLayout.layout, addr, namespaceOffset);
          }
        } catch {
          // Facet layout fetch failed
        }
      }
    } finally {
      setPostLoadResolving(false);
    }

    performance.mark('storage-fetch-end');
    performance.measure('storage-slot-table-paint', 'storage-fetch-start', 'storage-fetch-end');
  }, [
    contractAddress, chainId, sessionId,
    loadStorageForContract, seedFromLayout, seedDiamondNamespace, readSlotFromRpc,
    discovery, resetAutoScanTrigger,
  ]);

  // ?address=&chainId= → state sync → auto-fetch once state settles.
  useStorageUrlSync({
    selectedChain, setSelectedChain,
    contractAddress, setContractAddress,
    handleFetch,
  });

  const toggleSlotExpansion = useCallback((slotHex: string) => {
    setExpandedSlot((prev) => (prev === slotHex ? null : slotHex));
  }, []);

  const handleInspect = useCallback((row: ResolvedSlot) => {
    const slotLookup = row.slot.toLowerCase();
    const mappingEntry = mappingEntriesBySlot.get(slotLookup);

    const cleanLbl = row.layoutLabel || row.label?.replace(/\s*\(.*/, '') || shortHex(row.slot, 6, 4);
    const nextLabel = pathSegments.length === 0
      ? cleanLbl
      : row.label?.match(/\[(.*?)\]$/)?.[1] || shortHex(row.slot, 6, 4);

    let valueTypeLabel: string | undefined;
    if (mappingEntry?.valueTypeId && layout) {
      const leafType = resolveLeafValueType(layout, mappingEntry.valueTypeId);
      valueTypeLabel = leafType?.typeLabel
        ?? layout.types[mappingEntry.valueTypeId]?.label
        ?? mappingEntry.valueTypeId;
    }

    setPathSegments((prev) => [
      ...prev,
      {
        label: nextLabel,
        variable: cleanLbl,
        baseSlot: row.slot,
        keyTypeId: mappingEntry?.keyTypeId,
        slotKind: row.kind,
        valueTypeLabel,
      },
    ]);
    setExpandedSlot(null);
    setKeyInput('');
  }, [mappingEntriesBySlot, pathSegments.length, layout]);

  const handleKeyLookup = useCallback(async () => {
    if (!keyInput.trim() || pathSegments.length === 0) return;

    const currentSegment = pathSegments[pathSegments.length - 1];
    const isArray = currentSegment.slotKind === 'dynamic_array';
    const keyTypeId = currentSegment.keyTypeId;

    const keyType = isArray ? 'uint256' : storageKeyType(keyTypeId);

    const key = keyInput.trim();
    setIsLookingUp(true);

    try {
      const baseSlot = BigInt(currentSegment.baseSlot);
      const derivedSlot = isArray
        ? computeArrayElementSlot(baseSlot, BigInt(key))
        : computeMappingSlot(baseSlot, key, keyType);
      const derivedSlotHex = formatSlotHex(derivedSlot);

      const value = await readSlotFromRpc(chainId, contractAddress.trim(), derivedSlotHex);

      const entry: DiscoveredMappingKey = {
        key,
        keyType,
        derivedSlot: derivedSlotHex,
        value: value || null,
        variable: currentSegment.variable,
        baseSlot: currentSegment.baseSlot,
        source: 'manual_lookup',
        sourceLabel: 'Manual',
        sources: ['manual_lookup'],
        sourceLabels: ['Manual'],
        evidenceCount: 1,
      };

      setManualKeys((prev) => {
        const next = new Map(prev);
        const bucket = currentSegment.baseSlot.toLowerCase();
        const existing = next.get(bucket) || [];
        if (!existing.some((e) => e.key === key && e.derivedSlot.toLowerCase() === derivedSlotHex.toLowerCase())) {
          next.set(bucket, [...existing, entry]);
        }
        return next;
      });

      setKeyInput('');
    } catch {
      // Key lookup error
    } finally {
      setIsLookingUp(false);
    }
  }, [keyInput, pathSegments, chainId, contractAddress, readSlotFromRpc]);

  const navigateTo = useCallback((segIdx: number) => {
    if (segIdx < 0) {
      setPathSegments([]);
    } else {
      setPathSegments((prev) => prev.slice(0, segIdx + 1));
    }
    setExpandedSlot(null);
  }, []);

  const toggleTreeGroup = useCallback((group: string) => {
    setTreeExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const handleExportCsv = useCallback(() => {
    const rows = displayRows.map((slot) => {
      const decoded = slot.decodedFields?.map((field) => `${field.label}: ${field.decoded}`).join('; ') || '';
      return [
        slot.slot,
        slot.label || '',
        slot.typeLabel || '',
        slot.decodeKind,
        slot.confidence,
        slot.value || '',
        decoded,
        slot.provenance.join('+'),
      ];
    });

    const csv = [
      'slot,label,type,decodeKind,confidence,rawValue,decodedValue,provenance',
      ...rows.map((row) => row.map((value) => `"${value}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storage-${contractAddress.slice(0, 10)}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [contractAddress, displayRows]);

  const hasData = resolvedSlots.length > 0;
  const hasSession = sessionId !== null;

  const showSkeleton = (loadingPhase === 'seeding' || isFetchPending) && !hasData;
  const showTable = hasData;
  const isResolvingInBackground = hasData && (isLoading || postLoadResolving || isLayoutPending);

  const iconState: StorageIconState = (isLoading || isFetchPending)
    ? 'loading'
    : hasData
      ? 'loaded'
      : /^0x[0-9a-fA-F]{40}$/.test(contractAddress.trim())
        ? 'valid'
        : 'empty';

  return {
    contractAddress, setContractAddress, selectedChain, setSelectedChain,
    contractMeta,
    userFilter, setUserFilter, filter, searchQuery, setSearchQuery,
    expandedSlot, treeExpandedGroups, toggleTreeGroup, treeOpen, setTreeOpen,
    pathSegments, navigateTo,
    probeMode, setProbeMode, baseSlotInput, setBaseSlotInput,
    mappingKey, setMappingKey, arrayIndex, setArrayIndex,
    nestedKeys, addNestedKey, removeNestedKey, updateNestedKey,
    manualSlotReading, postLoadResolving, isFetchPending,
    evidence, layout, layoutConfidence, isLoading, loadingPhase, error,
    resolvedSlots, isLayoutPending, mappingEntries,
    keyInput, setKeyInput, isLookingUp, slotGraphOpen, setSlotGraphOpen,
    discovery,
    keyBySlot, stats, computedSlot, filteredSlots, displayRows, treeGroups,
    isMappingView, sessionId,
    tableHeaderRef, charLimits,
    handleFetch, handleCancel, handleProbeSlot, toggleSlotExpansion, handleInspect,
    handleKeyLookup, handleExportCsv,
    handleStartDiscovery, handleRescanDiscovery,
    hasData, hasSession, showSkeleton, showTable, isResolvingInBackground, iconState,
  };
}
