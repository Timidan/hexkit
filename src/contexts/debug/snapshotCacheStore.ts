import type { Dispatch, SetStateAction } from 'react';
import type { DebugSnapshot } from '../../types/debug';

export const SNAPSHOT_CACHE_MAX = 500;

/**
 * Persist one snapshot while keeping cache recency independent from snapshot IDs.
 * Map insertion order is the cache's least-to-most-recent write order.
 */
export function writeSnapshotToCache(
  cache: Map<number, DebugSnapshot>,
  snapshotId: number,
  snapshot: DebugSnapshot
): Map<number, DebugSnapshot> {
  const next = new Map(cache);
  next.delete(snapshotId);
  next.set(snapshotId, snapshot);

  while (next.size > SNAPSHOT_CACHE_MAX) {
    const oldestId = next.keys().next().value as number | undefined;
    if (oldestId === undefined) break;
    next.delete(oldestId);
  }

  return next;
}

export function createSnapshotCacheWriter(
  setSnapshotCache: Dispatch<
    SetStateAction<Map<number, DebugSnapshot>>
  >
): { set(snapshotId: number, snapshot: DebugSnapshot): void } {
  return {
    set(snapshotId, snapshot) {
      setSnapshotCache((previous) =>
        writeSnapshotToCache(previous, snapshotId, snapshot)
      );
    },
  };
}
