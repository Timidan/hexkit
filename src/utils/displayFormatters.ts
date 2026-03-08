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

