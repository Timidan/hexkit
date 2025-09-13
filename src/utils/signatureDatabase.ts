import axios from 'axios';

// OpenChain API configuration
const OPENCHAIN_API_BASE = 'https://api.openchain.xyz/signature-database/v1';

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
 * Search for signatures by name with wildcards
 * @param query Signature name with wildcards (e.g., 'transfer*', '*ERC20*')
 * @param filter Whether to filter junk results (default: true)
 */
export const searchSignatures = async (
  query: string,
  filter: boolean = true
): Promise<SearchResponse> => {
  try {
    const response = await axios.get(`${OPENCHAIN_API_BASE}/search`, {
      params: {
        query,
        filter,
      },
    });
    return response.data;
  } catch (error: any) {
    console.error('Failed to search signatures:', error);
    throw new Error(`OpenChain API error: ${error.response?.data?.detail || error.message}`);
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

// Local storage utilities for caching
const STORAGE_KEYS = {
  FUNCTION_SIGNATURES: 'web3toolkit_function_signatures',
  EVENT_SIGNATURES: 'web3toolkit_event_signatures',
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
export const cacheSignature = (hash: string, name: string, type: 'function' | 'event') => {
  const key = type === 'function' ? STORAGE_KEYS.FUNCTION_SIGNATURES : STORAGE_KEYS.EVENT_SIGNATURES;
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
export const getCachedSignatures = (type: 'function' | 'event'): { [hash: string]: CachedSignature } => {
  const key = type === 'function' ? STORAGE_KEYS.FUNCTION_SIGNATURES : STORAGE_KEYS.EVENT_SIGNATURES;
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
export const clearSignatureCache = (type?: 'function' | 'event' | 'custom') => {
  if (type === 'function') {
    localStorage.removeItem(STORAGE_KEYS.FUNCTION_SIGNATURES);
  } else if (type === 'event') {
    localStorage.removeItem(STORAGE_KEYS.EVENT_SIGNATURES);
  } else if (type === 'custom') {
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_SIGNATURES);
  } else {
    // Clear all
    localStorage.removeItem(STORAGE_KEYS.FUNCTION_SIGNATURES);
    localStorage.removeItem(STORAGE_KEYS.EVENT_SIGNATURES);
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_SIGNATURES);
  }
};