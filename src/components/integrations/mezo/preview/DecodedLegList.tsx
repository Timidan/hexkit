import { CheckCircle, XCircle } from "@phosphor-icons/react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DecodedLeg } from "../sim/types";

interface DecodedLegListProps {
  legs: DecodedLeg[];
}

/** Horizontal execution-plan stepper — chip per leg, details in tooltip. */
export function DecodedLegList({ legs }: DecodedLegListProps) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {legs.map((leg, i) => {
        const ok = leg.status === "success";
        const short = shortLabel(leg.decodedSummary);
        return (
          <li key={i} className="contents">
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  tabIndex={0}
                  className={
                    "flex cursor-help items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-white/30 " +
                    (ok
                      ? "border-emerald-500/25 bg-emerald-500/[0.05] text-emerald-100"
                      : "border-red-500/30 bg-red-500/[0.05] text-red-100")
                  }
                >
                  {ok ? (
                    <CheckCircle
                      className="h-3 w-3 text-emerald-300"
                      weight="fill"
                    />
                  ) : (
                    <XCircle className="h-3 w-3 text-red-300" weight="fill" />
                  )}
                  <span className="font-mono text-[10px] text-zinc-500">
                    {i + 1}
                  </span>
                  <span>{short}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="start"
                className="max-w-[320px] border-white/10 bg-zinc-950/95 text-zinc-100 backdrop-blur"
              >
                <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                  Step {i + 1} · {ok ? "ok" : "reverts"}
                </div>
                <div className="text-[12px] leading-snug text-zinc-100">
                  {leg.decodedSummary}
                </div>
                {leg.revertReason && (
                  <div className="mt-1 text-[11px] text-red-300">
                    {leg.revertReason}
                  </div>
                )}
                <div className="mt-1 font-mono text-[10px] tabular-nums text-zinc-500">
                  gas {leg.gasUsed.toLocaleString()}
                </div>
              </TooltipContent>
            </Tooltip>
            {i < legs.length - 1 && (
              <span aria-hidden className="text-zinc-700">
                →
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function shortLabel(summary: string): string {
  const lower = summary.toLowerCase();
  if (lower.startsWith("open trove")) return "Open trove";
  if (lower.startsWith("approve")) {
    const tok = summary.match(/Approve\s+([A-Za-z]+)/)?.[1] ?? "Approve";
    return `Approve ${tok}`;
  }
  if (lower.startsWith("deposit")) {
    const tok = summary.match(/into\s+([A-Za-z]+)/)?.[1];
    return tok ? `→ ${tok}` : "Deposit";
  }
  if (lower.startsWith("lock")) return "Lock";
  if (lower.startsWith("withdraw")) return "Withdraw";
  // fallback: first three words
  return summary.split(/\s+/).slice(0, 3).join(" ");
}
