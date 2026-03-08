import { useState, useCallback, useRef } from 'react';
import { debugBridgeService } from '../../../services/DebugBridgeService';
import { getSharedProvider } from '../../../utils/providerPool';
import { getChainById } from '../../../utils/chains';
import type {
  SlotEvidence,
  SlotSource,
  StorageLayoutResponse,
} from '../../../types/debug';
import type { ProxyType } from '../../../utils/resolver/types';
import {
  formatSlotHex,
  computeArrayElementSlot,
  computeMappingSlot,
  computeNamespaceRoot,
  DIAMOND_NAMESPACES,
  PROXY_SLOTS,
  ZERO_WORD,
} from '../../../utils/storageSlotCalculator';
import { fetchStorageLayout } from './fetchStorageLayout';
import type { LayoutConfidence } from './fetchStorageLayout';


/**
 * Collects storage slot evidence from multiple sources:
 *
 * **Primary (RPC — always available):**
 * 1. Direct slot reads via `eth_getStorageAt` (slots 0–9 seed + proxy slots)
 * 2. Layout-driven reads when layout metadata is available
 * 3. Manual slot probes
 *
 * **Optional enhancement (EDB — only when a debug session is active):**
 * 4. Static layout from EDB compiler output (`edb_getStorageLayout`)
 * 5. Trace-driven evidence from SLOAD/SSTORE (`edb_getStorageTouched`)
 * 6. Cached storage batch read (`edb_getStorageRange`)
 */
/** Loading phase for progressive UI feedback */
export type LoadingPhase = 'idle' | 'seeding' | 'resolving' | 'done';

