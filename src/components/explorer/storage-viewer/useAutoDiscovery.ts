/**
 * useAutoDiscovery — React hook for managing auto-discovery lifecycle.
 *
 * Wraps the discovery engine with React state management:
 * - Per-mapping-root state machine (idle | scanning | partial | complete | error)
 * - Auto-trigger after storage load
 * - Scan/Stop/Rescan controls
 * - Merge with manual keys without breaking manual flow
 * - Configurable lookback depth
 */

import { useState, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { getSharedProvider } from '../../../utils/providerPool';
import { getChainById } from '../../../utils/chains';
import type { DiscoveredMappingKey, StorageLayoutResponse } from '../../../types/debug';
import type { MappingEntry } from './useSlotResolution';
import {
  discoverMappingKeys,
  type DiscoveredKey,
  type DiscoveredKeySource,
  getDiscoverySourceLabel,
  type DiscoveryProgress,
  sortDiscoverySources,
} from './mappingKeyDiscovery';
import { mappingKeyCache } from './mappingKeyCache';

// ─── Types ───────────────────────────────────────────────────────────

export type DiscoveryPhase = 'idle' | 'scanning' | 'partial' | 'complete' | 'error';

export interface DiscoveryState {
  phase: DiscoveryPhase;
  progress: DiscoveryProgress | null;
  /** baseSlot (lowercase hex) -> discovered keys */
  discoveredKeys: Map<string, DiscoveredKey[]>;
  /** Total keys found across all mapping roots */
  totalKeysFound: number;
  /** Last scanned block */
  lastScannedBlock: number | null;
  /** Error message if phase === 'error' */
  error: string | null;
}

export interface AutoDiscoveryControls {
  state: DiscoveryState;
  /** Start or resume discovery scan */
  startScan: (params: {
    chainId: number;
    contractAddress: string;
    layout: StorageLayoutResponse;
    mappingEntries: MappingEntry[];
    lookbackBlocks?: number;
  }) => void;
  /** Stop current scan */
  stopScan: () => void;
  /** Restart scan from scratch */
  rescan: (params: {
    chainId: number;
    contractAddress: string;
    layout: StorageLayoutResponse;
    mappingEntries: MappingEntry[];
    lookbackBlocks?: number;
  }) => void;
  /** Get discovered keys for a specific mapping base slot */
  getKeysForSlot: (baseSlot: string) => DiscoveredKey[];
  /** Count of discovered keys for a specific mapping base slot */
  getKeyCountForSlot: (baseSlot: string) => number;
  /** Merge discovered keys into manual keys map (returns new map) */
  mergeWithManualKeys: (manualKeys: Map<string, DiscoveredMappingKey[]>) => Map<string, DiscoveredMappingKey[]>;
}

// ─── Default State ───────────────────────────────────────────────────

const DEFAULT_LOOKBACK = 5_000;

const INITIAL_STATE: DiscoveryState = {
  phase: 'idle',
  progress: null,
  discoveredKeys: new Map(),
  totalKeysFound: 0,
  lastScannedBlock: null,
  error: null,
};

type SignalEntry = {
  source: string;
  sourceLabel: string;
  sources: string[];
  sourceLabels: string[];
  evidenceCount: number;
  value: string | null;
};

function mergeSignalEntry<T extends SignalEntry>(existing: T, incoming: T): T {
  const sources = sortDiscoverySources([
    ...((existing.sources.length > 0 ? existing.sources : [existing.source]) as DiscoveredKeySource[]),
    ...((incoming.sources.length > 0 ? incoming.sources : [incoming.source]) as DiscoveredKeySource[]),
  ]);
  const primarySource = sources[0] ?? 'manual_lookup';
  return {
    ...existing,
    ...incoming,
    value: incoming.value ?? existing.value,
    source: primarySource,
    sourceLabel: getDiscoverySourceLabel(primarySource),
    sources,
    sourceLabels: sources.map(getDiscoverySourceLabel),
    evidenceCount: sources.length,
  };
}

// ─── Hook ────────────────────────────────────────────────────────────

export function useAutoDiscovery(): AutoDiscoveryControls {
  const [state, setState] = useState<DiscoveryState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const startScan = useCallback(
    async (params: {
      chainId: number;
      contractAddress: string;
      layout: StorageLayoutResponse;
      mappingEntries: MappingEntry[];
      lookbackBlocks?: number;
    }) => {
      // Abort any existing scan
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const chain = getChainById(params.chainId);
      if (!chain) {
        setState((prev) => ({
          ...prev,
          phase: 'error',
          error: `Unsupported chain ID: ${params.chainId}`,
        }));
        return;
      }

      const provider = getSharedProvider(chain) as ethers.providers.JsonRpcProvider;

      // Clear previous data and start fresh for this scan
      setState({
        ...INITIAL_STATE,
        phase: 'scanning',
      });

      try {
        // Hydrate from cache first
        const cached = await mappingKeyCache.hydrate(params.chainId, params.contractAddress);

        // Abort check after async hydrate (handles StrictMode remount + rapid contract switches)
        if (controller.signal.aborted) return;

        let cachedTotal = 0;
        if (cached.keys.size > 0) {
          cached.keys.forEach((v) => { cachedTotal += v.length; });
          setState((prev) => ({
            ...prev,
            phase: 'partial',
            discoveredKeys: cached.keys,
            totalKeysFound: cachedTotal,
            lastScannedBlock: cached.resumeFromBlock ? cached.resumeFromBlock - 1 : null,
          }));
        }

        // Determine scan range: resume from cache or use lookback
        const currentBlock = await provider.getBlockNumber();
        const lookback = params.lookbackBlocks ?? DEFAULT_LOOKBACK;
        const defaultFromBlock = Math.max(0, currentBlock - lookback);
        const fromBlock = cached.resumeFromBlock
          ? Math.max(cached.resumeFromBlock, defaultFromBlock)
          : defaultFromBlock;
        const toBlock = currentBlock;

        // Skip scan if cache covers the full range
        if (fromBlock > toBlock) {
          setState((prev) => ({
            ...prev,
            phase: 'complete',
            lastScannedBlock: toBlock,
          }));
          return;
        }

        const result = await discoverMappingKeys({
          chainId: params.chainId,
          contractAddress: params.contractAddress,
          layout: params.layout,
          mappingEntries: params.mappingEntries,
          fromBlock,
          toBlock,
          provider,
          signal: controller.signal,
          onProgress: (progress) => {
            if (controller.signal.aborted) return;
            setState((prev) => ({
              ...prev,
              phase: progress.phase === 'done' ? 'complete' : progress.phase === 'error' ? 'error' : 'scanning',
              progress,
            }));
          },
          onKeys: (keys) => {
            if (controller.signal.aborted) return;
            // Merge new scan keys with cached keys
            const merged = new Map(cached.keys);
            for (const [slot, newKeys] of keys) {
              const existing = merged.get(slot) ?? [];
              const nextById = new Map(
                existing.map((k) => [`${k.key}:${k.derivedSlot.toLowerCase()}`, k]),
              );
              for (const key of newKeys) {
                const dedupeKey = `${key.key}:${key.derivedSlot.toLowerCase()}`;
                const prior = nextById.get(dedupeKey);
                nextById.set(
                  dedupeKey,
                  prior ? mergeSignalEntry(prior, key) : key,
                );
              }
              merged.set(slot, Array.from(nextById.values()));
            }
            let total = 0;
            merged.forEach((v) => { total += v.length; });
            setState((prev) => ({
              ...prev,
              phase: 'partial',
              discoveredKeys: merged,
              totalKeysFound: total,
            }));
          },
        });

        if (!controller.signal.aborted) {
          // Merge final results with cached keys
          const finalKeys = new Map(cached.keys);
          for (const [slot, newKeys] of result.keys) {
            const existing = finalKeys.get(slot) ?? [];
            const nextById = new Map(
              existing.map((k) => [`${k.key}:${k.derivedSlot.toLowerCase()}`, k]),
            );
            for (const key of newKeys) {
              const dedupeKey = `${key.key}:${key.derivedSlot.toLowerCase()}`;
              const prior = nextById.get(dedupeKey);
              nextById.set(
                dedupeKey,
                prior ? mergeSignalEntry(prior, key) : key,
              );
            }
            finalKeys.set(slot, Array.from(nextById.values()));
          }

          let total = 0;
          finalKeys.forEach((v) => { total += v.length; });
          setState((prev) => ({
            ...prev,
            phase: 'complete',
            discoveredKeys: finalKeys,
            totalKeysFound: total,
            lastScannedBlock: result.lastScannedBlock,
          }));

          // Persist merged results to cache
          mappingKeyCache.persist(
            params.chainId,
            params.contractAddress,
            finalKeys,
            result.lastScannedBlock,
          );
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError' && !controller.signal.aborted) {
          setState((prev) => ({
            ...prev,
            phase: 'error',
            error: err instanceof Error ? err.message : 'Discovery failed',
          }));
        }
      }
    },
    [],
  );

  const stopScan = useCallback(() => {
    abortRef.current?.abort();
    setState((prev) => ({
      ...prev,
      phase: prev.totalKeysFound > 0 ? 'partial' : 'idle',
    }));
  }, []);

  const rescan = useCallback(
    async (params: {
      chainId: number;
      contractAddress: string;
      layout: StorageLayoutResponse;
      mappingEntries: MappingEntry[];
      lookbackBlocks?: number;
    }) => {
      // Await invalidation to prevent startScan from hydrating stale cache
      await mappingKeyCache.invalidate(params.chainId, params.contractAddress);
      setState(INITIAL_STATE);
      startScan(params);
    },
    [startScan],
  );

  const getKeysForSlot = useCallback(
    (baseSlot: string): DiscoveredKey[] => {
      return state.discoveredKeys.get(baseSlot.toLowerCase()) ?? [];
    },
    [state.discoveredKeys],
  );

  const getKeyCountForSlot = useCallback(
    (baseSlot: string): number => {
      return state.discoveredKeys.get(baseSlot.toLowerCase())?.length ?? 0;
    },
    [state.discoveredKeys],
  );

  const mergeWithManualKeys = useCallback(
    (
      manualKeys: Map<string, DiscoveredMappingKey[]>,
    ): Map<string, DiscoveredMappingKey[]> => {
      const merged = new Map(manualKeys);

      for (const [baseSlot, discoveredKeys] of state.discoveredKeys) {
        const existing = merged.get(baseSlot) ?? [];
        const nextById = new Map(
          existing.map((entry) => [`${entry.key}:${entry.derivedSlot.toLowerCase()}`, entry]),
        );

        for (const dk of discoveredKeys) {
          const entry: DiscoveredMappingKey = {
            key: dk.nestedKey ? `${dk.key} → ${dk.nestedKey}` : dk.key,
            keyType: dk.keyType,
            derivedSlot: dk.derivedSlot,
            value: dk.value,
            variable: dk.variable,
            baseSlot: dk.baseSlot,
            source: dk.source,
            sourceLabel: dk.sourceLabel,
            sources: dk.sources,
            sourceLabels: dk.sourceLabels,
            evidenceCount: dk.evidenceCount,
          };
          const dedupeKey = `${entry.key}:${entry.derivedSlot.toLowerCase()}`;
          const prior = nextById.get(dedupeKey);
          nextById.set(dedupeKey, prior ? mergeSignalEntry(prior, entry) : entry);
        }

        merged.set(baseSlot, Array.from(nextById.values()));
      }

      return merged;
    },
    [state.discoveredKeys],
  );

  return {
    state,
    startScan,
    stopScan,
    rescan,
    getKeysForSlot,
    getKeyCountForSlot,
    mergeWithManualKeys,
  };
}
