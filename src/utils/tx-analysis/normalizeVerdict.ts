const VERDICT_SYNONYMS: Record<string, "CONFIRMED" | "OPEN" | "INSUFFICIENT"> = {
  CONFIRMED: "CONFIRMED",
  CONFIRMED_EXPLOIT: "CONFIRMED",
  HACK_CONFIRMED: "CONFIRMED",
  EXPLOIT: "CONFIRMED",
  EXPLOIT_CONFIRMED: "CONFIRMED",
  HACK: "CONFIRMED",
  MALICIOUS: "CONFIRMED",
  ATTACK: "CONFIRMED",
  OPEN: "OPEN",
  LIKELY_EXPLOIT: "OPEN",
  PROBABLE_EXPLOIT: "OPEN",
  POSSIBLE_EXPLOIT: "OPEN",
  HACK_LIKELY: "OPEN",
  LIKELY_MALICIOUS: "OPEN",
  POSSIBLY_MALICIOUS: "OPEN",
  SUSPICIOUS: "OPEN",
  UNCERTAIN: "OPEN",
  NEEDS_REVIEW: "OPEN",
  AMBIGUOUS: "OPEN",
  INSUFFICIENT: "INSUFFICIENT",
  INSUFFICIENT_EVIDENCE: "INSUFFICIENT",
  BENIGN: "INSUFFICIENT",
  LIKELY_BENIGN: "INSUFFICIENT",
  SAFE: "INSUFFICIENT",
  ROUTINE: "INSUFFICIENT",
  CLEAN: "INSUFFICIENT",
  NONE: "INSUFFICIENT",
};

function normalizeVerdictLabel(label: string): "CONFIRMED" | "OPEN" | "INSUFFICIENT" | null {
  const key = label.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (VERDICT_SYNONYMS[key]) return VERDICT_SYNONYMS[key];
  if (/^(LIKELY|PROBABLE|POSSIBLE)_/.test(key) && /(EXPLOIT|HACK|MALICIOUS|ATTACK)/.test(key)) {
    return "OPEN";
  }
  if (key.includes("CONFIRMED") && /(EXPLOIT|HACK|MALICIOUS|ATTACK)/.test(key)) {
    return "CONFIRMED";
  }
  if (/(BENIGN|SAFE|CLEAN|ROUTINE)/.test(key)) return "INSUFFICIENT";
  return null;
}

const STEP_SYNONYMS: Record<string, "Write" | "Read" | "Trigger" | "Profit"> = {
  WRITE: "Write",
  SSTORE: "Write",
  STORE: "Write",
  READ: "Read",
  SLOAD: "Read",
  TRIGGER: "Trigger",
  CALL: "Trigger",
  EVENT: "Trigger",
  LOG: "Trigger",
  PROFIT: "Profit",
  TRANSFER: "Profit",
};

/**
 * Strips a markdown ```json ... ``` envelope or trims to the outermost JSON
 * object so that JSON.parse can succeed even when the model wraps its reply
 * in fences or surrounding prose.
 */
function stripJsonEnvelope(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text.trim();
}

/**
 * Accepts whatever useLlmInvocation surfaces (already-parsed object, or raw
 * text with optional fences/prose) and returns a normalized JS object ready
 * for verdictSchema.parse. Throws if no JSON object can be recovered.
 */
export function parseAndNormalizeVerdict(input: unknown): unknown {
  if (input == null) {
    throw new Error("LLM returned no payload to normalize");
  }
  if (typeof input === "string") {
    const stripped = stripJsonEnvelope(input);
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripped);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`LLM did not return valid JSON: ${msg}`);
    }
    return normalizeVerdictPayload(parsed);
  }
  return normalizeVerdictPayload(input);
}

/**
 * Coerces a raw LLM payload toward the verdictSchema shape so that small
 * deviations (verdict label synonyms, confidence as a percent, step name
 * casing, missing optional arrays) don't trigger schema_invalid.
 *
 * Pure: returns a new object, never throws. Caller still passes the result
 * through verdictSchema.parse for the final shape check.
 */
export function normalizeVerdictPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const obj: Record<string, unknown> = { ...(raw as Record<string, unknown>) };

  if (typeof obj.verdict === "string") {
    const normalized = normalizeVerdictLabel(obj.verdict);
    if (normalized) obj.verdict = normalized;
  }

  if (typeof obj.confidence === "number" && Number.isFinite(obj.confidence)) {
    let c = obj.confidence;
    if (c > 1) c = c / 100;
    if (c < 0) c = 0;
    if (c > 1) c = 1;
    obj.confidence = c;
  } else if (typeof obj.confidence === "string") {
    const parsed = Number.parseFloat(obj.confidence);
    if (Number.isFinite(parsed)) {
      let c = parsed;
      if (c > 1) c = c / 100;
      if (c < 0) c = 0;
      if (c > 1) c = 1;
      obj.confidence = c;
    }
  }

  if (Array.isArray(obj.causalChain)) {
    obj.causalChain = obj.causalChain
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const e = entry as Record<string, unknown>;
        let step = e.step;
        if (typeof step === "string") {
          const key = step.trim().toUpperCase();
          if (STEP_SYNONYMS[key]) step = STEP_SYNONYMS[key];
        }
        if (step !== "Write" && step !== "Read" && step !== "Trigger" && step !== "Profit") return null;
        const description = typeof e.description === "string" ? e.description : null;
        const evidenceId =
          typeof e.evidenceId === "string"
            ? e.evidenceId
            : typeof e.evidence_id === "string"
            ? e.evidence_id
            : null;
        if (description == null || evidenceId == null) return null;
        return { step, description, evidenceId };
      })
      .filter((s): s is { step: "Write" | "Read" | "Trigger" | "Profit"; description: string; evidenceId: string } => s !== null);
  } else if (obj.causalChain == null) {
    obj.causalChain = [];
  }

  if (Array.isArray(obj.gates)) {
    obj.gates = obj.gates
      .map((g) => {
        if (!g || typeof g !== "object") return null;
        const gate = g as Record<string, unknown>;
        if (typeof gate.name !== "string") return null;
        const bypassedBy =
          typeof gate.bypassedBy === "string"
            ? gate.bypassedBy
            : typeof gate.bypassed_by === "string"
            ? gate.bypassed_by
            : null;
        return { name: gate.name, bypassedBy };
      })
      .filter((g): g is { name: string; bypassedBy: string | null } => g !== null);
  } else if (obj.gates == null) {
    obj.gates = [];
  }

  if (Array.isArray(obj.missingEvidence)) {
    obj.missingEvidence = obj.missingEvidence.filter((s): s is string => typeof s === "string");
  } else if (obj.missingEvidence == null) {
    obj.missingEvidence = [];
  }

  if (obj.coreContradiction && typeof obj.coreContradiction === "object" && !Array.isArray(obj.coreContradiction)) {
    const cc = obj.coreContradiction as Record<string, unknown>;
    if (typeof cc.expected !== "string" || typeof cc.actual !== "string") {
      obj.coreContradiction = null;
    }
  } else if (obj.coreContradiction !== null && obj.coreContradiction !== undefined) {
    obj.coreContradiction = null;
  }

  if (obj.riskBound && typeof obj.riskBound === "object" && !Array.isArray(obj.riskBound)) {
    const rb = obj.riskBound as Record<string, unknown>;
    if (typeof rb.upperBoundEth !== "string" || typeof rb.rationale !== "string") {
      obj.riskBound = null;
    }
  }

  return obj;
}
