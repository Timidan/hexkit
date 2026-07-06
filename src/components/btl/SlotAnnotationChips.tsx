import { Warning } from "@phosphor-icons/react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

export interface SlotAnnotation {
  slot?: string | null;
  label?: string | null;
  note: string;
  unusual?: boolean;
}

function shortSlot(slot?: string | null): string {
  if (!slot) return "?";
  if (slot.startsWith("0x") && slot.length > 12) {
    return `${slot.slice(0, 6)}…${slot.slice(-4)}`;
  }
  return slot;
}

/**
 * Storage slot annotations as hoverable chips — one per slot, the model's note
 * revealed on hover. "Unusual" slots get an amber accent so anomalies pop.
 */
export function SlotAnnotationChips({
  slots,
  summary,
}: {
  slots: SlotAnnotation[];
  summary?: string | null;
}) {
  if (!slots || slots.length === 0) {
    return <p className="text-muted-foreground">No slot annotations.</p>;
  }
  const unusualCount = slots.filter((s) => s.unusual).length;
  // Surface anomalies first so a judge sees them the instant the panel renders.
  const ordered = [...slots].sort((a, b) => Number(!!b.unusual) - Number(!!a.unusual));

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] text-muted-foreground">
        Hover a slot for its annotation.
        {unusualCount > 0 && (
          <span className="ml-1 text-amber-300">
            {unusualCount} flagged unusual.
          </span>
        )}
      </p>

      <TooltipProvider delayDuration={100}>
        <div className="flex flex-wrap gap-1.5">
          {ordered.map((s, i) => (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={
                    "inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[11px] transition-colors cursor-help " +
                    (s.unusual
                      ? "border-amber-500/50 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 hover:border-amber-400/70"
                      : "border-border/50 bg-background/40 text-foreground/80 hover:border-foreground/40")
                  }
                >
                  {s.unusual && (
                    <Warning weight="fill" className="h-3 w-3 text-amber-400" />
                  )}
                  <span>{s.label || shortSlot(s.slot)}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <div className="space-y-1">
                  <div className="font-mono text-[10px] text-muted-foreground">
                    slot <span className="break-all">{s.slot || "?"}</span>
                    {s.label ? ` · ${s.label}` : ""}
                  </div>
                  {s.unusual && (
                    <div className="font-mono text-[9px] uppercase tracking-wide text-amber-300">
                      Flagged unusual
                    </div>
                  )}
                  <p className="text-xs leading-snug">{s.note}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>

      {summary && (
        <p className="border-t border-border/30 pt-2 text-xs text-foreground/80">
          <span className="font-semibold">Summary:</span> {summary}
        </p>
      )}
    </div>
  );
}

export default SlotAnnotationChips;
