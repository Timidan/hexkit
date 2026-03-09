import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { isAddress } from 'ethers/lib/utils';
import type { Chain } from '../../types';
import { SUPPORTED_CHAINS, getChainById } from '../../utils/chains';
import { useStorageEvidence } from './storage-viewer/useStorageEvidence';
import { fetchStorageLayout as fetchLayoutDirect } from './storage-viewer/fetchStorageLayout';
import { useSlotResolution } from './storage-viewer/useSlotResolution';
import { useAutoDiscovery } from './storage-viewer/useAutoDiscovery';
import { useDebug } from '../../contexts/DebugContext';
import {
  computeMappingSlot,
  computeArrayElementSlot,
  computeNestedMappingSlot,
  formatSlotHex,
  parseSlotInput,
  ZERO_WORD,
} from '../../utils/storageSlotCalculator';
import { resolveContractContext } from '../../utils/resolver/contractContext';
import { resolveLeafValueType } from '../../utils/storageLayoutResolver';
import type { ProxyInfo } from '../../utils/resolver/types';
import type {
  ViewFilter,
  SlotMode,
  MappingKey,
  StorageIconState,
  ResolvedSlot,
  PathSegment,
  DiscoveredMappingKey,
} from './storageViewerTypes';
import { shortHex } from './storageViewerHelpers';
import { useGridCharLimits } from './storageViewerHooks';
import { useStorageViewerData } from './useStorageViewerData';

