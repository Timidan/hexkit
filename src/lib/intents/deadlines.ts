// fillDeadline = solver fill cutoff; expires = refund unlock on origin.
// Refund is only callable after `expires`; the gap is oracle settlement grace.
export interface DeadlinePlan {
  nowSec: number;
  quoteValidUntilSec: number | null;
  fillDeadline: number;
  expires: number;
}

interface DeadlineInput {
  quoteValidUntilIso?: string | null;
  nowMs?: number;
  maxFillTtlSec?: number;
  refundGraceSec?: number;
}

export function buildDeadlinePlan(args: DeadlineInput = {}): DeadlinePlan {
  const nowSec = Math.floor((args.nowMs ?? Date.now()) / 1000);

  let quoteValidUntilSec: number | null = null;
  if (args.quoteValidUntilIso) {
    const parsed = Date.parse(args.quoteValidUntilIso);
    if (Number.isFinite(parsed)) {
      quoteValidUntilSec = Math.floor(parsed / 1000);
    }
  }

  const maxFillTtl = args.maxFillTtlSec ?? 15 * 60;
  const grace = args.refundGraceSec ?? 30 * 60;

  const fillDeadline = quoteValidUntilSec
    ? Math.min(quoteValidUntilSec, nowSec + maxFillTtl)
    : nowSec + maxFillTtl;

  if (fillDeadline <= nowSec + 30) {
    throw new Error("quote too close to expiry to safely open an order");
  }

  return {
    nowSec,
    quoteValidUntilSec,
    fillDeadline,
    expires: fillDeadline + grace,
  };
}
