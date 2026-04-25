import type { TypedDataPayload } from './types';

export type ParseResult =
  | { ok: true; payload: TypedDataPayload }
  | { ok: false; error: string; code: string };

const REQUIRED_KEYS = ['domain', 'types', 'primaryType', 'message'] as const;

function looksLikeTypedData(v: unknown): v is TypedDataPayload {
  if (!v || typeof v !== 'object') return false;
  return REQUIRED_KEYS.every((k) => k in (v as Record<string, unknown>));
}

function normalizeChainId(payload: TypedDataPayload): TypedDataPayload {
  const chainId = payload.domain?.chainId;
  if (typeof chainId === 'string' && /^\d+$/.test(chainId)) {
    return {
      ...payload,
      domain: { ...payload.domain, chainId: Number(chainId) },
    };
  }
  return payload;
}

function tryJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return undefined;
  }
}

function base64urlToJson(input: string): unknown {
  try {
    const padded = input.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const decoded = atob(padded + pad);
    return tryJson(decoded);
  } catch {
    return undefined;
  }
}

export function parsePayload(input: string): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'Empty input', code: 'EMPTY' };

  let candidate: unknown = tryJson(trimmed);

  // Double-stringified JSON: parse once, then parse the resulting string.
  if (typeof candidate === 'string') {
    candidate = tryJson(candidate) ?? candidate;
  }

  // eth_signTypedData_v4 RPC envelope: { method, params: [address, typedDataJson] }.
  if (
    candidate &&
    typeof candidate === 'object' &&
    'method' in (candidate as Record<string, unknown>) &&
    'params' in (candidate as Record<string, unknown>)
  ) {
    const c = candidate as { method?: string; params?: unknown };
    if (Array.isArray(c.params) && c.params.length >= 2) {
      const inner = c.params[1];
      if (typeof inner === 'string') {
        candidate = tryJson(inner) ?? inner;
      } else if (looksLikeTypedData(inner)) {
        candidate = inner;
      }
    }
  }

  // Base64url fallback (used by /database/preview?data= links).
  if (!looksLikeTypedData(candidate)) {
    const fromBase64 = base64urlToJson(trimmed);
    if (looksLikeTypedData(fromBase64)) {
      candidate = fromBase64;
    }
  }

  if (!looksLikeTypedData(candidate)) {
    return {
      ok: false,
      error:
        'Payload must contain `domain`, `types`, `primaryType`, and `message`.',
      code: 'MISSING_KEYS',
    };
  }

  return { ok: true, payload: normalizeChainId(candidate) };
}