export function useStorageViewerState() {
  const location = useLocation();
  const { session } = useDebug();

  // Input state
  const [contractAddress, setContractAddress] = useState('');
  const [selectedChain, setSelectedChain] = useState<Chain>(getChainById(1) || SUPPORTED_CHAINS[0]);

  // Contract metadata state
  const [contractMeta, setContractMeta] = useState<{
    name: string | null;
    compilerVersion: string | null;
    proxyInfo: ProxyInfo | null;
  } | null>(null);

  // View state
  const [userFilter, setUserFilter] = useState<ViewFilter>('resolved');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);
  const [treeExpandedGroups, setTreeExpandedGroups] = useState<Set<string>>(new Set(['variables', 'mappings', 'arrays']));
  const [treeOpen, setTreeOpen] = useState(false);

  // Auto-collapse tree on narrow viewports
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setTreeOpen(false); };
    if (mql.matches) setTreeOpen(false);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Path navigation state
  const [pathSegments, setPathSegments] = useState<PathSegment[]>([]);

  // Slot derivation state
  const [probeMode, setProbeMode] = useState<SlotMode>('simple');
  const [baseSlotInput, setBaseSlotInput] = useState('0');
  const [mappingKey, setMappingKey] = useState<MappingKey>({ type: 'address', value: '' });
  const [arrayIndex, setArrayIndex] = useState('0');
  const [nestedKeys, setNestedKeys] = useState<MappingKey[]>([
    { type: 'address', value: '' },
  ]);
  const [manualSlotReading, setManualSlotReading] = useState(false);
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

  // AbortController for the resolveContractContext phase (before evidence loading starts)
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
  } = useSlotResolution(evidence, layout, []);

  const mappingEntries = useMemo(() => getMappingEntries(), [getMappingEntries]);
  // Non-deferred mapping entries for auto-discovery (avoids stale data)
  const mappingEntriesForDiscovery = useMemo(() => getMappingEntriesImmediate(), [getMappingEntriesImmediate]);

  const mappingEntriesBySlot = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getMappingEntries>[number]>();
    for (const entry of mappingEntries) {
      map.set(entry.baseSlot.toLowerCase(), entry);
    }
    return map;
  }, [mappingEntries]);

  // Manual mapping key lookup state
  const [manualKeys, setManualKeys] = useState<Map<string, DiscoveredMappingKey[]>>(new Map());
  const [keyInput, setKeyInput] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [slotGraphOpen, setSlotGraphOpen] = useState(false);

  // Auto-discovery state
  const discovery = useAutoDiscovery();
  const { startScan: discoveryStartScan, stopScan: discoveryStopScan } = discovery;
  const [lookbackBlocks, setLookbackBlocks] = useState(20_000);
  const autoScanTriggered = useRef(false);
  const pendingUrlFetchRef = useRef<{ address: string; chainId: number } | null>(null);

  const sessionId = session?.sessionId ?? null;
  const chainId = selectedChain.id;
  const isMappingView = pathSegments.length > 0;

  // Dynamic per-column character limits based on actual rendered widths
  const tableHeaderRef = useRef<HTMLDivElement | null>(null);
  const viewKey = isMappingView ? 'mapping' : 'standard';
  const charLimits = useGridCharLimits(tableHeaderRef, viewKey);

  /** Merged keys: manual + auto-discovered */
  const mergedKeys = useMemo(() => {
    return discovery.mergeWithManualKeys(manualKeys);
  }, [manualKeys, discovery]);

  /** Map derivedSlot -> key for displaying the KEY column in mapping view */
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

  // ─── Computed Slot (from derivation inputs) ───────────────────────

  const computedSlot = useMemo(() => {
    try {
      const baseSlot = parseSlotInput(baseSlotInput);

      switch (probeMode) {
        case 'simple':
          return { hex: formatSlotHex(baseSlot), raw: baseSlot, error: null };

        case 'mapping': {
          if (!mappingKey.value.trim()) return { hex: '', raw: 0n, error: null };
          const slot = computeMappingSlot(baseSlot, mappingKey.value.trim(), mappingKey.type);
          return { hex: formatSlotHex(slot), raw: slot, error: null };
        }

        case 'array': {
          const index = BigInt(arrayIndex || '0');
          const slot = computeArrayElementSlot(baseSlot, index);
          return { hex: formatSlotHex(slot), raw: slot, error: null };
        }

        case 'nested': {
          const validKeys = nestedKeys.filter((k) => k.value.trim());
          if (validKeys.length === 0) return { hex: '', raw: 0n, error: null };
          const slot = computeNestedMappingSlot(baseSlot, validKeys);
          return { hex: formatSlotHex(slot), raw: slot, error: null };
        }
      }
    } catch (e: unknown) {
      return { hex: '', raw: 0n, error: e instanceof Error ? e.message : 'Computation failed' };
    }
  }, [probeMode, baseSlotInput, mappingKey, arrayIndex, nestedKeys]);

  // ─── Computed Data (delegated to useStorageViewerData) ─────────────

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

  // ─── Actions ────────────────────────────────────────────────────────

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

    // Abort any previous fetch
    contextAbortRef.current?.abort();
    const controller = new AbortController();
    contextAbortRef.current = controller;

    // Immediate visual feedback
    setIsFetchPending(true);

    performance.mark('storage-fetch-start');

    setPathSegments([]);
    setExpandedSlot(null);
    setManualKeys(new Map());
    setContractMeta(null);
    discovery.stopScan();
    autoScanTriggered.current = false;

    // Resolve contract context
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

        // Build sourceBundle for AST-based storage layout reconstruction.
        // Prefer implementation sources (proxy target), fall back to direct contract sources.
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

    // Build fallback addresses for layout fetching
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

    // Diamond namespace discovery
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
  }, [contractAddress, chainId, sessionId, loadStorageForContract, seedFromLayout, seedDiamondNamespace, readSlotFromRpc, discovery]);

  // URL intent handling
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedAddress = params.get('address')?.trim();
    if (!requestedAddress || !isAddress(requestedAddress)) return;

    const requestedChainIdRaw = params.get('chainId');
    const requestedChainId = requestedChainIdRaw ? Number.parseInt(requestedChainIdRaw, 10) : Number.NaN;
    const fallbackChain = getChainById(1) || SUPPORTED_CHAINS[0];
    const nextChain = SUPPORTED_CHAINS.find((chain) => chain.id === requestedChainId) || fallbackChain;

    if (selectedChain.id !== nextChain.id) {
      setSelectedChain(nextChain);
    }
    if (contractAddress.trim().toLowerCase() !== requestedAddress.toLowerCase()) {
      setContractAddress(requestedAddress);
    }

    pendingUrlFetchRef.current = {
      address: requestedAddress.toLowerCase(),
      chainId: nextChain.id,
    };
  }, [location.search]);

  // Execute URL-triggered fetch once state has synced.
  useEffect(() => {
    const pending = pendingUrlFetchRef.current;
    if (!pending) return;

    const currentAddress = contractAddress.trim().toLowerCase();
    if (!currentAddress || currentAddress !== pending.address) return;
    if (selectedChain.id !== pending.chainId) return;

    pendingUrlFetchRef.current = null;
    void handleFetch();
  }, [contractAddress, selectedChain.id, handleFetch]);

  // ─── Auto-Discovery Trigger ──────────────────────────────────────────

  useEffect(() => {
    if (
      !autoScanTriggered.current &&
      layout &&
      contractAddress.trim() &&
      !isLoading
    ) {
      autoScanTriggered.current = true;
      discoveryStartScan({
        chainId,
        contractAddress: contractAddress.trim(),
        layout,
        mappingEntries: mappingEntriesForDiscovery,
        lookbackBlocks,
      });
    }
    return () => {
      discoveryStopScan();
      autoScanTriggered.current = false;
    };
  }, [layout, mappingEntriesForDiscovery, contractAddress, isLoading, chainId, lookbackBlocks, discoveryStartScan, discoveryStopScan]);

  const handleStartDiscovery = useCallback(() => {
    if (!layout || !contractAddress.trim()) return;
    discoveryStartScan({
      chainId,
      contractAddress: contractAddress.trim(),
      layout,
      mappingEntries: mappingEntriesForDiscovery,
      lookbackBlocks,
    });
  }, [layout, mappingEntriesForDiscovery, contractAddress, chainId, lookbackBlocks, discoveryStartScan]);

  const handleRescanDiscovery = useCallback(() => {
    if (!layout || !contractAddress.trim()) return;
    discovery.rescan({
      chainId,
      contractAddress: contractAddress.trim(),
      layout,
      mappingEntries: mappingEntriesForDiscovery,
      lookbackBlocks,
    });
  }, [layout, mappingEntriesForDiscovery, contractAddress, chainId, lookbackBlocks, discovery]);

  const handleProbeSlot = useCallback(async () => {
    const addr = contractAddress.trim();
    if (!addr || !computedSlot.hex) return;

    setManualSlotReading(true);
    try {
      if (probeMode === 'mapping' && mappingKey.value.trim()) {
        const baseSlotHex = formatSlotHex(parseSlotInput(baseSlotInput));
        const mappingEntry = mappingEntriesBySlot.get(baseSlotHex.toLowerCase());

        const variable = mappingEntry?.variable || `slot_${baseSlotInput}`;
        const keyType = mappingKey.type;
        const key = mappingKey.value.trim();
        const derivedSlotHex = computedSlot.hex;

        const entry: DiscoveredMappingKey = {
          key,
          keyType,
          derivedSlot: derivedSlotHex,
          value: null,
          variable,
          baseSlot: baseSlotHex,
          source: 'manual_lookup',
          sourceLabel: 'Manual',
          sources: ['manual_lookup'],
          sourceLabels: ['Manual'],
          evidenceCount: 1,
        };

        setManualKeys((prev) => {
          const next = new Map(prev);
          const bucket = baseSlotHex.toLowerCase();
          const existing = next.get(bucket) || [];
          if (!existing.some((e) => e.key === key && e.derivedSlot.toLowerCase() === derivedSlotHex.toLowerCase())) {
            next.set(bucket, [...existing, entry]);
          }
          return next;
        });

        if (pathSegments.length === 0) {
          setPathSegments([{
            label: variable,
            variable,
            baseSlot: baseSlotHex,
            keyTypeId: mappingEntry?.keyTypeId,
          }]);
        }

        readSlotFromRpc(chainId, addr, derivedSlotHex).then((value) => {
          if (value) {
            setManualKeys((prev) => {
              const next = new Map(prev);
              const bucket = baseSlotHex.toLowerCase();
              const existing = next.get(bucket) || [];
              next.set(
                bucket,
                existing.map((e) =>
                  e.derivedSlot.toLowerCase() === derivedSlotHex.toLowerCase()
                    ? { ...e, value }
                    : e,
                ),
              );
              return next;
            });
          }
        });
      } else {
        addManualSlot(addr, computedSlot.hex);
        await readAndUpdateSlot(chainId, addr, computedSlot.hex);
      }

      if (sessionId && session?.totalSnapshots && session.totalSnapshots > 0) {
        await readSlotFromEdb(sessionId, session.totalSnapshots - 1, computedSlot.hex);
      }
    } finally {
      setManualSlotReading(false);
    }
  }, [contractAddress, computedSlot.hex, chainId, sessionId, session?.totalSnapshots, addManualSlot, readAndUpdateSlot, readSlotFromEdb, probeMode, mappingKey, baseSlotInput, mappingEntriesBySlot, readSlotFromRpc, pathSegments.length]);

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

  /** Look up a single mapping key or array index manually */
  const handleKeyLookup = useCallback(async () => {
    if (!keyInput.trim() || pathSegments.length === 0) return;

    const currentSegment = pathSegments[pathSegments.length - 1];
    const isArray = currentSegment.slotKind === 'dynamic_array';
    const keyTypeId = currentSegment.keyTypeId;

    let keyType = 'uint256';
    if (!isArray && keyTypeId) {
      if (keyTypeId.includes('address') || keyTypeId.startsWith('t_contract')) keyType = 'address';
      else if (keyTypeId.includes('bytes32')) keyType = 'bytes32';
      else if (keyTypeId.includes('bool')) keyType = 'bool';
      else if (keyTypeId.includes('uint')) keyType = 'uint256';
      else if (keyTypeId.includes('int')) keyType = 'int256';
    }

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

  const addNestedKey = useCallback(() => setNestedKeys((prev) => [...prev, { type: 'address', value: '' }]), []);
  const removeNestedKey = useCallback((i: number) => setNestedKeys((prev) => prev.filter((_, idx) => idx !== i)), []);
  const updateNestedKey = useCallback((i: number, field: 'type' | 'value', val: string) => {
    setNestedKeys((prev) => {
      const updated = [...prev];
      updated[i] = { ...updated[i], [field]: val };
      return updated;
    });
  }, []);

  // ─── Export (must be after displayRows) ────────────────────────────

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

  // ─── Render state ─────────────────────────────────────────────────

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
