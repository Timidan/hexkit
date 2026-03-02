import axios from 'axios';
import { ethers } from 'ethers';

// OpenChain API configuration
const OPENCHAIN_API_BASE = 'https://api.openchain.xyz/signature-database/v1';
const FOURBYTE_API_BASE = 'https://www.4byte.directory/api/v1';
const SEARCH_TIMEOUT_MS = 10000;
const SEARCH_RETRY_COUNT = 2;
const FOURBYTE_PAGE_SIZE = 50;

export interface SearchProgress {
  stage: 'variant' | 'retry' | 'fallback' | 'done' | 'error';
  message: string;
  variant?: string;
  attempt?: number;
  maxAttempts?: number;
  filtered?: boolean;
}

export interface SignatureResult {
  name: string;
  filtered: boolean;
}

export interface SignatureResponse {
  ok: boolean;
  result: {
    function: { [key: string]: SignatureResult[] };
    event: { [key: string]: SignatureResult[] };
  };
}

export interface SearchResponse {
  ok: boolean;
  result: {
    function: { [key: string]: SignatureResult[] };
    event: { [key: string]: SignatureResult[] };
  };
}

function getSearchResultCount(response: SearchResponse | null | undefined): number {
  if (!response?.result) return 0;

  const functionCount = Object.values(response.result.function || {}).reduce(
    (total, entries) => total + entries.length,
    0,
  );
  const eventCount = Object.values(response.result.event || {}).reduce(
    (total, entries) => total + entries.length,
    0,
  );

  return functionCount + eventCount;
}

function getSearchVariants(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const variants = [trimmed];
  if (!trimmed.includes('*')) {
    variants.push(`${trimmed}*`);
    variants.push(`*${trimmed}*`);
  }

  return Array.from(new Set(variants));
}

function createEmptySearchResponse(): SearchResponse {
  return {
    ok: true,
    result: {
      function: {},
      event: {},
    },
  };
}

async function requestSearchWithRetry(
  query: string,
  filter: boolean,
  retries: number = SEARCH_RETRY_COUNT,
  onProgress?: (progress: SearchProgress) => void
): Promise<SearchResponse> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    onProgress?.({
      stage: attempt === 0 ? 'variant' : 'retry',
      message: attempt === 0
        ? `Searching "${query}" (${filter ? 'filtered' : 'unfiltered'})…`
        : `Retry ${attempt}/${retries} for "${query}"…`,
      variant: query,
      attempt: attempt + 1,
      maxAttempts: retries + 1,
      filtered: filter,
    });
    try {
      const response = await axios.get(`${OPENCHAIN_API_BASE}/search`, {
        params: {
          query,
          filter,
        },
        timeout: SEARCH_TIMEOUT_MS,
      });
      return response.data;
    } catch (error: any) {
      lastError = error;
      const isCancelled = error?.code === 'ERR_CANCELED';
      const errMsg = error?.message || 'unknown error';
      onProgress?.({
        stage: 'error',
        message: isCancelled
          ? `Search cancelled`
          : `Attempt ${attempt + 1} failed: ${errMsg}`,
        variant: query,
        attempt: attempt + 1,
        maxAttempts: retries + 1,
        filtered: filter,
      });
      if (isCancelled || attempt >= retries) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }

  const e = lastError as any;
  throw new Error(`OpenChain API error: ${e?.response?.data?.detail || e?.message || 'Search request failed'}`);
}

/**
 * Look up function signatures by their 4-byte selector
 * @param functionHashes Array of 4-byte function selectors (e.g., ['0xa9059cbb'])
 * @param filter Whether to filter junk results (default: true)
 */
export const lookupFunctionSignatures = async (
  functionHashes: string[],
  filter: boolean = true
): Promise<SignatureResponse> => {
  try {
    const response = await axios.get(`${OPENCHAIN_API_BASE}/lookup`, {
      params: {
        function: functionHashes.join(','),
        filter,
      },
    });
    return response.data;
  } catch (error: any) {
    console.error('Failed to lookup function signatures:', error);
    throw new Error(`OpenChain API error: ${error.response?.data?.detail || error.message}`);
  }
};

/**
 * Look up event signatures by their topic hash
 * @param eventHashes Array of event topic hashes
 * @param filter Whether to filter junk results (default: true)
 */
export const lookupEventSignatures = async (
  eventHashes: string[],
  filter: boolean = true
): Promise<SignatureResponse> => {
  try {
    const response = await axios.get(`${OPENCHAIN_API_BASE}/lookup`, {
      params: {
        event: eventHashes.join(','),
        filter,
      },
    });
    return response.data;
  } catch (error: any) {
    console.error('Failed to lookup event signatures:', error);
    throw new Error(`OpenChain API error: ${error.response?.data?.detail || error.message}`);
  }
};

