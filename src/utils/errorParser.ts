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

export interface ClassifiedSimulationError {
  type: 'rpc' | 'bridge' | 'state' | 'config' | 'network' | 'unknown';
  message: string;
  suggestion?: string;
  technicalDetails: string;
}

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

/**
 * Extract the innermost human-readable message from nested Rust/EDB error strings.
 * E.g. 'engine error: ... Database(EdbDBError { message: "Transport error: ..." })'
 * → 'Transport error: ...'
 */
function extractInnerMessage(raw: string): string {
  // Match Rust struct pattern: SomeType { message: "..." }
  const rustMsgMatch = raw.match(/message:\s*"([^"]+)"/);
  if (rustMsgMatch) return rustMsgMatch[1];

  // Match 'error code -32000: <message>'
  const rpcCodeMatch = raw.match(/error code -?\d+:\s*(.+?)(?:"|$)/);
  if (rpcCodeMatch) return rpcCodeMatch[1].trim();

  // Strip common engine prefixes to get to the useful part
  const stripped = raw
    .replace(/^engine error:\s*/i, '')
    .replace(/^engine preparation failed:\s*/i, '')
    .replace(/^Failed to inspect the target transaction:\s*/i, '')
    .replace(/^Database\(EdbDBError\s*\{\s*message:\s*"/i, '')
    .replace(/"\s*\}\s*\)\s*$/i, '');

  return stripped.replace(/\s+Location:\s+.*$/is, '').trim();
}

/**
 * Classify bridge/simulation/RPC errors into user-friendly messages.
 * Use this for errors originating from the EDB bridge, RPC providers,
 * or simulation infrastructure — NOT for wallet/transaction errors (use parseError for those).
 */
export const classifySimulationError = (rawError: string): ClassifiedSimulationError => {
  const extracted = extractInnerMessage(rawError);
  const lower = `${rawError}\n${extracted}`.toLowerCase();

  // Provider-side request timeout / tier limitations
  if (
    lower.includes('request timeout on the free tier') ||
    lower.includes('upgrade your tier') ||
    (lower.includes('http error 408') && lower.includes('transport error'))
  ) {
    return {
      type: 'rpc',
      message: 'Your RPC provider timed out serving this historical replay.',
      suggestion: 'This provider tier may not support this archival query. Use a paid archival tier or switch to a different archive RPC in Settings.',
      technicalDetails: rawError,
    };
  }

  // Historical state not available (non-archival RPC)
  if (
    (lower.includes('historical state') && lower.includes('not available')) ||
    lower.includes('missing trie node') ||
    lower.includes("state histories haven't been fully indexed yet")
  ) {
    return {
      type: 'state',
      message: "The RPC node doesn't have historical data for this block.",
      suggestion: 'Configure an archive RPC node in Settings, or use Alchemy/Infura with an API key.',
      technicalDetails: rawError,
    };
  }

  // Rate limiting
  if (lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('429')) {
    return {
      type: 'rpc',
      message: 'RPC provider rate limit reached.',
      suggestion: 'Wait a moment and retry, or add your own API key in Settings > RPC.',
      technicalDetails: rawError,
    };
  }

  // Response too large
  if (lower.includes('exceeds maximum size') || lower.includes('body_too_large') || lower.includes('too large')) {
    return {
      type: 'bridge',
      message: 'Transaction data is too large to simulate.',
      suggestion: 'Try a simpler transaction or reduce the call data size.',
      technicalDetails: rawError,
    };
  }

  // Bridge unreachable / connection refused
  if (lower.includes('bridge_unreachable') || lower.includes('econnrefused') || lower.includes('connect econnrefused')) {
    return {
      type: 'bridge',
      message: 'Simulation engine is currently unavailable.',
      suggestion: 'Please try again in a few moments.',
      technicalDetails: rawError,
    };
  }

  // Debug bootstrap must return a live keep-alive session
  if (lower.includes('debug_bootstrap_failed') || lower.includes('no_live_session_returned')) {
    return {
      type: 'bridge',
      message: 'Live debugger could not be prepared for this simulation.',
      suggestion: 'Retry with Debug enabled, and verify the EDB bridge is healthy.',
      technicalDetails: rawError,
    };
  }

  // Timeout
  if (lower.includes('bridge_timeout') || lower.includes('timeout') || lower.includes('timed out')) {
    return {
      type: 'network',
      message: 'Simulation timed out.',
      suggestion: 'The transaction may be too complex. Try again or simplify the call.',
      technicalDetails: rawError,
    };
  }

  // Transport / connection errors to RPC
  if (lower.includes('transport error') || lower.includes('connection refused') || lower.includes('fetch failed') || lower.includes('network error')) {
    return {
      type: 'network',
      message: 'Failed to connect to the RPC node.',
      suggestion: 'Check your internet connection or try a different RPC provider in Settings.',
      technicalDetails: rawError,
    };
  }

  if (lower.includes('target transaction not found')) {
    return {
      type: 'network',
      message: 'Transaction not found on the selected network.',
      suggestion: 'Switch to the correct network and try the replay again.',
      technicalDetails: rawError,
    };
  }

  if (lower.includes('could not detect network') || lower.includes('nonetwork')) {
    return {
      type: 'network',
      message: 'Could not connect to the configured RPC for this network.',
      suggestion: 'Switch to App Default RPC or configure a custom RPC in Settings.',
      technicalDetails: rawError,
    };
  }

  // Rust/EDB engine errors with nested messages
  if (lower.includes('engine error') || lower.includes('edbdberror') || lower.includes('engine preparation failed')) {
    const inner = extractInnerMessage(rawError);
    // Re-classify the inner message if it matches a known pattern
    const innerLower = inner.toLowerCase();
    if (innerLower.includes('historical state') && innerLower.includes('not available')) {
      return {
        type: 'state',
        message: "The RPC node doesn't have historical data for this block.",
        suggestion: 'Configure an archive RPC node in Settings, or use Alchemy/Infura with an API key.',
        technicalDetails: rawError,
      };
    }
    if (innerLower.includes('rate limit') || innerLower.includes('too many requests')) {
      return {
        type: 'rpc',
        message: 'RPC provider rate limit reached.',
        suggestion: 'Wait a moment and retry, or add your own API key in Settings > RPC.',
        technicalDetails: rawError,
      };
    }
    return {
      type: 'bridge',
      message: inner !== rawError ? inner : 'Simulation engine encountered an internal error.',
      suggestion: 'Try changing your RPC provider in Settings or try again.',
      technicalDetails: rawError,
    };
  }

  // Generic RPC error codes
  if (lower.includes('error code -32')) {
    const inner = extractInnerMessage(rawError);
    return {
      type: 'rpc',
      message: inner !== rawError ? inner : 'RPC provider returned an error.',
      suggestion: 'Try a different RPC provider or check your RPC settings.',
      technicalDetails: rawError,
    };
  }

  // No RPC configured
  if (lower.includes('no rpc') || lower.includes('no rpc url configured')) {
    return {
      type: 'config',
      message: 'No RPC URL available for this network.',
      suggestion: 'Switch to Default mode or configure a custom RPC in Settings > RPC.',
      technicalDetails: rawError,
    };
  }

  // Simulation failed (generic bridge response)
  if (lower === 'simulation failed') {
    return {
      type: 'bridge',
      message: 'Simulation failed.',
      suggestion: 'Check your transaction parameters and try again.',
      technicalDetails: rawError,
    };
  }

  // Unknown — pass through but clean up
  const cleaned = extractInnerMessage(rawError);
  return {
    type: 'unknown',
    message: cleaned.length > 200 ? cleaned.slice(0, 200) + '...' : cleaned,
    technicalDetails: rawError,
  };
};
