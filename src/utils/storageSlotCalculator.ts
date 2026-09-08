import { ethers } from 'ethers';
import type { SlotDescriptor } from './storageLayoutDecode';

/**
 * Compute the storage slot for a Solidity mapping entry.
 * Solidity stores mapping[key] at: keccak256(abi.encode(key, baseSlot))
 */
export function computeMappingSlot(
  baseSlot: bigint,
  key: string | number | boolean,
  keyType: string
): bigint {
  const encoded = ethers.utils.defaultAbiCoder.encode(
    [keyType, 'uint256'],
    [key, baseSlot.toString()]
  );
  return BigInt(ethers.utils.keccak256(encoded));
}

/**
 * Compute the storage slot for a dynamic array element.
 * Solidity stores array[index] at: keccak256(abi.encode(baseSlot)) + index
 * The length of the array is stored at baseSlot itself.
 */
export function computeArrayElementSlot(
  baseSlot: bigint,
  index: bigint
): bigint {
  const encoded = ethers.utils.defaultAbiCoder.encode(
    ['uint256'],
    [baseSlot.toString()]
  );
  const dataStart = BigInt(ethers.utils.keccak256(encoded));
  return dataStart + index;
}

/**
 * Compute the storage slot for a nested mapping.
 * mapping(keyType1 => mapping(keyType2 => value))
 * Slot = keccak256(abi.encode(key2, keccak256(abi.encode(key1, baseSlot))))
 */
export function computeNestedMappingSlot(
  baseSlot: bigint,
  keys: { value: string | number | boolean; type: string }[]
): bigint {
  let slot = baseSlot;
  for (const key of keys) {
    slot = computeMappingSlot(slot, key.value, key.type);
  }
  return slot;
}

/**
 * Format a bigint slot as a 32-byte hex string (0x-prefixed, 64 chars).
 */
export function formatSlotHex(slot: bigint): string {
  return '0x' + slot.toString(16).padStart(64, '0');
}

/**
 * Compute the namespace root slot used by Diamond Storage / EIP-7201.
 * Root = keccak256(abi.encodePacked(namespaceString))
 */
export function computeNamespaceRoot(namespace: string): bigint {
  return BigInt(ethers.utils.keccak256(ethers.utils.toUtf8Bytes(namespace)));
}

/** Well-known ERC-1967 proxy slot hashes */
export const PROXY_SLOTS: Record<string, string> = {
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc': 'ERC-1967 Implementation',
  '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103': 'ERC-1967 Admin',
  '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50': 'ERC-1967 Beacon',
};

/** 32-byte zero word constant */
export const ZERO_WORD = '0x' + '0'.repeat(64);

/** Well-known diamond namespace strings */
export const DIAMOND_NAMESPACES = [
  'diamond.standard.diamond.storage',  // canonical mudgen
  'diamond.storage',                    // older/custom
] as const;

/**
 * Parse a slot input that can be decimal or hex.
 */
export function parseSlotInput(input: string): bigint {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Empty slot input');
  return BigInt(trimmed);
}

/**
 * Canonical resolver: layout typeId/label → ABI-encoder key-type string.
 *
 * Resolves the Solidity type of a mapping key into the type string that
 * `computeMappingSlot` feeds to the ABI encoder. Prefers the type
 * definition's `label` (most reliable), then falls back to parsing the
 * `typeId` string. Returns `null` when the type is unrecognized — callers
 * keep their own `?? 'uint256'` (or candidate) fallback.
 */
export function resolveAbiKeyType(opts: { typeId?: string; typeLabel?: string }): string | null {
  const { typeId, typeLabel } = opts;

  // Try the type definition's label first — this is the canonical Solidity type
  if (typeLabel) {
    const label = typeLabel.trim();
    // Contract types are addresses
    if (label.startsWith('contract ') || label.startsWith('interface ')) return 'address';
    // Enum types are uint8 in storage
    if (label.startsWith('enum ')) return 'uint8';
    // Direct Solidity type labels
    if (label === 'address' || label === 'address payable') return 'address';
    if (label === 'bool') return 'bool';
    if (label === 'string') return 'bytes32'; // string keys in mappings are hashed
    if (/^bytes\d{0,2}$/.test(label)) return label; // bytes1..bytes32
    if (/^uint\d+$/.test(label)) return label; // uint8..uint256
    if (/^int\d+$/.test(label)) return label; // int8..int256
  }
  // Fallback: parse the typeId string (e.g. "t_address", "t_uint256", "t_contract(IERC20)")
  if (!typeId) return null;
  if (typeId.startsWith('t_contract') || typeId.startsWith('t_address')) return 'address';
  if (typeId.startsWith('t_bool')) return 'bool';
  if (typeId.startsWith('t_enum')) return 'uint8';
  if (typeId.startsWith('t_string')) return 'bytes32';
  const bytesMatch = typeId.match(/^t_bytes(\d+)$/);
  if (bytesMatch) return `bytes${bytesMatch[1]}`;
  const uintMatch = typeId.match(/^t_uint(\d+)$/);
  if (uintMatch) return `uint${uintMatch[1]}`;
  const intMatch = typeId.match(/^t_int(\d+)$/);
  if (intMatch) return `int${intMatch[1]}`;
  return null;
}

/**
 * Build a synthetic single-field SlotDescriptor for type-aware scalar decoding.
 *
 * Used by derived-slot decode paths (mapping/array leaf values) that have a
 * resolved value type but no real layout entry. Fills offset 0, default size
 * 32, default encoding 'inplace', and a placeholder layout entry so callers
 * stop hand-fabricating the same literal.
 */
export function buildScalarDescriptor(args: {
  label?: string;
  typeLabel: string;
  typeKey?: string;
  size?: number;
  encoding?: string;
}): SlotDescriptor {
  const { label = '', typeLabel, typeKey = '', size = 32, encoding = 'inplace' } = args;
  return {
    label,
    typeLabel,
    typeKey,
    offset: 0,
    size,
    encoding,
    entry: { label: '', offset: 0, slot: '0', type: typeKey, astId: 0, contract: '' },
  };
}
