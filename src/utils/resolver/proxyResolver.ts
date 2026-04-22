/**
 * Proxy Resolver - Detects proxy contract types and resolves implementation addresses
 *
 * Detection order (important - Diamond must come before other checks):
 * 1. EIP-1167: Minimal Proxy (Clone) - bytecode pattern check
 * 2. EIP-2535: Diamond Proxy - call facetAddresses()
 * 3. Gnosis Safe - storage slot check
 * 4. EIP-1967: Transparent Proxy, Beacon Proxy - storage slot check
 * 5. EIP-1822: UUPS - proxiableUUID check
 *
 * Storage slots (keccak256(tag) - 1):
 * - implementation: 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
 * - admin:          0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103
 * - beacon:         0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50
 */

import { ethers } from 'ethers';
import type { Chain } from '../../types';
import type { ProxyInfo, ProxyType } from './types';
import { getSharedProvider } from '../providerPool';
import { ZERO_ADDRESS } from '../addressConstants';
let diamondResolverPromise: Promise<typeof import('./diamondResolver')> | null = null;

const loadDiamondResolver = () => {
  if (!diamondResolverPromise) {
    diamondResolverPromise = import('./diamondResolver');
  }
  return diamondResolverPromise;
};

// EIP-1967 storage slots
const EIP1967_IMPLEMENTATION_SLOT =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const EIP1967_ADMIN_SLOT =
  '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
const EIP1967_BEACON_SLOT =
  '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50';

// Pre-EIP-1967 OpenZeppelin ZOS implementation slot
// keccak256("org.zeppelinos.proxy.implementation") - used by USDC and other older proxies
const ZOS_IMPLEMENTATION_SLOT =
  '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3';

// Gnosis Safe proxy constants
// Storage slot: keccak256("proxy.mastercopy") - Safe uses this convention
const GNOSIS_SAFE_MASTERCOPY_SLOT =
  '0x5e22305164f996645b904b888b93dbadec3b34731301bc953c08fc9ba8f8111c';

// Function selectors
const IMPLEMENTATION_SELECTOR = '0x5c60da1b'; // implementation()
const PROXIABLE_UUID_SELECTOR = '0x52d1902d'; // proxiableUUID()
const MASTER_COPY_SELECTOR = '0xa619486e'; // masterCopy() - Gnosis Safe

// EIP-1167 minimal proxy bytecode patterns
// Pattern: 0x363d3d373d3d3d363d73<20-byte-address>5af43d82803e903d91602b57fd5bf3
const EIP1167_PREFIX = '363d3d373d3d3d363d73';
const EIP1167_SUFFIX = '5af43d82803e903d91602b57fd5bf3';

// Regex for EIP-1167 detection (allows extra bytes after suffix for clones with immutable args)
const EIP1167_REGEX = new RegExp(
  `^0x${EIP1167_PREFIX}([0-9a-fA-F]{40})${EIP1167_SUFFIX}`,
  'i'
);

// Cache TTL (5 minutes)
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  result: ProxyInfo;
  timestamp: number;
}

const proxyCache = new Map<string, CacheEntry>();

function getCacheKey(address: string, chainId: number): string {
  return `${chainId}:${address.toLowerCase()}`;
}

function getCachedResult(address: string, chainId: number): ProxyInfo | null {
  const key = getCacheKey(address, chainId);
  const entry = proxyCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.result;
  }
  if (entry) {
    proxyCache.delete(key);
  }
  return null;
}

const MAX_PROXY_CACHE_SIZE = 500;

function setCachedResult(address: string, chainId: number, result: ProxyInfo): void {
  const key = getCacheKey(address, chainId);
  proxyCache.set(key, { result, timestamp: Date.now() });
  if (proxyCache.size > MAX_PROXY_CACHE_SIZE) {
    const keysToDelete = [...proxyCache.keys()].slice(0, proxyCache.size - MAX_PROXY_CACHE_SIZE);
    keysToDelete.forEach(k => proxyCache.delete(k));
  }
}