export function useStorageEvidence() {
  const [evidence, setEvidence] = useState<SlotEvidence[]>([]);
  const [layout, setLayout] = useState<StorageLayoutResponse | null>(null);
  const [layoutConfidence, setLayoutConfidence] = useState<LayoutConfidence | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadIdRef = useRef(0);

  /** Merge new evidence, deduplicating by slot+source */
  const mergeEvidence = useCallback((newItems: SlotEvidence[]) => {
    setEvidence((prev) => {
      const existing = new Map(prev.map((e) => [`${e.slot}:${e.source}`, e]));
      for (const item of newItems) {
        const key = `${item.slot}:${item.source}`;
        existing.set(key, item);
      }
      return Array.from(existing.values());
    });
  }, []);

  // ─── RPC-Based Methods (always available) ──────────────────────────

  /**
   * Read a single storage slot via eth_getStorageAt.
   */
  const readSlotFromRpc = useCallback(
    async (chainId: number, address: string, slot: string): Promise<string | null> => {
      try {
        const chain = getChainById(chainId);
        if (!chain) return null;
        const provider = getSharedProvider(chain);
        const value = await provider.getStorageAt(address, slot);
        if (!value) return null;
        const hex = value.startsWith('0x') ? value.slice(2) : value;
        return '0x' + hex.padStart(64, '0');
      } catch {
        return null;
      }
    },
    [],
  );

  /**
   * Seed initial evidence by reading slots 0–9 and conditionally ERC-1967 proxy slots via RPC.
   * Proxy slots are filtered based on detected proxy type.
   */
  /** Read a batch of slots, returning only fulfilled results */
  const batchReadSlots = useCallback(
    async (chainId: number, address: string, slots: string[]): Promise<{ slot: string; value: string }[]> => {
      const BATCH_SIZE = 50;
      const results: { slot: string; value: string }[] = [];
      for (let i = 0; i < slots.length; i += BATCH_SIZE) {
        const batch = slots.slice(i, i + BATCH_SIZE);
        const settled = await Promise.allSettled(
          batch.map(async (slot) => {
            const value = await readSlotFromRpc(chainId, address, slot);
            return { slot, value };
          }),
        );
        for (const r of settled) {
          if (r.status === 'fulfilled' && r.value.value) {
            results.push({ slot: r.value.slot, value: r.value.value });
          }
        }
      }
      return results;
    },
    [readSlotFromRpc],
  );

  /**
   * Seed initial evidence by reading slots 0–255 and conditionally proxy slots via RPC.
   * After seed, expands any slots that look like dynamic array lengths.
   */
  const seedFromRpc = useCallback(
    async (chainId: number, address: string, proxyType?: ProxyType) => {
      const items: SlotEvidence[] = [];

      // ── Universal seed: slots 0-255 ──
      const slotsToRead: string[] = [];
      for (let i = 0; i < 256; i++) {
        slotsToRead.push(formatSlotHex(BigInt(i)));
      }

      // Only read proxy slots for relevant proxy types
      const shouldReadProxySlots =
        !proxyType ||
        proxyType === 'eip1967' ||
        proxyType === 'transparent' ||
        proxyType === 'eip1967-beacon' ||
        proxyType === 'eip1822';

      if (shouldReadProxySlots) {
        for (const proxySlot of Object.keys(PROXY_SLOTS)) {
          slotsToRead.push(proxySlot);
        }
      }

      const results = await batchReadSlots(chainId, address, slotsToRead);
      const implSlot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

      // Track non-zero seed slots for array expansion heuristic
      const nonZeroSeedSlots: { slotIndex: bigint; value: string }[] = [];

      for (const { slot, value } of results) {
        const isProxy = Object.keys(PROXY_SLOTS).includes(slot.toLowerCase());
        if (!isProxy && value === ZERO_WORD) continue;

        if (isProxy && shouldReadProxySlots) {
          const isImpl = slot.toLowerCase() === implSlot;
          if (!isImpl && value === ZERO_WORD) continue;
        }

        // Heuristic type detection for unlabeled seed slots
        let seedMeta: Record<string, unknown> | undefined;
        if (isProxy) {
          seedMeta = { proxyRole: PROXY_SLOTS[slot.toLowerCase()] };
        } else {
          const looksLikeAddr = value.slice(2, 26) === '0'.repeat(24) && value !== ZERO_WORD;
          const slotNum = BigInt(slot);
          if (looksLikeAddr) {
            seedMeta = { label: `slot${slotNum}`, type: 'address' };
          } else {
            seedMeta = { label: `slot${slotNum}`, type: 'uint256' };
          }
        }

        items.push({
          address,
          slot,
          source: isProxy ? 'proxy' as SlotSource : 'rpc_scan' as SlotSource,
          value,
          meta: seedMeta,
        });

        // Collect candidate array heads (small integers in low slots)
        if (!isProxy) {
          try {
            const n = BigInt(value);
            const slotIdx = BigInt(slot);
            if (n > 0n && n < 10000n && slotIdx < 256n) {
              nonZeroSeedSlots.push({ slotIndex: slotIdx, value });
            }
          } catch { /* not a valid bigint, skip */ }
        }
      }

      if (items.length > 0) {
        mergeEvidence(items);
      }

      // ── Dynamic array expansion heuristic ──
      // If a low slot holds a small integer, it might be an array length.
      // Probe keccak256(slot) + 0..min(length, 256) to discover array elements.
      const arraySlotMeta: { slot: string; parentSlot: bigint; index: number }[] = [];
      for (const { slotIndex, value } of nonZeroSeedSlots) {
        const len = Number(BigInt(value));
        const cap = Math.min(len, 256);
        for (let i = 0; i < cap; i++) {
          arraySlotMeta.push({
            slot: formatSlotHex(computeArrayElementSlot(slotIndex, BigInt(i))),
            parentSlot: slotIndex,
            index: i,
          });
        }
      }

      const ARRAY_PROBE_CAP = 1024;
      if (arraySlotMeta.length > ARRAY_PROBE_CAP) {
        arraySlotMeta.length = ARRAY_PROBE_CAP;
      }

      if (arraySlotMeta.length > 0) {
        const arrayResults = await batchReadSlots(chainId, address, arraySlotMeta.map(m => m.slot));
        // Build lookup for meta by slot hex
        const metaBySlot = new Map(arraySlotMeta.map(m => [m.slot, m]));
        const arrayItems: SlotEvidence[] = [];
        for (const { slot, value } of arrayResults) {
          if (value === ZERO_WORD) continue;
          const meta = metaBySlot.get(slot);
          // Detect if value looks like an address (high 12 bytes zero)
          const looksLikeAddress = value.slice(2, 26) === '0'.repeat(24) && value !== ZERO_WORD;
          arrayItems.push({
            address,
            slot,
            source: 'rpc_scan' as SlotSource,
            value,
            meta: {
              discoveredBy: 'array_expansion',
              label: meta ? `slot${meta.parentSlot}[${meta.index}]` : undefined,
              type: looksLikeAddress ? 'address' : undefined,
            },
          });
        }
        if (arrayItems.length > 0) {
          mergeEvidence(arrayItems);
        }
      }
    },
    [readSlotFromRpc, mergeEvidence, batchReadSlots],
  );

  // ─── Diamond Namespace Discovery ─────────────────────────────────

  /**
   * For diamond proxies: probe well-known namespace roots to discover
   * DiamondStorage struct fields and derive selector→facet mapping slots.
   *
   * DiamondStorage layout at root R:
   *   R+0: mapping(bytes4 => FacetAddressAndPosition) selectorToFacet
   *   R+1: mapping(address => FacetFunctionSelectors) facetFunctionSelectors
   *   R+2: address[] facetAddresses (length at R+2, data at keccak256(R+2)+i)
   *   R+3: mapping(bytes4 => bool) supportedInterfaces
   *   R+4: address contractOwner
   */
  const seedDiamondNamespace = useCallback(
    async (
      chainId: number,
      address: string,
      facetSelectors?: Map<string, string[]>, // facetAddress → selectors[]
    ) => {
      // Probe each known namespace to find the diamond storage root
      let confirmedRoot: bigint | null = null;

      for (const ns of DIAMOND_NAMESPACES) {
        const root = computeNamespaceRoot(ns);
        const ownerSlot = formatSlotHex(root + 4n);
        const ownerValue = await readSlotFromRpc(chainId, address, ownerSlot);
        if (ownerValue && ownerValue !== ZERO_WORD) {
          const high = ownerValue.slice(2, 26);
          if (high === '0'.repeat(24)) {
            confirmedRoot = root;
            break;
          }
        }
      }

      if (confirmedRoot === null) {
        return;
      }

      const items: SlotEvidence[] = [];

      // DiamondStorage struct field labels
      const STRUCT_LABELS = [
        { label: 'selectorToFacetAndPosition', type: 'mapping(bytes4 => struct)' },
        { label: 'facetFunctionSelectors', type: 'mapping(address => struct)' },
        { label: 'facetAddresses', type: 'address[]' },
        { label: 'supportedInterfaces', type: 'mapping(bytes4 => bool)' },
        { label: 'contractOwner', type: 'address' },
      ];

      // ── Read DiamondStorage struct fields R+0..R+4 ──
      const structSlots = Array.from({ length: 5 }, (_, i) =>
        formatSlotHex(confirmedRoot! + BigInt(i)),
      );
      const structResults = await batchReadSlots(chainId, address, structSlots);
      for (let i = 0; i < structResults.length; i++) {
        const { slot, value } = structResults[i];
        // Find the struct offset for this slot
        const offset = Number(BigInt(slot) - confirmedRoot!);
        const fieldInfo = STRUCT_LABELS[offset];
        items.push({
          address,
          slot,
          source: 'rpc_scan' as SlotSource,
          value,
          meta: {
            discoveredBy: 'diamond_namespace',
            label: fieldInfo?.label ?? `DiamondStorage[${offset}]`,
            type: fieldInfo?.type,
          },
        });
      }

      // ── Derive selectorToFacet mapping entries (R+0) ──
      if (facetSelectors) {
        const selectorSlotMap: string[] = [];
        const selectorLabels: string[] = [];
        for (const [, selectors] of facetSelectors) {
          for (const sel of selectors) {
            const derived = computeMappingSlot(confirmedRoot!, sel, 'bytes4');
            selectorSlotMap.push(formatSlotHex(derived));
            selectorLabels.push(`selectorToFacet[${sel}]`);
          }
        }
        if (selectorSlotMap.length > 0) {
          const selectorResults = await batchReadSlots(chainId, address, selectorSlotMap);
          for (const { slot, value } of selectorResults) {
            if (value === ZERO_WORD) continue;
            const idx = selectorSlotMap.findIndex(
              (s) => s.toLowerCase() === slot.toLowerCase(),
            );
            items.push({
              address,
              slot,
              source: 'rpc_scan' as SlotSource,
              value,
              meta: {
                discoveredBy: 'diamond_selector_mapping',
                label: idx >= 0 ? selectorLabels[idx] : 'selectorToFacet[?]',
                type: 'struct FacetAddressAndPosition',
              },
            });
          }
        }
      }

      // ── Expand facetAddresses array (R+2) ──
      const facetLenSlot = formatSlotHex(confirmedRoot + 2n);
      const facetLenResult = structResults.find(
        (r) => r.slot.toLowerCase() === facetLenSlot.toLowerCase(),
      );
      if (facetLenResult) {
        const len = Number(BigInt(facetLenResult.value));
        if (len > 0 && len < 1000) {
          const arrSlots = Array.from({ length: len }, (_, i) =>
            formatSlotHex(computeArrayElementSlot(confirmedRoot! + 2n, BigInt(i))),
          );
          const arrResults = await batchReadSlots(chainId, address, arrSlots);
          for (let i = 0; i < arrResults.length; i++) {
            const { slot, value } = arrResults[i];
            if (value === ZERO_WORD) continue;
            // Find the array index from the slot
            const arrIdx = arrSlots.findIndex(
              (s) => s.toLowerCase() === slot.toLowerCase(),
            );
            items.push({
              address,
              slot,
              source: 'rpc_scan' as SlotSource,
              value,
              meta: {
                discoveredBy: 'diamond_facet_array',
                label: `facetAddresses[${arrIdx >= 0 ? arrIdx : i}]`,
                type: 'address',
              },
            });
          }
        }
      }

      if (items.length > 0) {
        mergeEvidence(items);
      }

      // Return discovered facet addresses + namespace root for downstream layout fetching
      const discoveredFacets = items
        .filter(i => i.meta?.discoveredBy === 'diamond_facet_array' && i.value && i.value !== ZERO_WORD)
        .map(i => '0x' + i.value!.slice(26)); // extract address from padded value
      return { confirmed: confirmedRoot !== null, facetAddresses: discoveredFacets, namespaceRoot: confirmedRoot };
    },
    [readSlotFromRpc, batchReadSlots, mergeEvidence],
  );

  // ─── Layout Methods ────────────────────────────────────────────────

  /**
   * Seed evidence from a storage layout (from compiler output).
   *
   * For diamond contracts with namespaced storage, pass `namespaceOffset` to
   * rebase all slot positions from struct-relative to absolute on-chain slots.
   * e.g. layout says slot 16 → actual slot is namespace_root + 16.
   */
  const seedFromLayout = useCallback(
    (layoutData: StorageLayoutResponse, address: string, namespaceOffset?: bigint) => {
      // If a namespace offset is provided, rebase all layout slot positions
      const effectiveLayout: StorageLayoutResponse = namespaceOffset
        ? {
            ...layoutData,
            storage: layoutData.storage.map((entry) => ({
              ...entry,
              slot: (BigInt(entry.slot) + namespaceOffset).toString(),
            })),
          }
        : layoutData;

      setLayout(effectiveLayout);

      const items: SlotEvidence[] = [];
      for (const entry of effectiveLayout.storage) {
        const slotHex = formatSlotHex(BigInt(entry.slot));
        items.push({
          address,
          slot: slotHex,
          source: 'layout' as SlotSource,
          meta: {
            label: entry.label,
            type: entry.type,
            offset: entry.offset,
          },
        });

        const typeInfo = effectiveLayout.types[entry.type];
        if (typeInfo?.encoding === 'inplace' && typeInfo.members) {
          for (const member of typeInfo.members) {
            const memberSlot = BigInt(entry.slot) + BigInt(member.slot);
            items.push({
              address,
              slot: formatSlotHex(memberSlot),
              source: 'layout' as SlotSource,
              meta: {
                label: `${entry.label}.${member.label}`,
                type: member.type,
                parentLabel: entry.label,
                offset: member.offset,
              },
            });
          }
        }
      }

      mergeEvidence(items);
      return items;
    },
    [mergeEvidence],
  );

  // ─── EDB Methods (optional, only when session active) ─────────────

  const fetchLayoutFromEdb = useCallback(
    async (sessionId: string, address: string) => {
      try {
        const result = await debugBridgeService.getStorageLayout(sessionId, address);
        if (result) {
          seedFromLayout(result, address);
          return result;
        }
        return null;
      } catch {
        return null;
      }
    },
    [seedFromLayout],
  );

  const fetchTouchedFromEdb = useCallback(
    async (sessionId: string, address: string) => {
      try {
        const touched = await debugBridgeService.getStorageTouched(sessionId, address);
        if (!touched) return;

        const items: SlotEvidence[] = [];

        for (const [addr, slots] of Object.entries(touched)) {
          const normalizedAddr = addr.toLowerCase();
          if (normalizedAddr !== address.toLowerCase()) continue;

          for (const slotEntry of slots) {
            const slotHex = typeof slotEntry.slot === 'string'
              ? slotEntry.slot
              : formatSlotHex(BigInt(slotEntry.slot));

            const isProxy = Object.keys(PROXY_SLOTS).includes(slotHex.toLowerCase());

            let value: string | undefined;
            let before: string | undefined;
            let after: string | undefined;

            if (slotEntry.writes.length > 0) {
              const lastWrite = slotEntry.writes[slotEntry.writes.length - 1];
              before = typeof lastWrite.before === 'string'
                ? lastWrite.before
                : formatSlotHex(BigInt(lastWrite.before));
              after = typeof lastWrite.after === 'string'
                ? lastWrite.after
                : formatSlotHex(BigInt(lastWrite.after));
              value = after;
            } else if (slotEntry.reads.length > 0) {
              const lastRead = slotEntry.reads[slotEntry.reads.length - 1];
              value = typeof lastRead.value === 'string'
                ? lastRead.value
                : formatSlotHex(BigInt(lastRead.value));
            }

            items.push({
              address,
              slot: slotHex,
              source: isProxy ? 'proxy' as SlotSource : 'trace' as SlotSource,
              value,
              before,
              after,
              meta: isProxy ? { proxyRole: PROXY_SLOTS[slotHex.toLowerCase()] } : undefined,
            });
          }
        }

        if (items.length > 0) {
          // Guard: skip if a newer load has already aborted this one
          if (abortRef.current?.signal.aborted) return;
          mergeEvidence(items);
        }
      } catch {
        // fetchTouchedFromEdb error
      }
    },
    [mergeEvidence],
  );

  const fetchStorageRangeFromEdb = useCallback(
    async (sessionId: string, address: string) => {
      try {
        const rangeResult = await debugBridgeService.getStorageRange(sessionId, address);
        if (!rangeResult) return;

        const slotValues = new Map<string, string>();
        for (const [slot, value] of Object.entries(rangeResult)) {
          const normalizedSlot = slot.startsWith('0x')
            ? slot.toLowerCase()
            : ('0x' + slot).toLowerCase();
          const normalizedValue = typeof value === 'string'
            ? value
            : formatSlotHex(BigInt(value));
          slotValues.set(normalizedSlot, normalizedValue);
        }

        // Guard: skip if a newer load has already aborted this one
        if (abortRef.current?.signal.aborted) return;
        setEvidence((prev) =>
          prev.map((e) => {
            const val = slotValues.get(e.slot.toLowerCase());
            return val ? { ...e, value: val } : e;
          }),
        );
      } catch {
        // fetchStorageRangeFromEdb error
      }
    },
    [],
  );

  // ─── Main Pipeline ─────────────────────────────────────────────────

  const loadStorageForContract = useCallback(
    async (params: {
      chainId: number;
      address: string;
      sessionId?: string;
      layoutData?: StorageLayoutResponse;
      proxyType?: ProxyType;
      /** Pre-fetched source bundle for reconstruction (avoids redundant Sourcify call) */
      sourceBundle?: { files: Record<string, string>; contractName?: string; compilerVersion?: string };
      /** Diamond facet addresses to try fetching layout from */
      fallbackAddresses?: string[];
    }) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const currentLoadId = ++loadIdRef.current;

      setEvidence([]);
      setLayout(null);
      setLayoutConfidence(null);
      setIsLoading(true);
      setLoadingPhase('seeding');
      setError(null);

      try {
        await seedFromRpc(params.chainId, params.address, params.proxyType);

        // Collect observed non-zero slot indices for candidate scoring
        const observedSlots = new Set<number>();
        // evidence was just populated by seedFromRpc — read current state
        setEvidence((prev) => {
          for (const e of prev) {
            try {
              const idx = Number(BigInt(e.slot));
              if (idx < 256) observedSlots.add(idx);
            } catch { /* skip non-numeric */ }
          }
          return prev; // no mutation
        });

        // Move to resolving phase — layout fetch can take time
        setLoadingPhase('resolving');

        if (params.layoutData) {
          seedFromLayout(params.layoutData, params.address);
          setLayoutConfidence('compiler');
        } else if (params.sessionId) {
          const edbLayout = await fetchLayoutFromEdb(params.sessionId, params.address);
          if (edbLayout) setLayoutConfidence('compiler');
        } else {
          const publicResult = await fetchStorageLayout(
            params.chainId,
            params.address,
            {
              signal: abortRef.current?.signal,
              sourceBundle: params.sourceBundle,
              observedSlots,
              fallbackAddresses: params.fallbackAddresses,
            },
          );
          if (publicResult) {
            seedFromLayout(publicResult.layout, params.address);
            setLayoutConfidence(publicResult.confidence);
          }
        }

        // Layout resolved — show results
        setLoadingPhase('done');

        if (params.sessionId) {
          await fetchTouchedFromEdb(params.sessionId, params.address);
          await fetchStorageRangeFromEdb(params.sessionId, params.address);
        }

        setEvidence((prev) => {
          const slotsNeedingValues = prev.filter((e) => !e.value);
          if (slotsNeedingValues.length > 0) {
            Promise.allSettled(
              slotsNeedingValues.map(async (e) => {
                const value = await readSlotFromRpc(params.chainId, params.address, e.slot);
                return { slot: e.slot, value };
              }),
            ).then((results) => {
              if (loadIdRef.current !== currentLoadId) return;
              setEvidence((current) =>
                current.map((e) => {
                  const match = results.find(
                    (r) => r.status === 'fulfilled' && r.value.slot === e.slot,
                  );
                  if (match?.status === 'fulfilled' && match.value.value) {
                    return { ...e, value: match.value.value };
                  }
                  return e;
                }),
              );
            });
          }
          return prev;
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Failed to load storage');
        }
      } finally {
        setIsLoading(false);
        // If we errored before reaching 'done', mark done so skeleton clears
        setLoadingPhase((prev) => prev === 'done' ? prev : 'done');
      }
    },
    [seedFromRpc, seedFromLayout, fetchLayoutFromEdb, fetchTouchedFromEdb, fetchStorageRangeFromEdb, readSlotFromRpc],
  );

  // ─── Manual Slot Operations ────────────────────────────────────────

  const addManualSlot = useCallback(
    (address: string, slot: string) => {
      const normalized = formatSlotHex(BigInt(slot));
      mergeEvidence([
        {
          address,
          slot: normalized,
          source: 'manual' as SlotSource,
        },
      ]);
    },
    [mergeEvidence],
  );

  const readAndUpdateSlot = useCallback(
    async (chainId: number, address: string, slot: string) => {
      const value = await readSlotFromRpc(chainId, address, slot);
      const normalized = slot.startsWith('0x') ? slot.toLowerCase() : formatSlotHex(BigInt(slot));
      if (value !== null) {
        setEvidence((prev) =>
          prev.map((e) =>
            e.slot.toLowerCase() === normalized.toLowerCase()
              ? { ...e, value }
              : e,
          ),
        );
      }
      return value;
    },
    [readSlotFromRpc],
  );

  const readSlotFromEdb = useCallback(
    async (sessionId: string, snapshotId: number, slot: string) => {
      try {
        const value = await debugBridgeService.getStorage(sessionId, snapshotId, slot);
        if (value) {
          setEvidence((prev) =>
            prev.map((e) =>
              e.slot.toLowerCase() === slot.toLowerCase()
                ? { ...e, value }
                : e,
            ),
          );
        }
        return value;
      } catch {
        return null;
      }
    },
    [],
  );

  const addTraceSlots = useCallback(
    (items: Array<{ address: string; slot: string; before?: string; after?: string }>) => {
      mergeEvidence(
        items.map((item) => ({
          address: item.address,
          slot: formatSlotHex(BigInt(item.slot)),
          source: 'trace' as SlotSource,
          before: item.before,
          after: item.after,
        })),
      );
    },
    [mergeEvidence],
  );

  /** Cancel an in-progress load without clearing already-collected evidence */
  const cancelLoad = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
    setLoadingPhase('done');
    setError(null);
  }, []);

  const clearEvidence = useCallback(() => {
    abortRef.current?.abort();
    setEvidence([]);
    setLayout(null);
    setLayoutConfidence(null);
    setLoadingPhase('idle');
    setError(null);
  }, []);

  return {
    evidence,
    layout,
    layoutConfidence,
    isLoading,
    loadingPhase,
    error,
    seedFromLayout,
    loadStorageForContract,
    cancelLoad,
    seedDiamondNamespace,
    addManualSlot,
    readAndUpdateSlot,
    readSlotFromRpc,
    readSlotFromEdb,
    addTraceSlots,
    clearEvidence,
  };
}
