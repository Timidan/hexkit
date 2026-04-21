import type { Incident } from "./types";
import type { ClassifierLabel } from "./classifier";

export interface RetrievalInput {
  labels: ClassifierLabel[];
  corpus: Incident[];
  chainHint: string;
  k: number;
}

export function retrieveAnalogs({
  labels,
  corpus,
  chainHint,
  k,
}: RetrievalInput): Incident[] {
  const wanted = new Set(
    labels.filter((l) => l.class !== "unknown").map((l) => l.class)
  );
  if (wanted.size === 0) return [];

  const scored = corpus
    .map((incident) => {
      const overlap = incident.exploitClasses.filter((c) =>
        wanted.has(c)
      ).length;
      if (overlap === 0) return null;

      const chainBonus = incident.chain === chainHint ? 0.25 : 0;
      return { incident, score: overlap + chainBonus };
    })
    .filter((x): x is { incident: Incident; score: number } => x !== null);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((x) => x.incident);
}
