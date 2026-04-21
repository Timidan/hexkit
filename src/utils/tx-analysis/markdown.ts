import type { Verdict } from "./types";

export function verdictToMarkdown(v: Verdict): string {
  const lines: string[] = [];
  lines.push(`# Verdict: ${v.verdict}`, "");
  lines.push(`Confidence: ${(v.confidence * 100).toFixed(0)}%`, "");

  if (v.coreContradiction) {
    lines.push("## Core Contradiction", "");
    lines.push(`- Expected: ${v.coreContradiction.expected}`);
    lines.push(`- Actual: ${v.coreContradiction.actual}`, "");
  }

  if (v.causalChain.length > 0) {
    lines.push("## Causal Chain", "");
    for (const s of v.causalChain) {
      lines.push(`1. **${s.step}** — ${s.description} (\`${s.evidenceId}\`)`);
    }
    lines.push("");
  }

  if (v.gates.length > 0) {
    lines.push("## Gates", "");
    for (const g of v.gates) {
      lines.push(`- \`${g.name}\`${g.bypassedBy ? ` — bypassed by ${g.bypassedBy}` : ""}`);
    }
    lines.push("");
  }

  if (v.riskBound) {
    lines.push("## Risk Upper Bound", "");
    lines.push(`**${v.riskBound.upperBoundEth} ETH** — ${v.riskBound.rationale}`, "");
  }

  if (v.deepDive) {
    lines.push("## Deep Dive", "");
    lines.push(`Verdict upgrade: ${v.deepDive.verdictUpgrade}`, "");
    for (const tb of v.deepDive.trustBoundaries) {
      lines.push(`### ${tb.contract} (${tb.sourceQuality})`);
      for (const f of tb.findings) lines.push(`- ${f}`);
      lines.push("");
    }
  }

  if (v.missingEvidence.length > 0) {
    lines.push("## Missing Evidence", "");
    for (const m of v.missingEvidence) lines.push(`- ${m}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
