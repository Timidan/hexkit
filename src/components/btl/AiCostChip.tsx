import { Receipt } from "@phosphor-icons/react";
import type { BtlRuntimeMeta } from "@/lib/btl/client";

/**
 * A per-call cost receipt — the cost-transparency differentiator. The $ amount
 * is the headline (green "≈ $0" for the free routes); model + fee are metadata.
 */
export function AiCostChip({ meta }: { meta?: BtlRuntimeMeta | null }) {
  if (!meta || meta.customerChargeUsd == null) return null;
  const free = meta.customerChargeUsd < 0.0001;
  const cost = free ? "≈ $0" : `$${meta.customerChargeUsd.toFixed(4)}`;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-2 py-0.5 font-mono text-[9px] leading-none text-muted-foreground"
      title={`Routed via BTL Runtime · $${meta.customerChargeUsd.toFixed(6)}${meta.requestId ? ` · ${meta.requestId}` : ""}`}
    >
      <Receipt weight="duotone" aria-hidden className="h-3 w-3 shrink-0 opacity-70" />
      <span className={`text-[11px] font-semibold ${free ? "text-emerald-400" : "text-foreground"}`}>
        {cost}
      </span>
      {meta.model && (
        <>
          <span className="opacity-30">·</span>
          <span>{meta.model}</span>
        </>
      )}
      {meta.feePct != null && (
        <>
          <span className="opacity-30">·</span>
          <span className="tabular-nums">{meta.feePct}% gw</span>
        </>
      )}
    </span>
  );
}
