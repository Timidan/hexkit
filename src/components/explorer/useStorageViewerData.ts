import { useMemo } from 'react';
import { resolveLeafValueType } from '../../utils/storageLayoutResolver';
import type { StorageLayoutResponse } from '../../types/debug';
import type {
  ViewFilter,
  ResolvedSlot,
  PathSegment,
  DiscoveredMappingKey,
} from './storageViewerTypes';
import { ZERO_VALUE } from './storageViewerTypes';
import { shortHex, decodeSlotWord } from './storageViewerHelpers';

interface UseStorageViewerDataParams {
  resolvedSlots: ResolvedSlot[];
  filter: ViewFilter;
  searchQuery: string;
  getResolved: () => ResolvedSlot[];
  getUnknown: () => ResolvedSlot[];
  getChanged: () => ResolvedSlot[];
  getNonZero: () => ResolvedSlot[];
  pathSegments: PathSegment[];
  mergedKeys: Map<string, DiscoveredMappingKey[]>;
  contractAddress: string;
  mappingEntriesBySlot: Map<string, { variable: string; baseSlot: string; keyTypeId?: string; valueTypeId?: string }>;
  layout: StorageLayoutResponse | null;
}

export function useStorageViewerData({
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
}: UseStorageViewerDataParams) {

  // ─── Summary Stats ───────────────────────────────────────────────

  const stats = useMemo(() => {
    const packed = resolvedSlots.filter((slot) => slot.isPacked).length;

    return {
      total: resolvedSlots.length,
      resolved: getResolved().length,
      unknown: getUnknown().length,
      changed: getChanged().length,
      nonZero: getNonZero().length,
      packed,
    };
  }, [resolvedSlots, getResolved, getUnknown, getChanged, getNonZero]);

  // ─── Filtered & Grouped Data ─────────────────────────────────────────

  const filteredSlots = useMemo(() => {
    let slots: ResolvedSlot[];
    switch (filter) {
      case 'resolved': slots = getResolved(); break;
      case 'unknown': slots = getUnknown(); break;
      case 'changed': slots = getChanged(); break;
      case 'non-zero': slots = getNonZero(); break;
      default: slots = resolvedSlots;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      slots = slots.filter(
        (s) =>
          s.slot.toLowerCase().includes(q) ||
          (s.label?.toLowerCase().includes(q)) ||
          (s.typeLabel?.toLowerCase().includes(q)) ||
          (s.value?.toLowerCase().includes(q)) ||
          (s.decodedFields?.some((f) => f.decoded.toLowerCase().includes(q) || f.label.toLowerCase().includes(q))),
      );
    }

    return slots;
  }, [resolvedSlots, filter, searchQuery, getResolved, getUnknown, getChanged, getNonZero]);

  const displayRows = useMemo(() => {
    if (pathSegments.length === 0) {
      return filteredSlots;
    }

    const currentSegment = pathSegments[pathSegments.length - 1];
    const bucketKey = currentSegment.baseSlot.toLowerCase();
    const keyRows = mergedKeys.get(bucketKey) || [];

    const mappingEntry = mappingEntriesBySlot.get(bucketKey);
    const leafType = mappingEntry?.valueTypeId && layout
      ? resolveLeafValueType(layout, mappingEntry.valueTypeId)
      : null;
    const valueTypeLabel = leafType?.typeLabel
      ?? (mappingEntry?.valueTypeId && layout?.types[mappingEntry.valueTypeId]?.label)
      ?? mappingEntry?.valueTypeId
      ?? 'unknown';

    let rows: ResolvedSlot[] = keyRows.map((keyRow) => {
      const decoded = decodeSlotWord(keyRow.value, valueTypeLabel !== 'unknown' ? valueTypeLabel : currentSegment.valueTypeLabel);

      return {
        address: contractAddress,
        slot: keyRow.derivedSlot,
        label: `${currentSegment.variable}[${shortHex(keyRow.key, 6, 4)}]`,
        typeLabel: valueTypeLabel,
        decodeKind: 'derived' as const,
        confidence: 'medium' as const,
        provenance: ['rpc_scan' as const],
        value: keyRow.value ?? undefined,
        kind: 'leaf' as const,
        decodedFields: decoded
          ? [{
              label: `${currentSegment.variable}[${shortHex(keyRow.key, 6, 4)}]`,
              typeLabel: valueTypeLabel,
              decoded,
              offset: 0,
              size: 32,
            }]
          : undefined,
      };
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter((row) =>
        row.slot.toLowerCase().includes(q) ||
        (row.label?.toLowerCase().includes(q)) ||
        (row.value?.toLowerCase().includes(q)),
      );
    }

    return rows;
  }, [pathSegments, filteredSlots, mergedKeys, contractAddress, searchQuery, mappingEntriesBySlot, layout]);

  /** Group slots for the tree view -- only show non-zero slots */
  const treeGroups = useMemo(() => {
    const groups: Record<string, ResolvedSlot[]> = {
      variables: [],
      mappings: [],
      arrays: [],
      proxy: [],
      unknown: [],
    };

    for (const slot of resolvedSlots) {
      if (!slot.value || slot.value === ZERO_VALUE) continue;

      if (slot.decodeKind === 'proxy_slot' || slot.decodeKind === 'namespace_root') {
        groups.proxy.push(slot);
      } else if (slot.decodeKind === 'unknown') {
        groups.unknown.push(slot);
      } else if (slot.kind === 'mapping') {
        groups.mappings.push(slot);
      } else if (slot.kind === 'dynamic_array') {
        groups.arrays.push(slot);
      } else {
        groups.variables.push(slot);
      }
    }

    return groups;
  }, [resolvedSlots]);

  return {
    stats,
    filteredSlots,
    displayRows,
    treeGroups,
  };
}
