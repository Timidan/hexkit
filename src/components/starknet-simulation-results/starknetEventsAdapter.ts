// Starknet → EDB EventsTab event-shape adapter.
//
// Converts a Starknet `SimulationResult`'s emitted events into the
// row shape `<EventsTab>` from `src/components/simulation-results/`
// expects so we can mount the literal EDB events panel on the
// Starknet sim surface (same pattern as the trace-tab adapter).
//
// Each row carries:
//   - `eventName`        — pre-resolved from `decodedEventAbi.name`
//                          when the bridge has the ABI; falls back to
//                          a known-event hash lookup, then a short
//                          selector hex (`event(0x99cd…6e9)`).
//   - `eventArgs`        — Array<{name,value,type?}>; pairs each ABI
//                          field with its felt slice from `keys[1..]`
//                          then `data[]` (Cairo events: indexed fields
//                          go in `keys` after `key0`, non-indexed in
//                          `data`). u256 fields collapse the (low, high)
//                          felt pair into a single decimal string.
//   - `address`          — synthetic 40-char (last 20 bytes of the
//                          Starknet address) so EDB's `firstAddress`
//                          regex (`/^0x[a-fA-F0-9]{40}$/`) accepts it
//                          and renders the row + filter dropdown.
//                          The full Starknet address rides in
//                          `starknetAddress` for our own click handler.
//   - `contractName`     — friendly label from `frameLabel(frame)`
//                          (token symbol, account brand, …) so the row
//                          shows `ETH (0x9967…82f9e)` instead of
//                          `Unknown Contract` even when EDB's address
//                          regex truncated our entropy.
//   - `traceId`          — frame index in the trace adapter so the
//                          modal click handler can highlight the
//                          emitting row.
//   - `topics`/`data`    — raw key/data hex matching the EVM log
//                          shape EDB still inspects on some code paths.
//                          Topics is the felt-encoded `keys` (key0 is
//                          the event selector); data is hex-concat of
//                          the `data` felts.
//
// Public surface:
//   - `adaptStarknetEventsForEdb(result, frames, frameToRowId)` →
//        returns `{ events, eventsByEdbId }`. `events` is the Array<EvmShapeEvent>
//        the EventsTab consumes through `artifacts.events`. `eventsByEdbId`
//        maps `evt-N` → the original entry for the click-to-modal handler.

import type {
  AbiTypeDef,
  FunctionInvocation,
  SimulationResult,
} from "@/chains/starknet/simulatorTypes";
import {
  eventName as eventNameFromKeys,
  frameLabel,
  shortHex,
  walkInvocations,
} from "./decoders";
import { buildArgDetailJson, type JsonTree } from "./buildFrameDetailJson";

/** Single EVM-shape event row consumed by EDB's `<EventsTab>`. */
export interface EvmShapeEvent {
  /** Pre-resolved event name. EDB still falls back to its own decoder
   *  when this is empty / "Anonymous Event", but Starknet topic[0]
   *  felts won't match keccak hashes so we always provide it. */
  eventName: string;
  /** Decoded fields. EDB's `<EventCard>` accepts an array of
   *  `{name,value,type?}` and stringifies each value (or JSON-parses
   *  composite payloads). */
  eventArgs: Array<{ name: string; value: string; type?: string }>;
  /** Synthetic 40-char hex (last 20 bytes of the full Starknet
   *  address) so EDB's `isAddress` regex passes. */
  address: string;
  /** Friendly contract label (token symbol, wallet brand, …). EDB
   *  renders this next to the synthetic address. */
  contractName?: string;
  /** Frame index — links back to the trace row that emitted this
   *  event so the modal can highlight it on open. */
  traceId?: number;
  /** Original full Starknet address (64-char felt). Carried alongside
   *  the synthetic so our own click handler can build a Voyager-style
   *  modal title without losing entropy. Custom field — EDB ignores it. */
  starknetAddress?: string;
  /** Raw event payload — EDB's `<EventCard>` "Show raw data and
   *  topics" toggle pulls these. `topics` is the felt-encoded `keys`,
   *  `data` is hex-concat of the `data` felts. */
  topics?: string[];
  rawData?: string;
}

