import { Buffer } from "buffer/";
import { Sails, SailsProgram, getFnNamePrefix, getServiceNamePrefix } from "sails-js";
import type { DecodedCall, DecodedEvent, DecodedReply, DecodedUnknown } from "sails-js";
import { SailsIdlParser as SailsIdlParserV2 } from "sails-js/parser";
import { SailsIdlParser } from "sails-js-parser";

type Hex = `0x${string}`;
/** A loaded interface: legacy Sails IDL (`Sails`) or IDL v2 (`SailsProgram`). Both expose `services[name].functions/queries/events`. */
export type SailsIdl = Sails | SailsProgram;
export interface Decoded { service: string | null; name: string | null; value: unknown; error: string | null }

let parser: Promise<SailsIdlParser> | null = null;
let parserV2: Promise<SailsIdlParserV2> | null = null;
export async function loadIdl(text: string): Promise<SailsIdl> {
  parser ??= SailsIdlParser.new();
  try {
    return new Sails(await parser).parseIdl(text);
  } catch (legacy) {
    // sails-js 1.0.0 uses Buffer to unpack its parser WASM in browsers.
    globalThis.Buffer ??= Buffer as unknown as typeof globalThis.Buffer;
    parserV2 ??= (async () => { const p = new SailsIdlParserV2(); await p.init(); return p; })();
    try {
      return new SailsProgram((await parserV2).parse(text));
    } catch (v2) {
      const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").trim();
      throw new Error(`Unsupported Sails IDL syntax (legacy: ${msg(legacy)}; v2: ${msg(v2)})`);
    }
  }
}

const isV2Payload = (payload: Hex) => payload.toLowerCase().startsWith("0x474d");
/** Maps a sails-js v2 decode result to the shared shape; a missing interface or entry is reported apart from malformed bytes. */
function fromV2(r: DecodedCall | DecodedReply | DecodedEvent | DecodedUnknown): Decoded {
  if (r.kind === "unknown") {
    const why = `${r.reason}${r.detail ? `: ${r.detail}` : ""}`;
    const missing = r.reason === "no-service" || r.reason === "no-entry" || r.reason === "ambiguous-route";
    return { service: null, name: null, value: null, error: missing ? `Interface or method not in IDL (${why})` : `Malformed Sails v2 payload (${why})` };
  }
  const e = r.entry;
  return { service: "service" in e ? e.service : null, name: e.kind === "event" ? e.event : e.kind === "ctor" ? e.ctor : e.fn,
    value: r.kind === "call" ? r.args : r.kind === "reply" ? r.result : r.data, error: null };
}
/** Handles a payload whose framing does not match the loaded IDL; returns null when legacy decoding applies. */
function v2Mismatch(payload: Hex, sails: SailsIdl | null): Decoded | null {
  const err = (error: string): Decoded => ({ service: null, name: null, value: null, error });
  if (isV2Payload(payload)) return sails instanceof SailsProgram ? null : err(sails ? "Sails IDL v2 payload, but the loaded IDL is legacy" : "Sails IDL v2 payload: load the program IDL to resolve the route");
  if (sails instanceof SailsProgram && !("error" in readRoute(payload))) return err("Legacy Sails payload, but the loaded IDL is v2");
  return null;
}

const NAME = /^[A-Za-z_]\w*$/;
function readRoute(payload: Hex): { service: string; name: string } | { error: string } {
  try {
    const s = getServiceNamePrefix(payload, true), f = getFnNamePrefix(payload, true);
    if (NAME.test(s.service) && NAME.test(f.fn) && s.bytesLength + f.bytesLength <= (payload.length - 2) / 2) return { service: s.service, name: f.fn };
  } catch { /* not a Sails payload */ }
  return { error: "Not a Sails payload" };
}

export function decodeCall(payload: Hex, sails: SailsIdl | null): Decoded {
  const mismatch = v2Mismatch(payload, sails);
  if (mismatch) return mismatch;
  if (sails instanceof SailsProgram) return fromV2(sails.decodeCall(payload));
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

export function decodeReply(payload: Hex, call: Decoded, sails: SailsIdl | null): Decoded {
  const decoded: Decoded = { service: call.service, name: call.name, value: null, error: null };
  if (payload === "0x") return decoded;
  const mismatch = v2Mismatch(payload, sails);
  if (mismatch) return mismatch;
  if (sails instanceof SailsProgram) return fromV2(sails.decodeReply(payload));
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

export function decodeEvent(payload: Hex, sails: SailsIdl | null): Decoded {
  const mismatch = v2Mismatch(payload, sails);
  if (mismatch) return mismatch;
  if (sails instanceof SailsProgram) return fromV2(sails.decodeEvent(payload));
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

export function encodeArgs(sails: SailsIdl, service: string, name: string, kind: "functions" | "queries", args: unknown): Hex {
  const fn = sails.services[service]?.[kind][name];
  if (!fn) throw new Error(`${service}.${name} not in IDL`);
  if (!Array.isArray(args) && (args === null || typeof args !== "object")) throw new Error("Args must be a JSON object or array");
  const positional = Array.isArray(args) ? args : fn.args.map((a) => (args as Record<string, unknown>)[a.name]);
  return fn.encodePayload(...positional);
}
