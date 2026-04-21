import React from "react";
import { HexKitRoot, HKI, MicroLabel, shortAddress } from "./hexkitTheme";
import type {
  EvidencePacket,
  TriggerEvidence,
  ProfitEvidence,
  Verdict,
} from "../../utils/tx-analysis/types";

const TRANSFER_TOPIC0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const APPROVAL_TOPIC0 = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";

type ActivityKind = "transfer" | "eth" | "call" | "event" | "approve";
type ActivityFilter = "all" | "transfer" | "call" | "event" | "approve";

interface Activity {
  key: string;
  kind: ActivityKind;
  dir?: "in" | "out";
  label: string;
  sub?: string;
  value?: string;
  valueSub?: string;
}

const topicToAddress = (topic: string | undefined): string | null => {
  if (!topic) return null;
  const clean = topic.toLowerCase().replace(/^0x/, "");
  if (clean.length < 40) return null;
  return `0x${clean.slice(-40)}`;
};

const eqAddr = (a: string | null, b: string | null): boolean =>
  !!(a && b && a.toLowerCase() === b.toLowerCase());

function triggerToActivity(t: TriggerEvidence, packet: EvidencePacket): Activity {
  const key = t.id;
  if (t.kind === "LOG") {
    const topic0 = (t.logTopics[0] ?? "").toLowerCase();
    const isTransfer = topic0 === TRANSFER_TOPIC0;
    const isApproval = topic0 === APPROVAL_TOPIC0;
    if (isTransfer) {
      const fromAddr = topicToAddress(t.logTopics[1]);
      const toAddr = topicToAddress(t.logTopics[2]);
      const dir: "in" | "out" | undefined = eqAddr(toAddr, packet.from)
        ? "in"
        : eqAddr(fromAddr, packet.from)
        ? "out"
        : undefined;
      const amount = t.args.find((a) => /value|amount|wad/i.test(a.name))?.value ?? null;
      return {
        key,
        kind: "transfer",
        dir,
        label: `Transfer  ${shortAddress(fromAddr ?? "?")} → ${shortAddress(toAddr ?? "?")}`,
        sub: `${shortAddress(t.contract)} · topic0 ${topic0.slice(0, 10)}…`,
        value: amount ?? t.id,
      };
    }
    if (isApproval) {
      const ownerAddr = topicToAddress(t.logTopics[1]);
      const spenderAddr = topicToAddress(t.logTopics[2]);
      return {
        key,
        kind: "approve",
        label: `Approval  ${shortAddress(ownerAddr ?? "?")} → ${shortAddress(spenderAddr ?? "?")}`,
        sub: `${shortAddress(t.contract)} · topic0 ${topic0.slice(0, 10)}…`,
        value: t.id,
      };
    }
    return {
      key,
      kind: "event",
      label: t.function ?? `Log (${t.logTopics.length} topic${t.logTopics.length === 1 ? "" : "s"})`,
      sub: `${shortAddress(t.contract)}${topic0 ? ` · topic0 ${topic0.slice(0, 10)}…` : ""}`,
      value: t.id,
    };
  }
  // CALL / DELEGATECALL / STATICCALL / CREATE / CREATE2
  const fnLabel = t.function ?? t.selector ?? `${t.kind.toLowerCase()}()`;
  return {
    key,
    kind: "call",
    label: fnLabel,
    sub: `${t.kind} · ${shortAddress(t.contract)}`,
    value: t.selector ?? t.id,
  };
}

function profitToActivity(p: ProfitEvidence): Activity {
  const kind: ActivityKind = p.asset === "ETH" ? "eth" : "transfer";
  const assetLabel = p.asset === "ETH" ? "ETH" : p.asset;
  return {
    key: p.id,
    kind,
    dir: p.direction,
    label: `${p.direction === "in" ? "Received" : "Sent"} ${assetLabel}`,
    sub: `holder ${shortAddress(p.holder)}${p.token ? ` · token ${shortAddress(p.token)}` : ""}`,
    value: p.delta,
  };
}

