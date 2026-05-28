import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MEZO_GLOSSARY, type GlossaryKey } from "../glossary";

interface TermProps {
  k: GlossaryKey;
  children?: ReactNode;
  className?: string;
}

/** Inline term with a dotted-underline tooltip pulled from MEZO_GLOSSARY. */
export function Term({ k, children, className }: TermProps) {
  const entry = MEZO_GLOSSARY[k];
  if (!entry) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            "cursor-help underline decoration-dotted decoration-zinc-600 underline-offset-[3px] transition-colors hover:decoration-zinc-300 focus-visible:outline-none focus-visible:decoration-zinc-100",
            className,
          )}
        >
          {children ?? entry.title}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        className="max-w-[260px] border-white/10 bg-zinc-950/95 text-zinc-100 backdrop-blur"
      >
        <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
          {entry.title}
        </div>
        <div className="text-[12px] leading-snug text-zinc-200">
          {entry.body}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
