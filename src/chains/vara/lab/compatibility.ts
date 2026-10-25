import type { SailsIdl } from "../decode";
import { loadIdlModel } from "../idlForm";
import { decodeCall, encodeArgs } from "../decode";
import type { Hex, IdlModel } from "../model";
import { errorText, jsonText } from "./files";

export interface InterfaceChange { route: string; kind: "added" | "removed" | "changed"; detail: string }
function signatures(model: IdlModel) {
  return new Map<string, unknown>(model.services.flatMap((s) => [
    ...s.methods.map((m) => [`${s.name}.${m.name}`, { kind: m.kind, params: m.params, returns: m.returns }] as const),
    ...s.events.map((e) => [`${s.name}.event:${e.name}`, { kind: "event", schema: e.schema }] as const),
  ]));
}
export function compareModels(before: IdlModel, after: IdlModel): InterfaceChange[] {
  const a = signatures(before), b = signatures(after), changes: InterfaceChange[] = [];
  for (const [route, signature] of a) {
    if (!b.has(route)) changes.push({ route, kind: "removed", detail: "Old callers or decoders can no longer resolve this route." });
    else if (jsonText(signature) !== jsonText(b.get(route))) changes.push({ route, kind: "changed", detail: "Signature changed. Check parameter order, types, names, return values, and enum variant order before upgrading clients." });
  }
  for (const route of b.keys()) if (!a.has(route)) changes.push({ route, kind: "added", detail: "New route; existing routes are retained." });
  return changes;
}

export function checkPayload(payload: string, sails: SailsIdl) {
  try {
    if (!/^0x([\da-f]{2})*$/i.test(payload) || payload.length > 131074) throw new Error("Expected hex payload up to 64 KiB");
    const call = decodeCall(payload as Hex, sails);
    if (call.error || !call.service || !call.name) throw new Error(call.error ?? "Unknown method");
    const kind = sails.services[call.service].functions[call.name] ? "functions" : "queries";
    const encoded = encodeArgs(sails, call.service, call.name, kind, call.value);
    if (encoded.toLowerCase() !== payload.toLowerCase()) throw new Error("Payload does not round-trip exactly; bytes were ignored or interpreted differently");
    return { ok: true, route: `${call.service}.${call.name}`, value: call.value, error: null };
  } catch (err) { return { ok: false, route: null, value: null, error: errorText(err) }; }
}

export async function compareInterfaces(before: string, after: string, payloads: string[]) {
  if (payloads.length > 100) throw new Error("Compare at most 100 saved payloads at a time");
  const a = await loadIdlModel(before), b = await loadIdlModel(after);
  return { changes: compareModels(a.model, b.model), routesBefore: signatures(a.model).size, routesAfter: signatures(b.model).size,
    payloads: payloads.map((payload) => ({ payload, before: checkPayload(payload, a.sails), after: checkPayload(payload, b.sails) })) };
}
