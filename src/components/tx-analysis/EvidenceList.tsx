import React from "react";
import type { EvidencePacket } from "../../utils/tx-analysis/types";

interface Props {
  packet: EvidencePacket;
}

const Section: React.FC<{ title: string; count: number; truncated: boolean; children: React.ReactNode }> = ({
  title, count, truncated, children,
}) => (
  <section className="tx-evidence-section">
    <header className="tx-evidence-section__header">
      <h3>{title} ({count})</h3>
      {truncated ? <span className="tx-evidence-truncated">truncated</span> : null}
    </header>
    {children}
  </section>
);

const short = (v: string) => (v.length > 14 ? `${v.slice(0, 10)}…${v.slice(-4)}` : v);

export const EvidenceList: React.FC<Props> = ({ packet }) => {
  return (
    <div className="tx-evidence-list">
      <Section title="Writes" count={packet.writes.length} truncated={packet.truncated.writes}>
        <table className="tx-evidence-table">
          <thead><tr><th>Contract</th><th>Slot</th><th>Before</th><th>After</th><th>Source</th></tr></thead>
          <tbody>
            {packet.writes.map((w) => (
              <tr key={w.id}>
                <td title={w.contract}>{short(w.contract)}</td>
                <td>{w.slot}</td>
                <td>{w.valueBefore ?? "∅"}</td>
                <td>{w.valueAfter}</td>
                <td>{w.sourceFile ? `${w.sourceFile}:${w.sourceLine ?? "?"}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Reads" count={packet.reads.length} truncated={packet.truncated.reads}>
        <table className="tx-evidence-table">
          <thead><tr><th>Contract</th><th>Slot</th><th>Value</th><th>Follows</th></tr></thead>
          <tbody>
            {packet.reads.map((r) => (
              <tr key={r.id}>
                <td title={r.contract}>{short(r.contract)}</td>
                <td>{r.slot}</td>
                <td>{r.value}</td>
                <td>{r.followsWriteId ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Triggers" count={packet.triggers.length} truncated={packet.truncated.triggers}>
        <ul>
          {packet.triggers.map((t) => (
            <li key={t.id}>
              <code>{t.kind}</code> {t.function ?? t.selector ?? "?"} → {short(t.contract)}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Profit" count={packet.profit.length} truncated={packet.truncated.profit}>
        <ul>
          {packet.profit.map((p) => (
            <li key={p.id}>{p.asset} {p.direction === "in" ? "+" : "-"}{p.delta} @ {short(p.holder)}</li>
          ))}
        </ul>
      </Section>

      {packet.heuristics.length > 0 ? (
        <Section title="Heuristics" count={packet.heuristics.length} truncated={false}>
          <ul>
            {packet.heuristics.map((h, i) => (
              <li key={`${h.name}_${i}`}><strong>{h.name}</strong>: {h.reason}</li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
};
