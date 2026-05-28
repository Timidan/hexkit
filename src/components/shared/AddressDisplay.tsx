/**
 * Shared address/hash truncation utilities.
 *
 * The AddressDisplay React component was removed (no consumers).
 * Only the pure helper functions remain.
 */

import { ZERO_ADDRESS } from '../../utils/addressConstants';

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

