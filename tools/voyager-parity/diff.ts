// Pairwise diff over captured fixtures. Reads
// fixtures/{theirs,ours}.<tab>.json, applies normalize() per field,
// classifies each row, and emits a markdown report.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SCHEMA, FieldSpec } from "./schema";

const __dirname = dirname(fileURLToPath(import.meta.url));

type Verdict = "match" | "format" | "missing" | "extra" | "error";

interface DiffRow {
  tab: string;
  field: string;
  weight: number;
  ours: unknown;
  theirs: unknown;
  oursNorm: string | null;
  theirsNorm: string | null;
  verdict: Verdict;
}

const FIXTURE_DIR = join(__dirname, "fixtures");

function loadFixture(side: "ours" | "theirs", tab: string): Record<string, unknown> {
  try {
    const buf = readFileSync(join(FIXTURE_DIR, `${side}.${tab}.json`), "utf8");
    return JSON.parse(buf).fields ?? {};
  } catch {
    return {};
  }
}

function classify(spec: FieldSpec, oursRaw: unknown, theirsRaw: unknown): {
  oursNorm: string | null;
  theirsNorm: string | null;
  verdict: Verdict;
} {
  const norm = spec.normalize ?? ((v) => (v == null ? null : String(v)));
  const isErrShape = (v: unknown) => v && typeof v === "object" && "__error" in (v as object);
  if (isErrShape(oursRaw) || isErrShape(theirsRaw)) {
    return { oursNorm: null, theirsNorm: null, verdict: "error" };
  }
  const o = oursRaw == null ? null : norm(oursRaw as never);
  const t = theirsRaw == null ? null : norm(theirsRaw as never);
  if (t == null && o == null) return { oursNorm: o, theirsNorm: t, verdict: "match" };
  if (t != null && o == null) return { oursNorm: o, theirsNorm: t, verdict: "missing" };
  if (t == null && o != null) return { oursNorm: o, theirsNorm: t, verdict: "extra" };
  if (o === t) return { oursNorm: o, theirsNorm: t, verdict: "match" };
  return { oursNorm: o, theirsNorm: t, verdict: "format" };
}

function verdictGlyph(v: Verdict): string {
  return { match: "✅", format: "⚠️", missing: "❌", extra: "➕", error: "🛑" }[v];
}

function compute(): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const [tab, spec] of Object.entries(SCHEMA)) {
    const ours = loadFixture("ours", tab);
    const theirs = loadFixture("theirs", tab);
    for (const [name, fspec] of Object.entries(spec.fields)) {
      const { oursNorm, theirsNorm, verdict } = classify(
        fspec,
        ours[name],
        theirs[name],
      );
      rows.push({
        tab,
        field: name,
        weight: fspec.weight ?? 2,
        ours: ours[name] ?? null,
        theirs: theirs[name] ?? null,
        oursNorm,
        theirsNorm,
        verdict,
      });
    }
  }
  return rows;
}

function summary(rows: DiffRow[]): string {
  const total = rows.length;
  const counts = rows.reduce(
    (acc, r) => {
      acc[r.verdict] = (acc[r.verdict] ?? 0) + 1;
      return acc;
    },
    { match: 0, format: 0, missing: 0, extra: 0, error: 0 } as Record<Verdict, number>,
  );
  const pct = (n: number) => ((n / total) * 100).toFixed(1);
  return [
    `**${counts.match} / ${total} fields match (${pct(counts.match)}%)**`,
    counts.format > 0 ? `${counts.format} format-only differences` : null,
    counts.missing > 0 ? `**${counts.missing} missing on our side**` : null,
    counts.extra > 0 ? `${counts.extra} extra on our side` : null,
    counts.error > 0 ? `${counts.error} extraction errors` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function renderMarkdown(rows: DiffRow[]): string {
  const out: string[] = [];
  out.push("# Voyager parity report");
  out.push("");
  out.push(summary(rows));
  out.push("");
  const grouped = new Map<string, DiffRow[]>();
  for (const r of rows) {
    if (!grouped.has(r.tab)) grouped.set(r.tab, []);
    grouped.get(r.tab)!.push(r);
  }
  for (const [tab, tabRows] of grouped) {
    out.push(`## \`${tab}\``);
    out.push("");
    out.push("| | weight | field | voyager | ours | normalised diff |");
    out.push("|---|---|---|---|---|---|");
    for (const r of tabRows) {
      const valTheirs = r.theirs == null ? "—" : ellipsis(String(r.theirs));
      const valOurs = r.ours == null ? "—" : ellipsis(String(r.ours));
      const normDiff =
        r.verdict === "format" ? `\`${r.theirsNorm}\` vs \`${r.oursNorm}\`` : "";
      out.push(
        `| ${verdictGlyph(r.verdict)} | ${r.weight} | \`${r.field}\` | ${valTheirs} | ${valOurs} | ${normDiff} |`,
      );
    }
    out.push("");
  }
  return out.join("\n");
}

function ellipsis(s: string): string {
  if (s.length <= 60) return s.replace(/\n+/g, " ⏎ ");
  return s.slice(0, 57).replace(/\n+/g, " ⏎ ") + "…";
}

function main() {
  const rows = compute();
  const md = renderMarkdown(rows);
  const dest = join(__dirname, "report.md");
  writeFileSync(dest, md);
  process.stdout.write(md);
  console.error(`\n\nWrote ${dest}`);
}

main();
