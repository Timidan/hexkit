import type { Address } from "viem";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CircleNotch, Warning, Info } from "@phosphor-icons/react";
import { DecodedLegList } from "./DecodedLegList";
import {
  DepositReceiveCards,
  type ExtraReceive,
} from "./DepositReceiveCards";
import type { SimulationResult } from "../sim/types";
import { Term } from "../components/Term";
import type { GlossaryKey } from "../glossary";

interface PreviewPanelProps {
  isLoading: boolean;
  error: Error | null;
  result: SimulationResult | undefined;
  userAddress?: Address;
  btcDeltaWei?: bigint;
  btcUsdPrice?: number;
  extraReceives?: ExtraReceive[];
}

export function PreviewPanel({
  isLoading,
  error,
  result,
  userAddress,
  btcDeltaWei,
  btcUsdPrice,
  extraReceives,
}: PreviewPanelProps) {
  if (isLoading && !result) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-zinc-950/40 px-3 py-2.5 text-sm text-zinc-400">
        <CircleNotch className="h-4 w-4 animate-spin" />
        Simulating bundle on Mezo testnet…
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        variant="destructive"
        className="border-red-500/30 bg-red-950/30"
      >
        <Warning className="h-4 w-4" />
        <AlertDescription className="text-xs text-red-100/80">
          Simulation failed: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  if (!result) {
    return (
      <div className="rounded-lg border border-dashed border-white/[0.06] bg-transparent px-3 py-6 text-center text-[12px] text-zinc-500">
        Adjust inputs to preview outcome
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <DepositReceiveCards
        legs={result.legs}
        userAddress={userAddress}
        btcDeltaWei={btcDeltaWei}
        btcUsdPrice={btcUsdPrice}
        extraReceives={extraReceives}
      />

      {result.outcome.trove && (
        <section className="flex flex-col gap-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
            Resulting <Term k="trove">trove</Term>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat
              labelKey="icr"
              label="ICR"
              value={`${(result.outcome.trove.icrBps / 100).toFixed(0)}%`}
            />
            <Stat
              labelKey="liquidation"
              label="Liquidation"
              value={`$${result.outcome.trove.liquidationPriceUsd.toFixed(0)}`}
            />
            <Stat
              labelKey="troveDebt"
              label="Debt"
              value={`${Math.round(Number(result.outcome.trove.debt) / 1e18)} MUSD`}
            />
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
          Execution plan · {result.legs.length}{" "}
          {result.legs.length === 1 ? "step" : "steps"}
        </div>
        <DecodedLegList legs={result.legs} />
      </section>

      {result.warnings.length > 0 && (
        <section className="flex flex-wrap gap-2">
          {result.warnings.map((w, i) => {
            const tone =
              w.severity === "caution"
                ? "border-red-500/30 bg-red-950/30 text-red-100/85"
                : w.severity === "warning"
                ? "border-amber-500/25 bg-amber-500/[0.04] text-amber-100/85"
                : "border-white/[0.06] bg-zinc-950/40 text-zinc-300";
            return (
              <div
                key={i}
                className={`inline-flex max-w-md items-start gap-2 rounded-md border px-3 py-1.5 text-[11px] leading-snug ${tone}`}
              >
                {w.severity === "info" ? (
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
                ) : (
                  <Warning
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                      w.severity === "caution"
                        ? "text-red-300"
                        : "text-amber-300"
                    }`}
                  />
                )}
                <span>{w.text}</span>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  labelKey,
  value,
}: {
  label: string;
  labelKey?: GlossaryKey;
  value: string;
}) {
  return (
    <div className="rounded-md border border-white/[0.06] bg-zinc-950/40 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-500">
        {labelKey ? <Term k={labelKey}>{label}</Term> : label}
      </div>
      <div className="font-mono text-sm tabular-nums text-zinc-100">
        {value}
      </div>
    </div>
  );
}