/**
 * Derive wildcard mode from query string.
 * "transfer*"   → 'startswith'
 * "*transfer"   → 'endswith'
 * "*transfer*"  → 'contains'
 * "transfer"    → 'startswith'  (default: prefix match)
 */
function getWildcardMode(query: string): 'startswith' | 'endswith' | 'contains' {
  const startsWithWild = query.startsWith('*');
  const endsWithWild = query.endsWith('*');
  if (startsWithWild && endsWithWild) return 'contains';
  if (startsWithWild) return 'endswith';
  return 'startswith';
}

/** Client-side filter: does `name` match the wildcard mode for `term`? */
function matchesWildcard(name: string, term: string, mode: 'startswith' | 'endswith' | 'contains'): boolean {
  // Extract function name before the '(' for matching
  const fnName = name.split('(')[0].toLowerCase();
  const lowerTerm = term.toLowerCase();
  if (mode === 'startswith') return fnName.startsWith(lowerTerm);
  if (mode === 'endswith') return fnName.endsWith(lowerTerm);
  return fnName.includes(lowerTerm);
}

/**
 * Search 4byte.directory by text signature name.
 * The API only supports `text_signature` param (case-insensitive contains).
 * We apply additional client-side filtering for startswith/endswith semantics.
 */
async function search4byteDirectory(
  query: string,
  onProgress?: (progress: SearchProgress) => void
): Promise<SearchResponse> {
  const cleanQuery = query.replace(/\*/g, '').trim();
  if (!cleanQuery) return createEmptySearchResponse();

  const mode = getWildcardMode(query);

  onProgress?.({
    stage: 'variant',
    message: `4byte.directory: functions ${mode} "${cleanQuery}"…`,
    variant: cleanQuery,
  });

  // 4byte only supports bare `text_signature` param (contains match).
  // We fetch more results and filter client-side for startswith/endswith.
  const fetchSize = mode === 'contains' ? FOURBYTE_PAGE_SIZE : FOURBYTE_PAGE_SIZE * 4;

  const response = await axios.get(`${FOURBYTE_API_BASE}/signatures/`, {
    params: {
      text_signature: cleanQuery,
      page_size: fetchSize,
      ordering: 'text_signature',
    },
    timeout: SEARCH_TIMEOUT_MS,
  });

  const data = response.data;
  const functionResults: { [key: string]: SignatureResult[] } = {};
  if (data.results && Array.isArray(data.results)) {
    for (const entry of data.results) {
      const hash = entry.hex_signature as string;
      const name = entry.text_signature as string;
      if (!hash || !name) continue;
      if (!matchesWildcard(name, cleanQuery, mode)) continue;
      if (!functionResults[hash]) functionResults[hash] = [];
      functionResults[hash].push({ name, filtered: false });
    }
  }

  // Also search events
  onProgress?.({
    stage: 'variant',
    message: `4byte.directory: events ${mode} "${cleanQuery}"…`,
    variant: cleanQuery,
  });

  const eventResults: { [key: string]: SignatureResult[] } = {};
  try {
    const eventResponse = await axios.get(`${FOURBYTE_API_BASE}/event-signatures/`, {
      params: {
        text_signature: cleanQuery,
        page_size: fetchSize,
        ordering: 'text_signature',
      },
      timeout: SEARCH_TIMEOUT_MS,
    });
    if (eventResponse.data.results && Array.isArray(eventResponse.data.results)) {
      for (const entry of eventResponse.data.results) {
        const hash = entry.hex_signature as string;
        const name = entry.text_signature as string;
        if (!hash || !name) continue;
        if (!matchesWildcard(name, cleanQuery, mode)) continue;
        if (!eventResults[hash]) eventResults[hash] = [];
        eventResults[hash].push({ name, filtered: false });
      }
    }
  } catch {
    // Event search is best-effort
  }

  return {
    ok: true,
    result: {
      function: functionResults,
      event: eventResults,
    },
  };
}

/**
 * Search for signatures by name with wildcards.
 * Tries OpenChain first (single fast attempt), falls back to 4byte.directory.
 * @param query Signature name with wildcards (e.g., 'transfer*', '*ERC20*')
 * @param filter Whether to filter junk results (default: true)
 */
