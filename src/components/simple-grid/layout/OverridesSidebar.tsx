/**
 * OverridesSidebar - Right column simulation overrides panel.
 */
import React from "react";
import SimulationOverridesPanel from "../../SimulationOverridesPanel";
import { useGridContext } from "../GridContext";

export default function OverridesSidebar(): React.ReactElement {
  const ctx: any = useGridContext();
  const {
    isSimulationMode,
    simulationOverrides,
    setSimulationOverrides,
    address,
  } = ctx;

  if (!isSimulationMode) {
    return <div />;
  }

  return (
    <div style={{ position: "sticky", top: "20px", alignSelf: "start" }}>
      <SimulationOverridesPanel
        overrides={simulationOverrides}
        onChange={setSimulationOverrides}
        connectedAddress={address}
        isSimulationMode={isSimulationMode}
      />
    </div>
  );
}
