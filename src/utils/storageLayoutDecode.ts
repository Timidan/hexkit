/**
 * Storage Layout Value Decoder
 *
 * Pure TypeScript module (zero React dependencies) that decodes 256-bit hex
 * storage words into typed Solidity values using compiler storage layout metadata.
 *
 * Builds on top of:
 *   - storageSlotCalculator.ts  (slot formatting, mapping/array slot computation)
 *   - storageLayoutResolver.ts  (slot-label resolution: direct, mapping, array)
 *
 * Consumed by:
 *   - src/components/simulation-results/StateTab.tsx  (Task 4)
 */

import { ethers } from 'ethers';
import type {
  StorageLayoutResponse,
  StorageLayoutEntry,
  StorageTypeDefinition,
  StorageDiffEntry,
} from '../types/debug';
import type { SimulationResult } from '../types/transaction';
import { formatSlotHex, parseSlotInput } from './storageSlotCalculator';
import { resolveSlotLabelComprehensive } from './storageLayoutResolver';

/** A single field that occupies (part of) a storage slot */
export interface SlotDescriptor {
  label: string;           // Variable name, e.g. "totalSupply"
  typeLabel: string;       // Human-readable type, e.g. "uint256"
  typeKey: string;         // Type key into layout.types
  offset: number;          // Byte offset within 32-byte slot (0 = LSB)
  size: number;            // Bytes this field occupies
  encoding: string;        // "inplace", "mapping", "dynamic_array", "bytes", "unknown"
  entry: StorageLayoutEntry;
}

/** Decoded value for a single field */
export interface DecodedField {
  label: string;
  typeLabel: string;
  beforeDecoded: string | null;
  afterDecoded: string | null;
  beforeRaw: string;
  afterRaw: string;
  confidence: 'exact' | 'derived' | 'heuristic';
}

/** Result of matching a diff slot against layout */
export interface SlotMatch {
  descriptors: SlotDescriptor[];
  resolvedLabel: string | null;
  matchType: 'direct' | 'mapping' | 'array' | 'none';
  /** Resolved leaf value type ID (e.g. "t_uint256") for type-aware derived decode */
  valueTypeId?: string;
  /** Resolved leaf value type label (e.g. "uint256") */
  valueTypeLabel?: string;
  /** Size in bytes of the leaf value type (e.g. 32 for uint256, 1 for bool) */
  valueNumberOfBytes?: number;
  /** Encoding of the leaf value type (e.g. "inplace", "bytes") */
  valueEncoding?: string;
}

/**
 * Normalize any slot representation ("3", "0x0000...0003", "0x3")
 * to a 0x-prefixed 64-char hex string via formatSlotHex(BigInt(...)).
 */
export function canonicalizeSlot(slot: string): string | null {
  const trimmed = slot.trim();
  if (!trimmed) return null;
  try {
    return formatSlotHex(parseSlotInput(trimmed));
  } catch {
    try {
      return formatSlotHex(BigInt(trimmed));
    } catch {
      return null;
    }
  }
}

/**
 * Build an index from canonical slot hex to SlotDescriptor[].
 * Multiple descriptors per slot for packed variables (e.g. address + bool in one slot).
 * For inplace structs with members, each member is added at (parent slot + member.slot).
 */
