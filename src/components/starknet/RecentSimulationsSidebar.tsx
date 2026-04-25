// Sidebar listing newest-first sim/trace runs, persisted via
// recentSimulations.ts. Click an item to restore: the page selects the
// right tab and asks the matching view to rehydrate inputs + re-run.

import React from "react";
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
  return (
    <Card className="px-3 py-3 gap-2">
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
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="w-full text-left rounded-md border border-border bg-card hover:border-foreground/40 hover:bg-muted/40 px-2 py-1.5 transition-colors"
                data-testid="recent-item"
                data-recent-kind={item.kind}
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
          ))}
        </ul>
      )}
    </Card>
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
