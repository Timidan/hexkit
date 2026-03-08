import { ethers } from 'ethers';

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
  keys: { value: string; type: string }[]
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
  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    return BigInt(trimmed);
  }
  // Try decimal
  return BigInt(trimmed);
}