/** Return value from `adaptStarknetEventsForEdb`. */
export interface StarknetEventsAdapterResult {
  /** EDB-shape rows for `<EventsTab artifacts={{events}} />`. */
  events: EvmShapeEvent[];
  /** `evt-N` → original entry. Used by the click-to-modal handler so
   *  it can rebuild the full decoded JSON tree without re-walking the
   *  ABI. */
  eventsByEdbId: Map<string, EvmShapeEvent & { decodedTree?: Record<string, JsonTree> }>;
}

/** Walk every frame in execution order, then every event under that
 *  frame (preserving emission order), and emit one EDB-shape row per
 *  event. The `frameToRowId` map comes from the trace adapter so the
 *  `traceId` we attach matches the row id stamped on the trace tab. */
export function adaptStarknetEventsForEdb(
  result: SimulationResult,
  frames: FunctionInvocation[],
  frameToRowId: Map<FunctionInvocation, string>,
  types?: Record<string, AbiTypeDef>,
): StarknetEventsAdapterResult {
  const events: EvmShapeEvent[] = [];
  const eventsByEdbId = new Map<
    string,
    EvmShapeEvent & { decodedTree?: Record<string, JsonTree> }
  >();
  let edbIdx = 0;
  for (const frame of walkInvocations(result)) {
    const frameIdx = frames.indexOf(frame);
    const fLabel = frameLabel(frame) ?? undefined;
    for (const ev of frame.events ?? []) {
      // Resolve event name via the bridge-emitted ABI first, then fall
      // back to the static `KNOWN_EVENTS` table, then to a short-hex
      // pseudo-name so the row never reads "Anonymous Event".
      const abiName = ev.decodedEventAbi?.name?.trim() || null;
      const knownName = eventNameFromKeys(ev) ?? null;
      const evtName =
        abiName ||
        knownName ||
        `event(${shortHex(ev.keys[0] ?? "0x0", 6, 4)})`;

      // Decode the ABI fields against keys[1..] then data[]. Composite
      // values are preserved as structured JSON so the event card does
      // not collapse structs into a single felt preview.
      const { eventArgs, decodedTree } = decodeEventArgs(ev, types);

      // Synthetic 40-char address — EDB validates with
      // `/^0x[a-fA-F0-9]{40}$/`, so we hand it the last 20 bytes of the
      // full Starknet address. `shortenAddress` shows `0x.....last4`
      // which still reads as a unique identifier per row, and the
      // friendly label rides in `contractName`.
      const fullAddr = ev.fromAddress;
      const synthAddr = toSynthAddress(fullAddr);

      // Topics + data in the raw shape EDB's "Show raw data and topics"
      // toggle expects.
      const topics = (ev.keys ?? []).map(normalizeFelt);
      const dataConcat = (ev.data ?? [])
        .map((d) => stripHexPrefix(normalizeFelt(d)))
        .join("");
      const rawData = dataConcat ? `0x${dataConcat}` : "0x";

      const id = `evt-${edbIdx++}`;
      const row: EvmShapeEvent = {
        eventName: evtName,
        eventArgs,
        address: synthAddr,
        contractName: fLabel,
        traceId: frameIdx >= 0 ? frameIdx : undefined,
        starknetAddress: fullAddr,
        topics,
        rawData,
      };
      events.push(row);
      eventsByEdbId.set(id, { ...row, decodedTree });
    }
  }
  // We pre-stamp `frameToRowId` here purely to silence the unused-param
  // lint — the map is reserved for follow-up wiring (highlight the
  // emitting trace row when the modal opens). The current click flow
  // doesn't need it.
  void frameToRowId;
  return { events, eventsByEdbId };
}

