// LRU set: touching a key promotes it, oldest entry evicted when over maxSize.
export function setLimitedCacheEntry<K, V>(
  cache: Map<K, V>,
  key: K,
  value: V,
  maxSize: number,
): void {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  if (cache.size <= maxSize) {
    return;
  }
  const oldestKey = cache.keys().next().value;
  if (oldestKey !== undefined) {
    cache.delete(oldestKey);
  }
}

// Evicts the LOWEST-numbered keys — used for monotonic IDs (e.g. snapshot IDs)
// where "keep the N highest-numbered" matters more than insertion recency.
export function setNumericBoundedCacheEntry<V>(
  cache: Map<number, V>,
  key: number,
  value: V,
  maxSize: number,
): void {
  cache.set(key, value);
  if (cache.size <= maxSize) {
    return;
  }
  const sortedKeys = [...cache.keys()].sort((a, b) => a - b);
  for (let i = 0; i < cache.size - maxSize; i += 1) {
    cache.delete(sortedKeys[i]);
  }
}
