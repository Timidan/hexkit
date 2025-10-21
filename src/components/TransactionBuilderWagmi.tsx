import React, { useState, type ReactNode } from "react";
import SegmentedControl from "./shared/SegmentedControl";
import type { SegmentedControlOption } from "./shared/SegmentedControl";
import { LinkIcon, ClockIcon } from "./icons/IconLibrary";
import SimpleGridUI from "./SimpleGridUI";

type SimulationViewMode = "builder" | "replay";

interface SimulationViewOption extends SegmentedControlOption {
  value: SimulationViewMode;
}

const SIMULATION_VIEW_OPTIONS: SimulationViewOption[] = [
  {
    value: "builder",
    label: (
      <span className="abi-segment-label">
        <strong className="segmented-option-heading">
          <LinkIcon width={16} height={16} /> Manual / Project
        </strong>
        <small>Load ABI locally</small>
      </span>
    ),
  },
  {
    value: "replay",
    label: (
      <span className="abi-segment-label">
        <strong className="segmented-option-heading">
          <ClockIcon width={16} height={16} /> Transaction Replay
        </strong>
        <small>Existing hash</small>
      </span>
    ),
  },
];

const replayShellStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0a0a0a",
  color: "#fff",
  padding: "20px",
};

const replayHeaderStyle: React.CSSProperties = {
  textAlign: "center",
  marginBottom: "40px",
};

const replayGridContainerStyle: React.CSSProperties = {
  width: "100%",
  overflowX: "auto",
};

const replayGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: "32px",
  width: "100%",
  margin: 0,
  padding: "24px clamp(12px, 3vw, 32px)",
};

const replayEmptyCardStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
  padding: 0,
  background: "transparent",
  border: "none",
  borderRadius: 0,
  boxShadow: "none",
  display: "flex",
  flexDirection: "column",
};

const replaySectionTitleStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 600,
  color: "#fff",
  marginBottom: "20px",
};

const replaySpacerStyle: React.CSSProperties = {
  flex: 1,
  borderRadius: "12px",
  border: "1px dashed rgba(148, 163, 184, 0.18)",
  background: "rgba(17, 24, 39, 0.45)",
  marginTop: "24px",
};

const renderModeToggle = (
  value: SimulationViewMode,
  onChange: (mode: SimulationViewMode) => void
): ReactNode => {
  const control = (
    <SegmentedControl
      ariaLabel="Simulation view mode"
      className="abi-source-segmented"
      value={value}
      onChange={(newValue) => onChange(newValue as SimulationViewMode)}
      options={SIMULATION_VIEW_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
      }))}
    />
  );

  return (
    <div
      className="simulation-contract-toggle"
      style={{
        display: "flex",
        justifyContent: "flex-start",
        marginBottom: "16px",
      }}
    >
      {control}
    </div>
  );
};

const TransactionReplayBlank: React.FC<{
  modeToggle: ReactNode;
}> = ({ modeToggle }) => (
  <div style={replayShellStyle}>
    <div style={replayHeaderStyle} />

    <div style={replayGridContainerStyle}>
      <div style={replayGridStyle}>
        <section style={replayEmptyCardStyle}>
          <h2 style={replaySectionTitleStyle}>Contract</h2>
          {modeToggle}
          <div style={replaySpacerStyle} />
        </section>
      </div>
    </div>
  </div>
);

const TransactionBuilderWagmi: React.FC = () => {
  const [viewMode, setViewMode] = useState<SimulationViewMode>("builder");

  const handleModeChange = (mode: SimulationViewMode) => setViewMode(mode);

  if (viewMode === "builder") {
    return (
      <SimpleGridUI
        contractModeToggle={renderModeToggle(viewMode, handleModeChange)}
      />
    );
  }

  return (
    <TransactionReplayBlank
      modeToggle={renderModeToggle(viewMode, handleModeChange)}
    />
  );
};

export default TransactionBuilderWagmi;
