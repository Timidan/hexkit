import type { VaraCase } from "../case";
import { CaseSchema } from "../case";
import type { Trace } from "../model";

export function diagnoseCase(c: VaraCase, trace: Trace | null, application: "ok" | "err" | "unknown" = "unknown") {
  const root = trace?.nodes.find((n) => n.id.toLowerCase() === c.message?.id.toLowerCase());
  const dispatch = root?.steps.filter((s) => s.kind === "dispatched").at(-1)?.detail ?? c.message?.dispatchStatus;
  const latest = root?.steps.filter((s) => ["waited", "woken", "dispatched"].includes(s.kind)).at(-1);
  const tracedReply = trace?.nodes.find((n) => n.kind === "reply" && n.parent?.toLowerCase() === c.message?.id.toLowerCase());
  const reply = tracedReply ? { success: tracedReply.replySuccess, code: tracedReply.replyCode, payload: tracedReply.payload } : c.message?.reply;
  const findings: { title: string; evidence: string; action: string }[] = [];
  const errorEvidence = [c.result.error, dispatch === "Failed" ? dispatch : null, reply?.success === false ? reply.code : null].filter(Boolean).join(" · ");
  if (!c.result.success) findings.push({ title: "Extrinsic rejected", evidence: c.result.error ?? "ExtrinsicFailed in the case", action: /voucher/i.test(c.result.error ?? "") ? "Check voucher owner, scope, expiry, and balance in Gas & Vouchers." : "Review the runtime dispatch error before changing the program payload." });
  if (dispatch === "Failed" || reply?.success === false) findings.push({ title: /gas/i.test(errorEvidence) ? "Execution resource failure" : "Program execution failed", evidence: errorEvidence || String(reply?.code), action: /gas/i.test(errorEvidence) ? "Re-estimate resources and inspect downstream reservations and waits." : "Inspect the reply payload and reproduce the message with the correct WASM and state setup in Scenario Tests." });
  if (latest?.kind === "waited") findings.push({ title: "Wait observed; no later wake or dispatch observed", evidence: `MessageWaited at block ${latest.block}: ${latest.detail ?? "reason unavailable"}`, action: "Inspect downstream messages and widen the trace window. An absent reply alone does not prove a timeout." });
  if (dispatch === "NotExecuted") findings.push({ title: "Message was not executed", evidence: "MessagesDispatched recorded NotExecuted", action: "Check the program lifecycle and the runtime reason around the dispatch block." });
  if (application === "err") findings.push({ title: "Application returned Result::Err", evidence: "Successful transport reply decoded as the IDL method’s Result error variant", action: "Inspect the decoded application error; increasing gas will not change a rejected business condition." });
  if (c.message && !reply) findings.push({ title: "No root reply in this evidence", evidence: `Case block ${c.block.number}${trace ? `; trace covers ${trace.fromBlock}–${trace.toBlock}` : "; no follow-up trace loaded"}`, action: "Trace subsequent blocks. Missing observation is not a failed message or proof that it is still pending." });
  const statuses = [
    { stage: "Included", status: `Block ${c.block.number} · ${c.result.success ? "extrinsic accepted" : "extrinsic failed"}` },
    { stage: "Processed", status: dispatch ?? (latest?.kind === "waited" ? "Wait observed" : c.message ? "Not observed" : "No message queued") },
    { stage: "Reply", status: !reply ? "Not observed" : reply.success === true ? "Successful reply code" : reply.success === false ? "Error reply code" : "Code unavailable" },
    { stage: "Application", status: application === "ok" ? "Result::Ok decoded" : application === "err" ? "Result::Err decoded" : "Outcome not evaluated" },
  ];
  const timeline = (trace?.nodes.flatMap((n) => [
    ...n.steps.map((s) => ({ block: s.block, program: n.destination ?? n.source, message: n.id, event: s.kind, detail: s.detail })),
    ...(n.kind !== "root" && n.block !== null ? [{ block: n.block, program: n.source, message: n.id, event: n.kind, detail: n.replyCode }] : []),
  ]) ?? []).sort((a,b) => a.block - b.block);
  return { statuses, findings, timeline, reply, coveredThrough: trace?.toBlock ?? c.block.number };
}

const SAVED_KEY = "hexkit.vara.investigations.v1";
export interface SavedCase { key: string; savedAt: string; c: VaraCase }
export function readInvestigations(): SavedCase[] {
  const text = localStorage.getItem(SAVED_KEY);
  if (!text) return [];
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error("Saved investigations are invalid; existing storage was preserved");
  return value.map((v) => {
    if (!v || typeof v.key !== "string" || typeof v.savedAt !== "string") throw new Error("Saved investigation metadata is invalid");
    return { key: v.key, savedAt: v.savedAt, c: CaseSchema.parse(v.c) };
  });
}
export function saveInvestigation(c: VaraCase) {
  const key = `${c.network.genesisHash}:${c.block.hash}:${c.extrinsicIndex}:${c.messageIndex ?? 0}`;
  const previous = readInvestigations();
  const saved = [{ key, savedAt: new Date().toISOString(), c }, ...previous.filter((s) => s.key !== key)];
  if (saved.length > 20) throw new Error("20 investigations are already saved. Export your cases to files; existing saved cases were preserved.");
  localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  return saved;
}
