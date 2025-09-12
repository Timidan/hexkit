// Error message parsing utilities for better user experience

export interface ParsedError {
  type: 'REVERT' | 'GAS' | 'NETWORK' | 'WALLET' | 'UNKNOWN';
  title: string;
  message: string;
  details?: string;
  suggestion?: string;
}

export const parseTransactionError = (error: any): ParsedError => {
  const errorString = error?.message || error?.toString() || 'Unknown error';
  
  // Extract revert reason from various error formats
  const revertReason = extractRevertReason(errorString);
  if (revertReason) {
    return {
      type: 'REVERT',
      title: 'Transaction Reverted',
      message: revertReason,
      details: revertReason
    };
  }

  // Gas estimation errors
  if (errorString.includes('cannot estimate gas') || error?.code === 'UNPREDICTABLE_GAS_LIMIT') {
    const gasRevertReason = extractRevertReason(errorString);
    return {
      type: 'GAS',
      title: 'Gas Estimation Failed',
      message: gasRevertReason || 'Transaction will likely fail',
      details: errorString
    };
  }

  // Network errors
  if (errorString.includes('network') || errorString.includes('connection') || error?.code === 'NETWORK_ERROR') {
    return {
      type: 'NETWORK',
      title: 'Network Error',
      message: 'Failed to connect to blockchain',
      details: errorString
    };
  }

  // Wallet errors
  if (errorString.includes('user rejected') || errorString.includes('denied') || error?.code === 4001) {
    return {
      type: 'WALLET',
      title: 'Transaction Cancelled',
      message: 'User cancelled the transaction'
    };
  }

  if (errorString.includes('insufficient funds')) {
    return {
      type: 'WALLET',
      title: 'Insufficient Funds',
      message: 'Not enough ETH to complete transaction'
    };
  }

  // Fallback for unknown errors
  return {
    type: 'UNKNOWN',
    title: 'Transaction Error',
    message: errorString.length > 100 ? errorString.substring(0, 100) + '...' : errorString,
    details: errorString
  };
};

const extractRevertReason = (errorString: string): string | null => {
  // Pattern 1: execution reverted: {reason}
  const revertMatch = errorString.match(/execution reverted: (.+?)(?:\s*\[|$)/);
  if (revertMatch) {
    return revertMatch[1].trim();
  }

  // Pattern 2: revert {reason}
  const revertMatch2 = errorString.match(/revert (.+?)(?:\s*\[|$)/);
  if (revertMatch2) {
    return revertMatch2[1].trim();
  }

  // Pattern 3: reason="{reason}"
  const reasonMatch = errorString.match(/reason="([^"]+)"/);
  if (reasonMatch) {
    return reasonMatch[1].trim();
  }

  // Pattern 4: Look for common error messages
  const commonErrors = [
    'transfer amount exceeds balance',
    'insufficient allowance',
    'transfer to the zero address',
    'burn amount exceeds balance',
    'approve to the zero address',
    'ERC20: transfer from the zero address',
    'ERC20: mint to the zero address',
    'SafeMath: subtraction overflow',
    'SafeMath: addition overflow',
    'Ownable: caller is not the owner',
    'Pausable: paused',
    'not authorized'
  ];

  for (const commonError of commonErrors) {
    if (errorString.toLowerCase().includes(commonError.toLowerCase())) {
      return commonError;
    }
  }

  return null;
};


export const formatErrorForUser = (parsedError: ParsedError): string => {
  return parsedError.message;
};