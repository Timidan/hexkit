// APY is a percent (8.5 = 8.5%) and already bakes in the vault's native
// compounding, so we don't compound again.
const SAFE_ZERO = 0;

export function projectBalance(
  deposit: number,
  apyPercent: number | null | undefined,
  days: number,
): number {
  if (!Number.isFinite(deposit) || deposit <= 0) return SAFE_ZERO;
  if (apyPercent === null || apyPercent === undefined || !Number.isFinite(apyPercent)) {
    return deposit;
  }
  if (!Number.isFinite(days) || days <= 0) return deposit;
  return deposit * Math.pow(1 + apyPercent / 100, days / 365);
}

export function projectEarnings(
  deposit: number,
  apyPercent: number | null | undefined,
  days: number,
): number {
  return projectBalance(deposit, apyPercent, days) - (Number.isFinite(deposit) ? deposit : 0);
}

export function sampleBalanceCurve(
  deposit: number,
  apyPercent: number | null | undefined,
  days: number,
  samples = 60,
): number[] {
  const out: number[] = new Array(samples);
  for (let i = 0; i < samples; i++) {
    const d = (days * i) / (samples - 1);
    out[i] = projectBalance(deposit, apyPercent, d);
  }
  return out;
}
