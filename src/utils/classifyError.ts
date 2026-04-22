export type ClassifiedErrorKind =
  | 'aborted'
  | 'timeout'
  | 'rate-limit'
  | 'network'
  | 'auth'
  | 'not-found'
  | 'validation'
  | 'server'
  | 'unknown';

export interface ClassifiedError {
  kind: ClassifiedErrorKind;
  message: string;
}

// Extract a readable message without leaking prototype chain details.
function messageFrom(err: unknown): string {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object') {
    const anyErr = err as Record<string, unknown>;
    if (typeof anyErr.message === 'string') return anyErr.message;
    if (typeof anyErr.error === 'string') return anyErr.error;
  }
  try {
    return String(err);
  } catch {
    return '';
  }
}

// Normalize heterogenous error shapes (Fetch, ethers, bridge prose) into a
// small set of user-facing kinds. Returns the original message verbatim so
// callers can render it; use `kind` to drive retry / UX decisions.
export function classifyErrorMessage(err: unknown): ClassifiedError {
  const message = messageFrom(err);
  const lower = message.toLowerCase();

  if ((err as { name?: string } | null)?.name === 'AbortError' || lower.includes('aborted') || lower.includes('canceled') || lower.includes('cancelled')) {
    return { kind: 'aborted', message };
  }
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('etimedout')) {
    return { kind: 'timeout', message };
  }
  if (lower.includes('rate limit') || lower.includes('rate-limit') || lower.includes('429') || lower.includes('too many requests')) {
    return { kind: 'rate-limit', message };
  }
  if (lower.includes('unauthorized') || lower.includes('forbidden') || lower.includes('401') || lower.includes('403')) {
    return { kind: 'auth', message };
  }
  if (lower.includes('not found') || lower.includes('404')) {
    return { kind: 'not-found', message };
  }
  if (
    lower.includes('econnreset') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('network') ||
    lower.includes('fetch failed') ||
    lower.includes('failed to fetch')
  ) {
    return { kind: 'network', message };
  }
  if (lower.includes('invalid') || lower.includes('malformed') || lower.includes('bad request') || lower.includes('400')) {
    return { kind: 'validation', message };
  }
  if (lower.includes('500') || lower.includes('502') || lower.includes('503') || lower.includes('504') || lower.includes('internal server')) {
    return { kind: 'server', message };
  }

  return { kind: 'unknown', message };
}

// Helper: should this error kind be retried on a simple ladder?
export function isRetryableErrorKind(kind: ClassifiedErrorKind): boolean {
  return kind === 'timeout' || kind === 'network' || kind === 'server';
}
