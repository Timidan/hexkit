import React from "react";
import type { Verdict } from "../../utils/tx-analysis/types";

const verdictClass: Record<Verdict["verdict"], string> = {
  CONFIRMED: "tx-verdict tx-verdict--confirmed",
  OPEN: "tx-verdict tx-verdict--open",
  INSUFFICIENT: "tx-verdict tx-verdict--insufficient",
};

interface Props {
  verdict: Verdict;
  onOpenDeepDive?: () => void;
}

export const VerdictCard: React.FC<Props> = ({ verdict, onOpenDeepDive }) => {
  return (
    <article className={verdictClass[verdict.verdict]}>
      <header className="tx-verdict__header">
        <h2>{verdict.verdict}</h2>
        <span className="tx-verdict__confidence">{(verdict.confidence * 100).toFixed(0)}% confidence</span>
      </header>

      {verdict.coreContradiction ? (
        <section className="tx-verdict__contradiction">
          <h3>Core Contradiction</h3>
          <dl>
            <dt>Expected</dt><dd>{verdict.coreContradiction.expected}</dd>
            <dt>Actual</dt><dd>{verdict.coreContradiction.actual}</dd>
          </dl>
        </section>
      ) : null}

      {verdict.causalChain.length > 0 ? (
        <section className="tx-verdict__chain">
          <h3>Causal Chain</h3>
          <ol>
            {verdict.causalChain.map((s) => (
              <li key={s.evidenceId}><strong>{s.step}</strong> — {s.description} <code>{s.evidenceId}</code></li>
            ))}
          </ol>
        </section>
      ) : null}

      {verdict.gates.length > 0 ? (
        <section className="tx-verdict__gates">
          <h3>Gates</h3>
          <ul>
            {verdict.gates.map((g) => (
              <li key={g.name}><code>{g.name}</code>{g.bypassedBy ? ` — bypassed by ${g.bypassedBy}` : ""}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {verdict.riskBound ? (
        <section className="tx-verdict__risk">
          <h3>Risk Upper Bound</h3>
          <p><strong>{verdict.riskBound.upperBoundEth} ETH</strong> — {verdict.riskBound.rationale}</p>
        </section>
      ) : null}

      {verdict.missingEvidence.length > 0 ? (
        <section className="tx-verdict__missing">
          <h3>Missing Evidence</h3>
          <ul>{verdict.missingEvidence.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </section>
      ) : null}

      {onOpenDeepDive && !verdict.deepDive ? (
        <button type="button" onClick={onOpenDeepDive} className="tx-verdict__deep-dive-button">
          Run Deep Dive
        </button>
      ) : null}
    </article>
  );
};
