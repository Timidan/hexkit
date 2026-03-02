import type { AbiItem } from './types';

const LOUPE_SIGNATURES = new Set([
  'facetAddresses()',
  'facets()',
  'facetFunctionSelectors(address)',
  'facetAddress(bytes4)',
]);

/**
 * Check if an ABI contains Diamond Loupe functions.
 * This avoids making RPC calls for non-diamond contracts.
 */
export function hasDiamondLoupeFunctions(abi: AbiItem[]): boolean {
  const abiSignatures = new Set(
    abi
      .filter((item) => item.type === 'function' && item.name)
      .map((item) => `${item.name}(${(item.inputs || []).map((i) => i.type).join(',')})`)
  );

  // Diamond should have at least facetAddresses or facets
  for (const sig of LOUPE_SIGNATURES) {
    if (abiSignatures.has(sig)) return true;
  }
  return false;
}

/**
 * Quick check if a contract might be a Diamond based on its ABI.
 * Use this to avoid expensive RPC calls when we already have the ABI.
 */
export function mightBeDiamond(abi: AbiItem[] | null): boolean {
  if (!abi || abi.length === 0) return false;
  return hasDiamondLoupeFunctions(abi);
}
