import { ethers } from 'ethers';
import { shortenAddress } from '../components/shared/AddressDisplay';

/**
 * Shared formatting / normalization utilities.
 *
 * Any value-normalisation or display-formatting helper that is used in more
 * than one component should live here so that there is a single source of truth.
 */

// ── Value normalisation ────────────────────────────────────────────────

/**
 * Normalize a hex value (typically an address or data hash) for comparison.
 *
 * Returns null for empty / zero / dash values so callers can skip them.
 * Hex strings are lower-cased; plain strings are returned as-is.
 */
export const normalizeValue = (value: string | undefined | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "0x" || trimmed === "0x0" || trimmed === "—") return null;
  if (trimmed.startsWith("0x")) return trimmed.toLowerCase();
  return trimmed;
};

/**
 * Format a raw token amount (in smallest unit) to a human-readable decimal
 * string using the token's decimals.
 *
 * Example:
 *   formatTokenValue("1000000000000000000", 18) -> "1.0"
 *   formatTokenValue("100", 18) -> "0.0000000000000001"
 *   formatTokenValue("0", 18) -> "0.0"
 *
 * Returns the raw string unchanged if it doesn't look like a plain decimal.
 */
export function formatTokenValue(raw: string, decimals: number): string {
  // Only format plain decimal strings (positive or negative)
  if (!/^-?\d+$/.test(raw)) return raw;

  const isNegative = raw.startsWith('-');
  const abs = isNegative ? raw.slice(1) : raw;

  if (decimals <= 0) return raw;

  // Pad with leading zeros if shorter than decimals
  const padded = abs.padStart(decimals + 1, '0');
  const intPart = padded.slice(0, padded.length - decimals);
  const fracPart = padded.slice(padded.length - decimals);

  // Trim trailing zeros from fraction but keep at least one decimal place
  const trimmedFrac = fracPart.replace(/0+$/, '') || '0';

  const formatted = `${intPart}.${trimmedFrac}`;
  return isNegative ? `-${formatted}` : formatted;
}

// ── Decoded output formatting ──────────────────────────────────────────

/**
 * Format decoded function output for better readability
 * Handles various data types returned from smart contracts
 */
export const formatDecodedOutput = (output: unknown): string => {
  if (output === null || output === undefined) {
    return '—';
  }

  // Handle arrays
  if (Array.isArray(output)) {
    if (output.length === 0) return '[]';

    // If it's a tuple/struct-like array with named properties
    if (output.length === 1 && typeof output[0] === 'object' && !Array.isArray(output[0])) {
      return formatDecodedOutput(output[0]);
    }

    // Format each element
    const formatted = output.map((item, index) => {
      const value = formatDecodedOutput(item);
      return `  [${index}]: ${value}`;
    }).join('\n');

    return `[\n${formatted}\n]`;
  }

  // Handle objects (structs, tuples with named fields)
  if (typeof output === 'object') {
    const entries = Object.entries(output);

    // Check if it's a special ethers BigNumber object
    if (ethers.BigNumber.isBigNumber(output)) {
      return formatBigNumber(output);
    }

    // Filter out numeric keys (used for tuple indexing)
    const namedEntries = entries.filter(([key]) => isNaN(Number(key)));

    if (namedEntries.length === 0) {
      // Only numeric keys, treat as simple value
      const values = entries.map(([_, value]) => formatDecodedOutput(value));
      return values.length === 1 ? values[0] : values.join(', ');
    }

    // Format as key-value pairs
    const formatted = namedEntries.map(([key, value]) => {
      const formattedValue = formatDecodedOutput(value);
      return `  ${key}: ${formattedValue}`;
    }).join('\n');

    return `{\n${formatted}\n}`;
  }

  // Handle strings (addresses, hex data)
  if (typeof output === 'string') {
    // Check if it's an ethereum address
    if (output.startsWith('0x') && output.length === 42) {
      return output; // Return full address
    }

    // Check if it's a long hex string
    if (output.startsWith('0x') && output.length > 66) {
      return `${output.slice(0, 10)}...${output.slice(-8)}`;
    }

    return output;
  }

  // Handle numbers
  if (typeof output === 'number') {
    return output.toLocaleString();
  }

  // Handle booleans
  if (typeof output === 'boolean') {
    return output ? 'true' : 'false';
  }

  // Handle bigint
  if (typeof output === 'bigint') {
    return output.toString();
  }

  // Fallback to string representation
  return String(output);
};

/**
 * Format BigNumber values with appropriate units
 */