export function deriveActivities(packet: EvidencePacket): Activity[] {
  const acts: Activity[] = [];
  for (const t of packet.triggers) acts.push(triggerToActivity(t, packet));
  for (const p of packet.profit) acts.push(profitToActivity(p));
  return acts;
}

const activityTypeStyle = (kind: ActivityKind, dir?: "in" | "out") => {
  if (kind === "transfer" || kind === "eth") {
    const out = dir === "out";
    return {
      bg: out ? "rgba(245,158,11,0.14)" : "rgba(34,197,94,0.14)",
      border: out ? "rgba(245,158,11,0.30)" : "rgba(34,197,94,0.30)",
      color: out ? "#facc15" : "#bbf7d0",
      label: kind === "eth" ? "ETH" : "TRANSFER",
      icon: out ? <HKI.arrowUp size={9} /> : <HKI.arrowDown size={9} />,
    };
  }
  if (kind === "approve") {
    return { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.18)", color: "#e5e5e5", label: "APPROVE", icon: null };
  }
  if (kind === "call") {
    return { bg: "rgba(255,255,255,0.10)", border: "rgba(255,255,255,0.25)", color: "#ffffff", label: "CALL", icon: null };
  }
  return { bg: "#262626", border: "rgba(255,255,255,0.10)", color: "#a1a1aa", label: "EVENT", icon: null };
};

const verdictStatusPill = (
  v: Verdict["verdict"],
  reverted: boolean,
): { className: string; label: string } => {
  if (reverted) return { className: "hk-pill pill-warning", label: "REVERTED" };
  if (v === "CONFIRMED") return { className: "hk-pill pill-error", label: "CONFIRMED EXPLOIT" };
  if (v === "OPEN") return { className: "hk-pill pill-warning", label: "OPEN" };
  return { className: "hk-pill pill-success", label: "LIKELY BENIGN" };
};

const verdictTypeLabel = (
  v: Verdict,
  reverted: boolean,
): { type: string; category: string } => {
  if (reverted) {
    return { type: "Reverted transaction", category: "No state changed — cannot be an exploit" };
  }
  if (v.verdict === "CONFIRMED") return { type: "Exploit detected", category: "Security · High confidence" };
  if (v.verdict === "OPEN") return { type: "Needs review", category: "Security · Inconclusive" };
  return { type: "Routine transaction", category: "Evidence insufficient for exploit claim" };
};

const pickHeadline = (verdict: Verdict, packet: EvidencePacket): string => {
  if (verdict.coreContradiction?.actual) return verdict.coreContradiction.actual;
  const firstCausal = verdict.causalChain[0]?.description;
  if (firstCausal) return firstCausal;
  return `Transaction from ${shortAddress(packet.from)} to ${shortAddress(packet.to)}${packet.success ? "" : " (reverted)"}.`;
};

const pickNarrative = (verdict: Verdict): string | null => {
  if (verdict.coreContradiction) {
    return `Expected: ${verdict.coreContradiction.expected}`;
  }
  if (verdict.causalChain.length > 1) {
    return verdict.causalChain
      .slice(1, 3)
      .map((s) => s.description)
      .join(" ");
  }
  if (verdict.missingEvidence.length > 0) {
    return verdict.missingEvidence[0];
  }
  return null;
};

