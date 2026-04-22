// Combined abort: fires when `signal` aborts OR `ms` elapses.
export function withAbortTimeout(
  signal: AbortSignal | undefined,
  ms: number
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

// Races `op` against a `ms` timer. If the timer wins, `onTimeout` decides:
// an Error return rejects, a value return resolves with the fallback.
export function raceWithTimeout<T>(
  op: Promise<T>,
  ms: number,
  onTimeout: () => T | Error
): Promise<T> {
  const timeoutPromise = new Promise<T>((resolve, reject) => {
    const signal = AbortSignal.timeout(ms);
    signal.addEventListener(
      'abort',
      () => {
        const result = onTimeout();
        if (result instanceof Error) {
          reject(result);
        } else {
          resolve(result);
        }
      },
      { once: true }
    );
  });

  return Promise.race([op, timeoutPromise]);
}
