// Shared contract between the Vara data layer (trace.ts, program.ts, idlForm.ts)
// and the Vara UI. Types only.

export type Hex = `0x${string}`;

// ---- Message trace ----------------------------------------------------------

export type TraceStepKind = "queued" | "waited" | "woken" | "dispatched" | "read";

export interface TraceStep {
  kind: TraceStepKind;
  block: number;
  /** Status for dispatched ("Success" | "Failed" | "NotExecuted"); reason JSON for waited/woken/read,
   *  e.g. {"runtime":"WaitUpToCalledFull"} (key case not guaranteed); null for queued. */
  detail: string | null;
}

/**
 * root    the user message being traced
 * reply   observed UserMessageSent whose id = reply(parent)
 * event   observed UserMessageSent to the zero address (a Sails event), id = outgoing(parent, n)
 * message observed UserMessageSent to an actor, id = outgoing(parent, n)
 * hidden  outgoing(parent, n) for a nonce below the highest observed nonce that never
 *         surfaced in events: a call into another program, destination not on-chain
 */
export type TraceNodeKind = "root" | "reply" | "event" | "message" | "hidden";

export interface TraceNode {
  id: Hex;
  parent: Hex | null;
  kind: TraceNodeKind;
  /** How the id is derived from the parent id; null for the root. */
  derivation: { salt: "reply" | "outgoing"; nonce: number | null } | null;
  source: Hex | null;
  /** For hidden nodes: the callee, when one of its own events proves it (else null). */
  destination: Hex | null;
  /** Block where the node was observed; null for hidden nodes. */
  block: number | null;
  payload: Hex | null;
  value: string | null;
  /** Reply code as JSON text, replies only. */
  replyCode: string | null;
  replySuccess: boolean | null;
  steps: TraceStep[];
}

export interface Trace {
  root: Hex;
  programId: Hex;
  fromBlock: number;
  /** Last block scanned (inclusive). */
  toBlock: number;
  /** Nodes in discovery order; the root is first. */
  nodes: TraceNode[];
  /** True when the root reached a final dispatch status and no node is still waiting. */
  complete: boolean;
  /** MessagesDispatched.stateChanges for the blocks where a traced node was dispatched. */
  stateChanges: { block: number; programs: Hex[] }[];
}

export interface TraceOptions {
  /** Blocks to scan after fromBlock (inclusive range is fromBlock..fromBlock+maxBlocks). */
  maxBlocks: number;
  /** Outgoing nonces probed per node. */
  maxNonce: number;
}

// ---- Program workspace -----------------------------------------------------

export interface ProgramInfo {
  id: Hex;
  status: "active" | "exited" | "terminated" | "missing";
  codeId: Hex | null;
  /** Free balance in plancks (decimal string). */
  balance: string | null;
  block: number;
}

export interface ActivityItem {
  block: number;
  extrinsicIndex: number;
  /** Order of this message among the messages its extrinsic queued (batches queue several). */
  messageIndex: number;
  messageId: Hex;
  source: Hex;
  payload: Hex;
  /** MessagesDispatched status in the same block, null if not dispatched there. */
  status: string | null;
  replySuccess: boolean | null;
}

// ---- IDL-driven forms ---------------------------------------------------------

export type PrimitiveName =
  | "bool" | "char" | "str"
  | "u8" | "u16" | "u32" | "u64" | "u128" | "u256"
  | "i8" | "i16" | "i32" | "i64" | "i128"
  | "nat8" | "nat16" | "nat32" | "nat64" | "nat128" | "nat256"
  | "actor_id" | "code_id" | "message_id" | "h256" | "h160";

export type FieldSchema =
  | { kind: "primitive"; type: PrimitiveName }
  | { kind: "null" }
  | { kind: "struct"; name: string | null; tuple: boolean; fields: { name: string; schema: FieldSchema }[] }
  | { kind: "enum"; name: string | null; variants: { name: string; schema: FieldSchema | null }[] }
  | { kind: "option"; inner: FieldSchema }
  | { kind: "result"; ok: FieldSchema; err: FieldSchema }
  | { kind: "vec"; inner: FieldSchema }
  | { kind: "array"; inner: FieldSchema; len: number }
  | { kind: "map"; key: FieldSchema; value: FieldSchema }
  /** A user type that refers back to itself; edited as raw JSON. */
  | { kind: "recursive"; name: string };

export interface MethodSchema {
  service: string;
  name: string;
  kind: "function" | "query";
  params: { name: string; schema: FieldSchema }[];
  returns: FieldSchema;
  docs: string | null;
}

export interface IdlModel {
  services: {
    name: string;
    methods: MethodSchema[];
    events: { name: string; schema: FieldSchema | null }[];
  }[];
}

/**
 * Editable form state, one per FieldSchema kind:
 * primitive -> string (bool -> boolean), null -> null,
 * struct -> Record<field, FormValue> (tuple -> FormValue[]),
 * enum -> { variant: string, value: FormValue | null },
 * option -> { some: boolean, value: FormValue }, result -> { ok: boolean, value: FormValue },
 * vec/array -> FormValue[] (vec u8 -> hex string, e.g. "0x"), map -> [FormValue, FormValue][],
 * recursive -> string (JSON). The FieldSchema decides how a value is read, never its shape.
 */
export type FormValue = string | boolean | null | FormValue[] | { [key: string]: FormValue };