/**
 * Clear cache entry for a specific address (useful when user triggers refresh)
 */
export function clearProxyCache(address: string, chainId: number): void {
  const key = getCacheKey(address, chainId);
  proxyCache.delete(key);
}

/**
 * Clear entire proxy cache
 */
export function clearAllProxyCache(): void {
  proxyCache.clear();
}

/**
 * Check if an address is valid (non-zero and has code)
 */
function isValidAddress(address: string | null): address is string {
  if (!address) return false;
  if (address === ZERO_ADDRESS) return false;
  if (!/^0x[0-9a-fA-F]{40}$/i.test(address)) return false;
  return true;
}

/**
 * Extract address from a storage slot value (32 bytes -> 20 byte address)
 */
function slotToAddress(slotValue: string): string | null {
  if (!slotValue || slotValue === '0x' || slotValue === '0x0') return null;
  // Slot value is 32 bytes, address is in the last 20 bytes
  const hex = slotValue.replace(/^0x/, '').padStart(64, '0');
  const addressHex = hex.slice(-40);
  const address = `0x${addressHex}`;
  return isValidAddress(address) ? address : null;
}

/**
 * Read EIP-1967 storage slots to detect proxy type and addresses
 */
async function readEip1967Slots(
  address: string,
  provider: ethers.providers.Provider
): Promise<{
  implementation: string | null;
  admin: string | null;
  beacon: string | null;
}> {
  try {
    const [implSlot, adminSlot, beaconSlot, zosImplSlot] = await Promise.all([
      provider.getStorageAt(address, EIP1967_IMPLEMENTATION_SLOT),
      provider.getStorageAt(address, EIP1967_ADMIN_SLOT),
      provider.getStorageAt(address, EIP1967_BEACON_SLOT),
      provider.getStorageAt(address, ZOS_IMPLEMENTATION_SLOT),
    ]);

    // Check EIP-1967 first, then fallback to ZOS slot
    const eip1967Impl = slotToAddress(implSlot);
    const zosImpl = slotToAddress(zosImplSlot);

    return {
      implementation: eip1967Impl || zosImpl,
      admin: slotToAddress(adminSlot),
      beacon: slotToAddress(beaconSlot),
    };
  } catch {
    return { implementation: null, admin: null, beacon: null };
  }
}

/**
 * Detect EIP-1167 minimal proxy (clone) from bytecode
 */
function detectEip1167Clone(bytecode: string): string | null {
  if (!bytecode || bytecode === '0x') return null;

  const match = bytecode.match(EIP1167_REGEX);
  if (match && match[1]) {
    const address = `0x${match[1]}`;
    return isValidAddress(address) ? address : null;
  }
  return null;
}

/**
 * Get implementation address from a beacon contract by calling implementation()
 */