interface SummaryCardProps {
  verdict: Verdict;
  packet: EvidencePacket;
  txHash: string | null;
  chainName?: string;
  busy?: boolean;
  onDeepScan?: () => void;
  onCopyHash?: () => void;
  error?: { title: string; detail?: string } | null;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({
  verdict,
  packet,
  txHash,
  chainName,
  busy,
  onDeepScan,
  onCopyHash,
  error,
}) => {
  const [filter, setFilter] = React.useState<ActivityFilter>("all");
  const activities = React.useMemo(() => deriveActivities(packet), [packet]);

  const total = activities.length;
  const counts = {
    transfer: activities.filter((a) => a.kind === "transfer" || a.kind === "eth").length,
    call: activities.filter((a) => a.kind === "call").length,
    event: activities.filter((a) => a.kind === "event").length,
    approve: activities.filter((a) => a.kind === "approve").length,
  };
  const visible = activities.filter((a) => {
    if (filter === "all") return true;
    if (filter === "transfer") return a.kind === "transfer" || a.kind === "eth";
    return a.kind === filter;
  });

  const reverted = packet.success === false;
  const status = verdictStatusPill(verdict.verdict, reverted);
  const typeLabel = verdictTypeLabel(verdict, reverted);
  const headline = reverted
    ? packet.revertReason
      ? `Reverted: ${packet.revertReason}`
      : pickHeadline(verdict, packet)
    : pickHeadline(verdict, packet);
  const narrative = reverted
    ? "The transaction reverted, so no state was modified. A reverted call cannot be a successful exploit — the LLM verdict is shown below for context only."
    : pickNarrative(verdict);
  const confidencePct = reverted ? 0 : Math.round(verdict.confidence * 100);
  const displayHash = txHash ?? packet.txHash ?? null;

  const FilterPill: React.FC<{ id: ActivityFilter; label: string; n: number }> = ({ id, label, n }) => {
    const active = filter === id;
    return (
      <button
        type="button"
        onClick={() => setFilter(id)}
        className={`hk-pill ${active ? "pill-accent" : "pill-default"}`}
        style={{ cursor: "pointer", fontFamily: "var(--font-body)" }}
      >
        {label}
        <span className="mono" style={{ opacity: 0.6, marginLeft: 2 }}>
          {n}
        </span>
      </button>
    );
  };

  return (
    <HexKitRoot>
      <div className="hk-card-elevated" style={{ padding: 0, overflow: "hidden" }}>
        <div
          className="hk-summary-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(240px, 280px) 1fr",
            minHeight: 260,
          }}
        >
          <div
            style={{
              background: "#171717",
              padding: 22,
              borderRight: "1px solid var(--border-primary)",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <HKI.hex size={18} />
              <span className="brand-wordmark" style={{ color: "#fafafa", fontSize: 12 }}>HEXKIT</span>
              <span className="mono" style={{ color: "#71717a", fontSize: 11 }}>· summary</span>
              {chainName ? (
                <span className="hk-pill pill-default pill-mono" style={{ marginLeft: "auto" }}>{chainName}</span>
              ) : null}
            </div>

            <div>
              <MicroLabel>Transaction type</MicroLabel>
              <div style={{ fontSize: 18, color: "#fafafa", fontWeight: 600, marginTop: 4 }}>{typeLabel.type}</div>
              <div className="mono" style={{ fontSize: 11, color: "#71717a" }}>{typeLabel.category}</div>
            </div>

            <div>
              <MicroLabel>Status</MicroLabel>
              <div style={{ marginTop: 6 }}>
                <span className={status.className}>
                  <span className="dot dot-glow" /> {status.label}
                </span>
              </div>
            </div>

            <div>
              <MicroLabel>Confidence</MicroLabel>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                <div style={{ flex: 1, height: 4, background: "#262626", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${confidencePct}%`, background: "#fafafa" }} />
                </div>
                <span className="mono" style={{ fontSize: 12, color: "#fafafa" }}>{confidencePct}%</span>
              </div>
            </div>

            <div style={{ marginTop: "auto", display: "flex", gap: 6 }}>
              <button
                type="button"
                className="hk-btn hk-btn-primary"
                style={{ flex: 1 }}
                onClick={onDeepScan}
                disabled={!onDeepScan || busy}
              >
                {busy ? "Scanning…" : "Deep scan"} <HKI.arrowRight size={12} />
              </button>
              <button
                type="button"
                className="hk-btn hk-btn-secondary"
                aria-label="copy hash"
                onClick={onCopyHash}
                disabled={!displayHash}
              >
                <HKI.copy size={12} />
              </button>
            </div>
          </div>

          <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <div style={{ fontSize: 18, color: "#fafafa", fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.35 }}>
              {headline}
            </div>
            {narrative ? (
              <div style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.6 }}>{narrative}</div>
            ) : null}

            {error ? (
              <div
                role="alert"
                style={{
                  border: "1px solid rgba(245,158,11,0.35)",
                  background: "rgba(245,158,11,0.08)",
                  color: "#facc15",
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontSize: 12.5,
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ display: "block", marginBottom: error.detail ? 2 : 0, fontWeight: 600 }}>{error.title}</strong>
                {error.detail ? <span style={{ color: "rgba(250,204,21,0.85)" }}>{error.detail}</span> : null}
              </div>
            ) : null}

            <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <MicroLabel>Activity · {total}</MicroLabel>
                <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
                  <FilterPill id="all" label="All" n={total} />
                  <FilterPill id="transfer" label="Transfers" n={counts.transfer} />
                  <FilterPill id="call" label="Calls" n={counts.call} />
                  <FilterPill id="event" label="Events" n={counts.event} />
                  <FilterPill id="approve" label="Approve" n={counts.approve} />
                </div>
              </div>

              <div
                style={{
                  position: "relative",
                  border: "1px solid var(--border-primary)",
                  borderRadius: 10,
                  background: "rgba(10,10,10,0.4)",
                }}
              >
                <div style={{ maxHeight: 320, overflowY: "auto" }}>
                  {visible.map((a, i) => {
                    const ts = activityTypeStyle(a.kind, a.dir);
                    return (
                      <div
                        key={a.key}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "112px 1fr auto",
                          gap: 12,
                          alignItems: "center",
                          padding: "11px 14px",
                          borderBottom:
                            i === visible.length - 1 ? "none" : "1px solid var(--border-secondary)",
                        }}
                      >
                        <span
                          className="hk-pill pill-mono"
                          style={{
                            background: ts.bg,
                            borderColor: ts.border,
                            color: ts.color,
                            justifySelf: "start",
                          }}
                        >
                          {ts.icon}
                          {ts.label}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 12,
                              color: "#fafafa",
                              fontWeight: 500,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {a.label}
                          </div>
                          {a.sub ? (
                            <div
                              className="mono"
                              style={{
                                fontSize: 10.5,
                                color: "#71717a",
                                marginTop: 2,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {a.sub}
                            </div>
                          ) : null}
                        </div>
                        {a.value ? (
                          <div style={{ textAlign: "right" }}>
                            <div className="mono" style={{ fontSize: 12, color: "#fafafa" }}>{a.value}</div>
                            {a.valueSub ? (
                              <div className="mono" style={{ fontSize: 10, color: "#71717a", marginTop: 2 }}>{a.valueSub}</div>
                            ) : null}
                          </div>
                        ) : (
                          <span />
                        )}
                      </div>
                    );
                  })}
                  {visible.length === 0 && (
                    <div style={{ padding: "22px 14px", textAlign: "center", fontSize: 12, color: "#71717a" }}>
                      No matching activity in this filter.
                    </div>
                  )}
                </div>
                <div
                  style={{
                    pointerEvents: "none",
                    position: "absolute",
                    left: 1,
                    right: 8,
                    bottom: 1,
                    height: 22,
                    background: "linear-gradient(180deg, rgba(28,28,28,0) 0%, rgba(28,28,28,0.9) 100%)",
                    borderBottomLeftRadius: 10,
                    borderBottomRightRadius: 10,
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto", paddingTop: 4 }}>
              <span className="label-caps">Hash</span>
              <span
                className="mono"
                style={{
                  fontSize: 12,
                  color: "#a1a1aa",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {displayHash ?? "—"}
              </span>
              {displayHash ? (
                <button
                  type="button"
                  className="hk-btn hk-btn-ghost"
                  style={{ padding: 4 }}
                  aria-label="copy hash"
                  onClick={onCopyHash}
                >
                  <HKI.copy size={11} />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </HexKitRoot>
  );
};

export default SummaryCard;
