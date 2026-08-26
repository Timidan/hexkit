// fillDeadline = solver fill cutoff; expires = refund unlock on origin.
// Refund is only callable after `expires`; the gap is oracle settlement grace.
export interface DeadlinePlan {
  nowSec: number;
  quoteValidUntilSec: number | null;
  fillDeadline: number;
  expires: number;
}

interface DeadlineInput {
  quoteValidUntil?: string | number | null;
  nowMs?: number;
  maxFillTtlSec?: number;
  refundGraceSec?: number;
}

// Minimum window we require between "now" and the fill cutoff, both when the
// plan is built and again immediately before open() is signed.
export const MIN_FILL_WINDOW_SEC = 30;

// The API documents `validUntil` as a numeric Unix timestamp, but has shipped
// ISO strings too. Date.parse returns NaN for numeric input in either unit, so
// dispatch on shape rather than feeding everything to Date.parse.
export function parseQuoteValidUntil(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;

  const asNumber =
    typeof value === "number"
      ? value
      : /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : null;

  if (asNumber !== null) {
    if (!Number.isFinite(asNumber) || asNumber <= 0) return null;
    // Anything beyond ~year 5138 in seconds is really milliseconds.
    return Math.floor(asNumber > 1e11 ? asNumber / 1000 : asNumber);
  }

  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

// Throws if the quote's fill window has closed (or is about to) since the plan
// was built. Callers must run this immediately before signing open().
export function assertFillWindowOpen(fillDeadline: number, nowMs?: number): void {
  const nowSec = Math.floor((nowMs ?? Date.now()) / 1000);
  if (fillDeadline <= nowSec + MIN_FILL_WINDOW_SEC) {
    throw new Error(
      "This quote expired before the order was opened — request a new quote.",
    );
  }
}

export function buildDeadlinePlan(args: DeadlineInput = {}): DeadlinePlan {
  const nowSec = Math.floor((args.nowMs ?? Date.now()) / 1000);

  const quoteValidUntilSec = parseQuoteValidUntil(args.quoteValidUntil);

  const maxFillTtl = args.maxFillTtlSec ?? 15 * 60;
  const grace = args.refundGraceSec ?? 30 * 60;

  const fillDeadline = quoteValidUntilSec
    ? Math.min(quoteValidUntilSec, nowSec + maxFillTtl)
    : nowSec + maxFillTtl;

  if (fillDeadline <= nowSec + MIN_FILL_WINDOW_SEC) {
    throw new Error("quote too close to expiry to safely open an order");
  }

  return {
    nowSec,
    quoteValidUntilSec,
    fillDeadline,
    expires: fillDeadline + grace,
  };
}