async function getBeaconImplementation(
  beaconAddress: string,
  provider: ethers.providers.Provider
): Promise<string | null> {
  try {
    // Check if beacon has code
    const code = await provider.getCode(beaconAddress);
    if (!code || code === '0x') return null;

    // Call implementation() on the beacon
    const result = await provider.call({
      to: beaconAddress,
      data: IMPLEMENTATION_SELECTOR,
    });

    if (result && result !== '0x' && result.length >= 66) {
      const address = slotToAddress(result);
      return isValidAddress(address) ? address : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fallback: some legacy proxies expose implementation() directly on the proxy.
 * This is not EIP-1967 and has no storage slot, so we need an explicit call.
 */
async function getDirectImplementation(
  proxyAddress: string,
  provider: ethers.providers.Provider
): Promise<string | null> {
  try {
    const result = await provider.call({
      to: proxyAddress,
      data: IMPLEMENTATION_SELECTOR,
    });

    if (result && result !== '0x' && result.length >= 66) {
      const address = slotToAddress(result);
      if (!isValidAddress(address)) return null;

      const code = await provider.getCode(address);
      if (!code || code === '0x') return null;

      return address;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if contract supports EIP-1822 (UUPS) by calling proxiableUUID()
 */
async function checkEip1822Support(
  address: string,
  provider: ethers.providers.Provider
): Promise<boolean> {
  try {
    const result = await provider.call({
      to: address,
      data: PROXIABLE_UUID_SELECTOR,
    });
    // EIP-1822 proxiableUUID should return the implementation slot hash
    return result === EIP1967_IMPLEMENTATION_SLOT;
  } catch {
    return false;
  }
}

/**
 * Check if contract is a Gnosis Safe proxy by reading masterCopy storage slot
 * or calling masterCopy() function
 */
async function detectGnosisSafe(
  address: string,
  provider: ethers.providers.Provider
): Promise<string | null> {
  try {
    // Method 1: Read storage slot (preferred - no call needed)
    const slotValue = await provider.getStorageAt(address, GNOSIS_SAFE_MASTERCOPY_SLOT);
    const masterCopyFromSlot = slotToAddress(slotValue);
    if (masterCopyFromSlot) {
      return masterCopyFromSlot;
    }

    // Method 2: Call masterCopy() function as fallback
    const result = await provider.call({
      to: address,
      data: MASTER_COPY_SELECTOR,
    });

    if (result && result !== '0x' && result.length >= 66) {
      return slotToAddress(result);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Determine the proxy type based on detected characteristics
 */
function determineProxyType(
  hasImplementation: boolean,
  hasBeacon: boolean,
  hasAdmin: boolean,
  isEip1167: boolean,
  isUups: boolean
): ProxyType {
  if (isEip1167) return 'eip1167';
  if (hasBeacon) return 'eip1967-beacon';
  if (isUups) return 'eip1822';
  if (hasImplementation && hasAdmin) return 'transparent';
  if (hasImplementation) return 'eip1967';
  return 'unknown';
}

/**
 * Resolve proxy information for a contract address
 *
 * @param address - Contract address to analyze
 * @param chain - Chain object with id and rpcUrl
 * @param provider - Optional ethers provider (will use getSharedProvider if not provided)
 * @returns ProxyInfo with detected proxy type and implementation addresses
 */
export async function resolveProxyInfo(
  address: string,
  chain: Chain,
  provider?: ethers.providers.Provider
): Promise<ProxyInfo> {
  if (!isValidAddress(address)) {
    return { isProxy: false };
  }

  const cached = getCachedResult(address, chain.id);
  if (cached) {
    return cached;
  }

  const resolvedProvider = provider || getSharedProvider(chain);

  try {
    const code = await resolvedProvider.getCode(address);
    if (!code || code === '0x') {
      const result: ProxyInfo = { isProxy: false };
      setCachedResult(address, chain.id, result);
      return result;
    }

    // EIP-1167 can be detected from bytecode alone, no RPC calls needed
    const eip1167Implementation = detectEip1167Clone(code);
    if (eip1167Implementation) {
      const result: ProxyInfo = {
        isProxy: true,
        proxyType: 'eip1167',
        implementationAddress: eip1167Implementation,
        implementations: [eip1167Implementation],
      };
      setCachedResult(address, chain.id, result);
      return result;
    }

    // Diamond must be checked before EIP-1967 -- diamonds don't implement other proxy standards
    try {
      const { detectDiamond } = await loadDiamondResolver();
      const diamondResult = await detectDiamond(address, chain);
      if (diamondResult.isDiamond && diamondResult.facetAddresses) {
        const result: ProxyInfo = {
          isProxy: true,
          proxyType: 'diamond',
          implementations: diamondResult.facetAddresses,
        };
        setCachedResult(address, chain.id, result);
        return result;
      }
    } catch {
      // Diamond detection failed, continue with other checks
    }

    const gnosisSafeImpl = await detectGnosisSafe(address, resolvedProvider);
    if (gnosisSafeImpl) {
      const result: ProxyInfo = {
        isProxy: true,
        proxyType: 'gnosis-safe',
        implementationAddress: gnosisSafeImpl,
        implementations: [gnosisSafeImpl],
      };
      setCachedResult(address, chain.id, result);
      return result;
    }

    const slots = await readEip1967Slots(address, resolvedProvider);

    let beaconImplementation: string | null = null;
    if (slots.beacon) {
      beaconImplementation = await getBeaconImplementation(slots.beacon, resolvedProvider);
    }

    const hasImplementation = !!slots.implementation;
    const hasBeacon = !!slots.beacon;
    const hasAdmin = !!slots.admin;
    const isProxy = hasImplementation || hasBeacon;

    if (!isProxy) {
      const directImplementation = await getDirectImplementation(address, resolvedProvider);
      if (directImplementation) {
        const result: ProxyInfo = {
          isProxy: true,
          proxyType: 'unknown',
          implementationAddress: directImplementation,
          implementations: [directImplementation],
        };
        setCachedResult(address, chain.id, result);
        return result;
      }
      const result: ProxyInfo = { isProxy: false };
      setCachedResult(address, chain.id, result);
      return result;
    }

    let isUups = false;
    if (slots.implementation) {
      isUups = await checkEip1822Support(slots.implementation, resolvedProvider);
    }

    const proxyType = determineProxyType(hasImplementation, hasBeacon, hasAdmin, false, isUups);

    const implementations: string[] = [];
    if (slots.implementation) {
      implementations.push(slots.implementation);
    }
    if (beaconImplementation && !implementations.includes(beaconImplementation)) {
      implementations.push(beaconImplementation);
    }

    const result: ProxyInfo = {
      isProxy: true,
      proxyType,
      implementationAddress: slots.implementation || beaconImplementation || undefined,
      implementations: implementations.length > 0 ? implementations : undefined,
      adminAddress: slots.admin || undefined,
      beaconAddress: slots.beacon || undefined,
    };

    setCachedResult(address, chain.id, result);
    return result;
  } catch {
    const result: ProxyInfo = { isProxy: false };
    setCachedResult(address, chain.id, result);
    return result;
  }
}

/**
 * Quick check if an address is likely a proxy (without full resolution)
 * Useful for fast filtering before detailed resolution
 */
export async function isLikelyProxy(
  address: string,
  chain: Chain,
  provider?: ethers.providers.Provider
): Promise<boolean> {
  if (!isValidAddress(address)) return false;

  const resolvedProvider = provider || getSharedProvider(chain);

  try {
    const code = await resolvedProvider.getCode(address);
    if (!code || code === '0x') return false;

    if (detectEip1167Clone(code)) return true;

    const implSlot = await resolvedProvider.getStorageAt(address, EIP1967_IMPLEMENTATION_SLOT);
    if (slotToAddress(implSlot)) return true;

    const beaconSlot = await resolvedProvider.getStorageAt(address, EIP1967_BEACON_SLOT);
    if (slotToAddress(beaconSlot)) return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * Resolve nested proxies (proxy pointing to another proxy)
 * Returns all implementation addresses in the chain
 *
 * @param address - Starting proxy address
 * @param chain - Chain object
 * @param maxDepth - Maximum nesting depth (default: 3)
 * @returns Array of implementation addresses in resolution order
 */
export async function resolveNestedProxies(
  address: string,
  chain: Chain,
  maxDepth: number = 3
): Promise<string[]> {
  const implementations: string[] = [];
  const visited = new Set<string>();
  let current = address.toLowerCase();

  for (let depth = 0; depth < maxDepth; depth++) {
    if (visited.has(current)) {
      // Cycle detected
      break;
    }
    visited.add(current);

    const proxyInfo = await resolveProxyInfo(current, chain);
    if (!proxyInfo.isProxy || !proxyInfo.implementationAddress) {
      break;
    }

    const impl = proxyInfo.implementationAddress.toLowerCase();
    implementations.push(proxyInfo.implementationAddress);
    current = impl;
  }

  return implementations;
}
