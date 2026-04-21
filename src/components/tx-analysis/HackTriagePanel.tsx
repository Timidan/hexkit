import React from "react";
import { HEXKIT_CSS, MicroLabel } from "./hexkitTheme";
import { classBitsToLabels, type TriageResult } from "../../utils/hack-analysis/triage/cofhe";

export interface HackTriagePanelProps {
  verdict: TriageResult;
  txHash: `0x${string}` | null;
  handles: { classBits: string; severity: string } | null;
  contractAddress: `0x${string}`;
}

function shortHex(hex: string, head = 10, tail = 8): string {
  if (hex.length <= head + tail + 2) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

function ConsumerContractSnippet({
  contractAddress,
}: {
  contractAddress: `0x${string}`;
}): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const code = `// Any Sepolia contract can gate on this encrypted verdict.
// Only permit holders can decrypt — the chain never sees it in plaintext.
import { IHackTriage } from "./IHackTriage.sol";
import { euint8, ebool, FHE } from "@fhenixprotocol/cofhe-contracts/FHE.sol";

contract Escrow {
    IHackTriage constant TRIAGE = IHackTriage(${contractAddress});
    uint8 constant MAX_SAFE_SEVERITY = 4;

    function release(address user, uint256 amount) external {
        (, uint256 sevHandle, ) = TRIAGE.latest(user);
        euint8 severity = euint8.wrap(sevHandle);

        // Comparison runs under FHE. The bool is also encrypted.
        ebool safe = FHE.lte(severity, FHE.asEuint8(MAX_SAFE_SEVERITY));
        FHE.allow(safe, msg.sender);
        FHE.req(safe); // revert if severity > threshold, never revealing which
        _transfer(user, amount);
    }
}`;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mono"
        style={{
          background: "transparent",
          border: "1px solid var(--border-primary)",
          color: "var(--text-secondary)",
          fontSize: 11,
          padding: "4px 10px",
          borderRadius: 4,
          cursor: "pointer",
        }}
      >
        {open ? "Hide" : "Show"} consumer contract
      </button>
      {open ? (
        <pre
          className="mono"
          style={{
            marginTop: 8,
            padding: 12,
            background: "rgba(167,139,250,0.05)",
            border: "1px solid rgba(167,139,250,0.20)",
            borderRadius: 4,
            fontSize: 11,
            lineHeight: 1.5,
            color: "var(--text-secondary)",
            overflow: "auto",
            whiteSpace: "pre",
          }}
        >
          {code}
        </pre>
      ) : null}
    </div>
  );
}

/** Severity bar gauge: 0–9 scale rendered as a simple SVG bar. */
function SeverityGauge({ value, max = 9 }: { value: number; max?: number }): React.ReactElement {
  const clamped = Math.max(0, Math.min(value, max));
  const pct = max > 0 ? clamped / max : 0;
  const barWidth = 120;
  const fillWidth = Math.round(pct * barWidth);
  // Purple fill to stay visually distinct from green/red cleartext path
  const fillColor = "#a78bfa";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <svg
        width={barWidth}
        height={8}
        aria-label={`Severity gauge: ${clamped} out of ${max}`}
        role="img"
      >
        <rect x={0} y={0} width={barWidth} height={8} rx={4} fill="rgba(255,255,255,0.08)" />
        {fillWidth > 0 && (
          <rect x={0} y={0} width={fillWidth} height={8} rx={4} fill={fillColor} />
        )}
      </svg>
      <span
        className="mono"
        style={{ fontSize: 12, color: fillColor, fontWeight: 600 }}
        aria-label={`Severity ${clamped} out of 10`}
      >
        {clamped} / 10
      </span>
    </div>
  );
}

export function HackTriagePanel({
  verdict,
  txHash,
  handles,
  contractAddress,
}: HackTriagePanelProps): React.ReactElement {
  const labels = classBitsToLabels(verdict.classBits);

  return (
    <section className="hk-root dark tx-hack-triage-panel">
      <style>{HEXKIT_CSS}</style>
      <div className="hk-card" style={{ padding: 0, overflow: "hidden" }}>
        <header
          style={{
            padding: "16px 20px 14px",
            borderBottom: "1px solid var(--border-primary)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            className="hk-pill pill-mono"
            style={{
              color: "#a78bfa",
              background: "rgba(167,139,250,0.12)",
              borderColor: "rgba(167,139,250,0.30)",
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
            }}
          >
            🔒 Verified under FHE
          </span>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px, 280px) 1fr",
            gap: 0,
            padding: "16px 20px 20px",
          }}
        >
          {/* LEFT RAIL */}
          <div
            style={{
              paddingRight: 20,
              borderRight: "1px solid var(--border-primary)",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {/* Class Labels */}
            <div>
              <MicroLabel>Encrypted Rule Classes</MicroLabel>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {labels.length > 0 ? (
                  labels.map((label) => (
                    <span
                      key={label}
                      className="hk-pill pill-mono"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        alignSelf: "flex-start",
                      }}
                    >
                      {label}
                    </span>
                  ))
                ) : (
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-tertiary)",
                      fontStyle: "italic",
                    }}
                  >
                    No encrypted rules fired
                  </span>
                )}
              </div>
            </div>

            {/* Severity */}
            <div>
              <MicroLabel>Encrypted severity (decrypted locally)</MicroLabel>
              <div style={{ marginTop: 8 }}>
                <SeverityGauge value={verdict.severity} />
              </div>
            </div>
          </div>

          {/* RIGHT RAIL */}
          <div style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <MicroLabel>What the chain stored</MicroLabel>
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                }}
              >
                The severity gauge you see above was decrypted in your browser under your permit.
                On-chain, only these ciphertext handles exist. Any Sepolia contract can read them
                and run comparisons under FHE — no one needs to decrypt to make a decision.
              </p>
            </div>

            {handles ? (
              <div>
                <MicroLabel>Ciphertext handles</MicroLabel>
                <div
                  style={{
                    marginTop: 8,
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    columnGap: 12,
                    rowGap: 4,
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-tertiary)",
                  }}
                >
                  <span>classBits</span>
                  <span style={{ color: "#a78bfa" }} title={handles.classBits}>
                    {shortHex(handles.classBits)}
                  </span>
                  <span>severity</span>
                  <span style={{ color: "#a78bfa" }} title={handles.severity}>
                    {shortHex(handles.severity)}
                  </span>
                </div>
              </div>
            ) : null}

            <div>
              <MicroLabel>For downstream contracts</MicroLabel>
              <p
                style={{
                  margin: "8px 0 8px",
                  fontSize: 12,
                  color: "var(--text-tertiary)",
                  lineHeight: 1.5,
                }}
              >
                An escrow, throttle, or insurance pool can gate on this without ever learning the
                verdict:
              </p>
              <ConsumerContractSnippet contractAddress={contractAddress} />
            </div>

            {txHash ? (
              <div>
                <MicroLabel>On-chain record</MicroLabel>
                <div style={{ marginTop: 6 }}>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12,
                      color: "#a78bfa",
                      textDecoration: "underline",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    View on Etherscan
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