export function buildSlotDescriptors(
  layout: StorageLayoutResponse
): Map<string, SlotDescriptor[]> {
  const index = new Map<string, SlotDescriptor[]>();

  function addDescriptor(slotHex: string, descriptor: SlotDescriptor) {
    const existing = index.get(slotHex);
    if (existing) {
      existing.push(descriptor);
    } else {
      index.set(slotHex, [descriptor]);
    }
  }

  for (const entry of layout.storage) {
    const baseSlotBigint = BigInt(entry.slot);
    const typeInfo: StorageTypeDefinition | undefined = layout.types[entry.type];
    const encoding = typeInfo?.encoding ?? 'unknown';
    const typeLabel = typeInfo?.label ?? entry.type;
    const size = typeInfo ? Math.ceil(parseInt(typeInfo.numberOfBytes, 10) || 32) : 32;

    // Create the top-level descriptor for this entry
    const topDescriptor: SlotDescriptor = {
      label: entry.label,
      typeLabel,
      typeKey: entry.type,
      offset: entry.offset,
      size: Math.min(size, 32), // cap at 32 bytes per slot
      encoding,
      entry,
    };

    const slotHex = formatSlotHex(baseSlotBigint);

    // If it's a struct with members, add members only (not the parent struct
    // descriptor — it would produce a meaningless whole-word decode alongside
    // the meaningful member-level decodes)
    if (encoding === 'inplace' && typeInfo?.members) {
      for (const member of typeInfo.members) {
        const memberSlotBigint = baseSlotBigint + BigInt(member.slot);
        const memberSlotHex = formatSlotHex(memberSlotBigint);
        const memberTypeInfo = layout.types[member.type];
        const memberEncoding = memberTypeInfo?.encoding ?? 'unknown';
        const memberTypeLabel = memberTypeInfo?.label ?? member.type;
        const memberSize = memberTypeInfo
          ? Math.ceil(parseInt(memberTypeInfo.numberOfBytes, 10) || 32)
          : 32;

        const memberDescriptor: SlotDescriptor = {
          label: `${entry.label}.${member.label}`,
          typeLabel: memberTypeLabel,
          typeKey: member.type,
          offset: member.offset,
          size: Math.min(memberSize, 32),
          encoding: memberEncoding,
          entry: member,
        };

        addDescriptor(memberSlotHex, memberDescriptor);
      }
    } else {
      // Non-struct entries: add the top-level descriptor directly
      addDescriptor(slotHex, topDescriptor);
    }
  }

  return index;
}

/**
 * Match a diff slot against the layout.
 * 1. Direct descriptor match
 * 2. Fallback to resolveSlotLabelComprehensive for mapping/array derived slots
 */
export function matchSlot(
  diffSlot: string,
  layout: StorageLayoutResponse,
  descriptorIndex: Map<string, SlotDescriptor[]>,
  knownKeys: string[] = []
): SlotMatch {
  const canonical = canonicalizeSlot(diffSlot);

  // Bail early if the slot string was empty/malformed
  if (!canonical) {
    return { descriptors: [], resolvedLabel: null, matchType: 'none' };
  }

  // 1. Direct descriptor match
  const descriptors = descriptorIndex.get(canonical);
  if (descriptors && descriptors.length > 0) {
    // Determine match type from the descriptors
    const firstEncoding = descriptors[0].encoding;
    let matchType: SlotMatch['matchType'] = 'direct';
    if (firstEncoding === 'mapping') {
      matchType = 'mapping';
    } else if (firstEncoding === 'dynamic_array') {
      matchType = 'array';
    }

    return {
      descriptors,
      resolvedLabel: descriptors.map(d => `${d.label} (${d.typeLabel})`).join(', '),
      matchType,
    };
  }

  // 2. Fallback to comprehensive label resolution (mapping keys, array indices)
  const resolution = resolveSlotLabelComprehensive(canonical, layout, knownKeys);
  if (resolution) {
    // Determine match type from the label format
    let matchType: SlotMatch['matchType'] = 'none';
    if (resolution.label.includes('[') && !resolution.label.includes('.length')) {
      const bracketContent = resolution.label.match(/\[([^\]]+)\]/)?.[1] ?? '';
      if (/^\d+$/.test(bracketContent)) {
        matchType = 'array';
      } else {
        matchType = 'mapping';
      }
    }

    return {
      descriptors: [],
      resolvedLabel: resolution.label,
      matchType,
      valueTypeId: resolution.valueTypeId,
      valueTypeLabel: resolution.valueTypeLabel,
      valueNumberOfBytes: resolution.valueNumberOfBytes,
      valueEncoding: resolution.valueEncoding,
    };
  }

  return {
    descriptors: [],
    resolvedLabel: null,
    matchType: 'none',
  };
}

