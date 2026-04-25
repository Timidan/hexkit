import React from "react";
import { formatUnits } from "../../../../features/earn/shared/formatUnits";
import { Checkbox } from "../../../../components/ui/checkbox";
import ChainIcon from "../../../icons/ChainIcon";
import { TokenIcon } from "../TokenIcon";
import type { IdleAsset, SelectedSource } from "./types";

interface IdleAssetsTableProps {
  assets: IdleAsset[];
  // key = `${chainId}:${tokenAddress}`
  selections: Map<string, SelectedSource>;
  onToggle: (asset: IdleAsset, on: boolean) => void;
  onAmountChange: (asset: IdleAsset, percent: number) => void;
  isLoading?: boolean;
}

export function keyForAsset(a: IdleAsset): string {
  return `${a.chainId}:${a.token.address.toLowerCase()}`;
}

export function IdleAssetsTable({
  assets,
  selections,
  onToggle,
  onAmountChange,
  isLoading = false,
}: IdleAssetsTableProps) {
  if (isLoading && assets.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-44 animate-pulse rounded-xl border border-border/40 bg-muted/20"
          />
        ))}
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-background/30 p-4 text-center text-xs text-muted-foreground">
        No idle balances found on any LI.FI-supported chain.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {assets.map((asset) => {
        const key = keyForAsset(asset);
        const sel = selections.get(key);
        const selected = !!sel;
        const percent = sel ? percentFromRaw(asset, sel.amountRaw) : 100;
        const liveAmountDecimal = decimalFromPercent(asset, percent);
        const liveUsd =
          asset.amountUsd != null ? (asset.amountUsd * percent) / 100 : null;

        return (
          <div
            key={key}
            className={`relative flex flex-col rounded-xl border bg-card transition-colors ${
              selected
                ? "border-emerald-500/60"
                : "border-border/50 hover:border-border/70"
            }`}
          >
            <div className="absolute top-2 left-2 z-10">
              <Checkbox
                checked={selected}
                onCheckedChange={(v) => onToggle(asset, !!v)}
                aria-label={`Select ${asset.token.symbol} on ${asset.chainName}`}
              />
            </div>

            <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full border border-border/40 bg-background/80 backdrop-blur-sm px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <ChainIcon chainId={asset.chainId} size={12} rounded={6} />
              <span>{asset.chainName}</span>
            </div>

            <div className="flex flex-col items-center gap-2 px-4 pt-8 pb-3">
              <TokenIcon
                token={asset.token}
                chainId={asset.chainId}
                className="h-11 w-11 rounded-full border-2 border-background bg-muted object-contain"
              />
              <p className="text-sm font-semibold leading-tight">
                {asset.token.symbol}
              </p>
            </div>

            <div className="mx-3 mb-3 rounded-lg border border-border/30 bg-muted/30 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={percent}
                  disabled={!selected}
                  onChange={(e) =>
                    onAmountChange(asset, Number(e.target.value))
                  }
                  className="h-1 flex-1 accent-emerald-500 disabled:opacity-40"
                  aria-label={`Deploy percentage for ${asset.token.symbol} on ${asset.chainName}`}
                  aria-valuetext={`${percent}%`}
                />
                <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">
                  {percent}%
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-2 tabular-nums">
                <span
                  className={`text-sm font-semibold truncate ${
                    selected ? "text-foreground" : "text-muted-foreground"
                  }`}
                  title={`${liveAmountDecimal} ${asset.token.symbol}`}
                >
                  {liveAmountDecimal}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  ≈ {liveUsd != null ? formatUsd(liveUsd) : "$—"}
                </span>
              </div>
              <div
                className="mt-0.5 truncate text-[10px] text-muted-foreground/70"
                title={`of ${asset.amountDecimal} ${asset.token.symbol}`}
              >
                of {asset.amountDecimal}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function percentFromRaw(asset: IdleAsset, selRaw: string): number {
  try {
    const full = BigInt(asset.amountRaw);
    const sel = BigInt(selRaw);
    if (full === 0n) return 0;
    return Number((sel * 100n) / full);
  } catch {
    return 0;
  }
}

export function rawFromPercent(asset: IdleAsset, percent: number): string {
  try {
    const full = BigInt(asset.amountRaw);
    const p = BigInt(Math.max(0, Math.min(100, Math.round(percent))));
    return ((full * p) / 100n).toString();
  } catch {
    return "0";
  }
}

function decimalFromPercent(asset: IdleAsset, percent: number): string {
  try {
    const raw = BigInt(rawFromPercent(asset, percent));
    const formatted = formatUnits(raw, asset.token.decimals);
    return trimDecimal(formatted);
  } catch {
    return "0";
  }
}

function trimDecimal(s: string): string {
  if (!s.includes(".")) return s;
  const [whole, frac] = s.split(".");
  const clipped = frac.slice(0, 6).replace(/0+$/, "");
  return clipped.length > 0 ? `${whole}.${clipped}` : whole;
}

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "$—";
  if (n > 0 && n < 0.01) return "<$0.01";
  return usdFormatter.format(n);
}
