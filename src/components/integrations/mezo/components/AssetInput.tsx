import { useId, useMemo } from "react";
import { formatUnits } from "viem";
import { cn } from "@/lib/utils";
import { AssetIcon, type AssetSymbol } from "./AssetIcon";

export type { AssetSymbol };

interface AssetInputProps {
  label: string;
  symbol: AssetSymbol;
  value: string;
  onChange: (next: string) => void;
  step?: string;
  helper?: string;
  balance?: bigint;
  balanceDecimals?: number;
  usdValue?: number;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  /**
   * `deposit` (default) warns when value > balance. `receive` (e.g. MUSD
   * borrow) suppresses the warning but still shows the wallet balance.
   */
  intent?: "deposit" | "receive";
}

function formatBalance(value: bigint, decimals: number, precision = 4): string {
  const n = Number(formatUnits(value, decimals));
  if (!Number.isFinite(n)) return "0";
  if (n === 0) return "0";
  if (n < 0.0001) return n.toExponential(2);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision,
  });
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "$0.00";
  if (Math.abs(n) < 0.01) return "< $0.01";
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function AssetInput({
  label,
  symbol,
  value,
  onChange,
  step = "0.001",
  helper,
  balance,
  balanceDecimals = 18,
  usdValue,
  disabled,
  invalid,
  className,
  intent = "deposit",
}: AssetInputProps) {
  const id = useId();
  const hasBalance = balance !== undefined && balance > 0n;

  const handleMax = () => {
    if (balance === undefined) return;
    onChange(formatUnits(balance, balanceDecimals));
  };

  const exceedsBalance = useMemo(() => {
    if (intent !== "deposit") return false;
    if (balance === undefined) return false;
    if (!value || !value.trim()) return false;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return false;
    const balanceFloat = Number(formatUnits(balance, balanceDecimals));
    // 0.1% tolerance — avoids tripping the warning when the on-chain
    // balance is a few wei under the displayed rounded value.
    return n > balanceFloat * 1.001;
  }, [intent, value, balance, balanceDecimals]);

  const isInvalid = invalid || exceedsBalance;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-2 px-0.5">
        <label
          htmlFor={id}
          className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500"
        >
          {label}
        </label>
        {balance !== undefined && (
          <button
            type="button"
            onClick={handleMax}
            disabled={!hasBalance || disabled}
            className="group flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500 transition-colors hover:text-zinc-200 disabled:cursor-default disabled:hover:text-zinc-500"
          >
            <span>Balance</span>
            <span className="font-mono tabular-nums text-zinc-300">
              {formatBalance(balance, balanceDecimals)}
            </span>
            {hasBalance && (
              <span className="rounded-[3px] border border-white/10 px-1 py-px text-[9px] tracking-wider text-zinc-400 transition-colors group-hover:border-white/30 group-hover:text-zinc-100">
                MAX
              </span>
            )}
          </button>
        )}
      </div>

      <div
        className={cn(
          "group relative flex items-center gap-3 rounded-lg border bg-zinc-950/40 px-4 py-3 transition-all",
          isInvalid
            ? "border-red-500/40 ring-1 ring-red-500/20"
            : "border-white/[0.07] hover:border-white/15 focus-within:border-white/30 focus-within:bg-zinc-950/60",
          disabled && "opacity-50",
        )}
      >
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="0.00"
          className="min-w-0 flex-1 bg-transparent font-mono text-2xl font-light tabular-nums tracking-tight text-zinc-50 outline-none placeholder:text-zinc-700 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <div className="flex shrink-0 items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 transition-colors group-hover:border-white/15 group-hover:bg-white/[0.06]">
          <AssetIcon symbol={symbol} size="sm" noTooltip />
          <span className="font-mono text-xs font-medium tracking-wide text-zinc-100">
            {symbol}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-0.5 min-h-[14px]">
        {exceedsBalance ? (
          <p className="text-[11px] leading-tight text-red-400">
            Exceeds balance · simulation runs with override but tx will revert
          </p>
        ) : helper ? (
          <p className="text-[11px] leading-tight text-zinc-500">{helper}</p>
        ) : (
          <span />
        )}
        {usdValue !== undefined && (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">
            ≈ {formatUsd(usdValue)}
          </span>
        )}
      </div>
    </div>
  );
}