/**
 * Extract and decode a field's value from a 256-bit hex word.
 *
 * Solidity packs from LSB: offset 0 = rightmost bytes.
 * The field occupies bytes [offset, offset+size) from the right.
 *
 * Extraction:  (word >> (offset * 8)) & ((1 << (size * 8)) - 1)
 */
export function decodeSlotValue(
  hexValue: string,
  descriptor: SlotDescriptor
): string {
  const { offset, size, typeLabel, encoding } = descriptor;

  // Normalize hex to full 256-bit word
  const cleanHex = hexValue.startsWith('0x') ? hexValue.slice(2) : hexValue;
  const word = BigInt('0x' + (cleanHex || '0'));

  // Extract the field bits
  const shiftBits = BigInt(offset) * 8n;
  // For size >= 32, use full 256-bit mask to avoid overflow
  const mask = size >= 32 ? (1n << 256n) - 1n : (1n << (BigInt(size) * 8n)) - 1n;
  const fieldValue = (word >> shiftBits) & mask;

  // Handle special encodings
  if (encoding === 'mapping') {
    return '{...}';
  }
  if (encoding === 'dynamic_array') {
    return `length: ${fieldValue.toString()}`;
  }

  // Type-based decoding
  const lowerType = typeLabel.toLowerCase();

  // bool
  if (lowerType === 'bool') {
    return fieldValue === 0n ? 'false' : 'true';
  }

  // address or contract types
  if (lowerType === 'address' || lowerType.startsWith('contract ')) {
    return decodeAddress(fieldValue);
  }

  // signed integers (int8, int16, ..., int256)
  if (/^int\d*$/.test(lowerType)) {
    return decodeSignedInt(fieldValue, size);
  }

  // unsigned integers (uint8, uint16, ..., uint256)
  if (/^uint\d*$/.test(lowerType)) {
    return fieldValue.toString();
  }

  // fixed-size bytes (bytes1, bytes2, ..., bytes32)
  if (/^bytes\d+$/.test(lowerType)) {
    const hexStr = fieldValue.toString(16).padStart(size * 2, '0');
    return '0x' + hexStr;
  }

  // enum types — treat as uint
  if (lowerType.startsWith('enum ')) {
    return fieldValue.toString();
  }

  // bytes or string (dynamic) — encoding is 'bytes'
  // Solidity short-string layout: if lowest bit of slot is 0, data is inline.
  // High bytes hold the content, lowest byte = length * 2.
  if (encoding === 'bytes') {
    return decodeShortStringOrBytes(cleanHex, lowerType);
  }

  // Fallback: decimal for small values, hex for large
  if (fieldValue < 100000n) {
    return fieldValue.toString();
  }
  return '0x' + fieldValue.toString(16);
}

/**
 * Decode before/after values for all fields in a matched slot.
 *
 * For direct matches with descriptors: decode each field precisely.
 * For derived matches (mapping/array without descriptors): heuristic decode.
 */
