import React, { useState } from "react";
import { IdleSweepPanel } from "./IdleSweepPanel";
import { IntentPanel } from "./intent/IntentPanel";
import type { EarnVault } from "../types";

type ConciergeMode = "idle-sweep" | "intent";

interface ConciergePanelProps {
  /**
   * Opens the shared VaultDrawer owned by LifiEarnPage. Required by intent
   * mode to hand the user off to DepositFlow when they pick a ranked vault.
   * Idle-sweep mode drives its own ExecutionQueue and ignores this prop.
   */
  onSelectVault: (vault: EarnVault) => void;
  /** Connected wallet address or a manually-entered address for read-only mode. */
  targetAddress: string | null;
}

/**
 * Thin shell hosting two independent concierge entry points:
 *
 *   • Idle sweep — holdings-driven: "what should I do with what I have?"
 *     (delegates to IdleSweepPanel, which owns its own ExecutionQueue state).
 *
 *   • Intent — goal-driven: "I have a yield goal, find me the vault"
 *     (delegates to IntentPanel, which hands picked vaults back to
 *     LifiEarnPage's VaultDrawer via onSelectVault).
 *
 * Shell owns only the mode toggle + title. Neither subpanel sees the other.
 */
export function ConciergePanel({ onSelectVault, targetAddress }: ConciergePanelProps) {
  const [mode, setMode] = useState<ConciergeMode>("idle-sweep");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Put idle assets to work</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {mode === "idle-sweep"
              ? "Scan unused balances across chains and get AI-ranked vault recommendations, then deposit in a single flow."
              : "Describe your yield goal in plain English and get a ranked shortlist."}
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Concierge mode"
          className="flex items-center gap-0.5 rounded-md border border-border/40 bg-background/60 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "idle-sweep"}
            onClick={() => setMode("idle-sweep")}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "idle-sweep"
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Idle sweep
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "intent"}
            onClick={() => setMode("intent")}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "intent"
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Intent
          </button>
        </div>
      </div>

      {!targetAddress && mode === "idle-sweep" ? (
        <div className="rounded-lg border border-dashed border-border/40 p-6 text-center text-xs text-muted-foreground">
          Connect your wallet or enter an address above to scan idle balances.
        </div>
      ) : mode === "idle-sweep" ? (
        <IdleSweepPanel targetAddress={targetAddress} />
      ) : (
        <IntentPanel onSelectVault={onSelectVault} targetAddress={targetAddress} />
      )}
    </div>
  );
}
