/**
 * Storage Layout Resolver
 *
 * Maps raw storage slot hex values to human-readable variable names using
 * the compiler's storage layout output. Supports:
 *   - Direct slot matching (simple variables, structs, fixed-size arrays)
 *   - Single-depth mapping resolution (e.g. _balances[addr])
 *   - Nested mapping resolution (e.g. _allowances[owner][spender])
 *   - Dynamic array element resolution
 *   - Leaf value type resolution for type-aware decoding
 *
 * Zero dependency on EDB, debug sessions, or simulation infrastructure.
 * Reusable by StateTab, Contract Storage Layout Viewer, and any future consumer.
 */

import type {
  StorageLayoutResponse,
  StorageLayoutEntry,
  StorageTypeDefinition,
} from '../types/debug';
import { computeMappingSlot, computeArrayElementSlot, formatSlotHex } from './storageSlotCalculator';

/** Structured result from slot resolution, carrying type info for decoding */
export interface SlotResolutionResult {
  label: string;
  /** Type ID of the leaf value (e.g. "t_uint256") — used for type-aware decode */
  valueTypeId?: string;
  /** Human-readable type label (e.g. "uint256") */
  valueTypeLabel?: string;
  /** Size in bytes of the leaf value type (e.g. 32 for uint256, 1 for bool, 20 for address) */
  valueNumberOfBytes?: number;
  /** Encoding of the leaf value type (e.g. "inplace", "bytes") */
  valueEncoding?: string;
}

/** Result from resolveLeafValueType */
export interface LeafTypeInfo {
  typeId: string;
  typeLabel: string;
  encoding: string;
  numberOfBytes: string;
}

/**
 * Walk the layout type chain to resolve the final non-mapping/non-array type.
 *
 * For `mapping(address => mapping(address => uint256))`:
 *   root type = t_mapping(t_address,t_mapping(...))
 *   → .value = t_mapping(t_address,t_uint256)
 *   → .value = t_uint256
 *   → leaf = { typeId: "t_uint256", typeLabel: "uint256" }
 *
 * For `mapping(address => uint256)`:
 *   root type = t_mapping(t_address,t_uint256)
 *   → .value = t_uint256
 *   → leaf = { typeId: "t_uint256", typeLabel: "uint256" }
 */
export function resolveLeafValueType(
  layout: StorageLayoutResponse,
  typeId: string,
  depth = 0
): LeafTypeInfo | null {
  if (depth > 10) return null; // safety guard

  const typeDef = layout.types[typeId];
  if (!typeDef) return null;

  // If it's a mapping, recurse into its value type
  if (typeDef.encoding === 'mapping' && typeDef.value) {
    return resolveLeafValueType(layout, typeDef.value, depth + 1);
  }

  // If it's a dynamic_array, resolve element type
  if (typeDef.encoding === 'dynamic_array' && typeDef.value) {
    return resolveLeafValueType(layout, typeDef.value, depth + 1);
  }

  // Terminal type — return it
  return {
    typeId,
    typeLabel: typeDef.label,
    encoding: typeDef.encoding,
    numberOfBytes: typeDef.numberOfBytes,
  };
}

/**
 * Build a map from slot hex → variable label for all simple (non-derived) slots.
 * Simple variables, structs inlined in storage, and fixed-size arrays.
 */
export function buildSlotMap(layout: StorageLayoutResponse): Map<string, string> {
  const map = new Map<string, string>();

  for (const entry of layout.storage) {
    const slotHex = formatSlotHex(BigInt(entry.slot));
    const typeInfo = layout.types[entry.type];

    if (!typeInfo) {
      map.set(slotHex, entry.label);
      continue;
    }

    if (typeInfo.encoding === 'inplace') {
      map.set(slotHex, `${entry.label} (${typeInfo.label})`);
      if (typeInfo.members) {
        for (const member of typeInfo.members) {
          const memberSlot = BigInt(entry.slot) + BigInt(member.slot);
          const memberSlotHex = formatSlotHex(memberSlot);
          const memberType = layout.types[member.type];
          map.set(memberSlotHex, `${entry.label}.${member.label} (${memberType?.label || member.type})`);
        }
      }
    }

    if (typeInfo.encoding === 'mapping') {
      map.set(slotHex, `${entry.label} (${typeInfo.label}) [base slot]`);
    }

    if (typeInfo.encoding === 'dynamic_array') {
      map.set(slotHex, `${entry.label}.length (${typeInfo.label})`);
    }

    if (typeInfo.encoding === 'bytes') {
      map.set(slotHex, `${entry.label} (${typeInfo.label})`);
    }
  }

  return map;
}

