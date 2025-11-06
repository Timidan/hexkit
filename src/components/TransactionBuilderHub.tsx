import React, { useState, useEffect } from "react";
import SimpleGridUI from "./SimpleGridUI";
import TransactionBuilderWagmi from "./TransactionBuilderWagmi";
import SegmentedControl from "./shared/SegmentedControl";
import type { SegmentedControlOption } from "./shared/SegmentedControl";
import { useSimulation } from "../contexts/SimulationContext";

type BuilderMode = "live" | "simulation";

const BUILDER_MODE_OPTIONS: Array<
  SegmentedControlOption & { value: BuilderMode; helper: string }
> = [
  {
    value: "live",
    label: (
      <span className="abi-segment-label">
        <strong>Live Interaction</strong>
        <small>Connected wallet</small>
      </span>
    ),
    helper: "Send transactions directly to the selected network.",
  },
  {
    value: "simulation",
    label: (
      <span className="abi-segment-label">
        <strong>Simulation (EDB)</strong>
        <small>Offline fork & replay</small>
      </span>
    ),
    helper: "Preview execution locally or replay an existing hash through EDB.",
  },
];

const TransactionBuilderHub: React.FC = () => {
  const { contractContext } = useSimulation();

  // Initialize mode based on whether there's simulation context
  const [mode, setMode] = useState<BuilderMode>(() => {
    return contractContext?.address ? "simulation" : "live";
  });

  // Switch to simulation mode if simulation context is available
  useEffect(() => {
    if (contractContext?.address && mode !== "simulation") {
      setMode("simulation");
    }
  }, [contractContext?.address, mode]);

  return (
    <div className="transaction-builder-hub">
      <div className="abi-inline-shell">
        <div className="abi-inline-shell__selector">
          <SegmentedControl
            ariaLabel="Transaction builder mode"
            className="abi-source-segmented"
            value={mode}
            onChange={(value) => setMode(value as BuilderMode)}
            options={BUILDER_MODE_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
        </div>

        <div className="abi-inline-shell__body" style={{ marginTop: "24px" }}>
          {mode === "live" ? <SimpleGridUI /> : <TransactionBuilderWagmi />}
        </div>
      </div>
    </div>
  );
};

export default TransactionBuilderHub;
