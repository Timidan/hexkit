// src/utils/hack-analysis/llm.ts
import { hackAnalysisSchema, type HackAnalysis, type Incident } from "./types";
import type { EvidencePacket } from "../tx-analysis/types";
import type { ClassifierLabel } from "./classifier";
import type { LlmInvokeFn } from "../tx-analysis/llm";

export const HACK_SYSTEM_PROMPT = `You are TxCaptain-Forensics, writing a hack-incident post-mortem from on-chain evidence ONLY.

Rules you MUST follow:
1. Ground every attackSteps[i].evidenceIds entry in the evidence ids provided (writes w_*, reads r_*, triggers t_*, profit p_*). If an id is not in the evidence, do NOT cite it.
2. Do NOT invent addresses, tokens, amounts, or txs not present in the evidence or the analogous incidents.
3. Treat the classifier labels as a floor. Add classes only when the evidence clearly supports them. Remove classes that the evidence contradicts.
4. If the evidence is insufficient, return verdict HACK_UNCERTAIN or LOOKS_BENIGN and list gaps in missingEvidence.
5. Use analogous incidents for framing ONLY. Do not copy their addresses or amounts. Cite which analog ids informed the framing in analogIncidentIds.
6. Respond with a JSON object matching the declared schema exactly. No prose outside JSON.

Required JSON shape (all keys present; use null / [] / "" when unknown):
{
  "verdict": "HACK_CONFIRMED" | "HACK_LIKELY" | "HACK_UNCERTAIN" | "LOOKS_BENIGN",
  "confidence": number 0..1,
  "headline": string,
  "coreContradiction": string,
  "exploitClasses": [ { "class": string, "confidence": number, "rationale": string } ],
  "entities": [ { "role": string, "address": "0x..." (EIP-55), "label": string } ],
  "attackSteps": [ { "order": number, "label": string, "detail": string, "evidenceIds": string[] } ],
  "fundFlow": [ { "fromLabel": string, "toLabel": string, "tokenSymbol": string|null, "amountHuman": string|null } ],
  "analogIncidentIds": string[],
  "missingEvidence": string[],
  "caveats": string[]
}`;

export interface RunHackAnalysisInput {
  packet: EvidencePacket;
  labels: ClassifierLabel[];
  analogs: Incident[];
  invoke: LlmInvokeFn;
  signal?: AbortSignal;
}

export function validateEvidenceReferences(
  analysis: HackAnalysis,
  packet: EvidencePacket,
  analogs: Incident[],
): { badEvidenceIds: string[]; badAnalogIds: string[] } {
  const validIds = new Set<string>([
    ...packet.writes.map((w) => w.id),
    ...packet.reads.map((r) => r.id),
    ...packet.triggers.map((t) => t.id),
    ...packet.profit.map((p) => p.id),
  ]);
  const validAnalogIds = new Set<string>(analogs.map((a) => a.id));
  const badEvidenceIds = Array.from(
    new Set(analysis.attackSteps.flatMap((s) => s.evidenceIds.filter((id) => !validIds.has(id)))),
  );
  const badAnalogIds = analysis.analogIncidentIds.filter((id) => !validAnalogIds.has(id));
  return { badEvidenceIds, badAnalogIds };
}

function buildUserPrompt(input: RunHackAnalysisInput): string {
  return JSON.stringify({
    instruction: "Analyze the following tx as a suspected hack and return the structured JSON.",
    classifierLabels: input.labels,
    analogousIncidents: input.analogs.map((a) => ({
      id: a.id, name: a.name, protocol: a.protocol, exploitClasses: a.exploitClasses,
      coreContradiction: a.coreContradiction, tldr: a.tldr,
    })),
    evidence: {
      txHash: input.packet.txHash, chainId: input.packet.chainId,
      from: input.packet.from, to: input.packet.to,
      success: input.packet.success, revertReason: input.packet.revertReason,
      writes: input.packet.writes, reads: input.packet.reads,
      triggers: input.packet.triggers, profit: input.packet.profit,
      contracts: input.packet.contracts, heuristics: input.packet.heuristics,
      truncated: input.packet.truncated,
    },
  });
}

export async function runHackAnalysis(input: RunHackAnalysisInput): Promise<HackAnalysis> {
  const raw = await input.invoke({
    system: HACK_SYSTEM_PROMPT,
    user: buildUserPrompt(input),
    responseSchema: hackAnalysisSchema,
    signal: input.signal,
  });
  const parsed = hackAnalysisSchema.parse(raw);
  const report = validateEvidenceReferences(parsed, input.packet, input.analogs);

  if (report.badEvidenceIds.length === 0 && report.badAnalogIds.length === 0) return parsed;

  const cleaned: HackAnalysis = {
    ...parsed,
    attackSteps: parsed.attackSteps.map((s) => ({
      ...s,
      evidenceIds: s.evidenceIds.filter((id) => !report.badEvidenceIds.includes(id)),
    })),
    analogIncidentIds: parsed.analogIncidentIds.filter((id) => !report.badAnalogIds.includes(id)),
    caveats: [
      ...parsed.caveats,
      ...(report.badEvidenceIds.length ? [`LLM dropped ${report.badEvidenceIds.length} unknown evidenceIds: ${report.badEvidenceIds.join(", ")}`] : []),
      ...(report.badAnalogIds.length    ? [`LLM dropped ${report.badAnalogIds.length} unknown analogIncidentIds: ${report.badAnalogIds.join(", ")}`] : []),
    ],
  };
  return cleaned;
}
