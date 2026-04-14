import React, { useState } from "react";
import { X, ChartLineUp } from "@phosphor-icons/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import type { EarnVault } from "../types";
import {
  HORIZON_MAX,
  HORIZON_MIN,
  HORIZON_PRESETS,
  useSimulatorState,
  type SimulatorState,
} from "./useSimulatorState";
import { formatApyPercent, formatDays, formatToken } from "./formatters";

const DISCLAIMER =
  "Projection assumes the current APY stays constant. Actual yield can change.";

function DepositInput({ state, id }: { state: SimulatorState; id: string }) {
  return (
    <div className="flex items-center rounded-md border border-border/60 bg-background focus-within:ring-2 focus-within:ring-ring/40">
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={Number.isFinite(state.amount) ? state.amount : ""}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          state.setAmount(Number.isFinite(v) ? v : 0);
        }}
        className="border-0 shadow-none focus-visible:ring-0 tabular-nums"
      />
      <span className="pr-3 text-xs text-muted-foreground select-none">
        {state.symbol}
      </span>
    </div>
  );
}

function HorizonPresets({ state }: { state: SimulatorState }) {
  const active =
    HORIZON_PRESETS.find((p) => p.days === state.days)?.label ?? "";
  return (
    <ToggleGroup
      type="single"
      value={active}
      onValueChange={(val) => {
        const preset = HORIZON_PRESETS.find((p) => p.label === val);
        if (preset) state.setDays(preset.days);
      }}
      size="sm"
      variant="outline"
      spacing={4}
      className="flex-wrap"
    >
      {HORIZON_PRESETS.map((p) => (
        <ToggleGroupItem key={p.label} value={p.label} className="px-2 text-xs">
          {p.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function StatRow({
  label,
  value,
  emphasis = false,
  accent = false,
}: {
  label: string;
  value: React.ReactNode;
  emphasis?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={[
          "tabular-nums",
          emphasis ? "text-base font-semibold" : "text-sm",
          accent ? "text-emerald-500" : "text-foreground",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

export function VaultPositionSimulator({
  vault,
  onClose,
}: {
  vault: EarnVault;
  onClose?: () => void;
}) {
  const state = useSimulatorState(vault);

  return (
    <div className="w-[360px] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Forecast</h3>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {formatApyPercent(state.apyPercent)} APY
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {vault.name ?? vault.slug} · {vault.protocol.name}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close forecast"
            className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="vps-amount" className="text-xs">
            Deposit
          </Label>
          <DepositInput state={state} id="vps-amount" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Horizon</Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatDays(state.days)}
            </span>
          </div>
          <Slider
            min={HORIZON_MIN}
            max={HORIZON_MAX}
            step={1}
            value={[state.days]}
            onValueChange={([v]) => state.setDays(v)}
          />
          <HorizonPresets state={state} />
        </div>

        <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2">
          <StatRow
            label="Projected balance"
            value={formatToken(state.projectedBalance, state.symbol)}
            emphasis
          />
          <StatRow
            label="Earnings"
            value={`+${formatToken(state.projectedEarnings, state.symbol)}`}
            accent
          />
          <StatRow
            label="APY used"
            value={formatApyPercent(state.apyPercent)}
          />
        </div>

        <p className="text-[11px] leading-snug text-muted-foreground">
          {DISCLAIMER}
        </p>
      </div>
    </div>
  );
}

export interface VaultForecastButtonProps {
  vault: EarnVault;
  triggerClassName?: string;
  iconOnly?: boolean;
  label?: string;
  // Consumers rely on this to keep the trigger mounted while the popover is
  // open — otherwise the hover-reveal footer unmounts and Radix loses its anchor.
  onOpenChange?: (open: boolean) => void;
}

export function VaultForecastButton({
  vault,
  triggerClassName,
  iconOnly = false,
  label = "Forecast",
  onOpenChange,
}: VaultForecastButtonProps) {
  const [open, setOpen] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={stop}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") e.stopPropagation();
          }}
          aria-label={label}
          className={
            triggerClassName ??
            (iconOnly
              ? "flex h-7 w-7 items-center justify-center rounded-md border border-border/50 bg-muted/30 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              : "flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border/50 bg-muted/30 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground")
          }
        >
          <ChartLineUp className="h-3 w-3" />
          {!iconOnly && <span>{label}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        onInteractOutside={(e) => e.preventDefault()}
        onClick={stop}
        className="w-auto p-0"
      >
        <VaultPositionSimulator vault={vault} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
