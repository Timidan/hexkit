import React from "react";
import type { Verdict } from "../../utils/tx-analysis/types";

interface Props {
  open: boolean;
  onClose: () => void;
  verdict: Verdict;
}

export const DeepDiveDrawer: React.FC<Props> = ({ open, onClose, verdict }) => {
  if (!open) return null;
  return (
    <div className="tx-deep-dive-drawer" role="dialog" aria-modal="true">
      <header className="tx-deep-dive-drawer__header">
        <h2>Deep Dive</h2>
        <button type="button" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="tx-deep-dive-drawer__body">
        {verdict.deepDive ? (
          <>
            <p>Verdict upgrade: <strong>{verdict.deepDive.verdictUpgrade}</strong></p>
            {verdict.deepDive.additionalRiskBound ? (
              <p>
                Additional risk bound: <strong>{verdict.deepDive.additionalRiskBound.upperBoundEth} ETH</strong>
                {" "}— {verdict.deepDive.additionalRiskBound.rationale}
              </p>
            ) : null}
            <ul>
              {verdict.deepDive.trustBoundaries.map((tb) => (
                <li key={tb.contract}>
                  <h4>{tb.contract} <small>({tb.sourceQuality})</small></h4>
                  <ul>{tb.findings.map((f, i) => <li key={i}>{f}</li>)}</ul>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>No deep dive yet.</p>
        )}
      </div>
    </div>
  );
};
