/**
 * Address-map building helpers for the execution trace viewer.
 *
 * Extracted from useTraceState.ts to keep each module under 800 lines.
 * All functions are pure or memoisation-friendly -- they receive data and
 * return derived structures without side-effects.
 */

import type { TraceRow } from "./traceTypes";

// ---- helpers ----------------------------------------------------------

const isHexAddress = (value: string): boolean =>
  /^0x[a-fA-F0-9]{40}$/.test(value);

// ---- address  ->  name  map ------------------------------------------

export function buildAddressToNameMap(traceRows: TraceRow[]): Map<string, string> {
  const map = new Map<string, string>();

  traceRows.forEach((row) => {
    const contractName = row.contractName;
    const targetContractName =
      typeof row.entryMeta?.targetContractName === "string"
        ? row.entryMeta.targetContractName.trim()
        : "";
    const labelCandidate = targetContractName || contractName || "";

    if (
      labelCandidate &&
      labelCandidate !== "0x0" &&
      !isHexAddress(labelCandidate) &&
      !labelCandidate.toLowerCase().startsWith("unknown")
    ) {
      if (row.entryMeta?.target && isHexAddress(row.entryMeta.target)) {
        const addr = row.entryMeta.target.toLowerCase();
        if (!map.has(addr)) {
          map.set(addr, labelCandidate);
        }
      }
      if (
        row.to &&
        isHexAddress(row.to) &&
        row.entryMeta?.target &&
        row.to.toLowerCase() === row.entryMeta.target.toLowerCase()
      ) {
        const addr = row.to.toLowerCase();
        if (!map.has(addr)) {
          map.set(addr, labelCandidate);
        }
      }
    }
    if (row.entryMeta?.callerName && row.entryMeta?.caller) {
      const addr = row.entryMeta.caller.toLowerCase();
      if (!map.has(addr) && isHexAddress(row.entryMeta.caller)) {
        map.set(addr, row.entryMeta.callerName);
      }
    }
  });

  return map;
}

// ---- address  ->  symbol  map ----------------------------------------

export function buildAddressToSymbolMap(
  contractAddress: string | undefined,
  tokenSymbol: string | undefined | null,
  diamondFacets: Array<{ address?: string }> | undefined,
  fetchedSymbol: string | null,
): Map<string, string> {
  const map = new Map<string, string>();
  const symbol = fetchedSymbol || tokenSymbol;
  if (contractAddress && symbol) {
    map.set(contractAddress.toLowerCase(), symbol);
  }
  if (diamondFacets && symbol) {
    for (const facet of diamondFacets) {
      if (facet.address) {
        map.set(facet.address.toLowerCase(), symbol);
      }
    }
  }
  return map;
}

// ---- name  ->  address  (reverse) ------------------------------------

export function buildNameToAddressMap(
  addressToName: Map<string, string>,
): Map<string, string> {
  const map = new Map<string, string>();
  addressToName.forEach((name, addr) => {
    const lowerName = name.toLowerCase();
    if (!map.has(lowerName)) {
      map.set(lowerName, addr);
    }
  });
  return map;
}

// ---- tx sender / receiver extraction ---------------------------------

export function extractTxParties(
  traceRows: TraceRow[],
): { txSender: string | null; txReceiver: string | null } {
  const rootEntry =
    traceRows.find(
      (r) => r.depth === 0 && r.entryMeta?.caller && r.entryMeta?.target,
    ) || traceRows.find((r) => r.entryMeta?.caller && r.entryMeta?.target);

  return {
    txSender: rootEntry?.entryMeta?.caller?.toLowerCase() || null,
    txReceiver: rootEntry?.entryMeta?.target?.toLowerCase() || null,
  };
}
