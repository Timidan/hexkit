import { useMemo, useState } from "react";
import type { EarnVault } from "../types";
import { projectBalance, projectEarnings } from "./projection";

export interface SimulatorState {
  vault: EarnVault;
  amount: number;
  setAmount: (n: number) => void;
  days: number;
  setDays: (d: number) => void;
  symbol: string;
  apyPercent: number | null;
  projectedBalance: number;
  projectedEarnings: number;
}

const DEFAULT_DAYS = 365;
const DEFAULT_AMOUNT = 1000;

export function useSimulatorState(vault: EarnVault): SimulatorState {
  const [amount, setAmount] = useState<number>(DEFAULT_AMOUNT);
  const [days, setDays] = useState<number>(DEFAULT_DAYS);

  const symbol = vault.underlyingTokens[0]?.symbol ?? "TOKEN";
  const apyPercent = vault.analytics.apy.total;

  const projectedBalance = useMemo(
    () => projectBalance(amount, apyPercent, days),
    [amount, apyPercent, days],
  );
  const projectedEarnings = useMemo(
    () => projectEarnings(amount, apyPercent, days),
    [amount, apyPercent, days],
  );

  return {
    vault,
    amount,
    setAmount,
    days,
    setDays,
    symbol,
    apyPercent,
    projectedBalance,
    projectedEarnings,
  };
}

export const HORIZON_PRESETS: Array<{ label: string; days: number }> = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
];

export const HORIZON_MIN = 1;
export const HORIZON_MAX = 1825;
