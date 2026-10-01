import { Sails, getFnNamePrefix, getServiceNamePrefix } from "sails-js";
import { SailsIdlParser } from "sails-js-parser";

type Hex = `0x${string}`;
export interface Decoded { service: string | null; name: string | null; value: unknown; error: string | null }

let parser: Promise<SailsIdlParser> | null = null;
export async function loadIdl(text: string): Promise<Sails> {
  parser ??= SailsIdlParser.new();
  return new Sails(await parser).parseIdl(text);
}

const NAME = /^[A-Za-z_]\w*$/;
function readRoute(payload: Hex): { service: string; name: string } | { error: string } {
  if (payload.toLowerCase().startsWith("0x474d")) return { error: "Sails IDL v2 payload: not supported yet" };
  try {
    const s = getServiceNamePrefix(payload, true), f = getFnNamePrefix(payload, true);
    if (NAME.test(s.service) && NAME.test(f.fn) && s.bytesLength + f.bytesLength <= (payload.length - 2) / 2) return { service: s.service, name: f.fn };
  } catch { /* not a Sails payload */ }
  return { error: "Not a Sails payload" };
}

export function decodeCall(payload: Hex, sails: Sails | null): Decoded {
  const route = readRoute(payload);
  if ("error" in route) return { service: null, name: null, value: null, error: route.error };
  const decoded: Decoded = { ...route, value: null, error: null };
  if (!sails) return decoded;
  try {
    const fn = sails.services[route.service]?.functions[route.name] ?? sails.services[route.service]?.queries[route.name];
    if (!fn) decoded.error = `${route.service}.${route.name} not in IDL`;
    else decoded.value = fn.decodePayload<unknown>(payload);
  } catch (err) {
    decoded.error = err instanceof Error ? err.message : String(err);
  }
  return decoded;
}

export function decodeReply(payload: Hex, call: Decoded, sails: Sails | null): Decoded {
  const decoded: Decoded = { service: call.service, name: call.name, value: null, error: null };
  if (payload === "0x") return decoded;
  const route = readRoute(payload);
  if ("error" in route) return { service: null, name: null, value: null, error: route.error };
  if (!call.service || !call.name) return { ...decoded, error: call.error ?? "Not a Sails payload" };
  if (!sails) return decoded;
  try {
    const fn = sails.services[call.service]?.functions[call.name] ?? sails.services[call.service]?.queries[call.name];
    if (!fn) decoded.error = `${call.service}.${call.name} not in IDL`;
    else decoded.value = fn.decodeResult<unknown>(payload);
  } catch (err) {
    decoded.error = err instanceof Error ? err.message : String(err);
  }
  return decoded;
}

export function decodeEvent(payload: Hex, sails: Sails | null): Decoded {
  const route = readRoute(payload);
  if ("error" in route) return { service: null, name: null, value: null, error: route.error };
  const decoded: Decoded = { ...route, value: null, error: null };
  if (!sails) return decoded;
  try {
    const event = sails.services[route.service]?.events[route.name];
    if (!event) decoded.error = `${route.service}.${route.name} not in IDL`;
    else decoded.value = event.decode(payload);
  } catch (err) {
    decoded.error = err instanceof Error ? err.message : String(err);
  }
  return decoded;
}

export function encodeArgs(sails: Sails, service: string, name: string, kind: "functions" | "queries", args: unknown): Hex {
  const fn = sails.services[service]?.[kind][name];
  if (!fn) throw new Error(`${service}.${name} not in IDL`);
  if (!Array.isArray(args) && (args === null || typeof args !== "object")) throw new Error("Args must be a JSON object or array");
  const positional = Array.isArray(args) ? args : fn.args.map((a) => (args as Record<string, unknown>)[a.name]);
  return fn.encodePayload(...positional);
}