export function decodeDiffFields(
  beforeHex: string,
  afterHex: string,
  match: SlotMatch
): DecodedField[] {
  const fields: DecodedField[] = [];

  if (match.descriptors.length > 0) {
    // Precise decoding using descriptors
    for (const descriptor of match.descriptors) {
      let beforeDecoded: string | null = null;
      let afterDecoded: string | null = null;
      try {
        if (beforeHex) beforeDecoded = decodeSlotValue(beforeHex, descriptor);
      } catch { /* malformed hex — leave as null */ }
      try {
        if (afterHex) afterDecoded = decodeSlotValue(afterHex, descriptor);
      } catch { /* malformed hex — leave as null */ }

      fields.push({
        label: descriptor.label,
        typeLabel: descriptor.typeLabel,
        beforeDecoded,
        afterDecoded,
        beforeRaw: beforeHex || '0x' + '0'.repeat(64),
        afterRaw: afterHex || '0x' + '0'.repeat(64),
        confidence: 'exact',
      });
    }
  } else if (match.matchType !== 'none') {
    // Derived match (mapping/array) — use type-aware decode if value type is known
    const typeLabel = match.valueTypeLabel
      ?? (match.matchType === 'mapping' ? 'mapping value' : 'array element');

    let beforeDecoded: string | null = null;
    let afterDecoded: string | null = null;

    if (match.valueTypeLabel) {
      // Build a synthetic descriptor for type-aware decoding.
      // Use actual size from resolved leaf type for correct signed int / bytesN decode.
      const leafSize = match.valueNumberOfBytes ?? 32;
      const syntheticDescriptor: SlotDescriptor = {
        label: match.resolvedLabel ?? 'unknown',
        typeLabel: match.valueTypeLabel,
        typeKey: match.valueTypeId ?? '',
        offset: 0,
        size: leafSize,
        encoding: match.valueEncoding ?? 'inplace',
        entry: { label: '', offset: 0, slot: '0', type: match.valueTypeId ?? '', astId: 0, contract: '' },
      };
      try {
        if (beforeHex) beforeDecoded = decodeSlotValue(beforeHex, syntheticDescriptor);
      } catch { /* malformed hex */ }
      try {
        if (afterHex) afterDecoded = decodeSlotValue(afterHex, syntheticDescriptor);
      } catch { /* malformed hex */ }
    } else {
      // No type info — fall back to heuristic
      if (beforeHex) beforeDecoded = heuristicDecode(beforeHex);
      if (afterHex) afterDecoded = heuristicDecode(afterHex);
    }

    fields.push({
      label: match.resolvedLabel ?? 'unknown',
      typeLabel,
      beforeDecoded,
      afterDecoded,
      beforeRaw: beforeHex || '0x' + '0'.repeat(64),
      afterRaw: afterHex || '0x' + '0'.repeat(64),
      confidence: 'derived',
    });
  } else {
    // No match at all — still try heuristic
    const beforeDecoded = beforeHex ? heuristicDecode(beforeHex) : null;
    const afterDecoded = afterHex ? heuristicDecode(afterHex) : null;

    fields.push({
      label: 'unknown',
      typeLabel: 'unknown',
      beforeDecoded,
      afterDecoded,
      beforeRaw: beforeHex || '0x' + '0'.repeat(64),
      afterRaw: afterHex || '0x' + '0'.repeat(64),
      confidence: 'heuristic',
    });
  }

  return fields;
}

/**
 * Collect addresses from simulation result and storage diffs for mapping key
 * resolution. Returns lowercase hex strings.
 */
export function extractKnownKeys(
  result: SimulationResult,
  storageDiffs: StorageDiffEntry[],
  contractAddress?: string
): string[] {
  const keys = new Set<string>();

  // Transaction participants
  if (result.from) keys.add(result.from.toLowerCase());
  if (result.to) keys.add(result.to.toLowerCase());

  // Contract address
  if (contractAddress) keys.add(contractAddress.toLowerCase());

  // All contract addresses from the result
  if (result.contracts) {
    for (const c of result.contracts) {
      if (c.address) keys.add(c.address.toLowerCase());
    }
  }

  // All diff addresses
  for (const diff of storageDiffs) {
    if (diff.address) keys.add(diff.address.toLowerCase());
  }

  // Extract address-like values from calldata (e.g. transfer(to, amount) → to)
  if (result.data && result.data.length > 10) {
    const calldataHex = result.data.startsWith('0x') ? result.data.slice(2) : result.data;
    // Skip the 4-byte selector, then scan 32-byte words
    const paramsHex = calldataHex.slice(8);
    for (let i = 0; i + 64 <= paramsHex.length; i += 64) {
      const word = paramsHex.slice(i, i + 64);
      // Address: upper 12 bytes are zero, lower 20 bytes are non-zero
      if (word.slice(0, 24) === '000000000000000000000000' && !/^0+$/.test(word.slice(24))) {
        keys.add('0x' + word.slice(24).toLowerCase());
      }
    }
  }

  return Array.from(keys);
}

