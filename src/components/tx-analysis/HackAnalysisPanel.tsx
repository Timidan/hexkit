import React from "react";
import { HEXKIT_CSS, MicroLabel } from "./hexkitTheme";
import type { HackAnalysis, Incident } from "../../utils/hack-analysis/types";

export interface HackAnalysisPanelProps {
  analysis: HackAnalysis;
  analogs?: Incident[];
}

const truncAddr = (addr: string): string =>
  addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;

const verdictPill = (
  verdict: HackAnalysis["verdict"],
): { className: string; color: string } => {
  if (verdict === "HACK_CONFIRMED") return { className: "hk-pill pill-error", color: "var(--error)" };
  if (verdict === "HACK_LIKELY") return { className: "hk-pill pill-warning", color: "var(--warning)" };
  if (verdict === "LOOKS_BENIGN") return { className: "hk-pill pill-success", color: "var(--success)" };
  return { className: "hk-pill pill-default", color: "var(--text-tertiary)" };
};

export function HackAnalysisPanel({ analysis, analogs }: HackAnalysisPanelProps): React.ReactElement {
  const pill = verdictPill(analysis.verdict);
  const confidencePct = Math.round(analysis.confidence * 100);

  const analogsToShow = analogs?.filter((a) => analysis.analogIncidentIds.includes(a.id)) ?? [];

  const sortedSteps = [...analysis.attackSteps].sort((a, b) => a.order - b.order);

  return (
    <section className="hk-root dark tx-hack-panel">
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
            <span className={pill.className} style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
              {analysis.verdict}
            </span>
            <span className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              {confidencePct}% confidence
            </span>
          </header>

          <h2
            style={{
              margin: 0,
              padding: "14px 20px 0",
              fontSize: 17,
              fontWeight: 600,
              color: "var(--text-primary)",
              lineHeight: 1.4,
            }}
          >
            {analysis.headline}
          </h2>

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
              {/* Core Contradiction */}
              <div>
                <MicroLabel>Core Contradiction</MicroLabel>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                  {analysis.coreContradiction}
                </p>
              </div>

              {/* Exploit Classes */}
              {analysis.exploitClasses.length > 0 && (
                <div>
                  <MicroLabel>Exploit Classes</MicroLabel>
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    {analysis.exploitClasses.map((ec) => (
                      <div key={ec.class}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span
                            className="hk-pill pill-mono"
                            title={ec.class}
                            style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                          >{ec.class}</span>
                          <span className="mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                            {Math.round(ec.confidence * 100)}%
                          </span>
                        </div>
                        <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.4 }}>
                          {ec.rationale}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Entities */}
              {analysis.entities.length > 0 && (
                <div>
                  <MicroLabel>Entities</MicroLabel>
                  <dl style={{ margin: "8px 0 0", display: "flex", flexDirection: "column", gap: 5 }}>
                    {analysis.entities.map((ent) => (
                      <div key={ent.address} style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                        <dt
                          style={{
                            fontSize: 11,
                            color: "var(--text-tertiary)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            flexShrink: 0,
                          }}
                        >
                          {ent.role}
                        </dt>
                        <dd
                          className="mono"
                          style={{ margin: 0, fontSize: 11.5, color: "var(--text-secondary)" }}
                          title={ent.address}
                        >
                          {truncAddr(ent.address)}
                        </dd>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{ent.label}</span>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {/* Analogs */}
              {analogsToShow.length > 0 && (
                <div>
                  <MicroLabel>Similar Incidents</MicroLabel>
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                    {analogsToShow.map((inc) => (
                      <div
                        key={inc.id}
                        style={{
                          border: "1px solid var(--border-primary)",
                          borderRadius: 6,
                          padding: "6px 10px",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)" }}>
                          {inc.name ?? inc.id}
                        </span>
                        {inc.chain && (
                          <span className="hk-pill pill-mono" style={{ fontSize: 10 }}>{inc.chain}</span>
                        )}
                        {inc.protocol && (
                          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{inc.protocol}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Caveats */}
              {analysis.caveats.length > 0 && (
                <div>
                  <MicroLabel>Caveats</MicroLabel>
                  <ul style={{ margin: "6px 0 0", padding: "0 0 0 14px", display: "flex", flexDirection: "column", gap: 4 }}>
                    {analysis.caveats.map((c, i) => (
                      <li key={i} style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.45 }}>
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* RIGHT RAIL */}
            <div style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Attack Steps */}
              {sortedSteps.length > 0 && (
                <div>
                  <MicroLabel>Attack Steps</MicroLabel>
                  <ol style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                    {sortedSteps.map((step) => (
                      <li
                        key={step.order}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "20px 1fr",
                          gap: 10,
                          alignItems: "start",
                        }}
                      >
                        <span
                          className="mono"
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            paddingTop: 2,
                            textAlign: "right",
                          }}
                        >
                          {step.order}
                        </span>
                        <div>
                          <strong style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>
                            {step.label}
                          </strong>
                          <p
                            title={step.detail}
                            style={{ margin: "2px 0 5px", fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.45 }}
                          >{step.detail}</p>
                          {step.evidenceIds.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {step.evidenceIds.map((eid) => (
                                <span
                                  key={eid}
                                  className="mono hk-pill pill-mono"
                                  style={{ fontSize: 10.5 }}
                                >
                                  {eid}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Fund Flow */}
              {analysis.fundFlow.length > 0 && (
                <div>
                  <MicroLabel>Fund Flow</MicroLabel>
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                    {analysis.fundFlow.map((ff, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 12.5,
                          color: "var(--text-secondary)",
                        }}
                      >
                        <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{ff.fromLabel}</span>
                        <span style={{ color: "var(--text-muted)" }}>&#8594;</span>
                        <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{ff.toLabel}</span>
                        {(ff.amountHuman || ff.tokenSymbol) && (
                          <span className="mono" style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginLeft: "auto" }}>
                            {[ff.amountHuman, ff.tokenSymbol].filter(Boolean).join(" ")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing Evidence */}
              {analysis.missingEvidence.length > 0 && (
                <div
                  style={{
                    border: "1px solid rgba(245,158,11,0.30)",
                    background: "rgba(245,158,11,0.07)",
                    borderRadius: 8,
                    padding: "10px 14px",
                  }}
                >
                  <MicroLabel>Missing Evidence</MicroLabel>
                  <ul style={{ margin: "6px 0 0", padding: "0 0 0 14px", display: "flex", flexDirection: "column", gap: 4 }}>
                    {analysis.missingEvidence.map((m, i) => (
                      <li key={i} style={{ fontSize: 12.5, color: "#facc15", lineHeight: 1.45 }}>
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
    </section>
  );
}
