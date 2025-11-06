import React, { useState, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Share2, RefreshCw } from "lucide-react";
import { ethers } from "ethers";
import type { SimulationResult } from "../types/transaction";
import {
  extractSimulationArtifacts,
  flattenCallTreeEntries,
  type SimulationCallNode,
} from "../utils/simulationArtifacts";
import { copyTextToClipboard } from "../utils/clipboard";
import { useSimulation } from "../contexts/SimulationContext";
import { useNotifications } from "./NotificationManager";
import SegmentedControl from "./shared/SegmentedControl";
import type { SegmentedControlOption } from "./shared/SegmentedControl";
import {
  formatInputOutput,
  formatContractName,
  formatWeiWithTooltip,
  formatGasWithConversion,
  formatDecodedOutput,
} from "../utils/displayFormatters";
import "../styles/SimulationResultsPage.css";

interface SimulationResultsPageProps {
  result?: SimulationResult;
  onReSimulate?: () => void;
}

type SimulatorTab = "summary" | "contracts" | "events" | "assets" | "state" | "gas";

const shortAddress = (value?: string | null) => {
  if (!value) return "—";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};

const formatTimestamp = (value?: number | null) => {
  if (!value) return "—";

  try {
    // Convert Unix timestamp (seconds) to Date
    const date = new Date(value * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    // Calculate relative time
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    let relativeTime = "";
    if (days > 0) {
      relativeTime = `${days} day${days !== 1 ? "s" : ""} ago`;
    } else if (hours > 0) {
      relativeTime = `${hours} hour${hours !== 1 ? "s" : ""} ago`;
    } else if (minutes > 0) {
      relativeTime = `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
    } else {
      relativeTime = "Just now";
    }

    // Format absolute time as DD/MM/YYYY HH:MM:SS
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    const second = String(date.getSeconds()).padStart(2, "0");
    const absoluteTime = `${day}/${month}/${year} ${hour}:${minute}:${second}`;

    return `${relativeTime} (${absoluteTime})`;
  } catch {
    return "—";
  }
};

// Convert Wei to Gwei with proper formatting
const formatGwei = (weiValue?: string | null) => {
  if (!weiValue) return "—";
  try {
    // Parse Wei as BigInt to handle large numbers
    const wei = BigInt(weiValue);
    // 1 Gwei = 1e9 Wei
    const gwei = Number(wei) / 1e9;
    return `${gwei.toFixed(2)} Gwei`;
  } catch {
    return "—";
  }
};

// Convert Wei to ETH with proper formatting
const formatEth = (weiValue?: string | null) => {
  if (!weiValue) return "—";
  try {
    const wei = BigInt(weiValue);
    // 1 ETH = 1e18 Wei
    const eth = Number(wei) / 1e18;
    // Show up to 6 decimal places for small values, otherwise 4
    const decimals = eth < 0.0001 ? 6 : 4;
    return `${eth.toFixed(decimals)} ETH`;
  } catch {
    return "—";
  }
};

// Calculate transaction fee (gasUsed * effectiveGasPrice)
const calculateTxFee = (gasUsed?: string | null, gasPrice?: string | null) => {
  if (!gasUsed || !gasPrice) return "—";
  try {
    const gas = BigInt(gasUsed);
    const price = BigInt(gasPrice);
    const feeInWei = gas * price;
    return formatEth(feeInWei.toString());
  } catch {
    return "—";
  }
};

// Format transaction type
const formatTxType = (type?: number | null) => {
  if (type === null || type === undefined) return "—";
  switch (type) {
    case 0:
      return "Legacy (0)";
    case 1:
      return "EIP-2930 (1)";
    case 2:
      return "EIP-1559 (2)";
    default:
      return `Type ${type}`;
  }
};

// Helper to render call tree with contract names (Tenderly-style)
// Format: CALL  —  [Sender Address] → Receiver Contract
const CallTreeNode: React.FC<{
  node: SimulationCallNode;
  contractContext?: { address?: string; name?: string } | null;
  depth?: number;
}> = ({ node, contractContext, depth = 0 }) => {
  const [isExpanded, setIsExpanded] = React.useState(true);
  const hasChildren = node.children && node.children.length > 0;

  const fromName = formatContractName(node.from, contractContext);
  const toName = formatContractName(node.to, contractContext);
  const gasFormatted = formatGasWithConversion(node.gasUsed);

  // Determine call type from EDB data
  const callType = (node.type?.toUpperCase() || "CALL").toUpperCase();

  return (
    <li className="sim-call-tree__item" style={{ marginLeft: `${depth * 0}px` }}>
      <div className="sim-call-tree__row" style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 12px",
        fontSize: "13px",
        fontFamily: "monospace",
      }}>
        {/* Expand/collapse caret */}
        <button
          className="sim-call-tree__caret"
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            background: "transparent",
            border: "none",
            color: "#9a9aac",
            cursor: hasChildren ? "pointer" : "default",
            padding: "0 8px 0 0",
            fontSize: "12px",
            minWidth: "20px",
          }}
        >
          {hasChildren ? (isExpanded ? "▼" : "▶") : ""}
        </button>

        {/* Call type (from EDB call_type field) - plain text */}
        <span
          style={{
            color: "#9a9aac",
            marginRight: "16px",
            minWidth: "120px",
          }}
        >
          {callType}
        </span>

        {/* Gas separator and gas used (from EDB gas_used field) */}
        <span
          style={{
            color: "#9a9aac",
            marginRight: "16px",
            minWidth: "80px",
          }}
          title={gasFormatted.wei ? `${gasFormatted.wei} Wei` : undefined}
        >
          {gasFormatted.display !== "—" ? gasFormatted.display : "—"}
        </span>

        {/* Call details: [Sender] → Receiver (from EDB caller/target fields) */}
        <span style={{ flex: 1 }}>
          <span style={{ color: "#9a9aac" }}>[</span>
          <span style={{ color: "#22d3ee" }}>{fromName}</span>
          <span style={{ color: "#9a9aac" }}> (</span>
          <span style={{ color: "#22d3ee" }}>{node.from ? `${node.from.slice(0, 6)}...${node.from.slice(-4)}` : "—"}</span>
          <span style={{ color: "#9a9aac" }}>)] → </span>
          <span style={{ color: "#f6f6fb" }}>{toName}</span>
        </span>

        {/* Error indicator */}
        {node.error && (
          <span
            style={{
              marginLeft: "8px",
              padding: "2px 8px",
              borderRadius: "4px",
              fontSize: "10px",
              fontWeight: 600,
              backgroundColor: "#ef444420",
              color: "#ef4444",
              border: "1px solid #ef444460",
            }}
          >
            REVERT
          </span>
        )}
      </div>

      {/* Children (nested calls) */}
      {hasChildren && isExpanded && (
        <ul className="sim-call-tree__children" style={{ listStyle: "none", paddingLeft: "30px", margin: 0 }}>
          {node.children!.map((child, idx) => (
            <CallTreeNode
              key={child.frameKey || idx}
              node={child}
              contractContext={contractContext}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

const renderCallTreeNodes = (
  nodes: SimulationCallNode[],
  contractContext?: { address?: string; name?: string } | null
): React.ReactNode => {
  if (!nodes || nodes.length === 0) return null;

  return (
    <ul className="sim-call-tree" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {nodes.map((node, idx) => (
        <CallTreeNode
          key={node.frameKey || idx}
          node={node}
          contractContext={contractContext}
          depth={0}
        />
      ))}
    </ul>
  );
};

const SimulationResultsPage: React.FC<SimulationResultsPageProps> = ({
  result: propResult,
  onReSimulate,
}) => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { currentSimulation, contractContext } = useSimulation();
  const { showSuccess } = useNotifications();
  const [activeTab, setActiveTab] = useState<SimulatorTab>("summary");
  const [searchQuery, setSearchQuery] = useState("");
  const [traceFilters, setTraceFilters] = useState({
    gas: true,
    full: true,
    storage: true,
    events: true,
  });

  // Use prop result if provided, otherwise use context
  const result = propResult || currentSimulation;

  // Handle re-simulation
  const handleReSimulate = useCallback(() => {
    if (onReSimulate) {
      onReSimulate();
    } else {
      // Navigate back to builder - the simulation data is already in localStorage
      // and will be loaded by SimpleGridUI
      navigate('/builder');
    }
  }, [onReSimulate, navigate]);

  const artifacts = useMemo(
    () => {
      if (!result) return null;

      // Log the raw EDB response structure
      console.log('[SimulationResults] Raw EDB result:', result);
      console.log('[SimulationResults] Raw trace structure:', result.rawTrace);

      const extracted = extractSimulationArtifacts(result);
      console.log('[SimulationResults] Extracted artifacts:', extracted);
      console.log('[SimulationResults] Call tree:', extracted.callTree);

      return extracted;
    },
    [result]
  );

  const callTree = artifacts?.callTree ?? [];
  const flattenedTrace = useMemo(
    () => flattenCallTreeEntries(callTree),
    [callTree]
  );

  const handleCopy = useCallback((text: string) => {
    copyTextToClipboard(text);
  }, []);

  const handleShare = useCallback(() => {
    const url = window.location.href;
    copyTextToClipboard(url);
    showSuccess("Link Copied", "Simulation URL copied to clipboard");
  }, [showSuccess]);

  const handleBack = useCallback(() => {
    // Navigate back to the simulator workbench, preserving contract context
    navigate("/workbench");
  }, [navigate]);

  if (!result) {
    return (
      <div className="sim-results-page">
        <div className="sim-results-empty">
          <p>No simulation data available</p>
          <button onClick={handleBack} className="sim-btn-secondary">
            ← Go Back
          </button>
        </div>
      </div>
    );
  }

  const statusColor = result.success ? "var(--sim-success)" : "var(--sim-error)";
  const statusLabel = result.success ? "Success" : "Failed";
  const statusIcon = result.success ? "✓" : "✗";

  // Extract metadata from simulation result and contract context
  const hash = id || Date.now().toString();
  const network = contractContext?.networkName || "Ethereum";
  const blockNumber = result.blockNumber ? String(result.blockNumber) : "—";

  // Extract transaction data from simulation result first, then fall back to call tree
  const rootCall = callTree && callTree.length > 0 ? callTree[0] : null;
  const from = result.from || rootCall?.from || "0x0000000000000000000000000000000000000000";
  const to = result.to || contractContext?.address || rootCall?.to || "—";
  const functionName = result.functionName || rootCall?.functionName || rootCall?.label || "—";
  const value = result.value || rootCall?.value?.toString() || "0";
  const rawInput = result.data || rootCall?.input || "0x";

  // Gas info from EDB simulation result
  const gasUsed = result.gasUsed || "—";
  const gasLimit = result.gasLimitSuggested || "—";
  const gasPrice = result.effectiveGasPrice || result.gasPrice || "—";
  const nonce = result.nonce !== null && result.nonce !== undefined ? String(result.nonce) : "—";
  const txFee = calculateTxFee(result.gasUsed, result.effectiveGasPrice || result.gasPrice);
  const txType = formatTxType(result.type);

  const errorMessage = result.error || result.revertReason || null;

  // Additional data from rawTrace - also check root call output
  const returnData = artifacts?.rawReturnData || rootCall?.output || null;
  const hasSnapshots = artifacts?.snapshots && artifacts.snapshots.length > 0;

  return (
    <div className="sim-results-page">
      {/* Sticky Header */}
      <header className="sim-results-header">
        <div className="sim-results-header__left">
          <button
            onClick={handleBack}
            className="sim-header-btn"
            aria-label="Back to Builder"
          >
            <svg
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span className="sim-header-btn-tooltip">Back to Builder</span>
          </button>
          <div className="sim-results-header__title">
            <span>Simulation</span>
            <span
              className="sim-results-status-pill"
              style={{ color: statusColor }}
            >
              {statusIcon} {statusLabel}
            </span>
          </div>
        </div>
        <div className="sim-results-header__actions">
          <button onClick={handleShare} className="sim-header-btn" aria-label="Share simulation">
            <svg
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" />
            </svg>
            <span className="sim-header-btn-tooltip">Share</span>
          </button>
          <button onClick={handleReSimulate} className="sim-btn-primary">
            <RefreshCw size={16} />
            Re-Simulate
          </button>
        </div>
      </header>

      {/* Transaction Summary Panel */}
      <section className="sim-summary-section">
        <div className="sim-summary-grid">
          {/* Left Column */}
          <div className="sim-summary-col">
            <div className="sim-summary-row">
              <span className="sim-summary-label">Hash</span>
              <div className="sim-summary-value">
                <span className="sim-summary-mono">{hash}</span>
                {hash !== "—" && (
                  <button
                    className="sim-copy-btn"
                    onClick={() => handleCopy(hash)}
                    aria-label="Copy hash"
                  >
                    <svg
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <rect width="14" height="14" x="8" y="8" rx="2" />
                      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <div className="sim-summary-row">
              <span className="sim-summary-label">Network</span>
              <span className="sim-summary-value">{network}</span>
            </div>

            <div className="sim-summary-row">
              <span className="sim-summary-label">Status</span>
              <span className="sim-summary-value" style={{ color: statusColor }}>
                {statusIcon} {statusLabel}
              </span>
            </div>

            <div className="sim-summary-row">
              <span className="sim-summary-label">Block</span>
              <span className="sim-summary-value">{blockNumber}</span>
            </div>

            <div className="sim-summary-row">
              <span className="sim-summary-label">Timestamp</span>
              <span className="sim-summary-value">{formatTimestamp(result.timestamp)}</span>
            </div>

            <div className="sim-summary-row">
              <span className="sim-summary-label">From</span>
              <div className="sim-summary-value">
                <span className="sim-summary-mono">{from}</span>
                {from !== "—" && (
                  <button
                    className="sim-copy-btn"
                    onClick={() => handleCopy(from)}
                    aria-label="Copy from address"
                  >
                    <svg
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <rect width="14" height="14" x="8" y="8" rx="2" />
                      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <div className="sim-summary-row">
              <span className="sim-summary-label">Contract</span>
              <div className="sim-summary-value">
                <span>{contractContext?.name || "—"}</span>
              </div>
            </div>

            <div className="sim-summary-row">
              <span className="sim-summary-label">To</span>
              <div className="sim-summary-value">
                <span className="sim-summary-mono">{to}</span>
                {to !== "—" && (
                  <button
                    className="sim-copy-btn"
                    onClick={() => handleCopy(to)}
                    aria-label="Copy to address"
                  >
                    <svg
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <rect width="14" height="14" x="8" y="8" rx="2" />
                      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="sim-summary-col">
            <div className="sim-summary-row">
              <span className="sim-summary-label">Function</span>
              <span className="sim-summary-value sim-summary-mono">
                {functionName}
              </span>
            </div>

            <div className="sim-summary-row">
              <span className="sim-summary-label">Value</span>
              <span className="sim-summary-value">{value} ETH</span>
            </div>

            <div className="sim-summary-row">
              <span className="sim-summary-label">Tx Fee</span>
              <span className="sim-summary-value">{txFee}</span>
            </div>

            <div className="sim-summary-row">
              <span className="sim-summary-label">Gas Used</span>
              <span className="sim-summary-value">
                {gasUsed} / {gasLimit}
              </span>
            </div>

            <div className="sim-summary-row">
              <span className="sim-summary-label">Gas Price</span>
              <span className="sim-summary-value">{gasPrice !== "—" ? formatGwei(gasPrice) : gasPrice}</span>
            </div>

            <div className="sim-summary-row">
              <span className="sim-summary-label">Tx Type</span>
              <span className="sim-summary-value">{txType}</span>
            </div>

            <div className="sim-summary-row">
              <span className="sim-summary-label">Nonce</span>
              <span className="sim-summary-value">{nonce}</span>
            </div>

            <div className="sim-summary-row">
              <span className="sim-summary-label">Raw Input</span>
              <div className="sim-summary-value">
                <span className="sim-summary-mono sim-summary-truncate">
                  {rawInput}
                </span>
                {rawInput !== "0x" && (
                  <button
                    className="sim-copy-btn"
                    onClick={() => handleCopy(rawInput)}
                    aria-label="Copy raw input"
                  >
                    <svg
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <rect width="14" height="14" x="8" y="8" rx="2" />
                      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {returnData && returnData !== "0x" && (
              <div className="sim-summary-row">
                <span className="sim-summary-label">Return Data</span>
                <div className="sim-summary-value">
                  <span className="sim-summary-mono" style={{ wordBreak: "break-all" }}>
                    {returnData}
                  </span>
                  <button
                    className="sim-copy-btn"
                    onClick={() => handleCopy(returnData)}
                    aria-label="Copy return data"
                  >
                    <svg
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <rect width="14" height="14" x="8" y="8" rx="2" />
                      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Tab Navigation */}
      <nav className="sim-tabs-wrapper">
        <SegmentedControl
          className="sim-tabs-segmented"
          ariaLabel="Simulation tabs"
          value={activeTab}
          onChange={(value) => setActiveTab(value as SimulatorTab)}
          options={[
            { value: "summary", label: "Summary" },
            { value: "contracts", label: "Contracts" },
            { value: "events", label: "Events" },
            { value: "assets", label: "Assets" },
            { value: "state", label: "State" },
            { value: "gas", label: "Gas Profiler" },
          ]}
        />
      </nav>

      {/* Tab Content */}
      <div className="sim-tab-content">
        {activeTab === "summary" && (
          <>
            {/* Input and Output */}
            <section className="sim-io-section">
              <div className="sim-io-card">
                <div className="sim-io-card__header">
                  <span>Input</span>
                  <button
                    className="sim-copy-btn"
                    onClick={() => handleCopy(rawInput)}
                    aria-label="Copy input"
                  >
                    <svg
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <rect width="14" height="14" x="8" y="8" rx="2" />
                      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                    </svg>
                  </button>
                </div>
                <pre className="sim-io-card__content">
                  {(() => {
                    // For input, show decoded arguments
                    if (!rawInput || rawInput === "0x" || rawInput.length <= 10) {
                      return "(no arguments)";
                    }

                    // Try to decode using ABI if available
                    if (contractContext?.abi && functionName && functionName !== "—") {
                      try {
                        const iface = new ethers.utils.Interface(contractContext.abi);
                        const funcFragment = iface.functions[Object.keys(iface.functions).find(
                          key => iface.functions[key].name === functionName
                        ) || ''];

                        if (funcFragment) {
                          const decoded = iface.decodeFunctionData(funcFragment, rawInput);
                          if (decoded.length === 0) {
                            return "(no arguments)";
                          }
                          // Format decoded arguments as key-value pairs using param names
                          const formattedArgs = funcFragment.inputs.map((input, idx) => {
                            const value = decoded[idx];
                            return `${input.name || `arg${idx}`}: ${formatDecodedOutput(value)}`;
                          }).join('\n');
                          return formattedArgs;
                        }
                      } catch (decodeError) {
                        console.log('[SimulationResults] Input ABI decode failed, falling back:', decodeError);
                      }
                    }

                    // Fallback: show raw hex (without function selector)
                    const argsData = "0x" + rawInput.slice(10);
                    return formatInputOutput(argsData).formatted;
                  })()}
                </pre>
              </div>

              <div className="sim-io-card">
                <div className="sim-io-card__header">
                  <span>Output</span>
                  <button
                    className="sim-copy-btn"
                    onClick={() => handleCopy(returnData || "No output data")}
                    aria-label="Copy output"
                  >
                    <svg
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <rect width="14" height="14" x="8" y="8" rx="2" />
                      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                    </svg>
                  </button>
                </div>
                <pre className="sim-io-card__content">
                  {(() => {
                    if (!returnData) return "No output data";

                    // Try to decode using ABI if available
                    if (contractContext?.abi && functionName && functionName !== "—") {
                      try {
                        const iface = new ethers.utils.Interface(contractContext.abi);
                        const funcFragment = iface.functions[Object.keys(iface.functions).find(
                          key => iface.functions[key].name === functionName
                        ) || ''];

                        if (funcFragment) {
                          const decoded = iface.decodeFunctionResult(funcFragment, returnData);
                          // If it's a single return value, unwrap it
                          if (decoded.length === 1) {
                            return formatDecodedOutput(decoded[0]);
                          }
                          return formatDecodedOutput(decoded);
                        }
                      } catch (decodeError) {
                        console.log('[SimulationResults] ABI decode failed, falling back:', decodeError);
                      }
                    }

                    // Fallback: Try to decode as simple uint256
                    try {
                      if (returnData.startsWith("0x") && returnData.length === 66) {
                        const value = BigInt(returnData);
                        return value.toString();
                      }
                    } catch {}

                    // Last resort: display as-is
                    return formatInputOutput(returnData).formatted;
                  })()}
                </pre>
              </div>
            </section>

            {/* Stack Trace */}
            <section className="sim-stack-section">
              <h2>Stack Trace</h2>

              {errorMessage && (
                <div className="sim-error-banner">
                  <strong>Error Message:</strong> {errorMessage}
                </div>
              )}

              <div className="sim-stack-tree">
                {callTree.length > 0 ? (
                  renderCallTreeNodes(callTree, contractContext)
                ) : (
                  <p className="sim-empty-state">No call trace available</p>
                )}
              </div>

              {/* Search and quick actions */}
              <div className="sim-stack-actions">
                <input
                  type="search"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="sim-search-input"
                />
                <button className="sim-btn-secondary sim-btn-sm">All ▼</button>
                <button className="sim-btn-secondary sim-btn-sm">
                  Go to revert
                </button>
              </div>
            </section>

          </>
        )}

        {activeTab === "contracts" && (
          <section className="sim-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0 }}>Contracts Involved</h2>
              {(() => {
                const uniqueContracts = new Set<string>();
                const collectContracts = (nodes: any[]) => {
                  nodes.forEach(node => {
                    if (node.to) uniqueContracts.add(node.to.toLowerCase());
                    if (node.calls) collectContracts(node.calls);
                  });
                };
                collectContracts(callTree);
                return uniqueContracts.size > 0 && (
                  <span style={{
                    padding: "4px 12px",
                    background: "rgba(99, 102, 241, 0.1)",
                    border: "1px solid rgba(99, 102, 241, 0.3)",
                    borderRadius: "4px",
                    fontSize: "0.875rem",
                    color: "#6366f1"
                  }}>
                    {uniqueContracts.size} contract{uniqueContracts.size !== 1 ? "s" : ""}
                  </span>
                );
              })()}
            </div>

            {(() => {
              // Collect all unique contracts with their interaction counts
              const contractMap = new Map<string, { address: string; calls: number; functionNames: Set<string> }>();

              const collectContractData = (nodes: any[]) => {
                nodes.forEach(node => {
                  if (node.to) {
                    const addr = node.to.toLowerCase();
                    const existing = contractMap.get(addr);
                    if (existing) {
                      existing.calls++;
                      if (node.functionName) existing.functionNames.add(node.functionName);
                    } else {
                      contractMap.set(addr, {
                        address: node.to,
                        calls: 1,
                        functionNames: new Set(node.functionName ? [node.functionName] : [])
                      });
                    }
                  }
                  if (node.calls) collectContractData(node.calls);
                });
              };

              collectContractData(callTree);
              const contracts = Array.from(contractMap.values());

              return contracts.length > 0 ? (
                <>
                  {/* Contracts Summary Cards */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "24px" }}>
                    {contracts.map((contract, index) => (
                      <div
                        key={index}
                        style={{
                          padding: "16px",
                          background: "rgba(255, 255, 255, 0.02)",
                          border: "1px solid var(--sim-border, #1f2026)",
                          borderRadius: "8px"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "12px" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{
                              fontSize: "0.75rem",
                              color: "rgba(246, 246, 251, 0.6)",
                              marginBottom: "6px",
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: "0.05em"
                            }}>
                              {contract.address === contractContext?.address ? "Main Contract" : `Contract ${index + 1}`}
                            </div>
                            <code style={{
                              fontSize: "0.875rem",
                              color: "var(--sim-text, #f6f6fb)",
                              fontFamily: "monospace",
                              wordBreak: "break-all"
                            }}>
                              {contract.address}
                            </code>
                          </div>
                          <div style={{
                            padding: "4px 8px",
                            background: "rgba(34, 197, 94, 0.1)",
                            border: "1px solid rgba(34, 197, 94, 0.3)",
                            borderRadius: "4px",
                            fontSize: "0.75rem",
                            color: "#22c55e",
                            whiteSpace: "nowrap",
                            marginLeft: "16px"
                          }}>
                            {contract.calls} call{contract.calls !== 1 ? "s" : ""}
                          </div>
                        </div>

                        {contract.functionNames.size > 0 && (
                          <div>
                            <div style={{
                              fontSize: "0.75rem",
                              color: "rgba(246, 246, 251, 0.6)",
                              marginBottom: "8px",
                              fontWeight: 600
                            }}>
                              Functions Called:
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                              {Array.from(contract.functionNames).map((fn, i) => (
                                <span
                                  key={i}
                                  style={{
                                    padding: "4px 8px",
                                    background: "rgba(99, 102, 241, 0.1)",
                                    border: "1px solid rgba(99, 102, 241, 0.2)",
                                    borderRadius: "4px",
                                    fontSize: "0.75rem",
                                    color: "#6366f1",
                                    fontFamily: "monospace"
                                  }}
                                >
                                  {fn}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Call Tree Visualization */}
                  <div style={{
                    borderTop: "1px solid var(--sim-border, #1f2026)",
                    paddingTop: "24px"
                  }}>
                    <h3 style={{
                      fontSize: "0.95rem",
                      fontWeight: 600,
                      color: "var(--sim-text, #f6f6fb)",
                      marginBottom: "16px"
                    }}>
                      Interaction Flow
                    </h3>
                    {renderCallTreeNodes(callTree, contractContext)}
                  </div>
                </>
              ) : (
                <div style={{
                  padding: "40px",
                  textAlign: "center",
                  color: "rgba(246, 246, 251, 0.5)"
                }}>
                  <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📄</div>
                  <div>No contract interactions found</div>
                </div>
              );
            })()}
          </section>
        )}

        {activeTab === "events" && (
          <section className="sim-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0 }}>Events Emitted</h2>
              {artifacts?.events && artifacts.events.length > 0 && (
                <span style={{
                  padding: "4px 12px",
                  background: "rgba(99, 102, 241, 0.1)",
                  border: "1px solid rgba(99, 102, 241, 0.3)",
                  borderRadius: "4px",
                  fontSize: "0.875rem",
                  color: "#6366f1"
                }}>
                  {artifacts.events.length} event{artifacts.events.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {artifacts?.events && artifacts.events.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {artifacts.events.map((event, index) => (
                  <div
                    key={index}
                    style={{
                      padding: "16px",
                      background: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid var(--sim-border, #1f2026)",
                      borderRadius: "8px"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "12px" }}>
                      <div>
                        <div style={{
                          fontSize: "0.95rem",
                          fontWeight: 600,
                          color: "var(--sim-text, #f6f6fb)",
                          marginBottom: "4px"
                        }}>
                          {event.name || "Anonymous Event"}
                        </div>
                        {event.signature && (
                          <div style={{
                            fontSize: "0.75rem",
                            color: "var(--sim-text-muted, #9a9aac)",
                            fontFamily: "monospace"
                          }}>
                            {event.signature}
                          </div>
                        )}
                      </div>
                      <div style={{
                        fontSize: "0.75rem",
                        padding: "2px 8px",
                        background: "rgba(34, 211, 238, 0.1)",
                        border: "1px solid rgba(34, 211, 238, 0.3)",
                        borderRadius: "4px",
                        color: "#22d3ee",
                        fontFamily: "monospace"
                      }}>
                        {shortAddress(event.address)}
                      </div>
                    </div>

                    {event.decoded ? (
                      <div style={{
                        marginTop: "12px",
                        padding: "12px",
                        background: "rgba(0, 0, 0, 0.2)",
                        borderRadius: "6px",
                        fontSize: "0.875rem",
                        fontFamily: "monospace"
                      }}>
                        <pre style={{
                          margin: 0,
                          color: "var(--sim-text-muted, #9a9aac)",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all"
                        }}>
                          {JSON.stringify(event.decoded, null, 2)}
                        </pre>
                      </div>
                    ) : event.data ? (
                      <div style={{
                        marginTop: "12px",
                        padding: "8px 12px",
                        background: "rgba(0, 0, 0, 0.2)",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontFamily: "monospace",
                        color: "var(--sim-text-muted, #9a9aac)",
                        wordBreak: "break-all"
                      }}>
                        {JSON.stringify(event.data)}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                padding: "40px",
                textAlign: "center",
                color: "var(--sim-text-muted, #9a9aac)",
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px dashed var(--sim-border, #1f2026)",
                borderRadius: "8px"
              }}>
                <div style={{ fontSize: "2rem", marginBottom: "8px", opacity: 0.5 }}>📭</div>
                <div>No events were emitted during this simulation</div>
              </div>
            )}
          </section>
        )}

        {activeTab === "assets" && (
          <section className="sim-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0 }}>Asset Changes</h2>
              {artifacts?.assetChanges && artifacts.assetChanges.length > 0 && (
                <span style={{
                  padding: "4px 12px",
                  background: "rgba(99, 102, 241, 0.1)",
                  border: "1px solid rgba(99, 102, 241, 0.3)",
                  borderRadius: "4px",
                  fontSize: "0.875rem",
                  color: "#6366f1"
                }}>
                  {artifacts.assetChanges.length} change{artifacts.assetChanges.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {artifacts?.assetChanges && artifacts.assetChanges.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {artifacts.assetChanges.map((change, index) => {
                  const isIncoming = change.direction === "in";
                  const directionColor = isIncoming ? "#22c55e" : "#ef4444";
                  const directionLabel = isIncoming ? "Received" : "Sent";
                  const directionIcon = isIncoming ? "↓" : "↑";

                  return (
                    <div
                      key={index}
                      style={{
                        padding: "16px",
                        background: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid var(--sim-border, #1f2026)",
                        borderRadius: "8px"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "12px" }}>
                        <div>
                          <div style={{
                            fontSize: "0.95rem",
                            fontWeight: 600,
                            color: "var(--sim-text, #f6f6fb)",
                            marginBottom: "4px"
                          }}>
                            {change.symbol || "Unknown Asset"}
                            {change.name && change.name !== change.symbol && (
                              <span style={{
                                fontSize: "0.8rem",
                                color: "rgba(246, 246, 251, 0.6)",
                                fontWeight: 400,
                                marginLeft: "8px"
                              }}>
                                ({change.name})
                              </span>
                            )}
                          </div>
                          <div style={{
                            fontSize: "0.75rem",
                            color: "rgba(246, 246, 251, 0.6)",
                            fontFamily: "monospace"
                          }}>
                            {change.address ? shortAddress(change.address) : "—"}
                          </div>
                        </div>
                        <div style={{
                          padding: "4px 12px",
                          background: `${directionColor}15`,
                          border: `1px solid ${directionColor}40`,
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          color: directionColor,
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          gap: "4px"
                        }}>
                          <span>{directionIcon}</span>
                          <span>{directionLabel}</span>
                        </div>
                      </div>

                      <div style={{
                        marginTop: "12px",
                        padding: "12px",
                        background: "rgba(0, 0, 0, 0.2)",
                        borderRadius: "4px"
                      }}>
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "auto 1fr",
                          gap: "8px 16px",
                          fontSize: "0.85rem"
                        }}>
                          <div style={{ color: "rgba(246, 246, 251, 0.6)" }}>Amount:</div>
                          <div style={{
                            color: directionColor,
                            fontFamily: "monospace",
                            fontWeight: 600
                          }}>
                            {change.amount || "—"}
                          </div>

                          {change.rawAmount && (
                            <>
                              <div style={{ color: "rgba(246, 246, 251, 0.6)" }}>Raw Amount:</div>
                              <div style={{
                                color: "var(--sim-text, #f6f6fb)",
                                fontFamily: "monospace",
                                fontSize: "0.75rem",
                                wordBreak: "break-all"
                              }}>
                                {change.rawAmount}
                              </div>
                            </>
                          )}

                          {change.counterparty && (
                            <>
                              <div style={{ color: "rgba(246, 246, 251, 0.6)" }}>
                                {isIncoming ? "From:" : "To:"}
                              </div>
                              <div style={{
                                color: "var(--sim-text, #f6f6fb)",
                                fontFamily: "monospace",
                                fontSize: "0.75rem"
                              }}>
                                {change.counterparty}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{
                padding: "40px",
                textAlign: "center",
                color: "rgba(246, 246, 251, 0.5)"
              }}>
                <div style={{ fontSize: "2rem", marginBottom: "8px" }}>💰</div>
                <div>No asset changes detected</div>
              </div>
            )}
          </section>
        )}

        {activeTab === "state" && (
          <section className="sim-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0 }}>Storage Changes</h2>
              {artifacts?.storageDiffs && artifacts.storageDiffs.length > 0 && (
                <span style={{
                  padding: "4px 12px",
                  background: "rgba(99, 102, 241, 0.1)",
                  border: "1px solid rgba(99, 102, 241, 0.3)",
                  borderRadius: "4px",
                  fontSize: "0.875rem",
                  color: "#6366f1"
                }}>
                  {artifacts.storageDiffs.length} change{artifacts.storageDiffs.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {artifacts?.storageDiffs && artifacts.storageDiffs.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {artifacts.storageDiffs.map((diff, index) => (
                  <div
                    key={index}
                    style={{
                      padding: "16px",
                      background: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid var(--sim-border, #1f2026)",
                      borderRadius: "8px"
                    }}
                  >
                    <div style={{ marginBottom: "12px" }}>
                      {diff.address && (
                        <div style={{
                          fontSize: "0.75rem",
                          color: "#22d3ee",
                          marginBottom: "8px",
                          fontFamily: "monospace"
                        }}>
                          Contract: {shortAddress(diff.address)}
                        </div>
                      )}
                      <div style={{
                        fontSize: "0.875rem",
                        fontWeight: 600,
                        color: "var(--sim-text, #f6f6fb)",
                        fontFamily: "monospace"
                      }}>
                        Slot: {diff.slot || diff.key || "Unknown"}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div style={{
                        padding: "12px",
                        background: "rgba(239, 68, 68, 0.1)",
                        border: "1px solid rgba(239, 68, 68, 0.3)",
                        borderRadius: "6px"
                      }}>
                        <div style={{
                          fontSize: "0.75rem",
                          color: "#ef4444",
                          marginBottom: "6px",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em"
                        }}>
                          Before
                        </div>
                        <code style={{
                          fontSize: "0.75rem",
                          color: "var(--sim-text-muted, #9a9aac)",
                          wordBreak: "break-all",
                          display: "block"
                        }}>
                          {diff.before || "0x0"}
                        </code>
                      </div>

                      <div style={{
                        padding: "12px",
                        background: "rgba(34, 197, 94, 0.1)",
                        border: "1px solid rgba(34, 197, 94, 0.3)",
                        borderRadius: "6px"
                      }}>
                        <div style={{
                          fontSize: "0.75rem",
                          color: "#22c55e",
                          marginBottom: "6px",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em"
                        }}>
                          After
                        </div>
                        <code style={{
                          fontSize: "0.75rem",
                          color: "var(--sim-text-muted, #9a9aac)",
                          wordBreak: "break-all",
                          display: "block"
                        }}>
                          {diff.after || diff.value || "0x0"}
                        </code>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                padding: "40px",
                textAlign: "center",
                color: "var(--sim-text-muted, #9a9aac)",
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px dashed var(--sim-border, #1f2026)",
                borderRadius: "8px"
              }}>
                <div style={{ fontSize: "2rem", marginBottom: "8px", opacity: 0.5 }}>💾</div>
                <div>No storage slots were modified during this simulation</div>
              </div>
            )}
          </section>
        )}

        {activeTab === "gas" && (
          <section className="sim-panel">
            <h2 style={{ marginBottom: "20px" }}>Gas Profiler</h2>

            {/* Gas Overview */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
              marginBottom: "24px"
            }}>
              <div style={{
                padding: "16px",
                background: "rgba(99, 102, 241, 0.1)",
                border: "1px solid rgba(99, 102, 241, 0.3)",
                borderRadius: "8px"
              }}>
                <div style={{
                  fontSize: "0.75rem",
                  color: "#6366f1",
                  marginBottom: "8px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em"
                }}>
                  Gas Used
                </div>
                <div style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  color: "var(--sim-text, #f6f6fb)",
                  fontFamily: "monospace"
                }}>
                  {result.gasUsed ? Number(result.gasUsed).toLocaleString() : "N/A"}
                </div>
              </div>

              <div style={{
                padding: "16px",
                background: "rgba(34, 211, 238, 0.1)",
                border: "1px solid rgba(34, 211, 238, 0.3)",
                borderRadius: "8px"
              }}>
                <div style={{
                  fontSize: "0.75rem",
                  color: "#22d3ee",
                  marginBottom: "8px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em"
                }}>
                  Suggested Limit
                </div>
                <div style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  color: "var(--sim-text, #f6f6fb)",
                  fontFamily: "monospace"
                }}>
                  {result.gasLimitSuggested ? Number(result.gasLimitSuggested).toLocaleString() : "N/A"}
                </div>
              </div>

              {result.gasUsed && result.gasLimitSuggested && (
                <div style={{
                  padding: "16px",
                  background: "rgba(34, 197, 94, 0.1)",
                  border: "1px solid rgba(34, 197, 94, 0.3)",
                  borderRadius: "8px"
                }}>
                  <div style={{
                    fontSize: "0.75rem",
                    color: "#22c55e",
                    marginBottom: "8px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em"
                  }}>
                    Efficiency
                  </div>
                  <div style={{
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    color: "var(--sim-text, #f6f6fb)",
                    fontFamily: "monospace"
                  }}>
                    {((Number(result.gasUsed) / Number(result.gasLimitSuggested)) * 100).toFixed(1)}%
                  </div>
                </div>
              )}
            </div>

            {/* Gas Usage Bar */}
            {result.gasUsed && result.gasLimitSuggested && (
              <div style={{
                marginBottom: "24px",
                padding: "16px",
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid var(--sim-border, #1f2026)",
                borderRadius: "8px"
              }}>
                <div style={{
                  fontSize: "0.875rem",
                  color: "var(--sim-text-muted, #9a9aac)",
                  marginBottom: "12px"
                }}>
                  Gas Usage
                </div>
                <div style={{
                  height: "32px",
                  background: "rgba(0, 0, 0, 0.3)",
                  borderRadius: "6px",
                  overflow: "hidden",
                  position: "relative"
                }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.min((Number(result.gasUsed) / Number(result.gasLimitSuggested)) * 100, 100)}%`,
                    background: "linear-gradient(90deg, #6366f1, #22d3ee)",
                    transition: "width 0.5s ease",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    paddingRight: "12px"
                  }}>
                    <span style={{
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "#fff",
                      textShadow: "0 1px 2px rgba(0,0,0,0.5)"
                    }}>
                      {((Number(result.gasUsed) / Number(result.gasLimitSuggested)) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Call Tree Gas Breakdown */}
            {callTree.length > 0 && (
              <div>
                <h3 style={{
                  fontSize: "1rem",
                  marginBottom: "16px",
                  color: "var(--sim-text, #f6f6fb)"
                }}>
                  Call Tree Gas Breakdown
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {callTree.map((call, index) => (
                    <div
                      key={index}
                      style={{
                        padding: "12px",
                        background: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid var(--sim-border, #1f2026)",
                        borderRadius: "6px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          color: "var(--sim-text, #f6f6fb)",
                          marginBottom: "4px"
                        }}>
                          {call.functionName || call.label || "Unknown Function"}
                        </div>
                        {call.to && (
                          <div style={{
                            fontSize: "0.75rem",
                            color: "var(--sim-text-muted, #9a9aac)",
                            fontFamily: "monospace"
                          }}>
                            {shortAddress(call.to)}
                          </div>
                        )}
                      </div>
                      <div style={{
                        padding: "4px 12px",
                        background: "rgba(99, 102, 241, 0.1)",
                        border: "1px solid rgba(99, 102, 241, 0.3)",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "#6366f1",
                        fontFamily: "monospace"
                      }}>
                        {call.gasUsed ? Number(call.gasUsed).toLocaleString() : "—"} gas
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!result.gasUsed && !result.gasLimitSuggested && (
              <div style={{
                padding: "40px",
                textAlign: "center",
                color: "var(--sim-text-muted, #9a9aac)",
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px dashed var(--sim-border, #1f2026)",
                borderRadius: "8px"
              }}>
                <div style={{ fontSize: "2rem", marginBottom: "8px", opacity: 0.5 }}>⛽</div>
                <div>No gas data available for this simulation</div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default SimulationResultsPage;