/**
 * Resolve a single storage slot to a human-readable label.
 * Returns null if no match found.
 */
export function resolveSlotLabel(
  slot: string,
  layout: StorageLayoutResponse
): string | null {
  const slotMap = buildSlotMap(layout);
  const normalized = formatSlotHex(BigInt(slot));
  return slotMap.get(normalized) || null;
}

/**
 * Attempt to resolve a derived mapping slot by trying known keys.
 * Supports nested mappings up to `maxDepth` levels deep.
 *
 * For `mapping(address => uint256)`:  tries keccak256(key, baseSlot)
 * For `mapping(address => mapping(address => uint256))`: tries
 *   keccak256(key2, keccak256(key1, baseSlot))
 *
 * Returns structured result with label + value type info, or null.
 * Legacy callers that expect `string | null` should use `.label`.
 */
export function tryResolveMappingSlot(
  slot: string,
  layout: StorageLayoutResponse,
  knownKeys: string[],
  maxDepth = 3
): SlotResolutionResult | null {
  const targetSlot = BigInt(slot);

  for (const entry of layout.storage) {
    const typeInfo = layout.types[entry.type];
    if (!typeInfo || typeInfo.encoding !== 'mapping') continue;

    const baseSlot = BigInt(entry.slot);

    const result = dfsMappingSearch(
      targetSlot,
      layout,
      entry.label,
      baseSlot,
      entry.type,
      knownKeys,
      [],
      0,
      maxDepth
    );
    if (result) return result;
  }

  return null;
}

/**
 * DFS search through nested mapping structure to find the target slot.
 */
function dfsMappingSearch(
  targetSlot: bigint,
  layout: StorageLayoutResponse,
  rootLabel: string,
  currentSeed: bigint,
  currentTypeId: string,
  knownKeys: string[],
  pathKeys: string[],
  depth: number,
  maxDepth: number
): SlotResolutionResult | null {
  if (depth >= maxDepth) return null;

  const typeDef = layout.types[currentTypeId];
  if (!typeDef || typeDef.encoding !== 'mapping') return null;

  // Resolve the key type for this mapping level
  const keyTypeId = typeDef.key;
  if (!keyTypeId) return null;
  const keyTypeInfo = layout.types[keyTypeId];
  const keyTypeName = keyTypeInfo?.label || 'uint256';
  const abiKeyType = mapSolidityTypeToAbiType(keyTypeName);

  // The value type at this level
  const valueTypeId = typeDef.value;

  for (const key of knownKeys) {
    let derivedSlot: bigint;
    try {
      derivedSlot = computeMappingSlot(currentSeed, key, abiKeyType);
    } catch {
      continue; // key not valid for this type
    }

    if (derivedSlot === targetSlot) {
      // Found it! Build the label and resolve leaf value type
      const shortKey = key.length > 12 ? `${key.slice(0, 6)}...${key.slice(-4)}` : key;
      const allKeys = [...pathKeys, shortKey];
      const label = `${rootLabel}${allKeys.map(k => `[${k}]`).join('')}`;

      // Resolve the leaf value type for decoding
      const leafType = valueTypeId
        ? resolveLeafValueType(layout, valueTypeId)
        : null;

      return {
        label,
        valueTypeId: leafType?.typeId ?? valueTypeId ?? undefined,
        valueTypeLabel: leafType?.typeLabel ?? undefined,
        valueNumberOfBytes: leafType ? parseInt(leafType.numberOfBytes, 10) || 32 : 32,
        valueEncoding: leafType?.encoding ?? 'inplace',
      };
    }

    // If the value type is itself a mapping, recurse
    if (valueTypeId) {
      const valueTypeDef = layout.types[valueTypeId];
      if (valueTypeDef?.encoding === 'mapping') {
        const shortKey = key.length > 12 ? `${key.slice(0, 6)}...${key.slice(-4)}` : key;
        const result = dfsMappingSearch(
          targetSlot,
          layout,
          rootLabel,
          derivedSlot,
          valueTypeId,
          knownKeys,
          [...pathKeys, shortKey],
          depth + 1,
          maxDepth
        );
        if (result) return result;
      }
    }
  }

  return null;
}

