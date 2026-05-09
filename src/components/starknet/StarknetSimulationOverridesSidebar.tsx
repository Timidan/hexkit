// Mirrors EVM `<SimulationOverridesPanel>` for Starknet INVOKE v3.
// Deferred: Gas Settings (use "Estimate fee" instead — INVOKE v3 has 6
// felt-encoded resource-bound fields), VALUE (no native transfer in Cairo),
// Debug Session (offline Cairo VM trace capture, not an EDB keep-alive session).
import React, { useEffect, useState } from "react";
import {
  CaretDown,
  CaretUp,
  Bug,
  Cube,
  Hash,
  Wallet,
} from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import type { SimulationViewMode } from "../transaction-builder/types";
import type { InvokeFormState } from "./invokeRequestBuilder";

export interface StarknetSimulationOverridesSidebarProps {
  form: InvokeFormState;
  onFormChange: (next: InvokeFormState) => void;
  viewMode: SimulationViewMode;
}

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  forceOpen?: boolean;
}

// Local copy of EVM's CollapsibleSection — kept here so the two panels
// can diverge without coupling.
const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  children,
  defaultOpen = false,
  forceOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen || forceOpen);

  useEffect(() => {
    if (forceOpen && !isOpen) {
      setIsOpen(true);
    }
  }, [forceOpen, isOpen]);

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <Button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        variant="ghost"
        className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          {icon}
          {title}
        </div>
        {isOpen ? (
          <CaretUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <CaretDown className="w-4 h-4 text-muted-foreground" />
        )}
      </Button>
      {isOpen && (
        <div className="p-3 space-y-3 bg-background/50">{children}</div>
      )}
    </div>
  );
};

const StarknetSimulationOverridesSidebar: React.FC<
  StarknetSimulationOverridesSidebarProps
> = ({ form, onFormChange, viewMode }) => {
  if (viewMode !== "builder") return null;

  const update = <K extends keyof InvokeFormState>(
    key: K,
    value: InvokeFormState[K],
  ) => {
    onFormChange({ ...form, [key]: value });
  };

  const blockOverridesActive = form.blockId === "number";

  return (
    <div style={{ position: "sticky", top: "20px", alignSelf: "start" }}>
      <div className="border border-border rounded-xl bg-card/50 backdrop-blur-sm">
        <div className="p-4 border-b border-border/50">
          <h3 className="text-base font-semibold text-foreground">
            Simulation Overrides
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Configure transaction parameters for simulation
          </p>
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <Label
              htmlFor="stark-sim-from"
              className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"
            >
              <Wallet className="w-3.5 h-3.5" />
              From (Impersonate)
            </Label>
            <Input
              id="stark-sim-from"
              value={form.senderAddress}
              onChange={(e) => update("senderAddress", e.target.value)}
              placeholder="0x… deployed account address"
              className="font-mono text-sm h-9"
              spellCheck={false}
            />
            <p className="text-[10px] text-muted-foreground">
              Must be a deployed Cairo account contract (Argent / Braavos /
              OZ) — every INVOKE dispatches through its{" "}
              <code className="font-mono text-[10px]">__execute__</code>. The
              nonce field auto-fetches when you set this.
            </p>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="stark-sim-nonce"
              className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"
            >
              <Hash className="w-3.5 h-3.5" />
              Nonce
            </Label>
            <Input
              id="stark-sim-nonce"
              value={form.nonce}
              onChange={(e) => update("nonce", e.target.value)}
              placeholder="0x… or decimal"
              className="font-mono text-sm h-9"
              spellCheck={false}
            />
            <p className="text-[10px] text-muted-foreground">
              Account nonce for the simulated tx. Defaults to the on-chain
              nonce.
            </p>
          </div>

          <CollapsibleSection
            title="Block Overrides"
            icon={<Cube className="w-4 h-4" />}
            defaultOpen={false}
            forceOpen={blockOverridesActive}
          >
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap text-xs">
                <span className="text-muted-foreground">Pin to:</span>
                <div className="inline-flex rounded-md border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => update("blockId", "latest")}
                    aria-pressed={form.blockId === "latest"}
                    className={`px-2.5 py-1 text-xs ${
                      form.blockId === "latest"
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Fork head (latest)
                  </button>
                  <button
                    type="button"
                    onClick={() => update("blockId", "number")}
                    aria-pressed={form.blockId === "number"}
                    className={`px-2.5 py-1 text-xs border-l border-border ${
                      form.blockId === "number"
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Block #
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="stark-sim-block-number"
                  className="text-xs text-muted-foreground"
                >
                  Block Number
                </Label>
                <Input
                  id="stark-sim-block-number"
                  value={form.blockNumber}
                  onChange={(e) =>
                    update(
                      "blockNumber",
                      e.target.value.replace(/[^\d]/g, ""),
                    )
                  }
                  placeholder="9 151 000"
                  disabled={form.blockId !== "number"}
                  className="font-mono text-sm h-8"
                  spellCheck={false}
                />
                <p className="text-[10px] text-muted-foreground">
                  Fork state at a specific block number. Leave on "Fork head"
                  for latest.
                </p>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Debug Session"
            icon={<Bug className="w-4 h-4" />}
            defaultOpen={form.debugEnabled}
            forceOpen={form.debugEnabled}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <Label htmlFor="stark-sim-debug" className="text-xs">
                  Capture Cairo VM trace
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Runs the staged debug simulation path and saves an offline
                  trace artifact for the debugger.
                </p>
              </div>
              <Switch
                id="stark-sim-debug"
                checked={form.debugEnabled}
                onCheckedChange={(checked) => update("debugEnabled", checked)}
              />
            </div>
          </CollapsibleSection>

          <div className="border border-dashed border-border/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-emerald-400">Bridge supported:</span>
              Sender impersonation, block pin
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StarknetSimulationOverridesSidebar;
