import { ethers } from 'ethers';

// Enhanced decoding interfaces
export interface DecodedParameter {
  name: string;
  type: string;
  value: any;
  rawValue?: string;
  isArray?: boolean;
  arrayLength?: number;
  struct?: DecodedParameter[];
}

export interface HeuristicDecodingResult {
  selector: string;
  probableTypes: string[];
  decodedAttempts: Array<{
    types: string[];
    values: any[];
    confidence: number;
    description: string;
  }>;
  bestGuess?: {
    types: string[];
    values: any[];
    confidence: number;
    description: string;
  };
}

export interface AdvancedDecodingOptions {
  includeHeuristics: boolean;
  maxHeuristicAttempts: number;
  enableStructVisualization: boolean;
  enableArrayHelpers: boolean;
}

// Common Solidity type patterns for heuristic decoding
const TYPE_PATTERNS = {
  ADDRESS: /^0x[a-fA-F0-9]{40}$/,
  BYTES32: /^0x[a-fA-F0-9]{64}$/,
  BYTES: /^0x[a-fA-F0-9]+$/,
  UINT256_SMALL: (value: string) => {
    const bn = ethers.BigNumber.from(value);
    return bn.gte(0) && bn.lt(ethers.BigNumber.from(2).pow(32));
  },
  UINT256_TIMESTAMP: (value: string) => {
    const bn = ethers.BigNumber.from(value);
    const now = Math.floor(Date.now() / 1000);
    return bn.gte(1000000000) && bn.lt(now + 86400 * 365); // Within reasonable timestamp range
  }
};

// Common function signature patterns for better guessing
const COMMON_FUNCTION_PATTERNS = [
  // ERC20 patterns
  { pattern: ['address', 'uint256'], likelihood: 0.9, description: 'ERC20 transfer(to, amount)' },
  { pattern: ['address', 'address', 'uint256'], likelihood: 0.8, description: 'ERC20 transferFrom(from, to, amount)' },
  { pattern: ['address', 'uint256'], likelihood: 0.7, description: 'ERC20 approve(spender, amount)' },
  
  // ERC721 patterns
  { pattern: ['address', 'address', 'uint256'], likelihood: 0.7, description: 'ERC721 transferFrom(from, to, tokenId)' },
  { pattern: ['address', 'uint256'], likelihood: 0.6, description: 'ERC721 approve(to, tokenId)' },
  
  // Common DeFi patterns
  { pattern: ['uint256', 'uint256', 'address', 'uint256'], likelihood: 0.6, description: 'Swap with deadline' },
  { pattern: ['uint256'], likelihood: 0.5, description: 'Simple amount parameter' },
  { pattern: ['address'], likelihood: 0.5, description: 'Simple address parameter' },
  
  // Multicall patterns
  { pattern: ['bytes[]'], likelihood: 0.8, description: 'Multicall batch' },
  { pattern: ['address[]', 'uint256[]'], likelihood: 0.7, description: 'Batch transfer arrays' },
];

/**
 * Decode calldata using heuristic analysis when ABI is not available
 */
export const decodeWithHeuristics = (calldata: string): HeuristicDecodingResult => {
  if (!calldata.startsWith('0x') || calldata.length < 10) {
    throw new Error('Invalid calldata format');
  }

  const selector = calldata.slice(0, 10);
  const data = calldata.slice(10);
  
  // Try to decode the data portion using different type combinations
  const decodedAttempts: HeuristicDecodingResult['decodedAttempts'] = [];
  
  if (data.length === 0) {
    return {
      selector,
      probableTypes: [],
      decodedAttempts: [{
        types: [],
        values: [],
        confidence: 1.0,
        description: 'No parameters (empty calldata)'
      }]
    };
  }

  // Try common patterns
  for (const pattern of COMMON_FUNCTION_PATTERNS) {
    try {
      const types = pattern.pattern;
      const decoded = ethers.utils.defaultAbiCoder.decode(types, '0x' + data);
      const decodedArray = Array.from(decoded);
      
      // Calculate confidence based on pattern likelihood and data analysis
      let confidence = pattern.likelihood;
      
      // Analyze decoded values to adjust confidence
      confidence = adjustConfidenceBasedOnValues(decodedArray, types, confidence);
      
      if (confidence > 0.3) { // Only include reasonable attempts
        decodedAttempts.push({
          types,
          values: decodedArray,
          confidence,
          description: pattern.description
        });
      }
    } catch (error) {
      // Pattern didn't work, continue
    }
  }

  // Try additional heuristic combinations
  const heuristicAttempts = generateHeuristicCombinations(data);
  decodedAttempts.push(...heuristicAttempts);

  // Sort by confidence
  decodedAttempts.sort((a, b) => b.confidence - a.confidence);

  // Find best guess
  const bestGuess = decodedAttempts.length > 0 ? decodedAttempts[0] : undefined;

  return {
    selector,
    probableTypes: bestGuess ? bestGuess.types : [],
    decodedAttempts: decodedAttempts.slice(0, 5), // Limit to top 5 attempts
    bestGuess
  };
};

