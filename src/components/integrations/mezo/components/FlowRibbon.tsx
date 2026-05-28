import { Fragment } from "react";
import { cn } from "@/lib/utils";
import type { AssetSymbol } from "./AssetInput";

export interface FlowStep {
  symbol: AssetSymbol | "veMEZO";
  label?: string;
  muted?: boolean;
}

interface FlowRibbonProps {
  steps: FlowStep[];
  caption?: string;
  className?: string;
}

const SYMBOL_ACCENT: Record<string, string> = {
  BTC: "bg-amber-400/80",
  MUSD: "bg-emerald-400/80",
  sMUSD: "bg-emerald-300/80",
  MEZO: "bg-pink-400/80",
  veMEZO: "bg-violet-400/80",
  veBTC: "bg-amber-300/70",
};

export function FlowRibbon({ steps, caption, className }: FlowRibbonProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-2 text-xs",
        className,
      )}
    >
      {steps.map((step, i) => (
        <Fragment key={`${step.symbol}-${i}`}>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono tracking-wide",
              step.muted
                ? "border-white/5 bg-transparent text-zinc-500"
                : "border-white/[0.08] bg-white/[0.04] text-zinc-100",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                SYMBOL_ACCENT[step.symbol] ?? "bg-zinc-400",
              )}
              aria-hidden
            />
            {step.symbol}
            {step.label && (
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                {step.label}
              </span>
            )}
          </span>
          {i < steps.length - 1 && (
            <svg
              aria-hidden
              viewBox="0 0 16 8"
              className="h-2 w-4 text-zinc-700"
              fill="none"
            >
              <path
                d="M0 4 H13 M10 1 L13 4 L10 7"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </Fragment>
      ))}
      {caption && (
        <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-zinc-500">
          {caption}
        </span>
      )}
    </div>
  );
}
