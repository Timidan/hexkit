/**
 * Safe ABI parsing utilities to prevent crashes from malformed JSON
 */

export interface ABIFunction {
  name: string;
  type: 'function';
  inputs: Array<{
    name: string;
    type: string;
    components?: Array<any>;
  }>;
  outputs?: Array<{
    name: string;
    type: string;
    components?: Array<any>;
  }>;
  stateMutability?: 'pure' | 'view' | 'nonpayable' | 'payable';
}

export interface SafeABIParseResult {
  success: boolean;
  abi: ABIFunction[] | null;
  error?: string;
}

/**
 * Safely parse ABI JSON string with comprehensive error handling
 */
export const safeParseABI = (abiString: string): SafeABIParseResult => {
  try {
    if (!abiString || typeof abiString !== 'string') {
      return {
        success: false,
        abi: null,
        error: 'ABI string is empty or invalid'
      };
    }

    const trimmedAbi = abiString.trim();
    if (!trimmedAbi.startsWith('[') || !trimmedAbi.endsWith(']')) {
      return {
        success: false,
        abi: null,
        error: 'ABI must be a JSON array starting with [ and ending with ]'
      };
    }

    const parsed = JSON.parse(trimmedAbi);
    
    if (!Array.isArray(parsed)) {
      return {
        success: false,
        abi: null,
        error: 'ABI must be an array'
      };
    }

    // Validate that the ABI contains valid functions
    const functions = parsed.filter((item: any) => item.type === 'function');
    
    return {
      success: true,
      abi: parsed as ABIFunction[],
      error: undefined
    };
  } catch (error: any) {
    return {
      success: false,
      abi: null,
      error: `Failed to parse ABI: ${error.message || 'Invalid JSON format'}`
    };
  }
};

/**
 * Safely find a function in the ABI by name
 */
export const safeFindFunction = (abi: ABIFunction[] | null, functionName: string): ABIFunction | null => {
  try {
    if (!abi || !Array.isArray(abi) || !functionName) {
      return null;
    }

    return abi.find(item => item.type === 'function' && item.name === functionName) || null;
  } catch (error) {
    console.error('Error finding function in ABI:', error);
    return null;
  }
};

/**
 * Safely get all functions from ABI
 */
export const safeGetFunctions = (abi: ABIFunction[] | null): ABIFunction[] => {
  try {
    if (!abi || !Array.isArray(abi)) {
      return [];
    }

    return abi.filter(item => item.type === 'function');
  } catch (error) {
    console.error('Error getting functions from ABI:', error);
    return [];
  }
};

/**
 * Safely get function inputs
 */
export const safeFunctionInputs = (func: ABIFunction | null): Array<any> => {
  try {
    if (!func || !func.inputs || !Array.isArray(func.inputs)) {
      return [];
    }

    return func.inputs;
  } catch (error) {
    console.error('Error getting function inputs:', error);
    return [];
  }
};