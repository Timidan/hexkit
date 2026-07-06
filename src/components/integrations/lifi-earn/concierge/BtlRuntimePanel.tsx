import { Receipt } from "@phosphor-icons/react";
import type { BtlRuntimeMeta } from "@/lib/btl/client";

/**
 * Session cost receipt across the idle-sweep fan-out — the aggregate total is
 * the hero (green "≈ $0" when it rounds to nothing). Cost/routing, not savings.
 */
export function BtlRuntimePanel({ metas }: { metas: BtlRuntimeMeta[] }) {
  const priced = metas.filter((m) => m.customerChargeUsd != null);
  if (priced.length === 0) return null;
  const total = priced.reduce((s, m) => s + (m.customerChargeUsd ?? 0), 0);
  const models = Array.from(new Set(priced.map((m) => m.model).filter(Boolean)));
  const free = total < 0.0001;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/40 px-3 py-2">
      <Receipt weight="duotone" aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          BTL Runtime · {priced.length} {priced.length === 1 ? "call" : "calls"}
        </div>
        <div className="truncate font-mono text-[10px] text-muted-foreground/80">
          {models.join(" · ") || "—"}
        </div>
      </div>
      <div
        className={`ml-auto font-mono text-sm font-semibold tabular-nums ${free ? "text-emerald-400" : "text-foreground"}`}
      >
        {free ? "≈ $0" : `$${total.toFixed(4)}`}
      </div>
    </div>
  );
}
