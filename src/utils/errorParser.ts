/**
 * Enhanced error parsing for better user experience
 * Converts technical blockchain errors into human-readable messages
 */

export interface ParsedError {
  type: 'revert' | 'gas' | 'network' | 'auth' | 'validation' | 'unknown';
  message: string;
  originalError?: string;
  suggestion?: string;
}

export const parseErrorMessage = (error: any): string => {
  const parsed = parseError(error);
  return parsed.message;
};

export const parseError = (error: any): ParsedError => {
  let errorMessage = '';
  let errorType: ParsedError['type'] = 'unknown';
  let suggestion = '';

  // Extract error message from various error formats
  if (typeof error === 'string') {
    errorMessage = error;
  } else if (error?.message) {
    errorMessage = error.message;
  } else if (error?.error?.message) {
    errorMessage = error.error.message;
  } else if (error?.data?.message) {
    errorMessage = error.data.message;
  } else {
    errorMessage = 'Unknown error occurred';
  }

  const originalError = errorMessage;

  // Parse common error patterns
  if (errorMessage.includes('execution reverted')) {
    errorType = 'revert';
    
    // Extract revert reason if available
    const revertMatch = errorMessage.match(/execution reverted:?\s*(.+?)(?:\s*\(|$)/i);
    if (revertMatch && revertMatch[1]) {
      errorMessage = `Contract reverted: ${revertMatch[1].trim()}`;
    } else {
      errorMessage = 'Contract execution reverted (no reason provided)';
    }
    suggestion = 'Check function parameters and contract state requirements';
    
  } else if (errorMessage.includes('insufficient funds') || errorMessage.includes('insufficient balance')) {
    errorType = 'gas';
    errorMessage = 'Insufficient funds to cover gas costs';
    suggestion = 'Add more ETH to your wallet to cover transaction fees';
    
  } else if (errorMessage.includes('gas required exceeds allowance') || errorMessage.includes('out of gas')) {
    errorType = 'gas';
    errorMessage = 'Transaction ran out of gas';
    suggestion = 'Increase the gas limit for this transaction';
    
  } else if (errorMessage.includes('gas price too low')) {
    errorType = 'gas';
    errorMessage = 'Gas price is too low';
    suggestion = 'Increase the gas price to speed up transaction processing';
    
  } else if (errorMessage.includes('nonce too low')) {
    errorType = 'validation';
    errorMessage = 'Transaction nonce is too low (already used)';
    suggestion = 'Wait for pending transactions to complete or reset your wallet';
    
  } else if (errorMessage.includes('nonce too high')) {
    errorType = 'validation';
    errorMessage = 'Transaction nonce is too high';
    suggestion = 'Check for pending transactions or reset your wallet';
    
  } else if (errorMessage.includes('user rejected') || errorMessage.includes('user denied')) {
    errorType = 'auth';
    errorMessage = 'Transaction was rejected by user';
    suggestion = 'Approve the transaction in your wallet to proceed';
    
  } else if (errorMessage.includes('network changed') || errorMessage.includes('chain mismatch')) {
    errorType = 'network';
    errorMessage = 'Wrong network selected';
    suggestion = 'Switch to the correct network in your wallet';
    
  } else if (errorMessage.includes('contract not found') || errorMessage.includes('no code at address')) {
    errorType = 'validation';
    errorMessage = 'Contract not found at this address';
    suggestion = 'Verify the contract address and selected network';
    
  } else if (errorMessage.includes('invalid address')) {
    errorType = 'validation';
    errorMessage = 'Invalid contract address format';
    suggestion = 'Check that the address is a valid Ethereum address';
    
  } else if (errorMessage.includes('function not found') || errorMessage.includes('function does not exist')) {
    errorType = 'validation';
    errorMessage = 'Function not found in contract';
    suggestion = 'Verify the function exists in the contract ABI';
    
  } else if (errorMessage.includes('invalid argument') || errorMessage.includes('invalid parameter')) {
    errorType = 'validation';
    errorMessage = 'Invalid function parameters';
    suggestion = 'Check parameter types and values match the function signature';
    
  } else if (errorMessage.includes('timeout') || errorMessage.includes('request timeout')) {
    errorType = 'network';
    errorMessage = 'Network request timed out';
    suggestion = 'Check your internet connection and try again';
    
  } else if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
    errorType = 'network';
    errorMessage = 'API rate limit exceeded';
    suggestion = 'Wait a moment before trying again';
    
  } else if (errorMessage.includes('replacement transaction underpriced')) {
    errorType = 'gas';
    errorMessage = 'Replacement transaction gas price too low';
    suggestion = 'Increase gas price to replace the pending transaction';
    
  } else if (errorMessage.includes('transaction underpriced')) {
    errorType = 'gas';
    errorMessage = 'Transaction gas price too low';
    suggestion = 'Increase the gas price for faster processing';
  }

  // Clean up common technical prefixes
  errorMessage = errorMessage
    .replace(/^Error:\s*/i, '')
    .replace(/^MetaMask\s*-?\s*/i, '')
    .replace(/^WalletConnect\s*-?\s*/i, '')
    .replace(/^ethers\s*-?\s*/i, '');

  return {
    type: errorType,
    message: errorMessage,
    originalError,
    suggestion
  };
};

export const getErrorSeverity = (errorType: ParsedError['type']): 'low' | 'medium' | 'high' => {
  switch (errorType) {
    case 'auth':
      return 'low'; // User choice
    case 'validation':
    case 'gas':
      return 'medium'; // User can fix
    case 'network':
    case 'revert':
    case 'unknown':
      return 'high'; // Requires investigation
    default:
      return 'medium';
  }
};

export const getErrorColor = (errorType: ParsedError['type']): string => {
  switch (errorType) {
    case 'auth':
      return '#fbbf24'; // Amber - user action needed
    case 'validation':
    case 'gas':
      return '#f59e0b'; // Orange - user error
    case 'network':
      return '#3b82f6'; // Blue - network issue
    case 'revert':
      return '#ef4444'; // Red - contract error
    case 'unknown':
    default:
      return '#6b7280'; // Gray - unknown
  }
};

// Legacy function names for backward compatibility
export const parseTransactionError = parseErrorMessage;
export const formatErrorForUser = parseErrorMessage;