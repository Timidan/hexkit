import React, { useState, useMemo, useCallback, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import SegmentedControl from "./shared/SegmentedControl";
import type { SegmentedControlOption } from "./shared/SegmentedControl";
import {
  LinkIcon,
  ClockIcon,
  Loader2Icon,
  CheckCircleIcon,
  AlertTriangleIcon,
} from "./icons/IconLibrary";
import SimpleGridUI from "./SimpleGridUI";
import ChainSelector from "./ChainSelector";
import { SUPPORTED_CHAINS } from "../utils/chains";
import type { Chain } from "../types";
import type { SimulationResult } from "../types/transaction";
import {
  replayTransactionWithSimulator,
} from "../utils/transactionSimulation";
import {
  extractSimulationArtifacts,
  flattenCallTreeEntries,
  getCallNodeError,
  type SimulationCallNode,
} from "../utils/simulationArtifacts";
import { useSimulation } from "../contexts/SimulationContext";
import "../styles/SharedComponents.css";
import "../styles/SimulatorWorkbench.css";

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

const replaySectionTitleStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 600,
  color: "#fff",
  marginBottom: "20px",
};

const replayCardStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
  padding: "24px",
  borderRadius: "16px",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  background: "rgba(17, 24, 39, 0.45)",
  boxShadow: "0 18px 46px rgba(15, 23, 42, 0.35)",
  backdropFilter: "blur(18px)",
  display: "flex",
  flexDirection: "column",
  gap: "18px",
};

const shortAddress = (value?: string | null) => {
  if (!value) {
    return "—";
  }
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};

const renderCallTreeNodes = (nodes: SimulationCallNode[]): React.ReactNode => {
  if (!nodes || nodes.length === 0) {
    return null;
  }

  return (
    <ul className="simulation-call-tree">
      {nodes.map((node) => (
        <li key={node.frameKey} className="simulation-call-node">
          <div className="simulation-call-node__header">
            <strong>{node.functionName || node.label || "Call"}</strong>
          </div>
          <div className="simulation-call-node__meta">
            <span>{shortAddress(node.from)} → {shortAddress(node.to)}</span>
            {node.gasUsed ? <span> · gas {node.gasUsed}</span> : null}
            {node.error ? (
              <span style={{ color: "#fb7185" }}>
                {" "}
                · {node.error}
              </span>
            ) : null}
          </div>
          {node.children && node.children.length > 0
            ? renderCallTreeNodes(node.children)
            : null}
        </li>
      ))}
    </ul>
  );
};

