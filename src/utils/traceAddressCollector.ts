/**
 * Trace Address Collector
 *
 * Utility to extract all unique contract addresses from a decoded trace.
 * Used for fetching source code for all contracts involved in a transaction,
 * including Diamond proxy facets.
 */

import type { DecodedTraceRow } from './traceDecoder/types';

/**
 * Contract info collected from trace
 */
export interface TraceContract {
  address: string;
  name?: string;
  /** Source code from Etherscan/Blockscout/Sourcify */
  sourceCode?: string;
  /** Multiple source files for multi-file contracts */
  sourceFiles?: Map<string, string>;
  /** Whether the contract is verified on block explorer */
  verified: boolean;
  /** Source provider (etherscan, sourcify, blockscout) */
  sourceProvider?: string;
}

/**
 * Collect all unique contract addresses from decoded trace rows
 *
 * Extracts addresses from:
 * - entryMeta.codeAddress (CRITICAL: actual code being executed, e.g., facet address for DELEGATECALL)
 * - entryMeta.target (call recipient, may be proxy for DELEGATECALL)
 * - contract field (contract name context)
 *
 * @param rows Decoded trace rows
 * @param excludeAddress Optional address to exclude (e.g., transaction sender EOA)
 * @returns Set of unique contract addresses
 */
export function collectTraceAddresses(
  rows: DecodedTraceRow[] | undefined,
  excludeAddress?: string
): Set<string> {
  const addresses = new Set<string>();
  const excludeLower = excludeAddress?.toLowerCase();

  if (!rows || rows.length === 0) {
    return addresses;
  }

  for (const row of rows) {
    // codeAddress is CRITICAL - for DELEGATECALL this is the facet being executed
    if (row.entryMeta?.codeAddress) {
      const addr = row.entryMeta.codeAddress.toLowerCase();
      if (isValidAddress(addr) && addr !== excludeLower) {
        addresses.add(addr);
      }
    }

    // target is the call recipient (may be proxy for DELEGATECALL)
    if (row.entryMeta?.target) {
      const addr = row.entryMeta.target.toLowerCase();
      if (isValidAddress(addr) && addr !== excludeLower) {
        addresses.add(addr);
      }
    }

    // caller is sometimes useful for internal contract context
    if (row.entryMeta?.caller) {
      const addr = row.entryMeta.caller.toLowerCase();
      if (isValidAddress(addr) && addr !== excludeLower) {
        addresses.add(addr);
      }
    }
  }

  return addresses;
}

/**
 * Collect addresses from raw trace entries (fallback when decoded trace unavailable)
 */
export function collectRawTraceAddresses(
  rawTrace: any,
  excludeAddress?: string
): Set<string> {
  const addresses = new Set<string>();
  const excludeLower = excludeAddress?.toLowerCase();

  // Handle both inner.inner (double-nested) and inner directly (single-nested) formats
  const entries = rawTrace?.inner?.inner
    ? rawTrace.inner.inner
    : rawTrace?.inner && typeof rawTrace.inner === 'object'
      ? (Array.isArray(rawTrace.inner) ? rawTrace.inner : Object.values(rawTrace.inner))
      : [];

  if (entries.length === 0) {
    return addresses;
  }
  for (const entry of entries) {
    // code_address is the actual code being executed
    if (entry.code_address) {
      const addr = entry.code_address.toLowerCase();
      if (isValidAddress(addr) && addr !== excludeLower) {
        addresses.add(addr);
      }
    }

    // target is the call recipient
    if (entry.target) {
      const addr = entry.target.toLowerCase();
      if (isValidAddress(addr) && addr !== excludeLower) {
        addresses.add(addr);
      }
    }

    // caller
    if (entry.caller) {
      const addr = entry.caller.toLowerCase();
      if (isValidAddress(addr) && addr !== excludeLower) {
        addresses.add(addr);
      }
    }
  }

  return addresses;
}

/**
 * Validate Ethereum address format
 */
function isValidAddress(addr: string): boolean {
  return typeof addr === 'string' && addr.startsWith('0x') && addr.length === 42;
}

/**
 * Create a map from address to contract info, initialized with addresses
 */
export function createTraceContractMap(
  addresses: Set<string>
): Map<string, TraceContract> {
  const map = new Map<string, TraceContract>();

  for (const address of addresses) {
    map.set(address, {
      address,
      verified: false,
    });
  }

  return map;
}

/**
 * Get the currently executing contract address for a trace row
 * Prioritizes codeAddress (for DELEGATECALL) over target
 */
export function getExecutingAddress(row: DecodedTraceRow | undefined): string | null {
  if (!row) return null;

  // For DELEGATECALL, codeAddress is the facet being executed
  if (row.entryMeta?.codeAddress) {
    return row.entryMeta.codeAddress.toLowerCase();
  }

  // Fall back to target
  if (row.entryMeta?.target) {
    return row.entryMeta.target.toLowerCase();
  }

  return null;
}