/**
 * Generate additional heuristic type combinations based on data analysis
 */
const generateHeuristicCombinations = (data: string): HeuristicDecodingResult['decodedAttempts'] => {
  const attempts: HeuristicDecodingResult['decodedAttempts'] = [];
  
  // Calculate data length in bytes
  const dataLength = data.length / 2;
  
  // Try simple single parameter types
  if (dataLength === 32) {
    const singleParamAttempts = [
      'uint256', 'int256', 'address', 'bytes32', 'bool'
    ];
    
    for (const type of singleParamAttempts) {
      try {
        const decoded = ethers.utils.defaultAbiCoder.decode([type], '0x' + data);
        const decodedArray = Array.from(decoded);
        const confidence = calculateSingleParamConfidence(decodedArray[0], type);
        
        if (confidence > 0.2) {
          attempts.push({
            types: [type],
            values: decodedArray,
            confidence,
            description: `Single ${type} parameter`
          });
        }
      } catch (error) {
        // Continue with next type
      }
    }
  }
  
  // Try multiple 32-byte parameters
  if (dataLength % 32 === 0 && dataLength > 32) {
    const paramCount = dataLength / 32;
    if (paramCount <= 6) { // Reasonable limit
      // Try all uint256 parameters
      try {
        const types = Array(paramCount).fill('uint256');
        const decoded = ethers.utils.defaultAbiCoder.decode(types, '0x' + data);
        const decodedArray = Array.from(decoded);
        attempts.push({
          types,
          values: decodedArray,
          confidence: 0.4,
          description: `${paramCount} uint256 parameters`
        });
      } catch (error) {
        // Continue
      }
      
      // Try mixed address/uint256 patterns
      if (paramCount >= 2) {
        try {
          const types = ['address', ...Array(paramCount - 1).fill('uint256')];
          const decoded = ethers.utils.defaultAbiCoder.decode(types, '0x' + data);
          const decodedArray = Array.from(decoded);
          const confidence = calculateMixedParamConfidence(decodedArray, types);
          
          if (confidence > 0.3) {
            attempts.push({
              types,
              values: decodedArray,
              confidence,
              description: `Address + ${paramCount - 1} uint256 parameters`
            });
          }
        } catch (error) {
          // Continue
        }
      }
    }
  }
  
  return attempts;
};

/**
 * Calculate confidence for single parameter based on value analysis
 */
const calculateSingleParamConfidence = (value: any, type: string): number => {
  let confidence = 0.3; // Base confidence
  
  switch (type) {
    case 'address':
      if (TYPE_PATTERNS.ADDRESS.test(value)) {
        confidence = 0.9;
      } else {
        confidence = 0.1;
      }
      break;
      
    case 'bytes32':
      if (TYPE_PATTERNS.BYTES32.test(value)) {
        confidence = 0.8;
      } else {
        confidence = 0.1;
      }
      break;
      
    case 'uint256':
      if (TYPE_PATTERNS.UINT256_SMALL(value.toString())) {
        confidence = 0.6;
      } else if (TYPE_PATTERNS.UINT256_TIMESTAMP(value.toString())) {
        confidence = 0.7;
      } else {
        confidence = 0.4;
      }
      break;
      
    case 'bool':
      const bn = ethers.BigNumber.from(value);
      if (bn.eq(0) || bn.eq(1)) {
        confidence = 0.8;
      } else {
        confidence = 0.1;
      }
      break;
  }
  
  return confidence;
};

/**
 * Adjust confidence based on decoded values analysis
 */