export const searchSignatures = async (
  query: string,
  filter: boolean = true,
  onProgress?: (progress: SearchProgress) => void
): Promise<SearchResponse> => {
  const variants = getSearchVariants(query);
  if (variants.length === 0) {
    return createEmptySearchResponse();
  }

  // 1) Try OpenChain first (single attempt, no retries — it's often broken)
  try {
    const response = await requestSearchWithRetry(variants[0], filter, 0, onProgress);
    if (getSearchResultCount(response) > 0) {
      onProgress?.({ stage: 'done', message: `Found results via OpenChain` });
      return response;
    }
  } catch {
    // OpenChain failed — fall through to 4byte
  }

  // 2) Fallback to 4byte.directory
  onProgress?.({
    stage: 'fallback',
    message: 'OpenChain empty/failed, falling back to 4byte.directory…',
  });

  try {
    const fourbyteResponse = await search4byteDirectory(query, onProgress);
    if (getSearchResultCount(fourbyteResponse) > 0) {
      onProgress?.({ stage: 'done', message: `Found ${getSearchResultCount(fourbyteResponse)} results via 4byte.directory` });
      return fourbyteResponse;
    }
    onProgress?.({ stage: 'done', message: 'No results found from any source' });
    return fourbyteResponse;
  } catch (error: any) {
    console.error('4byte.directory search also failed:', error);
    throw new Error(`Signature search failed: ${error.message}`);
  }
};

/**
 * Import custom function and event signatures
 * @param functionSignatures Array of function signatures (e.g., ['transfer(address,uint256)'])
 * @param eventSignatures Array of event signatures (e.g., ['Transfer(address,address,uint256)'])
 */
export const importSignatures = async (
  functionSignatures: string[] = [],
  eventSignatures: string[] = []
): Promise<any> => {
  try {
    const response = await axios.post(`${OPENCHAIN_API_BASE}/import`, {
      function: functionSignatures,
      event: eventSignatures,
    });
    return response.data;
  } catch (error: any) {
    console.error('Failed to import signatures:', error);
    throw new Error(`OpenChain API error: ${error.response?.data?.detail || error.message}`);
  }
};

// Built-in error signature database (OpenChain doesn't support error lookups)
const BUILT_IN_ERRORS: { [selector: string]: string[] } = {
  '0x08c379a0': ['Error(string)'],
  '0x4e487b71': ['Panic(uint256)'],
  '0xe450d38c': ['InsufficientBalance(uint256,uint256)'],
  '0x118cdaa7': ['OwnableUnauthorizedAccount(address)'],
  '0x1e4fbdf7': ['OwnableInvalidOwner(address)'],
  '0xf92ee8a9': ['InvalidInitialization()'],
  '0xd7e6bcf8': ['NotInitializing()'],
  '0x3ee5aeb5': ['ReentrancyGuardReentrantCall()'],
  '0x8579befe': ['EnforcedPause()'],
  '0xd93c0665': ['ExpectedPause()'],
  '0xe602df05': ['ERC20InvalidApprover(address)'],
  '0x94280d62': ['ERC20InvalidReceiver(address)'],
  '0xec442f05': ['ERC20InvalidSender(address)'],
  '0xfb8f41b2': ['ERC20InsufficientAllowance(address,uint256,uint256)'],
  '0x7939f424': ['ERC20InsufficientBalance(address,uint256,uint256)'],
  '0x64a0ae92': ['ERC721InvalidOwner(address)'],
  '0x73c6ac6e': ['ERC721InvalidReceiver(address)'],
  '0x89c62b64': ['ERC721InvalidSender(address)'],
  '0x7e273289': ['ERC721NonexistentToken(uint256)'],
  '0xb12d13eb': ['InvalidSignature()'],
  '0x1425ea42': ['DeadlineExpired()'],
  '0xce174065': ['SlippageExceeded()'],
  '0x39afc614': ['InsufficientLiquidity()'],
  '0x2c5211c6': ['InvalidAmount(uint256)'],
  '0x00bfc921': ['Unauthorized()'],
};

/**
 * Look up error signatures by their 4-byte selector.
 * Checks built-in errors first, then custom signatures, then falls back to
 * the function lookup API (since error selectors share the 4-byte format).
 */
