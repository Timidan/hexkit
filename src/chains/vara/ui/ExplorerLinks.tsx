import { ArrowSquareOut } from "@phosphor-icons/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../components/ui/dropdown-menu";
import { cn } from "../../../lib/utils";

export type ExplorerLink = { label: string; href: string; title?: string };

// The explorers' own marks; Gear's is black, so it is inverted for the dark theme.
const LOGOS: Record<string, { src: string; className?: string }> = {
  Subscan: { src: "/logos/subscan.png", className: "rounded-[3px]" },
  "Gear IDEA": { src: "/logos/gear-idea.png", className: "invert" },
  IDEA: { src: "/logos/gear-idea.png", className: "invert" },
};

const CHIP = "inline-flex h-6 items-center gap-1 rounded border border-border/60 px-1.5 text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const Logo = ({ label }: { label: string }) => {
  const logo = LOGOS[label];
  return logo ? <img src={logo.src} alt="" width={14} height={14} className={cn("size-3.5", logo.className)} /> : null;
};

/** External links to the explorers Vara developers already use (Subscan, Gear IDEA). One link is a logo chip; several
 *  for the same value share one "Open in" menu, so a row of values is not followed by rows of chips. */
export function ExplorerLinks({ links, className }: { links: ExplorerLink[]; className?: string }) {
  if (links.length === 0) return null;
  if (links.length > 1) return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Open in ${links.map((l) => l.label).join(" or ")}`} title="Open in an explorer" className={cn(CHIP, className)}>
          {links.map((l) => <Logo key={l.href} label={l.label} />)}<ArrowSquareOut size={11} aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="[&_[role=menuitem]]:min-h-11 md:[&_[role=menuitem]]:min-h-9">
        {links.map((l) => <DropdownMenuItem key={l.href} asChild>
          <a href={l.href} target="_blank" rel="noreferrer"><Logo label={l.label} />{l.title ?? `Open in ${l.label}`}</a>
        </DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const [l] = links, name = l.title ?? `Open in ${l.label}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a href={l.href} target="_blank" rel="noreferrer" aria-label={name} className={cn(CHIP, className)}>
          {LOGOS[l.label] ? <Logo label={l.label} /> : l.label}
          <ArrowSquareOut size={11} aria-hidden />
        </a>
      </TooltipTrigger>
      <TooltipContent>{name}</TooltipContent>
    </Tooltip>
  );
}
