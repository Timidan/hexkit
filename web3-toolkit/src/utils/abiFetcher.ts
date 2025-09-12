import axios from 'axios';
import type { Chain, ABIFetchResult } from '../types';

// No default API key - users must provide their own

interface ExplorerAPIResponse {
  status: string;
  message: string;
  result: string;
}

export const fetchContractABI = async (
  contractAddress: string,
  chain: Chain,
  apiKey?: string
): Promise<ABIFetchResult> => {
  try {
    // Validate contract address
    if (!contractAddress || contractAddress.length !== 42 || !contractAddress.startsWith('0x')) {
      return {
        success: false,
        error: 'Invalid contract address format',
      };
    }

    // Build API URL
    const url = `${chain.apiUrl}?module=contract&action=getabi&address=${contractAddress}${apiKey ? `&apikey=${apiKey}` : ''}`;
    
    console.log(`Fetching ABI from ${chain.name} for ${contractAddress}`);
    
    const response = await axios.get<ExplorerAPIResponse>(url, {
      timeout: 10000, // 10 second timeout
    });

    if (response.data.status === '1' && response.data.result) {
      // Validate that the result is valid JSON
      try {
        JSON.parse(response.data.result);
        return {
          success: true,
          abi: response.data.result,
        };
      } catch (jsonError) {
        return {
          success: false,
          error: 'Invalid ABI format received from API',
        };
      }
    } else if (response.data.status === '0') {
      // Handle specific error messages
      const message = response.data.message || response.data.result;
      if (message === 'NOTOK') {
        if (!apiKey) {
          return {
            success: false,
            error: 'API key required - rate limit exceeded or invalid request',
          };
        } else {
          return {
            success: false,
            error: 'Invalid API key or contract not found',
          };
        }
      }
      if (message && message.includes('Contract source code not verified')) {
        return {
          success: false,
          error: 'Contract source code not verified on this explorer',
        };
      }
      return {
        success: false,
        error: message || 'Failed to fetch ABI',
      };
    } else {
      return {
        success: false,
        error: 'Unexpected response format from API',
      };
    }
  } catch (error: any) {
    console.error('ABI fetch error:', error);
    
    if (error.code === 'ECONNABORTED') {
      return {
        success: false,
        error: 'Request timeout - API may be unavailable',
      };
    }
    
    if (error.response?.status === 403) {
      return {
        success: false,
        error: 'API key invalid or rate limit exceeded',
      };
    }
    
    if (error.response?.status === 429) {
      return {
        success: false,
        error: 'Rate limit exceeded - please try again later',
      };
    }
    
    return {
      success: false,
      error: error.message || 'Network error occurred',
    };
  }
};

export const validateABI = (abiString: string): boolean => {
  try {
    const abi = JSON.parse(abiString);
    return Array.isArray(abi) && abi.length > 0;
  } catch {
    return false;
  }
};

export const formatABI = (abiString: string): string => {
  try {
    const abi = JSON.parse(abiString);
    return JSON.stringify(abi, null, 2);
  } catch {
    return abiString;
  }
};