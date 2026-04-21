import { incidentSchema, validateCrossRefs, type Incident } from "../types";

const jsonModules = import.meta.glob<Record<string, unknown>>(
  "./*.json",
  { eager: true, import: "default" },
);

let cached: Incident[] | null = null;

export function loadIncidents(): Incident[] {
  if (cached) return cached;
  const out: Incident[] = [];
  for (const [path, mod] of Object.entries(jsonModules)) {
    const parsed = incidentSchema.safeParse(mod);
    if (!parsed.success) throw new Error(`Invalid incident JSON at ${path}: ${parsed.error.message}`);
    const refErrs = validateCrossRefs(parsed.data);
    if (refErrs.length) throw new Error(`Cross-ref errors in ${path}: ${refErrs.join("; ")}`);
    out.push(parsed.data);
  }
  cached = out;
  return out;
}

export function getIncidentById(id: string): Incident | undefined {
  return loadIncidents().find((i) => i.id === id);
}