const adjustConfidenceBasedOnValues = (values: any[], types: string[], baseConfidence: number): number => {
  let confidence = baseConfidence;
  
  for (let i = 0; i < values.length && i < types.length; i++) {
    const value = values[i];
    const type = types[i];
    
    if (type === 'address' && TYPE_PATTERNS.ADDRESS.test(value)) {
      confidence += 0.1;
    } else if (type === 'address' && !TYPE_PATTERNS.ADDRESS.test(value)) {
      confidence -= 0.3;
    }
    
    if (type === 'uint256' && TYPE_PATTERNS.UINT256_TIMESTAMP(value.toString())) {
      confidence += 0.05;
    }
  }
  
  return Math.max(0, Math.min(1, confidence));
};

/**
 * Calculate confidence for mixed parameter types
 */
const calculateMixedParamConfidence = (values: any[], types: string[]): number => {
  let confidence = 0.3;
  
  for (let i = 0; i < values.length && i < types.length; i++) {
    const value = values[i];
    const type = types[i];
    
    if (type === 'address' && TYPE_PATTERNS.ADDRESS.test(value)) {
      confidence += 0.15;
    } else if (type === 'address' && !TYPE_PATTERNS.ADDRESS.test(value)) {
      confidence -= 0.2;
      break; // If address doesn't match, this is likely wrong
    }
  }
  
  return Math.max(0, Math.min(1, confidence));
};

/**
 * Enhanced parameter visualization for complex types
 */
export const visualizeParameter = (param: DecodedParameter): string => {
  if (param.struct) {
    return visualizeStruct(param.struct);
  }
  
  if (param.isArray) {
    return visualizeArray(param);
  }
  
  return visualizePrimitiveValue(param.value, param.type);
};

/**
 * Visualize struct parameters with nested formatting
 */
const visualizeStruct = (struct: DecodedParameter[]): string => {
  const lines = struct.map(param => {
    const value = param.struct ? 
      visualizeStruct(param.struct) : 
      visualizePrimitiveValue(param.value, param.type);
    return `  ${param.name}: ${value}`;
  });
  
  return `{\n${lines.join('\n')}\n}`;
};

/**
 * Visualize array parameters with length and sample values
 */
const visualizeArray = (param: DecodedParameter): string => {
  if (!Array.isArray(param.value)) {
    return param.value?.toString() || 'null';
  }
  
  const arr = param.value;
  const length = arr.length;
  
  if (length === 0) {
    return '[]';
  }
  
  if (length <= 3) {
    // Show all elements for small arrays
    const elements = arr.map((item, index) => 
      `[${index}]: ${visualizePrimitiveValue(item, param.type.replace('[]', ''))}`
    ).join(', ');
    return `[${elements}]`;
  } else {
    // Show first few elements for large arrays
    const firstElements = arr.slice(0, 2).map((item, index) => 
      `[${index}]: ${visualizePrimitiveValue(item, param.type.replace('[]', ''))}`
    ).join(', ');
    return `[${firstElements}, ... +${length - 2} more]`;
  }
};

/**
 * Enhanced visualization for primitive values
 */
const visualizePrimitiveValue = (value: any, type: string): string => {
  if (value === null || value === undefined) {
    return 'null';
  }
  
  // Address formatting
  if (type === 'address') {
    return value.toString();
  }
  
  // Large number formatting
  if (type.includes('uint') || type.includes('int')) {
    const bn = ethers.BigNumber.from(value);
    const valueStr = bn.toString();
    
    // If it looks like a timestamp
    if (TYPE_PATTERNS.UINT256_TIMESTAMP(valueStr)) {
      const date = new Date(parseInt(valueStr) * 1000);
      return `${valueStr} (${date.toISOString()})`;
    }
    
    // If it's a large number, show both decimal and hex
    if (bn.gt(ethers.BigNumber.from(10).pow(12))) {
      return `${valueStr} (0x${bn.toHexString()})`;
    }
    
    return valueStr;
  }
  
  // Bytes formatting
  if (type.includes('bytes')) {
    const str = value.toString();
    if (str.length > 42) {
      return `${str.slice(0, 42)}... (${(str.length - 2) / 2} bytes)`;
    }
    return str;
  }
  
  // Boolean formatting
  if (type === 'bool') {
    return value ? 'true' : 'false';
  }
  
  return value.toString();
};

/**
 * Detect if decoded parameters likely represent a struct
 */
export const detectStructPattern = (_values: any[], types: string[]): boolean => {
  // Simple heuristic: if we have mixed types including addresses, it might be a struct
  const hasAddress = types.some(t => t === 'address');
  const hasUint = types.some(t => t.includes('uint'));
  const hasMultipleTypes = new Set(types).size > 1;
  
  return hasAddress && hasUint && hasMultipleTypes && types.length >= 2;
};