export const lookupErrorSignatures = async (
  errorHashes: string[],
  filter: boolean = true
): Promise<SignatureResponse> => {
  const builtInResults: { [key: string]: SignatureResult[] } = {};
  const missedHashes: string[] = [];

  // 1. Check built-in error database
  for (const hash of errorHashes) {
    const normalized = hash.toLowerCase();
    if (BUILT_IN_ERRORS[normalized]) {
      builtInResults[hash] = BUILT_IN_ERRORS[normalized].map(name => ({ name, filtered: false }));
    } else {
      missedHashes.push(hash);
    }
  }

  // 2. Check custom signatures for remaining misses
  const customs = getCustomSignatures();
  const stillMissed: string[] = [];
  for (const hash of missedHashes) {
    const matches = customs.filter(c => {
      try {
        const sig = c.signature;
        if (sig.includes('(') && sig.includes(')')) {
          const computed = ethers.utils.id(sig).slice(0, 10);
          return computed.toLowerCase() === hash.toLowerCase();
        }
      } catch { /* ignore */ }
      return false;
    });
    if (matches.length > 0) {
      builtInResults[hash] = matches.map(m => ({ name: m.signature, filtered: false }));
    } else {
      stillMissed.push(hash);
    }
  }

  // 3. Fall back to function lookup API for remaining misses
  // (error selectors are 4-byte like functions, some may match)
  let apiResults: { [key: string]: SignatureResult[] } = {};
  if (stillMissed.length > 0) {
    try {
      const response = await lookupFunctionSignatures(stillMissed, filter);
      if (response.result?.function) {
        apiResults = response.result.function;
      }
    } catch {
      // API failure is non-fatal for error lookups
    }
  }

  // Merge all results under the 'function' key (for display compatibility)
  const merged: { [key: string]: SignatureResult[] } = {};
  for (const hash of errorHashes) {
    const results: SignatureResult[] = [];
    if (builtInResults[hash]) results.push(...builtInResults[hash]);
    if (apiResults[hash]) {
      // Mark API results as potential function matches
      for (const r of apiResults[hash]) {
        if (!results.some(existing => existing.name === r.name)) {
          results.push(r);
        }
      }
    }
    if (results.length > 0) merged[hash] = results;
    else merged[hash] = [];
  }

  return { ok: true, result: { function: merged, event: {} } };
};

// Local storage utilities for caching
const STORAGE_KEYS = {
  FUNCTION_SIGNATURES: 'web3toolkit_function_signatures',
  EVENT_SIGNATURES: 'web3toolkit_event_signatures',
  ERROR_SIGNATURES: 'web3toolkit_error_signatures',
  CUSTOM_SIGNATURES: 'web3toolkit_custom_signatures',
};

export interface CachedSignature {
  hash: string;
  name: string;
  timestamp: number;
}

export interface CustomSignature {
  signature: string;
  description?: string;
  project?: string;
  timestamp: number;
}

/**
 * Cache signature lookup results locally
 */
export const cacheSignature = (hash: string, name: string, type: 'function' | 'event' | 'error') => {
  const key = type === 'function' ? STORAGE_KEYS.FUNCTION_SIGNATURES : type === 'event' ? STORAGE_KEYS.EVENT_SIGNATURES : STORAGE_KEYS.ERROR_SIGNATURES;
  const cached = getCachedSignatures(type);
  cached[hash] = {
    hash,
    name,
    timestamp: Date.now(),
  };
  localStorage.setItem(key, JSON.stringify(cached));
};

/**
 * Get cached signatures
 */
export const getCachedSignatures = (type: 'function' | 'event' | 'error'): { [hash: string]: CachedSignature } => {
  const key = type === 'function' ? STORAGE_KEYS.FUNCTION_SIGNATURES : type === 'event' ? STORAGE_KEYS.EVENT_SIGNATURES : STORAGE_KEYS.ERROR_SIGNATURES;
  try {
    const cached = localStorage.getItem(key);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
};

/**
 * Save custom signature to local database
 */
export const saveCustomSignature = (signature: CustomSignature) => {
  try {
    const customs = getCustomSignatures();
    customs.push(signature);
    localStorage.setItem(STORAGE_KEYS.CUSTOM_SIGNATURES, JSON.stringify(customs));
  } catch (error) {
    console.error('Failed to save custom signature:', error);
  }
};

/**
 * Get all custom signatures
 */
export const getCustomSignatures = (): CustomSignature[] => {
  try {
    const customs = localStorage.getItem(STORAGE_KEYS.CUSTOM_SIGNATURES);
    return customs ? JSON.parse(customs) : [];
  } catch {
    return [];
  }
};

/**
 * Clear cached signatures (for cleanup/reset)
 */
export const clearSignatureCache = (type?: 'function' | 'event' | 'error' | 'custom') => {
  if (type === 'function') {
    localStorage.removeItem(STORAGE_KEYS.FUNCTION_SIGNATURES);
  } else if (type === 'event') {
    localStorage.removeItem(STORAGE_KEYS.EVENT_SIGNATURES);
  } else if (type === 'error') {
    localStorage.removeItem(STORAGE_KEYS.ERROR_SIGNATURES);
  } else if (type === 'custom') {
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_SIGNATURES);
  } else {
    // Clear all
    localStorage.removeItem(STORAGE_KEYS.FUNCTION_SIGNATURES);
    localStorage.removeItem(STORAGE_KEYS.EVENT_SIGNATURES);
    localStorage.removeItem(STORAGE_KEYS.ERROR_SIGNATURES);
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_SIGNATURES);
  }
};