const SimulationReplayResults: React.FC<{ result: SimulationResult }> = ({ result }) => {
  const artifacts = useMemo(() => extractSimulationArtifacts(result), [result]);
  const callTree = artifacts.callTree ?? [];
  const flattened = useMemo(
    () => flattenCallTreeEntries(callTree).slice(0, 32),
    [callTree]
  );
  const warnings = result.warnings ?? [];
  const statusColor = result.success ? "#34d399" : "#fb7185";
  const statusIcon = result.success ? (
    <CheckCircleIcon width={18} height={18} color={statusColor} />
  ) : (
    <AlertTriangleIcon width={18} height={18} color={statusColor} />
  );

  return (
    <div className="simulation-replay-results">
      <div
        className="simulation-status-pill"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "12px 16px",
          borderRadius: "12px",
          border: `1px solid ${statusColor}33`,
          background: "rgba(15, 23, 42, 0.45)",
        }}
      >
        {statusIcon}
        <div>
          <strong>{result.success ? "Execution completed" : "Execution failed"}</strong>
          <div style={{ fontSize: "12px", color: "#cbd5f5" }}>
            Mode: {result.mode?.toUpperCase() ?? "N/A"}
          </div>
        </div>
      </div>

      <div
        className="simulation-summary-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "150px 1fr",
          gap: "12px",
        }}
      >
        <span className="simulation-summary-label">Gas Used</span>
        <span>{result.gasUsed ?? "—"}</span>
        <span className="simulation-summary-label">Suggested Gas</span>
        <span>{result.gasLimitSuggested ?? "—"}</span>
        <span className="simulation-summary-label">Revert Reason</span>
        <span>{result.revertReason ?? result.error ?? "—"}</span>
        <span className="simulation-summary-label">Warnings</span>
        <span>
          {warnings.length === 0 ? (
            "—"
          ) : (
            <ul style={{ paddingLeft: "18px", margin: 0 }}>
              {warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          )}
        </span>
      </div>

      <div>
        <h3 style={{ margin: "0 0 12px", fontSize: "16px" }}>Call Trace</h3>
        {callTree.length === 0 ? (
          <p style={{ margin: 0, color: "#cbd5f5" }}>No call trace available.</p>
        ) : (
          <>
            {renderCallTreeNodes(callTree)}
            {flattened.length > 0 ? (
              <details style={{ marginTop: "8px" }}>
                <summary style={{ cursor: "pointer" }}>View flat call list</summary>
                <table
                  className="simulation-table"
                  style={{
                    width: "100%",
                    marginTop: "12px",
                    borderCollapse: "collapse",
                    fontSize: "13px",
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "6px 8px" }}>Function</th>
                      <th style={{ textAlign: "left", padding: "6px 8px" }}>From → To</th>
                      <th style={{ textAlign: "left", padding: "6px 8px" }}>Gas</th>
                      <th style={{ textAlign: "left", padding: "6px 8px" }}>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flattened.map((entry) => (
                      <tr key={entry.frameKey}>
                        <td style={{ padding: "6px 8px" }}>
                          {entry.functionName || entry.label || "Call"}
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          {shortAddress(entry.from)} → {shortAddress(entry.to)}
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          {entry.gasUsed ?? "—"}
                        </td>
                        <td style={{ padding: "6px 8px", color: "#fb7185" }}>
                          {getCallNodeError(entry) ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ) : null}
          </>
        )}
      </div>

      <div>
        <h3 style={{ margin: "0 0 12px", fontSize: "16px" }}>Events</h3>
        {artifacts.events && artifacts.events.length > 0 ? (
          <ul style={{ paddingLeft: "18px", margin: 0 }}>
            {artifacts.events.slice(0, 10).map((event, index) => (
              <li key={index} style={{ marginBottom: "6px" }}>
                <strong>{event.name || "Event"}</strong>{" "}
                <span style={{ color: "#94a3b8" }}>
                  ({shortAddress(event.address)})
                </span>
                {event.decoded ? (
                  <details style={{ marginTop: "4px" }}>
                    <summary>Decoded</summary>
                    <pre style={{ whiteSpace: "pre-wrap" }}>
                      {JSON.stringify(event.decoded, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </li>
            ))}
            {artifacts.events.length > 10 ? (
              <li style={{ color: "#cbd5f5" }}>
                +{artifacts.events.length - 10} additional events
              </li>
            ) : null}
          </ul>
        ) : (
          <p style={{ margin: 0, color: "#cbd5f5" }}>No events emitted.</p>
        )}
      </div>

      <div>
        <h3 style={{ margin: "0 0 12px", fontSize: "16px" }}>Storage Diffs</h3>
        {artifacts.storageDiffs && artifacts.storageDiffs.length > 0 ? (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
            }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Address</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Slot</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Before</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>After</th>
              </tr>
            </thead>
            <tbody>
              {artifacts.storageDiffs.slice(0, 8).map((diff, index) => (
                <tr key={`${diff.address}-${diff.slot}-${index}`}>
                  <td style={{ padding: "6px 8px" }}>{shortAddress(diff.address)}</td>
                  <td style={{ padding: "6px 8px" }}>{diff.slot ?? diff.key ?? "—"}</td>
                  <td style={{ padding: "6px 8px" }}>{diff.before ?? "—"}</td>
                  <td style={{ padding: "6px 8px" }}>{diff.after ?? diff.value ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ margin: 0, color: "#cbd5f5" }}>No storage changes detected.</p>
        )}
      </div>

      <div>
        <h3 style={{ margin: "0 0 12px", fontSize: "16px" }}>Raw Payload</h3>
        {artifacts.rawPayload ? (
          <details open={false}>
            <summary style={{ cursor: "pointer" }}>View JSON</summary>
            <pre
              style={{
                marginTop: "12px",
                maxHeight: "260px",
                overflow: "auto",
                borderRadius: "12px",
                padding: "12px",
                background: "rgba(15, 23, 42, 0.6)",
              }}
            >
              {artifacts.rawPayload}
            </pre>
          </details>
        ) : (
          <p style={{ margin: 0, color: "#cbd5f5" }}>Payload unavailable.</p>
        )}
      </div>
    </div>
  );
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

const defaultReplayChain =
  SUPPORTED_CHAINS.find((chain) => chain.id === 1) ?? SUPPORTED_CHAINS[0];

const TransactionReplayView: React.FC<{
  modeToggle: ReactNode;
}> = ({ modeToggle }) => {
  const navigate = useNavigate();
  const { setSimulation } = useSimulation();
  const [selectedChain, setSelectedChain] = useState<Chain>(defaultReplayChain);
  const [txHash, setTxHash] = useState("");
  const [blockTag, setBlockTag] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [bridgeWarning, setBridgeWarning] = useState<string | null>(null);

  const handleReplay = useCallback(async () => {
    const trimmedHash = txHash.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(trimmedHash)) {
      setFormError("Enter a valid 32-byte transaction hash (0x-prefixed).");
      return;
    }

    setFormError(null);
    setBridgeWarning(null);
    setIsSimulating(true);

    try {
      const simulation = await replayTransactionWithSimulator(
        selectedChain,
        trimmedHash,
        {
          blockTag: blockTag.trim() || undefined,
        }
      );

      if (!simulation) {
        setBridgeWarning(
          "Simulator bridge unavailable. Run `npm run simulator:server` and ensure the edb-simulator binary is built."
        );
        return;
      }

      // Enrich simulation result with transaction metadata
      const enrichedSimulation = {
        ...simulation,
        networkName: selectedChain?.name || "Unknown",
        chainId: selectedChain?.id,
        transactionHash: trimmedHash,
        blockNumber: blockTag.trim() || undefined,
        timestamp: new Date().toISOString(),
        simulationId: trimmedHash || `sim-${Date.now()}`,
      };

      // Store enriched simulation in context and navigate to dedicated results page
      setSimulation(enrichedSimulation as any);
      const simulationId = enrichedSimulation.simulationId || trimmedHash || `sim-${Date.now()}`;
      navigate(`/simulation/${simulationId}`);
    } catch (error: any) {
      const message =
        error?.message ??
        "Replay failed due to an unexpected error. Check the simulator logs.";
      setFormError(message);
    } finally {
      setIsSimulating(false);
    }
  }, [selectedChain, txHash, blockTag, navigate, setSimulation]);

  const resetForm = useCallback(() => {
    setTxHash("");
    setBlockTag("");
    setFormError(null);
    setBridgeWarning(null);
  }, []);

  const runDisabled = !txHash.trim() || isSimulating;

  return (
    <div style={replayShellStyle}>
      <div style={replayHeaderStyle}>
        <h1 style={{ margin: 0, fontSize: "28px" }}>Transaction Replay</h1>
        <p style={{ marginTop: "8px", color: "#cbd5f5" }}>
          Fork any supported network locally and replay a confirmed transaction
          with full EDB traces, snapshots, and storage diffs.
        </p>
      </div>

      <div style={replayGridContainerStyle}>
        <div style={replayGridStyle}>
          <section style={replayCardStyle}>
            <h2 style={replaySectionTitleStyle}>Replay Parameters</h2>
            {modeToggle}

            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "6px",
                  fontSize: "13px",
                  color: "#cbd5f5",
                  letterSpacing: "0.03em",
                }}
              >
                Network
              </label>
              <ChainSelector
                selectedChain={selectedChain}
                onChainChange={setSelectedChain}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "6px",
                  fontSize: "13px",
                  color: "#cbd5f5",
                  letterSpacing: "0.03em",
                }}
              >
                Transaction Hash
              </label>
              <input
                type="text"
                value={txHash}
                onChange={(event) => setTxHash(event.target.value)}
                placeholder="0x…"
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "12px",
                  border: "1px solid rgba(148, 163, 184, 0.25)",
                  background: "rgba(15, 23, 42, 0.5)",
                  color: "#fff",
                  fontFamily: "monospace",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "6px",
                  fontSize: "13px",
                  color: "#cbd5f5",
                  letterSpacing: "0.03em",
                }}
              >
                Block Tag (optional)
              </label>
              <input
                type="text"
                value={blockTag}
                onChange={(event) => setBlockTag(event.target.value)}
                placeholder="latest"
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "12px",
                  border: "1px solid rgba(148, 163, 184, 0.25)",
                  background: "rgba(15, 23, 42, 0.5)",
                  color: "#fff",
                  fontFamily: "monospace",
                }}
              />
              <small style={{ color: "#94a3b8" }}>
                Leave empty for latest state. Accepts block numbers or tags (e.g.
                "safe").
              </small>
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <button
                type="button"
                onClick={handleReplay}
                disabled={runDisabled}
                className="simulation-action primary"
                style={{
                  padding: "10px 18px",
                  borderRadius: "12px",
                  border: "none",
                  background: runDisabled ? "rgba(59, 130, 246, 0.3)" : "#3b82f6",
                  color: "#0b1120",
                  fontWeight: 600,
                  cursor: runDisabled ? "not-allowed" : "pointer",
                }}
              >
                {isSimulating ? (
                  <>
                    <Loader2Icon
                      width={16}
                      height={16}
                      style={{ marginRight: "8px", animation: "spin 1s linear infinite" }}
                    />
                    Replaying…
                  </>
                ) : (
                  "Run Replay"
                )}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="simulation-action"
                style={{
                  padding: "10px 18px",
                  borderRadius: "12px",
                  border: "1px solid rgba(148, 163, 184, 0.35)",
                  background: "transparent",
                  color: "#cbd5f5",
                  cursor: "pointer",
                }}
              >
                Reset
              </button>
            </div>

            <div style={{ fontSize: "12px", color: "#94a3b8" }}>
              Bridge runs locally via <code>npm run simulator:server</code> and uses the
              compiled <code>edb-simulator</code> binary.
            </div>

            {formError ? (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "12px",
                  background: "rgba(248, 113, 113, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  color: "#fecaca",
                  fontSize: "13px",
                }}
              >
                {formError}
              </div>
            ) : null}

            {bridgeWarning ? (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "12px",
                  background: "rgba(252, 211, 77, 0.12)",
                  border: "1px solid rgba(251, 191, 36, 0.35)",
                  color: "#fde68a",
                  fontSize: "13px",
                }}
              >
                {bridgeWarning}
              </div>
            ) : null}
          </section>

          <section style={replayCardStyle}>
            <h2 style={replaySectionTitleStyle}>Replay Result</h2>
            {isSimulating ? (
              <div
                className="simulation-helper-card"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "16px",
                  borderRadius: "12px",
                  background: "rgba(59, 130, 246, 0.12)",
                  border: "1px solid rgba(96, 165, 250, 0.35)",
                }}
              >
                <Loader2Icon
                  width={20}
                  height={20}
                  style={{ animation: "spin 1s linear infinite", color: "#93c5fd" }}
                />
                <div>
                  <strong>Executing replay…</strong>
                  <p style={{ margin: 0, color: "#cbd5f5" }}>
                    Forking state and running the transaction through EDB. Results will open in a new page.
                  </p>
                </div>
              </div>
            ) : (
              <div style={{ color: "#94a3b8", fontSize: "14px" }}>
                Provide a transaction hash and click{" "}
                <strong>Run Replay</strong> to fetch the call trace, storage diffs,
                and snapshots. Results will open in a dedicated page (Tenderly-style).
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

const TransactionBuilderWagmi: React.FC = () => {
  const { contractContext } = useSimulation();

  // Initialize to "builder" mode, especially if there's simulation context to restore
  const [viewMode, setViewMode] = useState<SimulationViewMode>(() => {
    return contractContext?.address ? "builder" : "builder";
  });

  const handleModeChange = (mode: SimulationViewMode) => setViewMode(mode);

  if (viewMode === "builder") {
    return (
      <SimpleGridUI
        contractModeToggle={renderModeToggle(viewMode, handleModeChange)}
        mode="simulation"
        initialContractData={contractContext ? {
          address: contractContext.address,
          name: contractContext.name,
          abi: contractContext.abi || [],
          networkId: contractContext.networkId,
        } : undefined}
      />
    );
  }

  return (
    <TransactionReplayView
      modeToggle={renderModeToggle(viewMode, handleModeChange)}
    />
  );
};

export default TransactionBuilderWagmi;
