import { useEffect, useRef, useState } from "react";

export interface AsyncCacheOptions {
  maxConcurrent?: number;
}

export interface AsyncCacheEntry<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

type AsyncCacheSubscriber<T> = (
  value: T | null,
  error: string | null,
) => void;

export function createAsyncCache<T>(options?: AsyncCacheOptions): {
  fetch: (key: string, fetcher: () => Promise<T>) => Promise<T>;
  useCache: (
    key: string | null,
    fetcher: ((key: string) => Promise<T>) | null,
  ) => AsyncCacheEntry<T>;
  reset: () => void;
} {
  const RESOLVED: Map<string, T> = new Map();
  const INFLIGHT: Map<string, Promise<T>> = new Map();
  const SUBSCRIBERS: Map<string, Set<AsyncCacheSubscriber<T>>> = new Map();

  const maxConcurrent = options?.maxConcurrent;
  const concurrentLimit =
    typeof maxConcurrent === "number" &&
    Number.isFinite(maxConcurrent) &&
    maxConcurrent > 0
      ? maxConcurrent
      : null;
  let activeFetches = 0;
  const fetchQueue: Array<() => void> = [];
  let generation = 0;

  async function withFetchSlot(run: () => Promise<T>): Promise<T> {
    if (concurrentLimit === null) return run();
    if (activeFetches >= concurrentLimit) {
      await new Promise<void>((resolve) => {
        fetchQueue.push(resolve);
      });
    }
    activeFetches += 1;
    try {
      return await run();
    } finally {
      activeFetches -= 1;
      fetchQueue.shift()?.();
    }
  }

  function notify(key: string, value: T | null, error: string | null): void {
    const subs = SUBSCRIBERS.get(key);
    if (!subs) return;
    for (const fn of subs) fn(value, error);
  }

  function fetch(key: string, fetcher: () => Promise<T>): Promise<T> {
    if (RESOLVED.has(key)) {
      return Promise.resolve(RESOLVED.get(key) as T);
    }
    const existing = INFLIGHT.get(key);
    if (existing) return existing;

    const fetchGeneration = generation;
    const promise = Promise.resolve()
      .then(() => withFetchSlot(fetcher))
      .then((value) => {
        if (fetchGeneration === generation) {
          if (value !== null) RESOLVED.set(key, value);
          notify(key, value, null);
        }
        return value;
      })
      .catch((err) => {
        if (fetchGeneration === generation) {
          const message = err instanceof Error ? err.message : String(err);
          notify(key, null, message);
        }
        throw err;
      })
      .finally(() => {
        if (INFLIGHT.get(key) === promise) {
          INFLIGHT.delete(key);
        }
      });

    INFLIGHT.set(key, promise);
    return promise;
  }

  function useCache(
    key: string | null,
    fetcher: ((key: string) => Promise<T>) | null,
  ): AsyncCacheEntry<T> {
    const initialEntry = (): AsyncCacheEntry<T> => {
      if (!key) return { data: null, loading: false, error: null };
      if (RESOLVED.has(key)) {
        return { data: RESOLVED.get(key) as T, loading: false, error: null };
      }
      return { data: null, loading: Boolean(fetcher), error: null };
    };

    const [state, setState] = useState<{
      key: string | null;
      entry: AsyncCacheEntry<T>;
    }>(() => ({ key, entry: initialEntry() }));
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;

    useEffect(() => {
      const currentFetcher = fetcherRef.current;
      if (!key || !currentFetcher) {
        setState({
          key,
          entry: { data: null, loading: false, error: null },
        });
        return;
      }
      if (RESOLVED.has(key)) {
        setState({
          key,
          entry: { data: RESOLVED.get(key) as T, loading: false, error: null },
        });
        return;
      }

      let cancelled = false;
      setState({
        key,
        entry: { data: null, loading: true, error: null },
      });

      const subs = SUBSCRIBERS.get(key) ?? new Set<AsyncCacheSubscriber<T>>();
      const onResolve: AsyncCacheSubscriber<T> = (value, err) => {
        if (cancelled) return;
        setState({
          key,
          entry: err
            ? { data: null, loading: false, error: err }
            : { data: value, loading: false, error: null },
        });
      };
      subs.add(onResolve);
      SUBSCRIBERS.set(key, subs);

      fetch(key, () => currentFetcher(key))
        .then((value) => {
          if (cancelled) return;
          setState({
            key,
            entry: { data: value, loading: false, error: null },
          });
        })
        .catch((err) => {
          if (cancelled) return;
          setState({
            key,
            entry: {
              data: null,
              loading: false,
              error: err instanceof Error ? err.message : String(err),
            },
          });
        });

      return () => {
        cancelled = true;
        const set = SUBSCRIBERS.get(key);
        if (set) {
          set.delete(onResolve);
          if (set.size === 0) SUBSCRIBERS.delete(key);
        }
      };
      // Cache identity is intentionally key-driven. Fetchers are kept in a ref
      // so callers can pass closures without restarting an in-flight request;
      // changing fetch behavior should use a different key or reset().
    }, [key]);

    if (!key) return { data: null, loading: false, error: null };
    if (RESOLVED.has(key)) {
      return { data: RESOLVED.get(key) as T, loading: false, error: null };
    }
    if (state.key !== key) {
      return { data: null, loading: Boolean(fetcher), error: null };
    }
    return state.entry;
  }

  function reset(): void {
    generation += 1;
    RESOLVED.clear();
    INFLIGHT.clear();
    SUBSCRIBERS.clear();
  }

  return { fetch, useCache, reset };
}
