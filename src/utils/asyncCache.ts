export interface AsyncCache<K, V> {
  get(key: K): Promise<V>;
  peek(key: K): V | undefined;
  invalidate(key: K): void;
  clear(): void;
}

export interface AsyncCacheOptions<K, V> {
  loader: (key: K) => Promise<V>;
  maxEntries?: number;
  ttlMs?: number;
  serialize?: (key: K) => string;
}

interface Entry<V> {
  value: V;
  expiresAt: number;
}

// LRU + optional TTL cache that dedupes concurrent loads for the same key.
export function createAsyncCache<K, V>(options: AsyncCacheOptions<K, V>): AsyncCache<K, V> {
  const { loader, maxEntries = 256, ttlMs, serialize } = options;
  const keyOf = serialize ?? ((k: K) => (typeof k === 'string' ? k : JSON.stringify(k)));
  const entries = new Map<string, Entry<V>>();
  const inflight = new Map<string, Promise<V>>();

  const touch = (k: string, entry: Entry<V>) => {
    entries.delete(k);
    entries.set(k, entry);
    if (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) entries.delete(oldest);
    }
  };

  const readFresh = (k: string): V | undefined => {
    const e = entries.get(k);
    if (!e) return undefined;
    if (ttlMs !== undefined && Date.now() > e.expiresAt) {
      entries.delete(k);
      return undefined;
    }
    touch(k, e);
    return e.value;
  };

  return {
    async get(key: K) {
      const k = keyOf(key);
      const cached = readFresh(k);
      if (cached !== undefined) return cached;
      const existing = inflight.get(k);
      if (existing) return existing;
      const promise = loader(key)
        .then((value) => {
          const expiresAt = ttlMs !== undefined ? Date.now() + ttlMs : Number.POSITIVE_INFINITY;
          touch(k, { value, expiresAt });
          return value;
        })
        .finally(() => {
          inflight.delete(k);
        });
      inflight.set(k, promise);
      return promise;
    },
    peek(key: K) {
      return readFresh(keyOf(key));
    },
    invalidate(key: K) {
      entries.delete(keyOf(key));
    },
    clear() {
      entries.clear();
    },
  };
}
