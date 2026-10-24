import { ArrowSquareOut } from "@phosphor-icons/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../components/ui/tooltip";
import { cn } from "../../../lib/utils";

export type ExplorerLink = { label: string; href: string; title?: string };

// The explorers' own marks; Gear's is black, so it is inverted for the dark theme.
const LOGOS: Record<string, { src: string; className?: string }> = {
  Subscan: { src: "/logos/subscan.png", className: "rounded-[3px]" },
  "Gear IDEA": { src: "/logos/gear-idea.png", className: "invert" },
  IDEA: { src: "/logos/gear-idea.png", className: "invert" },
};

/** Compact external links to the explorers Vara developers already use (Subscan, Gear IDEA), shown by their logos. */
export function ExplorerLinks({ links, className }: { links: ExplorerLink[]; className?: string }) {
  if (links.length === 0) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {links.map((l) => {
        const name = l.title ?? `Open in ${l.label}`;
        const logo = LOGOS[l.label];
        return (
          <Tooltip key={l.href}>
            <TooltipTrigger asChild>
              <a href={l.href} target="_blank" rel="noreferrer" aria-label={name}
                className="inline-flex h-6 items-center gap-1 rounded border border-border/60 px-1.5 text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {logo ? <img src={logo.src} alt="" width={14} height={14} className={cn("size-3.5", logo.className)} /> : l.label}
                <ArrowSquareOut size={11} aria-hidden />
              </a>
            </TooltipTrigger>
            <TooltipContent>{name}</TooltipContent>
          </Tooltip>
        );
      })}
    </span>
  );
}
