// Single recency-LRU eviction policy (cap SNAPSHOT_CACHE_MAX) for the
// number-keyed DebugSnapshot cache shared across the debug hooks.

import type { DebugSnapshot } from '../../types/debug';

export const SNAPSHOT_CACHE_MAX = 500;

// Pure recency-LRU write: returns a new Map, evicting the oldest entry past the cap.
export function writeSnapshotToCache(
  prev: Map<number, DebugSnapshot>,
  id: number,
  snapshot: DebugSnapshot
): Map<number, DebugSnapshot> {
  const next = new Map(prev);
  if (next.has(id)) {
    next.delete(id);
  }
  next.set(id, snapshot);
  while (next.size > SNAPSHOT_CACHE_MAX) {
    const oldestKey = next.keys().next().value;
    if (oldestKey === undefined) break;
    next.delete(oldestKey);
  }
  return next;
}

export interface SnapshotCacheWriter {
  set(id: number, snapshot: DebugSnapshot): void;
}

/**
 * Wraps a React setSnapshotCache updater so callers can write through the one
 * eviction policy with { set(id, snapshot) }.
 */
export function createSnapshotCacheWriter(
  setSnapshotCache: (
    updater: (prev: Map<number, DebugSnapshot>) => Map<number, DebugSnapshot>
  ) => void
): SnapshotCacheWriter {
  return {
    set(id: number, snapshot: DebugSnapshot) {
      setSnapshotCache((prev) => writeSnapshotToCache(prev, id, snapshot));
    },
  };
}
