export interface MapLimitOptions {
  signal?: AbortSignal;
  stopOnError?: boolean;
}

// Runs `task` over `items` with at most `limit` concurrent in-flight calls.
// Preserves output order. Honors AbortSignal; rejects the whole run on first
// error when stopOnError=true (default).
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
  options: MapLimitOptions = {}
): Promise<R[]> {
  const { signal, stopOnError = true } = options;
  if (items.length === 0) return [];
  const concurrency = Math.max(1, Math.min(limit, items.length));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let aborted = false;
  let firstError: unknown = null;

  const runWorker = async () => {
    while (true) {
      if (aborted) return;
      if (signal?.aborted) {
        aborted = true;
        throw signal.reason instanceof Error ? signal.reason : new Error('Aborted');
      }
      const i = nextIndex++;
      if (i >= items.length) return;
      try {
        results[i] = await task(items[i], i);
      } catch (err) {
        if (stopOnError) {
          aborted = true;
          if (firstError === null) firstError = err;
          throw err;
        }
        results[i] = undefined as unknown as R;
      }
    }
  };

  const workers = Array.from({ length: concurrency }, runWorker);
  try {
    await Promise.all(workers);
  } catch (err) {
    throw firstError ?? err;
  }
  return results;
}

// Convenience alias — same semantics as mapLimit but reads as "run with concurrency".
export const runWithConcurrency = mapLimit;
