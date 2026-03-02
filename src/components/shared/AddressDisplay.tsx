/**
 * Shared AddressDisplay component — replaces scattered address.slice(0,6)...slice(-4) patterns.
 *
 * Provides:
 * - Consistent truncation (configurable)
 * - Copy-to-clipboard on click
 * - Tooltip with full address
 * - Zero-address label
 * - Monospace font for addresses
 */

import React, { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export interface AddressDisplayProps {
  address: string | null | undefined;
  /** Number of leading hex chars to show (default 6, includes 0x) */
  prefixLength?: number;
  /** Number of trailing hex chars to show (default 4) */
  suffixLength?: number;
  /** Show copy icon on hover (default true) */
  copyable?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** If true, renders as inline span instead of flex container */
  inline?: boolean;
  /** Optional label override (e.g. contract name) */
  label?: string;
}

/** Pure utility: truncate an address string consistently */
export function shortenAddress(
  address: string | null | undefined,
  prefixLength = 6,
  suffixLength = 4,
): string {
  if (!address) return '\u2014';
  if (address.toLowerCase() === ZERO_ADDRESS) return 'Zero Address';
  if (address.length <= prefixLength + suffixLength + 2) return address;
  return `${address.slice(0, prefixLength)}\u2026${address.slice(-suffixLength)}`;
}

/** Pure utility: truncate a hex hash (tx hash, slot, etc.) */
export function shortenHash(
  hash: string | null | undefined,
  prefixLength = 10,
  suffixLength = 6,
): string {
  if (!hash) return '\u2014';
  if (hash.length <= prefixLength + suffixLength + 2) return hash;
  return `${hash.slice(0, prefixLength)}\u2026${hash.slice(-suffixLength)}`;
}

export const AddressDisplay: React.FC<AddressDisplayProps> = ({
  address,
  prefixLength = 6,
  suffixLength = 4,
  copyable = true,
  className = '',
  inline = false,
  label,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [address]);

  if (!address) {
    return <span className={`text-muted-foreground ${className}`}>{'\u2014'}</span>;
  }

  const displayText = label || shortenAddress(address, prefixLength, suffixLength);
  const isZero = address.toLowerCase() === ZERO_ADDRESS;

  if (inline) {
    return (
      <span
        className={`font-mono cursor-pointer ${isZero ? 'text-muted-foreground' : ''} ${className}`}
        title={address}
        onClick={copyable ? handleCopy : undefined}
      >
        {displayText}
        {copied && <Check className="h-3 w-3 inline ml-1 text-green-500" />}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono group ${isZero ? 'text-muted-foreground' : ''} ${className}`}
      title={address}
    >
      <span>{displayText}</span>
      {copyable && (
        <button
          type="button"
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0 border-0 bg-transparent cursor-pointer"
          aria-label="Copy address"
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
      )}
    </span>
  );
};

export default AddressDisplay;
