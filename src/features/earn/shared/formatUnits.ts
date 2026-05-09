/**
 * Local formatUnits — replaces a thin viem import so Earn shell code stays
 * off any family-specific SDK. Mirrors viem's semantics closely: it turns a
 * raw bigint into a decimal string without trailing zeros being aggressive,
 * using exactly `decimals` fractional digits of precision then returning the
 * same shape viem would (no scientific notation, no locale formatting).
 *
 * Callers should NOT use this for user-facing display formatting — it's a
 * bigint → string converter. Display formatting is the consumer's job.
 */

export function formatUnits(raw: bigint, decimals: number): string {
  if (decimals === 0) return raw.toString();
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const asStr = abs.toString();
  const pad = asStr.padStart(decimals + 1, "0");
  const whole = pad.slice(0, pad.length - decimals);
  const fraction = pad.slice(pad.length - decimals).replace(/0+$/, "");
  const body = fraction.length > 0 ? `${whole}.${fraction}` : whole;
  return negative ? `-${body}` : body;
}
