// Adapter that flattens the canonical Starknet `StateDiff` shape into the
// EVM-shape `artifacts.storageDiffs` array that EDB's `<StateTab>` reads.
//
// EDB expects:
//   artifacts.storageDiffs: Array<{ address, slot, before, after }>
// while the bridge emits a per-contract grouped shape:
//   stateDiff.storageDiffs: Array<{ address, storageEntries: Array<{ key, before, value }> }>
//
// We also pass `storageLayout: undefined` so EDB falls through to its
// raw-slot rendering (with char-by-char before/after diff highlighting).
// We don't have Cairo storage layouts to feed it.
//
// Nonce updates are surfaced separately by the wrapping panel — EDB's
// StateTab has no slot for them.

import type { StateDiff } from "@/chains/starknet/simulatorTypes";

export interface StarknetEdbStorageDiff {
  address: string;
  slot: string;
  before: string;
  after: string;
}

export interface StarknetEdbArtifacts {
  storageDiffs: StarknetEdbStorageDiff[];
  /** EDB falls through to raw-slot rendering when this is undefined. */
  storageLayout: undefined;
}

/** Flatten the per-contract grouped Starknet `StateDiff.storageDiffs` into
 *  the flat EVM-shape array EDB's `<StateTab>` consumes. Returns an empty
 *  array (still valid for EDB) when `stateDiff` is null/undefined. */
export function adaptStarknetStateForEdb(
  stateDiff: StateDiff | null | undefined,
): StarknetEdbArtifacts {
  const storageDiffs: StarknetEdbStorageDiff[] = [];
  if (stateDiff && Array.isArray(stateDiff.storageDiffs)) {
    for (const group of stateDiff.storageDiffs) {
      const address = group.address;
      if (!address || !Array.isArray(group.storageEntries)) continue;
      for (const entry of group.storageEntries) {
        storageDiffs.push({
          address,
          slot: entry.key,
          // Bridge sometimes omits `before` for first-touch slots; EDB's
          // diff renderer treats missing/null as 0x0, so normalise here
          // to keep the downstream shape uniform.
          before: entry.before ?? "0x0",
          after: entry.value,
        });
      }
    }
  }
  return {
    storageDiffs,
    storageLayout: undefined,
  };
}
