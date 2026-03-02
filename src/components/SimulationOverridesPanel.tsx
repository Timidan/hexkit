import React, { useState } from "react";
import { ChevronDown, ChevronUp, Wallet, Fuel, Coins, Clock, Box, Bug } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { cn } from "@/lib/utils";

export interface SimulationOverrides {
  from?: string;
  gas?: string;
  gasPrice?: string;
  value?: string;
  // Future EDB support (currently disabled)
  blockNumber?: string;
  timestamp?: string;
  enableDebug?: boolean;
}

interface SimulationOverridesPanelProps {
  overrides: SimulationOverrides;
  onChange: (overrides: SimulationOverrides) => void;
  connectedAddress?: string;
  className?: string;
  isSimulationMode?: boolean;
}

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  forceOpen?: boolean; // When true, section will auto-expand (for restored values)
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  children,
  defaultOpen = false,
  forceOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen || forceOpen);

  // Auto-expand when forceOpen becomes true (e.g., when values are restored)
  React.useEffect(() => {
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
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </Button>
      {isOpen && <div className="p-3 space-y-3 bg-background/50">{children}</div>}
    </div>
  );
};

const SimulationOverridesPanel: React.FC<SimulationOverridesPanelProps> = ({
  overrides,
  onChange,
  connectedAddress,
  className,
  isSimulationMode = true,
}) => {
  // Initialize toggle states based on whether overrides have values
  const [useCustomGas, setUseCustomGas] = useState(
    () => !!(overrides.gas || overrides.gasPrice)
  );
  const [useBlockOverrides, setUseBlockOverrides] = useState(
    () => !!(overrides.blockNumber || overrides.timestamp)
  );

  // Sync toggle states when overrides change from external sources (e.g., resimulation)
  React.useEffect(() => {
    if (overrides.gas || overrides.gasPrice) {
      setUseCustomGas(true);
    }
  }, [overrides.gas, overrides.gasPrice]);

  React.useEffect(() => {
    if (overrides.blockNumber || overrides.timestamp) {
      setUseBlockOverrides(true);
    }
  }, [overrides.blockNumber, overrides.timestamp]);

  const updateOverride = <K extends keyof SimulationOverrides>(
    key: K,
    value: SimulationOverrides[K]
  ) => {
    onChange({ ...overrides, [key]: value });
  };

  if (!isSimulationMode) {
    return null;
  }

  return (
    <div
      className={cn(
        "border border-border rounded-xl bg-card/50 backdrop-blur-sm",
        className
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <h3 className="text-base font-semibold text-foreground">
          Simulation Overrides
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Configure transaction parameters for simulation
        </p>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* From Address (Impersonation) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="sim-from"
              className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"
            >
              <Wallet className="w-3.5 h-3.5" />
              From (Impersonate)
            </Label>
            {connectedAddress && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-primary hover:text-primary/80"
                onClick={() => updateOverride("from", connectedAddress)}
              >
                Use Wallet
              </Button>
            )}
          </div>
          <Input
            id="sim-from"
            value={overrides.from || ""}
            onChange={(e) => updateOverride("from", e.target.value)}
            placeholder="0x... (leave blank for default)"
            className="font-mono text-sm h-9"
          />
          <p className="text-[10px] text-muted-foreground">
            Simulate as if this address is the caller. Leave blank to use a neutral default.
          </p>
        </div>

        {/* Value (ETH to send) */}
        <div className="space-y-2">
          <Label
            htmlFor="sim-value"
            className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"
          >
            <Coins className="w-3.5 h-3.5" />
            Value (ETH)
          </Label>
          <Input
            id="sim-value"
            value={overrides.value || ""}
            onChange={(e) => updateOverride("value", e.target.value)}
            placeholder="0"
            className="font-mono text-sm h-9"
          />
          <p className="text-[10px] text-muted-foreground">
            Amount of ETH to send with the transaction (in wei or decimal ETH).
          </p>
        </div>

        {/* Gas Settings (Collapsible) */}
        <CollapsibleSection
          title="Gas Settings"
          icon={<Fuel className="w-4 h-4" />}
          defaultOpen={false}
          forceOpen={useCustomGas}
        >
          <div className="flex items-center justify-between mb-3">
            <Label className="text-xs text-muted-foreground">
              Use custom gas values
            </Label>
            <Switch
              checked={useCustomGas}
              onCheckedChange={setUseCustomGas}
            />
          </div>

          {useCustomGas && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="sim-gas" className="text-xs text-muted-foreground">
                  Gas Limit
                </Label>
                <Input
                  id="sim-gas"
                  value={overrides.gas || ""}
                  onChange={(e) => updateOverride("gas", e.target.value)}
                  placeholder="8000000"
                  className="font-mono text-sm h-8"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sim-gasPrice" className="text-xs text-muted-foreground">
                  Gas Price (wei)
                </Label>
                <Input
                  id="sim-gasPrice"
                  value={overrides.gasPrice || ""}
                  onChange={(e) => updateOverride("gasPrice", e.target.value)}
                  placeholder="Auto"
                  className="font-mono text-sm h-8"
                />
              </div>
            </div>
          )}
        </CollapsibleSection>

        {/* Block Overrides (Collapsible) */}
        <CollapsibleSection
          title="Block Overrides"
          icon={<Box className="w-4 h-4" />}
          defaultOpen={false}
          forceOpen={useBlockOverrides}
        >
          <div className="flex items-center justify-between mb-3">
            <Label className="text-xs text-muted-foreground">
              Override block parameters
            </Label>
            <Switch
              checked={useBlockOverrides}
              onCheckedChange={setUseBlockOverrides}
            />
          </div>

          {useBlockOverrides && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="sim-blockNumber" className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  Block Number
                </Label>
                <Input
                  id="sim-blockNumber"
                  value={overrides.blockNumber || ""}
                  onChange={(e) => updateOverride("blockNumber", e.target.value)}
                  placeholder="Latest (leave blank)"
                  className="font-mono text-sm h-8"
                />
                <p className="text-[10px] text-muted-foreground">
                  Fork state at a specific block number. Leave blank for latest.
                </p>
              </div>
              <div className="space-y-1.5 opacity-50">
                <Label className="text-xs text-muted-foreground">
                  Timestamp
                </Label>
                <Input
                  value={overrides.timestamp || ""}
                  onChange={(e) => updateOverride("timestamp", e.target.value)}
                  placeholder="Auto"
                  disabled
                  className="font-mono text-sm h-8"
                />
                <p className="text-[10px] text-amber-400/80">
                  Timestamp override not yet supported by EDB.
                </p>
              </div>
            </div>
          )}
        </CollapsibleSection>

        {/* Debug Mode */}
        <div className="border border-border/50 rounded-lg p-3 bg-muted/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label
                htmlFor="sim-enable-debug"
                className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"
              >
                <Bug className="w-3.5 h-3.5" />
                Debug Session
              </Label>
              <p className="text-[10px] text-muted-foreground mt-1">
                Opt-in live debugging (expression eval, snapshots, source stepping). This increases simulation startup time.
              </p>
            </div>
            <Switch
              id="sim-enable-debug"
              checked={overrides.enableDebug === true}
              onCheckedChange={(checked) => updateOverride("enableDebug", checked)}
            />
          </div>
        </div>

        {/* State Overrides placeholder */}
        <div className="border border-dashed border-border/50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-emerald-400">EDB Supported:</span>
            Storage Overrides (coming to UI soon)
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimulationOverridesPanel;
