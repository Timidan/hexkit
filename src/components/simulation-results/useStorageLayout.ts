/**
 * useStorageLayout — lazy-fetches edb_getStorageLayout per contract address.
 *
 * Designed for the State tab: given a debug sessionId and a list of contract
 * addresses (typically from storage diffs), it fetches storage layout metadata
 * from the EDB bridge, caching results at module level so tab re-mounts within
 * the same page session are instant.
 *
 * Key properties:
 *  - Bounded parallelism (max 4 concurrent fetches)
 *  - Progressive per-address state updates (no "wait-for-all" blocking)
 *  - StrictMode-safe deduplication via useRef
 *  - Cancellation on effect cleanup to avoid stale setState calls
 */

import { useState, useEffect, useRef } from 'react';
import { debugBridgeService } from '../../services/DebugBridgeService';
import type { StorageLayoutResponse } from '../../types/debug';

export type LayoutStatus = 'idle' | 'loading' | 'loaded' | 'unavailable' | 'error';

export interface LayoutEntry {
  layout: StorageLayoutResponse | null;
  status: LayoutStatus;
}

export interface UseStorageLayoutResult {
  layouts: Record<string, LayoutEntry>; // keyed by lowercase address
  isLoading: boolean;
}

// Module-level cache -- survives tab re-mounts within same page session
const layoutCache = new Map<string, StorageLayoutResponse | null>();

function cacheKey(sessionId: string, address: string): string {
  return `${sessionId}:${address.toLowerCase()}`;
}

async function runBounded<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<void> {
  let idx = 0;

  async function next(): Promise<void> {
    while (idx < tasks.length) {
      const current = idx++;
      await tasks[current]();
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    () => next(),
  );
  await Promise.all(workers);
}

const MAX_CONCURRENCY = 4;

export function useStorageLayout(
  sessionId: string | null | undefined,
  addresses: string[],
): UseStorageLayoutResult {
  const [layouts, setLayouts] = useState<Record<string, LayoutEntry>>({});

  // Track which (sessionId + sorted addresses) key we've already kicked off
  // to avoid double-fetch in React StrictMode.
  const fetchedKeyRef = useRef<string>('');

  // Build a stable dedup key from sessionId + sorted lowercase addresses
  const stableKey = sessionId
    ? `${sessionId}:${[...addresses].map((a) => a.toLowerCase()).sort().join(',')}`
    : '';

  useEffect(() => {
    // Guard: nothing to do without a session or addresses
    if (!sessionId || addresses.length === 0) {
      setLayouts({});
      fetchedKeyRef.current = '';
      return;
    }

    // Dedup: if we already triggered for this exact key, skip
    if (stableKey === fetchedKeyRef.current) {
      return;
    }
    fetchedKeyRef.current = stableKey;

    let cancelled = false;

    // Normalize addresses once
    const normalizedAddresses = addresses.map((a) => a.toLowerCase());

    // Seed initial state — cache hits resolve immediately, rest start as 'loading'
    const initial: Record<string, LayoutEntry> = {};
    const toFetch: string[] = [];

    for (const addr of normalizedAddresses) {
      const key = cacheKey(sessionId, addr);
      if (layoutCache.has(key)) {
        const cached = layoutCache.get(key)!;
        initial[addr] = {
          layout: cached,
          status: cached ? 'loaded' : 'unavailable',
        };
      } else {
        initial[addr] = { layout: null, status: 'loading' };
        toFetch.push(addr);
      }
    }

    setLayouts(initial);

    // If everything was cached, we're done
    if (toFetch.length === 0) {
      return;
    }

    // Build fetch tasks with progressive per-address updates
    const tasks = toFetch.map((addr) => async () => {
      if (cancelled) return;

      try {
        const result = await debugBridgeService.getStorageLayout(sessionId, addr);
        const key = cacheKey(sessionId, addr);
        layoutCache.set(key, result);

        if (!cancelled) {
          setLayouts((prev) => ({
            ...prev,
            [addr]: {
              layout: result,
              status: result ? 'loaded' : 'unavailable',
            },
          }));
        }
      } catch {
        if (!cancelled) {
          setLayouts((prev) => ({
            ...prev,
            [addr]: { layout: null, status: 'error' },
          }));
        }
      }
    });

    // Kick off bounded-parallelism fetch
    runBounded(tasks, MAX_CONCURRENCY);

    return () => {
      cancelled = true;
      // Reset ref on cleanup so StrictMode's second mount re-triggers fetches
      // (first mount is cleaned up immediately, second mount must not be skipped)
      fetchedKeyRef.current = '';
    };
  }, [sessionId, stableKey, addresses.length]);

  const isLoading = Object.values(layouts).some((e) => e.status === 'loading');

  return { layouts, isLoading };
}
