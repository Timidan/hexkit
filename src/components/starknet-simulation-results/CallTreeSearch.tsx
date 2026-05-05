import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlass, Command as CommandIcon } from "@phosphor-icons/react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { FunctionInvocation } from "@/chains/starknet/simulatorTypes";
import {
  contractLabel,
  eventName,
  frameLabel,
  selectorName,
  shortHex,
} from "./decoders";

interface CallTreeSearchProps {
  frames: FunctionInvocation[];
  setSelectedFrame: (f: FunctionInvocation) => void;
  onSearchChange?: (term: string) => void;
}

/** Walnut-style cmdk fuzzy search for the call-tree pane.
 *  The trigger is a compact search input that opens a Popover hosting a
 *  Command palette listing every frame grouped by Contract / Selector /
 *  Event. cmdk handles fuzzy matching natively over the searchable text
 *  on each item. Selecting an item sets it as the current frame and
 *  smooth-scrolls the row into view via the existing `data-frame-row`
 *  attribute. Cmd+K (or Ctrl+K on linux) opens the palette globally. */
export function CallTreeSearch({
  frames,
  setSelectedFrame,
  onSearchChange,
}: CallTreeSearchProps) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const triggerRef = useRef<HTMLInputElement | null>(null);

  // Cmd+K / Ctrl+K opens the palette anywhere on the page.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Keep the legacy text-filter behaviour live as the user types so the
  // tree still narrows in the background — search and filter compose.
  useEffect(() => {
    onSearchChange?.(term.trim().toLowerCase());
  }, [term, onSearchChange]);

  // Build deduped option lists. We index by frame index so selecting an
  // option can both set the selectedFrame (re-render right rail) and
  // scroll the row into view.
  const { contracts, selectors, events } = useMemo(() => {
    const seenAddr = new Map<string, number>();
    const seenSel = new Map<string, number>();
    const eventEntries: Array<{
      label: string;
      frameIdx: number;
      from: string;
    }> = [];

    frames.forEach((f, idx) => {
      const addr = f.contractAddress.toLowerCase();
      if (!seenAddr.has(addr)) seenAddr.set(addr, idx);
      const sel = selectorName(f);
      if (sel && !seenSel.has(sel)) seenSel.set(sel, idx);
      for (const ev of f.events || []) {
        const name = eventName(ev) || ev.decodedEventAbi?.name || null;
        if (name) {
          eventEntries.push({ label: name, frameIdx: idx, from: f.contractAddress });
        }
      }
    });

    // Dedupe events by (label + from) — keep the first occurrence.
    const eventSeen = new Set<string>();
    const dedupedEvents = eventEntries.filter((e) => {
      const k = `${e.label}@${e.from.toLowerCase()}`;
      if (eventSeen.has(k)) return false;
      eventSeen.add(k);
      return true;
    });

    const contracts = Array.from(seenAddr.entries()).map(([addr, idx]) => ({
      address: addr,
      frameIdx: idx,
      label: contractLabel(addr) || frameLabel(frames[idx]) || null,
    }));

    const selectors = Array.from(seenSel.entries()).map(([name, idx]) => ({
      name,
      frameIdx: idx,
    }));

    return { contracts, selectors, events: dedupedEvents };
  }, [frames]);

  const choose = (frameIdx: number) => {
    const frame = frames[frameIdx];
    if (!frame) return;
    setSelectedFrame(frame);
    setOpen(false);
    setTerm("");
    // Defer to next tick so the right pane has rendered before we scroll.
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-frame-row="${frameIdx}"]`);
      if (el && "scrollIntoView" in el) {
        (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          className="relative w-52 cursor-text"
          onClick={() => setOpen(true)}
        >
          <MagnifyingGlass
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            ref={triggerRef}
            type="search"
            readOnly
            placeholder="search frames…"
            value={term}
            onFocus={() => setOpen(true)}
            className="w-full h-8 rounded-md border border-input bg-background pl-7 pr-12 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <kbd className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-0.5 rounded border border-border bg-muted px-1 py-0.5 text-[9px] font-mono text-muted-foreground pointer-events-none">
            <CommandIcon size={9} />K
          </kbd>
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[360px] p-0 z-[10000]"
        // Stop the popover from auto-focusing back on the trigger so the
        // CommandInput inside captures the cursor on open.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter className="bg-popover">
          <CommandInput
            placeholder="filter selector / contract / event…"
            value={term}
            onValueChange={setTerm}
            autoFocus
          />
          <CommandList className="max-h-80">
            <CommandEmpty>No frames matched.</CommandEmpty>

            {selectors.length > 0 && (
              <CommandGroup heading="Selectors">
                {selectors.map((s) => (
                  <CommandItem
                    key={`sel-${s.name}-${s.frameIdx}`}
                    value={`selector ${s.name}`}
                    onSelect={() => choose(s.frameIdx)}
                  >
                    <span className="font-mono text-foreground truncate">
                      {s.name}
                      <span className="text-muted-foreground text-[10px] ml-0.5">
                        ()
                      </span>
                    </span>
                    <span className="ml-auto text-muted-foreground text-[10px] font-mono">
                      #{s.frameIdx}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {contracts.length > 0 && (
              <CommandGroup heading="Contracts">
                {contracts.map((c) => (
                  <CommandItem
                    key={`addr-${c.address}`}
                    value={`contract ${c.label || ""} ${c.address}`}
                    onSelect={() => choose(c.frameIdx)}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="font-mono text-foreground truncate">
                        {c.label || shortHex(c.address)}
                      </span>
                      {c.label && (
                        <span className="text-[10px] font-mono text-muted-foreground truncate">
                          {shortHex(c.address)}
                        </span>
                      )}
                    </div>
                    <span className="ml-auto text-muted-foreground text-[10px] font-mono">
                      #{c.frameIdx}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {events.length > 0 && (
              <CommandGroup heading="Events">
                {events.map((ev, i) => (
                  <CommandItem
                    key={`evt-${ev.label}-${i}`}
                    value={`event ${ev.label} ${ev.from}`}
                    onSelect={() => choose(ev.frameIdx)}
                  >
                    <span className="font-mono text-foreground truncate">
                      {ev.label}
                    </span>
                    <span className="ml-2 text-[10px] font-mono text-muted-foreground truncate">
                      {contractLabel(ev.from) || shortHex(ev.from)}
                    </span>
                    <span className="ml-auto text-muted-foreground text-[10px] font-mono">
                      #{ev.frameIdx}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