export const formatBigNumber = (value: ethers.BigNumber): string => {
  const valueStr = value.toString();

  // If it looks like Wei (18 decimals), try to format as ETH
  if (valueStr.length >= 15) {
    try {
      const eth = ethers.utils.formatEther(value);
      const ethNum = parseFloat(eth);

      // If it's a whole number or very small, show the raw value too
      if (ethNum === 0) {
        return '0';
      } else if (ethNum < 0.000001) {
        return `${ethNum.toFixed(8)} (${valueStr} Wei)`;
      } else if (ethNum >= 1000) {
        return `${ethNum.toLocaleString()} ETH`;
      } else {
        return `${ethNum} ETH`;
      }
    } catch {
      // Fall through to raw display
    }
  }

  // For smaller numbers, just show the raw value with commas
  const num = Number(valueStr);
  if (num > 1000) {
    return num.toLocaleString();
  }

  return valueStr;
};

/**
 * Format decoded input/output object with proper indentation
 */
export const formatDecodedData = (data: unknown): string => {
  try {
    if (typeof data === 'string') {
      // Try to parse if it's a JSON string
      try {
        const parsed = JSON.parse(data);
        return formatDecodedOutput(parsed);
      } catch {
        return data;
      }
    }

    return formatDecodedOutput(data);
  } catch (error) {
    return String(data);
  }
};

/**
 * Smart formatting for input/output data - handles both raw and decoded
 */
export const formatInputOutput = (value: unknown): { formatted: string; isDecoded: boolean } => {
  // Check if it's already decoded (has named properties)
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value);
    const hasNamedProperties = entries.some(([key]) => isNaN(Number(key)));

    if (hasNamedProperties) {
      return {
        formatted: formatDecodedData(value),
        isDecoded: true,
      };
    }
  }

  // Otherwise, format as-is
  if (typeof value === 'string' && value.startsWith('0x')) {
    return {
      formatted: value,
      isDecoded: false,
    };
  }

  return {
    formatted: JSON.stringify(value, null, 2),
    isDecoded: false,
  };
};

/**
 * Extract contract name from address or use a shortened address
 * @param address - Ethereum address
 * @param contractContext - Optional context with known contract information
 * @returns Formatted name or shortened address
 */
export const formatContractName = (
  address?: string | null,
  contractContext?: { address?: string; name?: string } | null
): string => {
  if (!address) return '—';

  // Check if this is the main contract in context
  if (contractContext?.address?.toLowerCase() === address.toLowerCase()) {
    return contractContext.name || shortenAddress(address);
  }

  // Check for known contracts (we can expand this)
  const knownContracts: Record<string, string> = {
    '0x0000000000000000000000000000000000000000': 'Zero Address',
    '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
    '0x6b175474e89094c44da98b954eedeac495271d0f': 'DAI',
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'WBTC',
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'WETH',
  };

  const normalized = address.toLowerCase();
  if (knownContracts[normalized]) {
    return `${knownContracts[normalized]} (${shortenAddress(address)})`;
  }

  return shortenAddress(address);
};

/**
 * Format Wei value with tooltip showing both Wei and ETH
 */
export const formatWeiWithTooltip = (weiValue?: string | null): { display: string; tooltip: string } => {
  if (!weiValue) {
    return { display: '—', tooltip: '' };
  }

  try {
    const wei = ethers.BigNumber.from(weiValue);
    const eth = ethers.utils.formatEther(wei);
    const ethNum = parseFloat(eth);

    if (ethNum === 0) {
      return { display: '0', tooltip: '0 Wei' };
    }

    // Display in ETH if it's a reasonable amount
    if (ethNum >= 0.0001) {
      return {
        display: `${ethNum.toFixed(4)} ETH`,
        tooltip: `${wei.toString()} Wei`,
      };
    }

    // For very small amounts, show Wei
    return {
      display: `${wei.toString()} Wei`,
      tooltip: `${ethNum.toFixed(8)} ETH`,
    };
  } catch {
    return { display: weiValue, tooltip: '' };
  }
};

/**
 * Format gas value with conversion
 */
export const formatGasWithConversion = (gasValue?: string | number | null): { display: string; wei?: string } => {
  if (!gasValue) {
    return { display: '—' };
  }

  const numValue = typeof gasValue === 'string' ? parseInt(gasValue, 10) : gasValue;

  if (isNaN(numValue)) {
    return { display: '—' };
  }

  return {
    display: numValue.toLocaleString(),
    wei: numValue.toString(),
  };
};