/**
 * Heuristic decode of a 256-bit hex value when no type info is available.
 * Tries address and uint256 interpretations.
 */
function heuristicDecode(hexValue: string): string | null {
  const rawHex = hexValue.startsWith('0x') ? hexValue.slice(2) : hexValue;
  if (!rawHex || /^0+$/.test(rawHex)) return '0';

  // Pad to 64 hex chars for consistent upper/lower byte checks
  const cleanHex = rawHex.padStart(64, '0');
  const value = BigInt('0x' + cleanHex);

  // Check if it looks like an address (fits in 20 bytes, upper 12 bytes are zero).
  // Use a high entropy threshold to avoid misidentifying large uint256 values
  // (like token balances) as addresses.
  const upper12 = cleanHex.slice(0, 24); // first 12 bytes = 24 hex chars
  if (upper12 === '0'.repeat(24) && value > 0n) {
    const lower20hex = cleanHex.slice(24);
    const lower20value = BigInt('0x' + lower20hex);
    // Only treat as address if value is large enough to be a plausible address
    // and has non-trivial entropy (not a round number / token amount pattern).
    // Real addresses are >= 2^128 (16 bytes of non-zero data).
    if (lower20value >= (1n << 128n)) {
      return decodeAddress(lower20value);
    }
  }

  // Small value — prefer decimal
  if (value < 100000n) {
    return value.toString();
  }

  // Large value — show both decimal and hex hint
  return value.toString();
}

/**
 * Decode a bigint as a checksummed Ethereum address.
 */
function decodeAddress(value: bigint): string {
  const hexAddr = '0x' + value.toString(16).padStart(40, '0');
  try {
    return ethers.utils.getAddress(hexAddr);
  } catch {
    return hexAddr;
  }
}

/**
 * Decode a bigint as a signed integer using two's complement.
 * Size is in bytes (e.g. 1 for int8, 32 for int256).
 */
function decodeSignedInt(value: bigint, sizeBytes: number): string {
  const bits = BigInt(sizeBytes) * 8n;
  const maxPositive = (1n << (bits - 1n)) - 1n;
  if (value > maxPositive) {
    // Negative: two's complement
    const negative = value - (1n << bits);
    return negative.toString();
  }
  return value.toString();
}

/**
 * Decode a Solidity short string or bytes value from a 32-byte storage slot.
 *
 * Solidity layout for `string`/`bytes`:
 * - Short (≤31 bytes): data stored inline in the high bytes,
 *   lowest byte = length * 2 (lowest bit is 0).
 * - Long (>31 bytes): slot stores length * 2 + 1 (lowest bit is 1),
 *   actual data at keccak256(slot). We can only show the length here.
 */
function decodeShortStringOrBytes(fullSlotHex: string, lowerType: string): string {
  const padded = fullSlotHex.padStart(64, '0');
  const lowestByte = parseInt(padded.slice(62, 64), 16);

  if ((lowestByte & 1) === 1) {
    // Long string/bytes — data is elsewhere, this slot holds (length * 2 + 1)
    const length = (lowestByte - 1) / 2;
    // For very long strings the full word encodes the length
    const fullLength = (BigInt('0x' + padded) - 1n) / 2n;
    if (lowerType === 'string') return `"..." (${fullLength} bytes)`;
    return `0x... (${fullLength} bytes)`;
  }

  // Short string/bytes — inline data
  const length = lowestByte / 2;
  if (length === 0) {
    return lowerType === 'string' ? '""' : '0x';
  }

  // Data is in the high bytes (left-aligned)
  const dataHex = padded.slice(0, length * 2);

  if (lowerType === 'string') {
    // Try to decode as UTF-8
    try {
      const bytes = new Uint8Array(dataHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return `"${text}"`;
    } catch {
      return `0x${dataHex}`;
    }
  }

  // bytes type — show as hex
  return `0x${dataHex}`;
}
