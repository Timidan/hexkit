export function formatToken(amount: number, symbol: string, decimals = 4): string {
  if (!Number.isFinite(amount)) return `— ${symbol}`;
  const abs = Math.abs(amount);
  let d = decimals;
  if (abs >= 1000) d = 2;
  else if (abs >= 1) d = 4;
  else d = 6;
  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  })} ${symbol}`;
}

export function formatApyPercent(apyPercent: number | null | undefined): string {
  if (apyPercent === null || apyPercent === undefined || !Number.isFinite(apyPercent)) {
    return "—";
  }
  return `${apyPercent.toFixed(2)}%`;
}

export function formatDays(days: number): string {
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  const y = days / 365;
  return y === Math.round(y) ? `${y}y` : `${y.toFixed(1)}y`;
}