/**
 * Attempt to resolve a dynamic array element slot.
 * Checks if the slot falls within the data range of any dynamic array.
 *
 * Returns a structured result with label + element type info for decoding,
 * mirroring the approach used by tryResolveMappingSlot().
 */
export function tryResolveArraySlot(
  slot: string,
  layout: StorageLayoutResponse
): SlotResolutionResult | null {
  const targetSlot = BigInt(slot);

  for (const entry of layout.storage) {
    const typeInfo = layout.types[entry.type];
    if (!typeInfo || typeInfo.encoding !== 'dynamic_array') continue;

    const baseSlot = BigInt(entry.slot);
    const dataStart = computeArrayElementSlot(baseSlot, 0n);

    if (targetSlot >= dataStart && targetSlot < dataStart + 1000n) {
      const index = targetSlot - dataStart;
      const label = `${entry.label}[${index}]`;

      // Resolve element type via the dynamic_array's .value type chain
      const leafType = resolveLeafValueType(layout, entry.type);

      return {
        label,
        valueTypeId: leafType?.typeId ?? undefined,
        valueTypeLabel: leafType?.typeLabel ?? undefined,
        valueNumberOfBytes: leafType ? parseInt(leafType.numberOfBytes, 10) || 32 : 32,
        valueEncoding: leafType?.encoding ?? 'inplace',
      };
    }
  }

  return null;
}

/**
 * Comprehensive slot resolution: tries all strategies in order.
 * 1. Direct slot map (simple variables, struct members)
 * 2. Known-key mapping resolution (single and nested)
 * 3. Array element resolution
 *
 * Returns structured result with label + value type info for decoding.
 */
export function resolveSlotLabelComprehensive(
  slot: string,
  layout: StorageLayoutResponse,
  knownKeys: string[] = []
): SlotResolutionResult | null {
  // 1. Direct match
  const direct = resolveSlotLabel(slot, layout);
  if (direct) {
    // Try to extract type info from the label "(typeName)" pattern
    // and also look up the actual entry for precise type ID
    const entry = findDirectEntry(slot, layout);
    if (entry) {
      const leafType = resolveLeafValueType(layout, entry.type);
      return {
        label: direct,
        valueTypeId: leafType?.typeId ?? entry.type,
        valueTypeLabel: leafType?.typeLabel,
        valueNumberOfBytes: leafType ? parseInt(leafType.numberOfBytes, 10) || 32 : 32,
        valueEncoding: leafType?.encoding ?? 'inplace',
      };
    }
    return { label: direct };
  }

  // 2. Mapping with known keys (single + nested)
  if (knownKeys.length > 0) {
    const mapping = tryResolveMappingSlot(slot, layout, knownKeys);
    if (mapping) return mapping;
  }

  // 3. Array element
  const array = tryResolveArraySlot(slot, layout);
  if (array) return array;

  return null;
}

/**
 * Find the storage entry that directly maps to a slot (for type info extraction).
 */
function findDirectEntry(
  slot: string,
  layout: StorageLayoutResponse
): StorageLayoutEntry | null {
  const normalized = formatSlotHex(BigInt(slot));

  for (const entry of layout.storage) {
    const slotHex = formatSlotHex(BigInt(entry.slot));
    if (slotHex === normalized) return entry;

    // Check struct members
    const typeInfo = layout.types[entry.type];
    if (typeInfo?.members) {
      for (const member of typeInfo.members) {
        const memberSlot = BigInt(entry.slot) + BigInt(member.slot);
        if (formatSlotHex(memberSlot) === normalized) return member;
      }
    }
  }

  return null;
}

/** Map Solidity type names to ABI encoder type strings */
function mapSolidityTypeToAbiType(typeName: string): string {
  if (typeName === 'address') return 'address';
  if (typeName === 'bool') return 'bool';
  if (typeName === 'string') return 'string';
  if (typeName.startsWith('uint')) return typeName;
  if (typeName.startsWith('int')) return typeName;
  if (typeName.startsWith('bytes')) return typeName;
  // Contract types (e.g. "contract IERC20") are addresses
  if (typeName.startsWith('contract ')) return 'address';
  return 'uint256';
}
