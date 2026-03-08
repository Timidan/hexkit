import React, { useMemo } from "react";
import {
  CheckCircleIcon,
  AlertTriangleIcon,
} from "../icons/IconLibrary";
import {
  extractSimulationArtifacts,
  flattenCallTreeEntries,
  getCallNodeError,
  type SimulationCallNode,
} from "../../utils/simulationArtifacts";
import type { SimulationResult } from "../../types/transaction";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../ui/table";
import { EMPTY_CALL_TREE } from "./types";
import { shortenAddress } from "../shared/AddressDisplay";

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
            <span>{shortenAddress(node.from)} → {shortenAddress(node.to)}</span>
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

export const SimulationReplayResults: React.FC<{ result: SimulationResult }> = ({ result }) => {
  const artifacts = useMemo(() => extractSimulationArtifacts(result), [result]);
  const callTree = artifacts.callTree ?? EMPTY_CALL_TREE;
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
          <div style={{ fontSize: "13px", color: "#cbd5f5" }}>
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
        <span>{result.gasUsed ?? "\u2014"}</span>
        <span className="simulation-summary-label">Suggested Gas</span>
        <span>{result.gasLimitSuggested ?? "\u2014"}</span>
        <span className="simulation-summary-label">Revert Reason</span>
        <span>{result.revertReason ?? result.error ?? "\u2014"}</span>
        <span className="simulation-summary-label">Warnings</span>
        <span>
          {warnings.length === 0 ? (
            "\u2014"
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
        <h3 style={{ margin: "0 0 12px", fontSize: "17px" }}>Call Trace</h3>
        {callTree.length === 0 ? (
          <p style={{ margin: 0, color: "#cbd5f5" }}>No call trace available.</p>
        ) : (
          <>
            {renderCallTreeNodes(callTree)}
            {flattened.length > 0 ? (
              <details style={{ marginTop: "8px" }}>
                <summary style={{ cursor: "pointer" }}>View flat call list</summary>
                <Table className="mt-3 text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Function</TableHead>
                      <TableHead>From → To</TableHead>
                      <TableHead>Gas</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {flattened.map((entry) => (
                      <TableRow key={entry.frameKey}>
                        <TableCell>
                          {entry.functionName || entry.label || "Call"}
                        </TableCell>
                        <TableCell>
                          {shortenAddress(entry.from)} → {shortenAddress(entry.to)}
                        </TableCell>
                        <TableCell>
                          {entry.gasUsed ?? "\u2014"}
                        </TableCell>
                        <TableCell className="text-rose-400">
                          {getCallNodeError(entry) ?? "\u2014"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </details>
            ) : null}
          </>
        )}
      </div>

      <div>
        <h3 style={{ margin: "0 0 12px", fontSize: "17px" }}>Events</h3>
        {artifacts.events && artifacts.events.length > 0 ? (
          <ul style={{ paddingLeft: "18px", margin: 0 }}>
            {artifacts.events.slice(0, 10).map((event, index) => (
              <li key={index} style={{ marginBottom: "6px" }}>
                <strong>{event.name || "Event"}</strong>{" "}
                <span style={{ color: "#94a3b8" }}>
                  ({shortenAddress(event.address)})
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
        <h3 style={{ margin: "0 0 12px", fontSize: "17px" }}>Storage Diffs</h3>
        {artifacts.storageDiffs && artifacts.storageDiffs.length > 0 ? (
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Address</TableHead>
                <TableHead>Slot</TableHead>
                <TableHead>Before</TableHead>
                <TableHead>After</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {artifacts.storageDiffs.slice(0, 8).map((diff, index) => (
                <TableRow key={`${diff.address}-${diff.slot}-${index}`}>
                  <TableCell>{shortenAddress(diff.address)}</TableCell>
                  <TableCell>{diff.slot ?? diff.key ?? "\u2014"}</TableCell>
                  <TableCell>{diff.before ?? "\u2014"}</TableCell>
                  <TableCell>{diff.after ?? diff.value ?? "\u2014"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p style={{ margin: 0, color: "#cbd5f5" }}>No storage changes detected.</p>
        )}
      </div>

      <div>
        <h3 style={{ margin: "0 0 12px", fontSize: "17px" }}>Raw Payload</h3>
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
