import React, { useEffect, useRef, useState } from "react";
import { Trash, ClockClockwise, ArrowsClockwise } from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { shortHex } from "@/components/starknet-simulation-results/decoders";
import type { RecentItem } from "./recentSimulations";

interface Props {
  items: RecentItem[];
  onSelect: (item: RecentItem) => void;
  onClear: () => void;
}

export const RecentSimulationsSidebar: React.FC<Props> = ({
  items,
  onSelect,
  onClear,
}) => {
  // -1 means "nothing highlighted yet"; first j/k press jumps to 0.
  // Active row is also styled with a ring so a quick eye can tell
  // which entry Enter would restore.
  const [activeIdx, setActiveIdx] = useState(-1);
  // The result Card has its own j/k listener for frame stepping. Only
  // claim the keys when the user has explicitly focused into the
  // sidebar (clicked a row or tabbed in) so the two scopes don't
  // collide on the same keystroke.
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasFocus, setHasFocus] = useState(false);

  useEffect(() => {
    if (items.length === 0) {
      setActiveIdx(-1);
      return;
    }
    if (activeIdx >= items.length) setActiveIdx(items.length - 1);
  }, [items, activeIdx]);

  useEffect(() => {
    if (items.length === 0 || !hasFocus) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (target.isContentEditable) return;
      }
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(items.length - 1, i + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        if (activeIdx >= 0 && items[activeIdx]) {
          e.preventDefault();
          onSelect(items[activeIdx]);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, activeIdx, onSelect, hasFocus]);

  return (
    <div
      ref={containerRef}
      tabIndex={items.length > 0 ? 0 : -1}
      onFocus={() => setHasFocus(true)}
      onBlur={(e) => {
        // Only clear focus when leaving the sidebar entirely; clicks
        // between rows shuffle focus inside the same container.
        if (!containerRef.current?.contains(e.relatedTarget as Node | null)) {
          setHasFocus(false);
        }
      }}
    >
    <Card className="px-3 py-3 gap-2" data-testid="recent-sidebar">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <ClockClockwise size={14} />
          Recent
        </div>
        {items.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash size={12} />}
            onClick={onClear}
            className="h-6 px-1 text-[10px]"
            aria-label="Clear recent simulations"
          >
            Clear
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground leading-snug">
          Run a trace or speculative simulate; recent runs land here so you
          can jump back without re-pasting the hash.
        </p>
      ) : (
        <>
          <ul className="space-y-1">
            {items.map((item, i) => {
              const isActive = i === activeIdx;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveIdx(i);
                      onSelect(item);
                    }}
                    className={`w-full text-left rounded-md border bg-card px-2 py-1.5 transition-colors ${
                      isActive
                        ? "border-foreground/60 ring-1 ring-foreground/40"
                        : "border-border hover:border-foreground/40 hover:bg-muted/40"
                    }`}
                    data-testid="recent-item"
                    data-recent-kind={item.kind}
                    data-active={isActive ? "true" : "false"}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground">
                      {item.kind === "trace" ? "Trace" : "Speculative"}
                      <span className="ml-auto">{relativeTime(item.ts)}</span>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-foreground truncate flex items-center gap-1">
                      <ArrowsClockwise size={10} className="text-muted-foreground" />
                      {labelFor(item)}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-[10px] text-muted-foreground/70 leading-snug">
            <span className="font-mono">j</span>/<span className="font-mono">k</span>{" "}
            to step · <span className="font-mono">enter</span> to restore
          </p>
        </>
      )}
    </Card>
    </div>
  );
};

function labelFor(item: RecentItem): string {
  if (item.kind === "trace") return shortHex(item.txHash, 10, 6);
  const sender = item.form?.senderAddress ?? "0x0";
  return `${shortHex(sender, 8, 4)} · n=${item.form?.nonce ?? "?"}`;
}

function relativeTime(ts: number): string {
  const delta = Date.now() - ts;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
  return `${Math.floor(delta / 86_400_000)}d`;
}

export default RecentSimulationsSidebar;
