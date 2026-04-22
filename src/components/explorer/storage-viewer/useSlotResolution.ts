import { useMemo, useCallback, useDeferredValue } from 'react';
import type {
  SlotEvidence,
  ResolvedSlot,
  DecodedSlotField,
  SlotSource,
  StorageLayoutResponse,
  StorageKind,
  StorageLayoutEntry,
} from '../../../types/debug';
import {
  buildSlotMap,
  tryResolveArraySlot,
} from '../../../utils/storageLayoutResolver';
import {
  buildSlotDescriptors,
  decodeSlotValue,
  type SlotDescriptor,
} from '../../../utils/storageLayoutDecode';
import { formatSlotHex, PROXY_SLOTS, ZERO_WORD } from '../../../utils/storageSlotCalculator';

export interface MappingEntry {
  variable: string;
  baseSlot: string;
  typeId: string;
  keyTypeId?: string;
  valueTypeId?: string;
}

/**
 * Decode all descriptors for a given slot value.
 * Returns decoded fields and whether the slot is packed.
 */
function decodeFieldsFromDescriptors(
  value: string,
  descriptors: SlotDescriptor[],
): { decodedFields: DecodedSlotField[]; isPacked: boolean } {
  const decodedFields: DecodedSlotField[] = [];

  for (const desc of descriptors) {
    try {
      const decoded = decodeSlotValue(value, desc);
      decodedFields.push({
        label: desc.label,
        typeLabel: desc.typeLabel,
        decoded,
        offset: desc.offset,
        size: desc.size,
      });
    } catch {
      decodedFields.push({
        label: desc.label,
        typeLabel: desc.typeLabel,
        decoded: '(decode error)',
        offset: desc.offset,
        size: desc.size,
      });
    }
  }

  return {
    decodedFields,
    isPacked: descriptors.length > 1,
  };
}

/**
 * Heuristic decode for slots without layout info.
 * Returns multiple interpretation candidates.
 */
function heuristicDecodeFields(value: string): DecodedSlotField[] {
  if (value === ZERO_WORD) return [{ label: '', typeLabel: 'zero', decoded: '0', offset: 0, size: 32 }];

  const fields: DecodedSlotField[] = [];
  const stripped = value.startsWith('0x') ? value.slice(2) : value;
  const bigVal = BigInt('0x' + stripped);

  // uint256
  fields.push({ label: '', typeLabel: 'uint256', decoded: bigVal.toString(), offset: 0, size: 32 });

  // Check for address pattern (upper 12 bytes zero, lower 20 bytes look like an address)
  // Exclude small values that are clearly numbers, not addresses (must use >= 4 non-zero bytes)
  if (stripped.slice(0, 24) === '0'.repeat(24) && !/^0+$/.test(stripped.slice(24))) {
    const lower20 = stripped.slice(24);
    const nonZeroChars = lower20.replace(/^0+/, '').length;
    if (nonZeroChars >= 8) {
      const addrHex = '0x' + lower20;
      fields.push({ label: '', typeLabel: 'address', decoded: addrHex, offset: 0, size: 20 });
    }
  }

  // Check for bool (value is 0 or 1)
  if (bigVal === 0n || bigVal === 1n) {
    fields.push({ label: '', typeLabel: 'bool', decoded: bigVal === 1n ? 'true' : 'false', offset: 0, size: 1 });
  }

  // Check for plausible ether amount (1e15 to 1e24 range)
  if (bigVal >= 10n ** 15n && bigVal < 10n ** 24n) {
    // BigInt-safe formatting to avoid Number() precision loss
    const intPart = bigVal / (10n ** 18n);
    const fracPart = (bigVal % (10n ** 18n)).toString().padStart(18, '0').slice(0, 6);
    fields.push({ label: '', typeLabel: 'ether', decoded: `${intPart}.${fracPart} ETH`, offset: 0, size: 32 });
  }

  return fields;
}

/** Type labels for which decodeSlotValue produces reliable results.
 *  Complex/composite types (structs, multi-slot types) fall back to heuristic. */
const SAFE_DECODE_TYPES = /^(address|bool|uint\d*|int\d*|bytes\d+|contract .+|enum .+)$/i;

/**
 * Type-aware decode for derived slots (mapping/array) when we have resolved type info.
 * Builds a synthetic SlotDescriptor and uses decodeSlotValue for precise decoding.
 * Only applies for scalar types where decodeSlotValue is reliable.
 * Returns a single-element DecodedSlotField array, or undefined on failure / complex types.
 */
