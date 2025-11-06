import React, { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Copy,
  ExternalLink,
} from "lucide-react";
import type { SimulationResult } from "../types/transaction";
import {
  extractSimulationArtifacts,
  flattenCallTreeEntries,
  type SimulationCallNode,
} from "../utils/simulationArtifacts";
import "../styles/TenderlySimulationResults.css";

interface TenderlyStyleSimulationResultsProps {
  result: SimulationResult;
  transactionHash?: string;
  networkName?: string;
  fromAddress?: string;
  toAddress?: string;
  blockNumber?: string | number;
  timestamp?: string;
  value?: string;
  nonce?: number;
  rawInput?: string;
}

type TabType = "summary" | "contracts" | "events" | "state" | "gas";

const TenderlyStyleSimulationResults: React.FC<
  TenderlyStyleSimulationResultsProps
> = ({
  result,
  transactionHash,
  networkName = "Ethereum Mainnet",
  fromAddress,
  toAddress,
  blockNumber,
  timestamp,
  value = "0",
  nonce = 0,
  rawInput,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>("summary");
  const [expandedCallNodes, setExpandedCallNodes] = useState<Set<string>>(
    new Set()
  );
  const [selectedCallNode, setSelectedCallNode] = useState<string | null>(null);

  const artifacts = useMemo(() => extractSimulationArtifacts(result), [result]);
  const callTree = artifacts.callTree ?? [];
  const events = artifacts.events ?? [];
  const storageDiffs = artifacts.storageDiffs ?? [];
  const assetChanges = artifacts.assetChanges ?? [];

  // Flatten call tree for stack trace view
  const flattenedEntries = useMemo(
    () => flattenCallTreeEntries(callTree),
    [callTree]
  );

  const toggleCallNode = (frameKey: string) => {
    setExpandedCallNodes((prev) => {
      const next = new Set(prev);
      if (next.has(frameKey)) {
        next.delete(frameKey);
      } else {
        next.add(frameKey);
      }
      return next;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const shortAddress = (addr?: string) => {
    if (!addr) return "—";
    if (addr.length < 10) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatTimestamp = (ts?: string) => {
    if (!ts) return "—";
    const date = new Date(parseInt(ts) * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const formattedDate = date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
    const formattedTime = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    return `${diffDays} days ago (${formattedDate} ${formattedTime})`;
  };

  const getErrorMessage = (node: SimulationCallNode): string | null => {
    return node.error || null;
  };

  const renderCallTreeNode = (
    node: SimulationCallNode,
    depth: number = 0
  ): React.ReactNode => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedCallNodes.has(node.frameKey);
    const isSelected = selectedCallNode === node.frameKey;
    const error = getErrorMessage(node);
    const hasError = !!error;

    return (
      <div
        key={node.frameKey}
        className="tenderly-call-node"
        style={{ marginLeft: `${depth * 24}px` }}
      >
        <div
          className={`tenderly-call-node-header ${isSelected ? "selected" : ""} ${hasError ? "error" : ""}`}
          onClick={() => setSelectedCallNode(node.frameKey)}
        >
          {hasChildren && (
            <button
              className="tenderly-call-node-toggle"
              onClick={(e) => {
                e.stopPropagation();
                toggleCallNode(node.frameKey);
              }}
            >
              {isExpanded ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
            </button>
          )}
          {!hasChildren && <div className="tenderly-call-node-spacer" />}

          <div className="tenderly-call-node-info">
            <div className="tenderly-call-node-title">
              <span className="tenderly-call-node-from">
                {shortAddress(node.from)}
              </span>
              <span className="tenderly-call-node-arrow">→</span>
              <span className="tenderly-call-node-to">
                {shortAddress(node.to)}
              </span>
              {node.functionName && (
                <span className="tenderly-call-node-function">
                  .{node.functionName}()
                </span>
              )}
            </div>
            {error && (
              <div className="tenderly-call-node-error">
                <AlertTriangle size={14} />
                <span>{error}</span>
              </div>
            )}
          </div>

          {node.type && (
            <span className={`tenderly-call-type ${node.type.toLowerCase()}`}>
              {node.type}
            </span>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className="tenderly-call-node-children">
            {node.children!.map((child) =>
              renderCallTreeNode(child, depth + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  const renderSummaryTab = () => (
    <div className="tenderly-tab-content">
      <div className="tenderly-section">
        <h3 className="tenderly-section-title">Transaction Details</h3>
        <div className="tenderly-details-grid">
          <div className="tenderly-detail-row">
            <span className="tenderly-detail-label">Hash</span>
            <div className="tenderly-detail-value">
              <span className="tenderly-mono">{transactionHash || "—"}</span>
              {transactionHash && (
                <button
                  className="tenderly-icon-btn"
                  onClick={() => copyToClipboard(transactionHash)}
                  title="Copy"
                >
                  <Copy size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="tenderly-detail-row">
            <span className="tenderly-detail-label">Network</span>
            <div className="tenderly-detail-value">
              <span className="tenderly-network-badge">{networkName}</span>
            </div>
          </div>

          <div className="tenderly-detail-row">
            <span className="tenderly-detail-label">Status</span>
            <div className="tenderly-detail-value">
              {result.success ? (
                <span className="tenderly-status-badge success">
                  <CheckCircle size={14} />
                  Success
                </span>
              ) : (
                <span className="tenderly-status-badge error">
                  <AlertTriangle size={14} />
                  Failed
                </span>
              )}
            </div>
          </div>

          {result.error && (
            <div className="tenderly-detail-row">
              <span className="tenderly-detail-label">Error</span>
              <div className="tenderly-detail-value tenderly-error-message">
                {result.error}
              </div>
            </div>
          )}

          {result.revertReason && (
            <div className="tenderly-detail-row">
              <span className="tenderly-detail-label">Revert Reason</span>
              <div className="tenderly-detail-value tenderly-error-message">
                {result.revertReason}
              </div>
            </div>
          )}

          <div className="tenderly-detail-row">
            <span className="tenderly-detail-label">Block</span>
            <div className="tenderly-detail-value">
              <span className="tenderly-mono">{blockNumber || "—"}</span>
            </div>
          </div>

          <div className="tenderly-detail-row">
            <span className="tenderly-detail-label">Timestamp</span>
            <div className="tenderly-detail-value">
              {formatTimestamp(timestamp)}
            </div>
          </div>

          <div className="tenderly-detail-row">
            <span className="tenderly-detail-label">From</span>
            <div className="tenderly-detail-value">
              <span className="tenderly-mono tenderly-address">
                {fromAddress || "0x0000000000000000000000000000000000000000"}
              </span>
              {fromAddress && (
                <button
                  className="tenderly-icon-btn"
                  onClick={() => copyToClipboard(fromAddress)}
                  title="Copy"
                >
                  <Copy size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="tenderly-detail-row">
            <span className="tenderly-detail-label">To</span>
            <div className="tenderly-detail-value">
              <span className="tenderly-mono tenderly-address">
                {toAddress || "—"}
              </span>
              {toAddress && (
                <button
                  className="tenderly-icon-btn"
                  onClick={() => copyToClipboard(toAddress)}
                  title="Copy"
                >
                  <Copy size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="tenderly-detail-row">
            <span className="tenderly-detail-label">Function</span>
            <div className="tenderly-detail-value">
              <span className="tenderly-mono">
                {flattenedEntries[0]?.functionName ||
                  flattenedEntries[0]?.label ||
                  "fallback()"}
              </span>
            </div>
          </div>

          <div className="tenderly-detail-row">
            <span className="tenderly-detail-label">Value</span>
            <div className="tenderly-detail-value">
              <span className="tenderly-mono">{value} POL</span>
            </div>
          </div>

          <div className="tenderly-detail-row">
            <span className="tenderly-detail-label">Tx Fee</span>
            <div className="tenderly-detail-value">
              <span className="tenderly-mono">
                {result.gasUsed
                  ? `${result.gasUsed} (${((parseInt(result.gasUsed) / 8000000) * 100).toFixed(2)}%)`
                  : "—"}
              </span>
            </div>
          </div>

          <div className="tenderly-detail-row">
            <span className="tenderly-detail-label">Tx Type</span>
            <div className="tenderly-detail-value">
              <span className="tenderly-mono">—</span>
            </div>
          </div>

          <div className="tenderly-detail-row">
            <span className="tenderly-detail-label">Gas Price</span>
            <div className="tenderly-detail-value">
              <span className="tenderly-mono">0 Wei (0 POL)</span>
            </div>
          </div>

          <div className="tenderly-detail-row">
            <span className="tenderly-detail-label">Gas Used</span>
            <div className="tenderly-detail-value">
              <span className="tenderly-mono">
                {result.gasUsed
                  ? `${result.gasUsed} / 8,000,000 (${((parseInt(result.gasUsed) / 8000000) * 100).toFixed(2)}%)`
                  : "—"}
              </span>
            </div>
          </div>

          <div className="tenderly-detail-row">
            <span className="tenderly-detail-label">Nonce</span>
            <div className="tenderly-detail-value">
              <span className="tenderly-mono">{nonce}</span>
            </div>
          </div>

          <div className="tenderly-detail-row full-width">
            <span className="tenderly-detail-label">Raw Input</span>
            <div className="tenderly-detail-value">
              <div className="tenderly-raw-input">
                {rawInput || flattenedEntries[0]?.input || "0x"}
              </div>
              {(rawInput || flattenedEntries[0]?.input) && (
                <button
                  className="tenderly-icon-btn"
                  onClick={() =>
                    copyToClipboard(
                      rawInput || flattenedEntries[0]?.input || ""
                    )
                  }
                  title="Copy"
                >
                  <Copy size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderContractsTab = () => (
    <div className="tenderly-tab-content">
      <div className="tenderly-section">
        <h3 className="tenderly-section-title">Contracts Involved</h3>
        <div className="tenderly-contracts-list">
          {flattenedEntries.map((entry, index) => (
            <div key={`contract-${index}`} className="tenderly-contract-item">
              <div className="tenderly-contract-address">
                <span className="tenderly-mono">{entry.to}</span>
                <button
                  className="tenderly-icon-btn"
                  onClick={() => copyToClipboard(entry.to || "")}
                  title="Copy"
                >
                  <Copy size={14} />
                </button>
              </div>
              {entry.functionName && (
                <div className="tenderly-contract-function">
                  {entry.functionName}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderEventsTab = () => (
    <div className="tenderly-tab-content">
      <div className="tenderly-section">
        <h3 className="tenderly-section-title">Events</h3>
        {events.length > 0 ? (
          <div className="tenderly-events-list">
            {events.map((event, index) => (
              <div key={`event-${index}`} className="tenderly-event-item">
                <div className="tenderly-event-name">
                  {event.name || event.signature || "Unknown Event"}
                </div>
                {(event as any).params && (
                  <div className="tenderly-event-params">
                    {JSON.stringify((event as any).params, null, 2)}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="tenderly-empty-state">No events emitted</div>
        )}
      </div>
    </div>
  );

  const renderStateTab = () => (
    <div className="tenderly-tab-content">
      <div className="tenderly-section">
        <h3 className="tenderly-section-title">State Changes</h3>
        {storageDiffs.length > 0 ? (
          <div className="tenderly-state-list">
            {storageDiffs.map((diff, index) => (
              <div key={`diff-${index}`} className="tenderly-state-item">
                <div className="tenderly-state-address">
                  <span className="tenderly-mono">{diff.address}</span>
                </div>
                <div className="tenderly-state-changes">
                  {(diff as any).slots?.map((slot: any, slotIndex: number) => (
                    <div
                      key={`slot-${slotIndex}`}
                      className="tenderly-state-slot"
                    >
                      <span className="tenderly-state-slot-key">
                        {slot.slot || slot.key || diff.slot}
                      </span>
                      <div className="tenderly-state-slot-values">
                        <span className="tenderly-state-old">
                          {slot.original || slot.from || diff.before}
                        </span>
                        <span className="tenderly-state-arrow">→</span>
                        <span className="tenderly-state-new">
                          {slot.value || slot.to || diff.after}
                        </span>
                      </div>
                    </div>
                  ))}
                  {!(diff as any).slots && (
                    <div className="tenderly-state-slot">
                      <span className="tenderly-state-slot-key">
                        {diff.slot}
                      </span>
                      <div className="tenderly-state-slot-values">
                        <span className="tenderly-state-old">
                          {diff.before || "—"}
                        </span>
                        <span className="tenderly-state-arrow">→</span>
                        <span className="tenderly-state-new">
                          {diff.after || diff.value || "—"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="tenderly-empty-state">No state changes</div>
        )}
      </div>
    </div>
  );

  const renderGasTab = () => (
    <div className="tenderly-tab-content">
      <div className="tenderly-section">
        <h3 className="tenderly-section-title">Gas Profiler</h3>
        <div className="tenderly-gas-overview">
          <div className="tenderly-gas-stat">
            <span className="tenderly-gas-label">Total Gas Used</span>
            <span className="tenderly-gas-value">{result.gasUsed || "—"}</span>
          </div>
          <div className="tenderly-gas-stat">
            <span className="tenderly-gas-label">Gas Limit</span>
            <span className="tenderly-gas-value">
              {result.gasLimitSuggested || "—"}
            </span>
          </div>
          <div className="tenderly-gas-stat">
            <span className="tenderly-gas-label">Mode</span>
            <span className="tenderly-gas-value">
              {result.mode.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="tenderly-gas-breakdown">
          <h4 className="tenderly-subsection-title">Call Gas Breakdown</h4>
          <div className="tenderly-gas-list">
            {flattenedEntries.map((entry, index) => (
              <div key={`gas-${index}`} className="tenderly-gas-item">
                <div className="tenderly-gas-item-info">
                  <span className="tenderly-gas-item-function">
                    {entry.functionName || entry.label || "Call"}
                  </span>
                  <span className="tenderly-gas-item-addresses">
                    {shortAddress(entry.from)} → {shortAddress(entry.to)}
                  </span>
                </div>
                <div className="tenderly-gas-item-value">
                  {entry.gasUsed ? `${entry.gasUsed} gas` : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="tenderly-simulation-results">
      {/* Header with Status */}
      <div className="tenderly-header">
        <div className="tenderly-status-banner">
          {result.success ? (
            <>
              <CheckCircle size={24} className="tenderly-status-icon success" />
              <div>
                <h2 className="tenderly-status-title">Simulation</h2>
                <p className="tenderly-status-subtitle">
                  Execution completed successfully
                </p>
              </div>
            </>
          ) : (
            <>
              <AlertTriangle size={24} className="tenderly-status-icon error" />
              <div>
                <h2 className="tenderly-status-title">Failed</h2>
                <p className="tenderly-status-subtitle">execution reverted</p>
              </div>
            </>
          )}
        </div>

        {result.error && (
          <div className="tenderly-error-banner">
            <AlertTriangle size={16} />
            <span>Error Message: {result.error}</span>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="tenderly-main-content">
        {/* Left Side: Stack Trace */}
        <div className="tenderly-stack-trace-panel">
          <div className="tenderly-panel-header">
            <h3>Stack Trace</h3>
            <div className="tenderly-panel-actions">
              <button
                className="tenderly-btn-text"
                onClick={() =>
                  setExpandedCallNodes(
                    new Set(flattenedEntries.map((e) => e.frameKey))
                  )
                }
              >
                Expand All
              </button>
              <button
                className="tenderly-btn-text"
                onClick={() => setExpandedCallNodes(new Set())}
              >
                Collapse All
              </button>
            </div>
          </div>
          <div className="tenderly-stack-trace-content">
            {callTree.length > 0 ? (
              <div className="tenderly-call-tree">
                {callTree.map((node) => renderCallTreeNode(node))}
              </div>
            ) : (
              <div className="tenderly-empty-state">
                No call trace available
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Tabs */}
        <div className="tenderly-details-panel">
          <div className="tenderly-tabs">
            <button
              className={`tenderly-tab ${activeTab === "summary" ? "active" : ""}`}
              onClick={() => setActiveTab("summary")}
            >
              Summary
            </button>
            <button
              className={`tenderly-tab ${activeTab === "contracts" ? "active" : ""}`}
              onClick={() => setActiveTab("contracts")}
            >
              Contracts
            </button>
            <button
              className={`tenderly-tab ${activeTab === "events" ? "active" : ""}`}
              onClick={() => setActiveTab("events")}
            >
              Events
            </button>
            <button
              className={`tenderly-tab ${activeTab === "state" ? "active" : ""}`}
              onClick={() => setActiveTab("state")}
            >
              State
            </button>
            <button
              className={`tenderly-tab ${activeTab === "gas" ? "active" : ""}`}
              onClick={() => setActiveTab("gas")}
            >
              Gas Profiler
            </button>
          </div>

          <div className="tenderly-tab-panel">
            {activeTab === "summary" && renderSummaryTab()}
            {activeTab === "contracts" && renderContractsTab()}
            {activeTab === "events" && renderEventsTab()}
            {activeTab === "state" && renderStateTab()}
            {activeTab === "gas" && renderGasTab()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TenderlyStyleSimulationResults;