/** Decode the event's ABI fields (when present) against the
 *  `keys[1..]` + `data[]` felt sequence. Falls back to a raw-felt
 *  dump when the bridge didn't ship a decoded ABI for this event. */
function decodeEventArgs(
  ev: { keys: string[]; data: string[]; decodedEventAbi?: { name: string; fields: { name: string; type: string }[] } | null },
  types?: Record<string, AbiTypeDef>,
): {
  eventArgs: Array<{ name: string; value: string; type?: string }>;
  decodedTree: Record<string, JsonTree>;
} {
  const args: Array<{ name: string; value: string; type?: string }> = [];
  const tree: Record<string, JsonTree> = {};
  const fields = ev.decodedEventAbi?.fields ?? [];
  if (fields.length === 0) {
    // No ABI → dump raw felts. `keys[0]` is the selector so we skip it.
    const indexed = ev.keys.slice(1);
    indexed.forEach((felt, i) => {
      const name = `key${i + 1}`;
      args.push({ name, value: normalizeFelt(felt), type: "felt252" });
      tree[name] = { value: normalizeFelt(felt), type: "felt252" };
    });
    (ev.data ?? []).forEach((felt, i) => {
      const name = `data${i}`;
      args.push({ name, value: normalizeFelt(felt), type: "felt252" });
      tree[name] = { value: normalizeFelt(felt), type: "felt252" };
    });
    return { eventArgs: args, decodedTree: tree };
  }

  // Cairo events conventionally lay indexed fields out in keys[1..]
  // and the rest in data[]. We don't currently get per-field
  // `kind: "key"|"data"` from the bridge, so we decode the concatenated
  // sequence in that order. `buildArgDetailJson` handles structs,
  // arrays, tuples, u256, and primitive previews consistently with the
  // frame-detail modal.
  const indexed = ev.keys.slice(1);
  const allFelts = [...indexed, ...(ev.data ?? [])].map(normalizeFelt);
  const typesMap = types ?? {};
  let pos = 0;
  for (const f of fields) {
    const r = buildArgDetailJson(f.type, allFelts, typesMap, pos);
    tree[f.name] = r.tree;
    args.push({
      name: f.name,
      value: eventTreeDisplayValue(r.tree),
      type: f.type,
    });
    pos = r.next;
  }

  return { eventArgs: args, decodedTree: tree };
}

function eventTreeDisplayValue(tree: JsonTree): string {
  if (typeof tree.value === "string") return tree.value;
  return JSON.stringify(jsonTreeValueOnly(tree.value));
}

function jsonTreeValueOnly(
  value: JsonTree[] | Record<string, JsonTree>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item.value === "string" ? item.value : jsonTreeValueOnly(item.value),
    );
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] =
      typeof item.value === "string" ? item.value : jsonTreeValueOnly(item.value);
  }
  return out;
}

/** Last 20 bytes of a Starknet address as a 40-char hex. EDB validates
 *  addresses against `/^0x[a-fA-F0-9]{40}$/`, so feeding it the full
 *  64-char felt rejects every Starknet event. The last-20-byte tail
 *  preserves entropy where it counts (Starknet addresses are big-endian
 *  so the LSBs vary the most across deployments). */
function toSynthAddress(addr: string): string {
  const hex = stripHexPrefix(normalizeFelt(addr));
  const padded = hex.padStart(64, "0");
  return `0x${padded.slice(-40)}`;
}

/** Lowercase hex with `0x` prefix. Starknet bridge sometimes emits
 *  numeric strings; normalise to hex so downstream string comparisons
 *  are stable. */
function normalizeFelt(felt: string | undefined): string {
  if (!felt) return "0x0";
  const trimmed = felt.trim();
  if (!trimmed) return "0x0";
  if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
    return trimmed.toLowerCase();
  }
  try {
    return `0x${BigInt(trimmed).toString(16)}`;
  } catch {
    return trimmed;
  }
}

function stripHexPrefix(hex: string): string {
  return hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
}