function typeAwareDecode(
  value: string,
  typeLabel: string,
  size: number,
  encoding: string,
): DecodedSlotField[] | undefined {
  // Only decode scalar types — complex types (structs, dynamic bytes/string
  // multi-slot composites) should fall back to heuristic for better output.
  if (!SAFE_DECODE_TYPES.test(typeLabel)) return undefined;

  try {
    const syntheticDescriptor: SlotDescriptor = {
      label: '',
      typeLabel,
      typeKey: '',
      offset: 0,
      size,
      encoding,
      entry: { label: '', offset: 0, slot: '0', type: '', astId: 0, contract: '' },
    };
    const decoded = decodeSlotValue(value, syntheticDescriptor);
    return [{ label: '', typeLabel, decoded, offset: 0, size }];
  } catch {
    return undefined;
  }
}

/** Classify a storage entry as mapping, dynamic_array, or leaf based on type encoding */
function classifyStorageKind(
  typeId: string | undefined,
  types: Record<string, { encoding: string; label: string; key?: string; value?: string }> | undefined,
): StorageKind {
  if (!typeId || !types) return 'leaf';
  const typeDef = types[typeId];
  if (!typeDef) return 'leaf';
  if (typeDef.encoding === 'mapping') return 'mapping';
  if (typeDef.encoding === 'dynamic_array') return 'dynamic_array';
  return 'leaf';
}

function findLayoutEntryBySlot(
  slotHex: string,
  layout: StorageLayoutResponse,
): StorageLayoutEntry | null {
  for (const entry of layout.storage) {
    if (formatSlotHex(BigInt(entry.slot)) === slotHex) {
      return entry;
    }

    const typeInfo = layout.types[entry.type];
    if (typeInfo?.encoding === 'inplace' && typeInfo.members) {
      for (const member of typeInfo.members) {
        const memberSlot = BigInt(entry.slot) + BigInt(member.slot);
        if (formatSlotHex(memberSlot) === slotHex) {
          return {
            ...member,
            slot: memberSlot.toString(),
          };
        }
      }
    }
  }

  return null;
}

/**
 * Extract all mapping entries from a storage layout, including mappings nested
 * inside struct members (critical for AppStorage-pattern diamonds where the
 * top-level entry is a struct and mappings live inside its members).
 * Recursively walks nested structs up to 5 levels deep.
 */
function extractMappingEntries(layout: StorageLayoutResponse): MappingEntry[] {
  const entries: MappingEntry[] = [];

  function walkMembers(
    members: StorageLayoutEntry[],
    parentSlot: bigint,
    parentLabel: string,
    depth: number,
  ) {
    if (depth > 5) return; // safety guard against circular types
    for (const member of members) {
      const memberType = layout.types[member.type];
      if (!memberType) continue;
      const absoluteSlot = parentSlot + BigInt(member.slot);
      const fullLabel = parentLabel ? `${parentLabel}.${member.label}` : member.label;

      if (memberType.encoding === 'mapping') {
        entries.push({
          variable: fullLabel,
          baseSlot: formatSlotHex(absoluteSlot),
          typeId: member.type,
          keyTypeId: memberType.key,
          valueTypeId: memberType.value,
        });
      } else if (memberType.encoding === 'inplace' && memberType.members) {
        // Recurse into nested structs
        walkMembers(memberType.members, absoluteSlot, fullLabel, depth + 1);
      }
    }
  }

  for (const entry of layout.storage) {
    const typeDef = layout.types[entry.type];
    if (!typeDef) continue;

    if (typeDef.encoding === 'mapping') {
      // Direct top-level mapping
      entries.push({
        variable: entry.label,
        baseSlot: formatSlotHex(BigInt(entry.slot)),
        typeId: entry.type,
        keyTypeId: typeDef.key,
        valueTypeId: typeDef.value,
      });
    } else if (typeDef.encoding === 'inplace' && typeDef.members) {
      // Struct with members — recursively walk for nested mappings
      walkMembers(typeDef.members, BigInt(entry.slot), entry.label, 0);
    }
  }

  return entries;
}

/**
 * Resolves SlotEvidence[] into ResolvedSlot[] using layout + heuristics.
 * Includes value decoding, packing detection, and structural kind classification.
 */
