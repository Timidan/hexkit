export interface RetryOptions {
  retries?: number;
  delayMs?: number;
  backoffFactor?: number;
  jitter?: number;
  signal?: AbortSignal;
  onRetry?: (error: unknown, attempt: number, nextDelay: number) => void;
}

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    retries = 2,
    delayMs = 300,
    backoffFactor = 2,
    jitter = 0.25,
    signal,
    onRetry,
  } = options;

  let attempt = 0;
  let nextDelay = delayMs;
  let lastErr: unknown;

  while (attempt <= retries) {
    if (signal?.aborted) {
      throw Object.assign(new Error("Operation cancelled"), {
        cause: lastErr,
      });
    }

    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;

      const randomizedDelay =
        nextDelay + nextDelay * jitter * (Math.random() - 0.5) * 2;
      onRetry?.(err, attempt + 1, randomizedDelay);

      if (signal?.aborted) {
        break;
      }

      await wait(Math.max(0, randomizedDelay));
      nextDelay *= backoffFactor;
      attempt += 1;
    }
  }

  throw lastErr;
}
