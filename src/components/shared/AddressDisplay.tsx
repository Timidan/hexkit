/**
 * Shared address/hash truncation utilities.
 *
 * The AddressDisplay React component was removed (no consumers).
 * Only the pure helper functions remain.
 */

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Pure utility: truncate an address string consistently */
export function shortenAddress(
  address: string | null | undefined,
  prefixLength = 6,
  suffixLength = 4,
): string {
  if (!address) return '\u2014';
  if (address.toLowerCase() === ZERO_ADDRESS) return 'Zero Address';
  if (address.length <= prefixLength + suffixLength + 2) return address;
  return `${address.slice(0, prefixLength)}\u2026${address.slice(-suffixLength)}`;
}

/** Pure utility: truncate a hex hash (tx hash, slot, etc.) */
export function shortenHash(
  hash: string | null | undefined,
  prefixLength = 10,
  suffixLength = 6,
): string {
  if (!hash) return '\u2014';
  if (hash.length <= prefixLength + suffixLength + 2) return hash;
  return `${hash.slice(0, prefixLength)}\u2026${hash.slice(-suffixLength)}`;
}