export function useSlotResolution(
  evidence: SlotEvidence[],
  layout: StorageLayoutResponse | null,
) {
  // Defer layout changes so the table keeps showing old resolved data
  // while the new slotMap/descriptorIndex/resolvedSlots recompute.
  const deferredLayout = useDeferredValue(layout);
  const isLayoutPending = layout !== deferredLayout;

  /** Build the slot map once when layout changes */
  const slotMap = useMemo(() => {
    if (!deferredLayout) return new Map<string, string>();
    return buildSlotMap(deferredLayout);
  }, [deferredLayout]);

  /** Build descriptor index once when layout changes */
  const descriptorIndex = useMemo(() => {
    if (!deferredLayout) return new Map<string, SlotDescriptor[]>();
    return buildSlotDescriptors(deferredLayout);
  }, [deferredLayout]);

  /** Precomputed slot→layout entry index for O(1) lookups */
  const layoutEntryIndex = useMemo(() => {
    const index = new Map<string, StorageLayoutEntry>();
    if (!deferredLayout) return index;
    for (const entry of deferredLayout.storage) {
      index.set(formatSlotHex(BigInt(entry.slot)), entry);
      const typeInfo = deferredLayout.types[entry.type];
      if (typeInfo?.encoding === 'inplace' && typeInfo.members) {
        for (const member of typeInfo.members) {
          const memberSlot = BigInt(entry.slot) + BigInt(member.slot);
          index.set(formatSlotHex(memberSlot), { ...member, slot: memberSlot.toString() });
        }
      }
    }
    return index;
  }, [deferredLayout]);

  /** Resolve all evidence into labeled slots */
  const resolvedSlots = useMemo((): ResolvedSlot[] => {
    // Deduplicate evidence by slot (keep all sources)
    const slotBucket = new Map<string, SlotEvidence[]>();
    for (const e of evidence) {
      const bucket = slotBucket.get(e.slot) || [];
      bucket.push(e);
      slotBucket.set(e.slot, bucket);
    }

    const entries = Array.from(slotBucket.entries());
    // Sort by slot number so the table always displays in ascending order
    entries.sort((a, b) => {
      try { return BigInt(a[0]) < BigInt(b[0]) ? -1 : BigInt(a[0]) > BigInt(b[0]) ? 1 : 0; }
      catch { return a[0].localeCompare(b[0]); }
    });

    return entries.map(([slot, items]) => {
      const firstItem = items[0];
      const provenance: SlotSource[] = [...new Set(items.map((i) => i.source))];

      // Collect before/after from trace evidence
      const traceEvidence = items.find((i) => i.source === 'trace');
      const before = traceEvidence?.before || items.find((i) => i.before)?.before;
      const after = traceEvidence?.after || items.find((i) => i.after)?.after;

      // Pick the best value
      const value = items.find((i) => i.value)?.value;

      // Try to get descriptors for this slot (for decoding + packing)
      const descriptors = descriptorIndex.get(slot);

      // Decode fields if we have a value
      let decodedFields: DecodedSlotField[] | undefined;
      let isPacked: boolean | undefined;

      if (value && descriptors && descriptors.length > 0) {
        const result = decodeFieldsFromDescriptors(value, descriptors);
        decodedFields = result.decodedFields;
        isPacked = result.isPacked;
      } else if (value && value !== ZERO_WORD) {
        // Heuristic decode for slots without descriptor info
        decodedFields = heuristicDecodeFields(value);
      }

      const directEntry = layoutEntryIndex.get(slot) ?? null;
      const layoutItem = items.find((i) => i.source === 'layout');
      // Check meta.label from trustworthy sources only — layout evidence or
      // diamond-discovered entries with meaningful names. Generic rpc_scan
      // "slotN" and "slotN[M]" labels are excluded so they fall to Unknown.
      const TRUSTED_DISCOVERY = ['diamond_namespace', 'diamond_selector_mapping', 'diamond_facet_array'];
      const anyLabelItem = layoutItem ?? items.find((i) =>
        typeof i.meta?.label === 'string' &&
        (i.source !== 'rpc_scan' || TRUSTED_DISCOVERY.includes(String(i.meta?.discoveredBy)))
      );
      // Type hints can come from any source (including rpc_scan heuristics)
      const anyMetaItem = anyLabelItem ?? items.find((i) => typeof i.meta?.type === 'string');
      const metaType = typeof anyMetaItem?.meta?.type === 'string' ? anyMetaItem.meta.type : undefined;
      const layoutTypeId = metaType ?? directEntry?.type;
      const layoutSlot = directEntry?.slot;
      const layoutLabel =
        (typeof anyLabelItem?.meta?.label === 'string' ? anyLabelItem.meta.label : undefined) ??
        directEntry?.label;
      const kindFromLayout = classifyStorageKind(layoutTypeId, deferredLayout?.types);
      const typeLabelFromLayout = layoutTypeId && deferredLayout?.types[layoutTypeId]
        ? deferredLayout.types[layoutTypeId].label
        : metaType; // fallback: use meta.type directly (e.g. diamond-discovered "address")

      const base: Omit<ResolvedSlot, 'decodeKind' | 'confidence'> = {
        address: firstItem.address,
        slot,
        provenance,
        value,
        before,
        after,
        decodedFields,
        isPacked,
        kind: kindFromLayout,
        layoutTypeId,
        layoutSlot,
        layoutLabel,
      };

      // 1. Check proxy slots
      const proxyLabel = PROXY_SLOTS[slot];
      if (proxyLabel) {
        const proxyFields = value
          ? typeAwareDecode(value, 'address', 20, 'inplace')
          : undefined;
        return {
          ...base,
          ...(proxyFields ? { decodedFields: proxyFields } : {}),
          label: proxyLabel,
          typeLabel: 'address',
          decodeKind: 'proxy_slot' as const,
          confidence: 'high' as const,
          kind: 'leaf' as const,
        };
      }

      // 2. Try direct slot map
      const directLabel = slotMap.get(slot);
      if (directLabel) {
        const typeMatch = directLabel.match(/\(([^)]+)\)/);
        return {
          ...base,
          label: directLabel,
          typeLabel: typeLabelFromLayout ?? typeMatch?.[1],
          decodeKind: 'exact' as const,
          confidence: 'high' as const,
        };
      }

      // 3. Try array element resolution
      if (deferredLayout) {
        const arrayResult = tryResolveArraySlot(slot, deferredLayout);
        if (arrayResult) {
          // Override heuristic decodedFields with type-aware decode when type info is available
          const derivedFields = value && arrayResult.valueTypeLabel
            ? typeAwareDecode(value, arrayResult.valueTypeLabel, arrayResult.valueNumberOfBytes ?? 32, arrayResult.valueEncoding ?? 'inplace')
            : undefined;
          return {
            ...base,
            ...(derivedFields ? { decodedFields: derivedFields } : {}),
            label: arrayResult.label,
            typeLabel: arrayResult.valueTypeLabel ?? 'array element',
            decodeKind: 'derived' as const,
            confidence: 'medium' as const,
            kind: 'leaf' as const,
          };
        }
      }

      // 4. Check if it has layout metadata (from seedFromLayout)
      if (layoutLabel) {
        // Type-aware decode: override heuristic fields when we know the scalar type
        const metaDerived = value && typeLabelFromLayout
          ? typeAwareDecode(value, typeLabelFromLayout, 32, 'inplace')
          : undefined;
        return {
          ...base,
          ...(metaDerived ? { decodedFields: metaDerived } : {}),
          label: layoutLabel,
          typeLabel: typeLabelFromLayout,
          decodeKind: 'exact' as const,
          confidence: 'high' as const,
        };
      }

      // 5. Unknown slot
      return {
        ...base,
        decodeKind: 'unknown' as const,
        confidence: 'low' as const,
        kind: 'leaf' as const,
      };
    });
  }, [evidence, slotMap, descriptorIndex, deferredLayout, layoutEntryIndex]);

  /** Filter helpers */
  const getResolved = useCallback(
    () => resolvedSlots.filter((s) => s.decodeKind !== 'unknown'),
    [resolvedSlots],
  );

  const getUnknown = useCallback(
    () => resolvedSlots.filter((s) => s.decodeKind === 'unknown'),
    [resolvedSlots],
  );

  const getChanged = useCallback(
    () => resolvedSlots.filter((s) => s.before !== undefined || s.after !== undefined),
    [resolvedSlots],
  );

  const getNonZero = useCallback(
    () =>
      resolvedSlots.filter(
        (s) => s.value && s.value !== ZERO_WORD,
      ),
    [resolvedSlots],
  );

  /** Get all layout entries that are mappings, including slot/type metadata.
   *  Walks struct members so AppStorage-style diamonds expose nested mappings. */
  const getMappingEntries = useCallback((): MappingEntry[] => {
    if (!deferredLayout) return [];
    return extractMappingEntries(deferredLayout);
  }, [deferredLayout]);

  /** Same as getMappingEntries but uses non-deferred layout for discovery timing */
  const getMappingEntriesImmediate = useCallback((): MappingEntry[] => {
    if (!layout) return [];
    return extractMappingEntries(layout);
  }, [layout]);

  return {
    resolvedSlots,
    getResolved,
    getUnknown,
    getChanged,
    getNonZero,
    getMappingEntries,
    getMappingEntriesImmediate,
    isLayoutPending,
  };
}
