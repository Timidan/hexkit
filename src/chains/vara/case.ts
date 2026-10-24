import { GearApi } from "@gear-js/api";
import type { GearCoreProgram, PalletGearVoucherInternalPrepaidCall, UserMessageSentData } from "@gear-js/api";
import type { GenericExtrinsic, Option, Vec } from "@polkadot/types";
import type { Call, DispatchError, MultiAddress } from "@polkadot/types/interfaces";
import type { FrameSystemEventRecord } from "@polkadot/types/lookup";
import { z } from "zod";
import { getIdl } from "./idlStore";
import { ideaIdl, ideaMessageBlock, ideaProgram } from "./idea";
import type { Hex as HexId } from "./model";

const VARA_RPC = "wss://archive-rpc.vara.network";
const ZERO = `0x${"00".repeat(32)}`;
let pending: Promise<GearApi> | null = null;

// ponytail: one shared archive connection per session; add an endpoint picker when testnet/local nodes are needed.
export function getVaraApi(): Promise<GearApi> {
  pending ??= (async () => {
    const api = new GearApi({ providerAddress: VARA_RPC });
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Could not reach ${VARA_RPC}`)), 20_000));
    try {
      await Promise.race([api.isReadyOrError, timeout]);
      return api;
    } catch (err) {
      pending = null;
      api.provider.disconnect().catch(() => {});
      throw err;
    }
  })();
  return pending;
}

export function explainRpcError(err: unknown, block: number | string): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/State already discarded|UnknownBlock/.test(message)) return `History unavailable at block ${block} on ${VARA_RPC} (state discarded; needs an archive node)`;
  if (/calculate_reply_for_handle is not found/.test(message)) return `Dry run not supported by the runtime at block ${block}`;
  const panic = /panicked with '(.*)'/.exec(message);
  if (panic) return `The program panics: ${panic[1].replace(/'+"?$/, "")}`;
  return message;
}

export async function findMessage(messageId: HexId, hint?: { block: number; hash: HexId }): Promise<{ block: number; index: number; messageIndex: number } | null> {
  const hit = hint ? { id: messageId, ...hint } : await ideaMessageBlock(messageId);
  if (!hit) return null;
  const api = await getVaraApi();
  const apiAt = await api.at(hit.hash);
  const records = await apiAt.query.system.events();
  const counts = new Map<number, number>();
  for (const { phase, event } of records) {
    if (!phase.isApplyExtrinsic || event.section !== "gear" || event.method !== "MessageQueued") continue;
    const index = phase.asApplyExtrinsic.toNumber();
    const messageIndex = counts.get(index) ?? 0;
    if (event.data[0].toHex().toLowerCase() === hit.id.toLowerCase()) return { block: hit.block, index, messageIndex };
    counts.set(index, messageIndex + 1);
  }
  return null;
}

export async function resolveIdl(programId: HexId, codeId: HexId | null): Promise<{ text: string; source: "local" | "idea" } | null> {
  const local = getIdl(programId);
  if (local !== null) return { text: local, source: "local" };
  const text = await ideaIdl(codeId ?? (await ideaProgram(programId))?.codeId ?? null);
  return text === null ? null : { text, source: "idea" };
}

const Hex = z.custom<`0x${string}`>((v) => typeof v === "string" && /^0x([0-9a-fA-F]{2})*$/.test(v));
const Reply = z.object({ code: z.string(), success: z.boolean(), payload: Hex, value: z.string() });
const RunInput = z.object({ block: z.string(), origin: z.string(), payload: z.string(), value: z.string(), gasLimit: z.string() });
const RunResult = z.object({
  block: z.object({ number: z.number(), hash: Hex }).nullable(), specVersion: z.number().nullable(),
  reply: Reply.nullable(), query: z.union([Reply, z.object({ error: z.string() })]).nullable(), error: z.string().nullable(),
});
const Run = z.object({ input: RunInput, result: RunResult.nullable() });
export const CaseSchema = z.object({
  format: z.literal("hexkit.vara.case"), version: z.literal(1),
  network: z.object({ genesisHash: Hex, specVersion: z.number(), endpoint: z.string() }),
  block: z.object({ number: z.number(), hash: Hex }), extrinsicIndex: z.number(),
  messageIndex: z.number().optional(), messageCount: z.number().optional(),
  call: z.object({
    section: z.string(), method: z.string(), signer: Hex.nullable(), args: z.unknown(),
    destination: Hex.nullable(), payload: Hex.nullable(), gasLimit: z.string().nullable(), value: z.string().nullable(), keepAlive: z.boolean().nullable(),
    via: z.enum(["voucher", "batch"]).nullable().optional(), voucherId: Hex.nullable().optional(),
  }),
  result: z.object({ success: z.boolean(), error: z.string().nullable() }),
  message: z.object({
    id: Hex, programId: Hex, codeId: Hex.nullable(), dispatchStatus: z.string().nullable(),
    reply: z.object({ id: Hex, code: z.string(), success: z.boolean(), payload: Hex }).nullable(),
    programEvents: z.array(z.object({ id: Hex, payload: Hex })),
  }).nullable(),
  idl: z.string().nullable(),
  trace: z.object({
    root: Hex, programId: Hex, fromBlock: z.number(), toBlock: z.number(), complete: z.boolean(),
    nodes: z.array(z.object({
      id: Hex, parent: Hex.nullable(), kind: z.enum(["root", "reply", "event", "message", "hidden"]),
      derivation: z.object({ salt: z.enum(["reply", "outgoing"]), nonce: z.number().nullable() }).nullable(),
      source: Hex.nullable(), destination: Hex.nullable(), block: z.number().nullable(), payload: Hex.nullable(),
      value: z.string().nullable(), replyCode: z.string().nullable(), replySuccess: z.boolean().nullable(),
      steps: z.array(z.object({ kind: z.enum(["queued", "waited", "woken", "dispatched", "read"]), block: z.number(), detail: z.string().nullable() })),
    })),
    stateChanges: z.array(z.object({ block: z.number(), programs: z.array(Hex) })),
  }).optional(),
  runs: z.object({ a: Run, b: Run, query: z.object({ service: z.string(), name: z.string(), args: z.array(z.unknown()) }).nullable() }).optional(),
});
export type VaraCase = z.infer<typeof CaseSchema>;
export type RunInputT = z.infer<typeof RunInput>;
export type RunResultT = z.infer<typeof RunResult>;
export type Runs = NonNullable<VaraCase["runs"]>;

export function caseFromJson(text: string): VaraCase {
  const result = CaseSchema.safeParse(JSON.parse(text));
  if (!result.success) throw new Error(`Not a hexkit.vara.case file: ${result.error.issues[0].path.join(".") || "root"}`);
  return result.data;
}

export function messageCall(ex: GenericExtrinsic, phase: FrameSystemEventRecord[], k: number) {
  let call = ex.method;
  const queued = phase.filter(({ event }) => event.section === "gear" && event.method === "MessageQueued")[k];
  const result: Pick<VaraCase["call"], "destination" | "payload" | "gasLimit" | "value" | "keepAlive" | "via" | "voucherId"> = {
    destination: null, payload: null, gasLimit: null, value: null, keepAlive: null, via: null, voucherId: null,
  };
  if (call.section === "utility" && ["batch", "batchAll", "forceBatch"].includes(call.method)) {
    let j = 0;
    for (const record of phase) {
      if (record === queued) break;
      if (record.event.section === "utility" && ["ItemCompleted", "ItemFailed"].includes(record.event.method)) j++;
    }
    // ponytail: nested batches misalign; the destination check below nulls the fields instead of lying.
    call = (call.args[0] as unknown as Vec<Call>)[j];
    result.via = "batch";
  }
  if (call?.section === "gearVoucher" && call.method === "call") {
    result.voucherId = call.args[0].toHex();
    result.via ??= "voucher";
    const pc = call.args[1] as unknown as PalletGearVoucherInternalPrepaidCall;
    if (pc.isSendMessage) {
      const { destination, payload, gasLimit, value, keepAlive } = pc.asSendMessage;
      Object.assign(result, { destination: destination.toHex(), payload: payload.toHex(), gasLimit: gasLimit.toString(), value: value.toString(), keepAlive: keepAlive.isTrue });
    }
  } else if (call?.section === "gear" && call.method === "sendMessage") {
    const [dest, payload, gas, value, keep] = call.args;
    Object.assign(result, { destination: dest.toHex(), payload: payload.toHex(), gasLimit: gas.toString(), value: value.toString(), keepAlive: keep.eq(true) });
  }
  if (result.destination && result.destination.toLowerCase() !== queued?.event.data[2].toHex().toLowerCase()) {
    Object.assign(result, { destination: null, payload: null, gasLimit: null, value: null, keepAlive: null });
  }
  return result;
}

export async function fetchCase(blockNumber: number, index: number, messageIndex = 0): Promise<VaraCase> {
  const api = await getVaraApi();
  const hash = await api.rpc.chain.getBlockHash(blockNumber);
  if (hash.isEmpty) throw new Error(`Block ${blockNumber} not found`);
  const [{ block }, apiAt] = await Promise.all([api.rpc.chain.getBlock(hash), api.at(hash)]);
  const ex = block.extrinsics[index];
  if (!ex) throw new Error(`No extrinsic ${index} in block ${blockNumber}`);
  const records = await apiAt.query.system.events();
  const mine = records.filter((r) => r.phase.isApplyExtrinsic && r.phase.asApplyExtrinsic.eqn(index));
  const gear = (name: string, rs: typeof mine = records) => rs.filter((r) => r.event.section === "gear" && r.event.method === name).map((r) => r.event.data);
  const failed = mine.find((r) => r.event.section === "system" && r.event.method === "ExtrinsicFailed");
  let error: string | null = null;
  if (failed) {
    const err = failed.event.data[0] as DispatchError;
    if (err.isModule) {
      const meta = apiAt.registry.findMetaError(err.asModule);
      error = `${meta.section}.${meta.name}`;
    } else {
      error = err.toString();
    }
  }

  let message: VaraCase["message"] = null;
  const queuedAll = gear("MessageQueued", mine);
  const messageCount = queuedAll.length;
  const queued = queuedAll[messageIndex];
  if (!Number.isSafeInteger(messageIndex) || messageIndex < 0) throw new Error(`Invalid message index ${messageIndex}`);
  if (messageIndex > 0 && !queued) throw new Error(`Message ${messageIndex} not found in extrinsic ${blockNumber}-${index} (it queued ${messageCount})`);
  if (queued) {
    const id = queued[0].toHex();
    const programId = queued[2].toHex();
    message = { id, programId, codeId: null, dispatchStatus: null, reply: null, programEvents: [] };
    for (const data of gear("MessagesDispatched")) {
      message.dispatchStatus = (data[1].toJSON() as Record<string, string>)[id] ?? message.dispatchStatus;
    }
    for (const data of gear("UserMessageSent")) {
      const m = data[0] as unknown as UserMessageSentData["message"];
      if (m.details.isSome) {
        const details = m.details.unwrap();
        if (details.to.toHex() === id) {
          message.reply = { id: m.id.toHex(), code: JSON.stringify(details.code.toJSON()), success: details.code.isSuccess, payload: m.payload.toHex() };
        }
      }
      if (m.source.toHex() === programId && m.destination.toHex() === ZERO && m.details.isNone) {
        message.programEvents.push({ id: m.id.toHex(), payload: m.payload.toHex() });
      }
    }
    const program = await apiAt.query.gearProgram.programStorage(programId) as unknown as Option<GearCoreProgram>;
    if (program.isSome && program.unwrap().isActive) message.codeId = program.unwrap().asActive.codeId.toHex();
  }

  const signer = ex.signer as unknown as MultiAddress;
  return {
    format: "hexkit.vara.case", version: 1,
    network: { genesisHash: api.genesisHash.toHex(), specVersion: apiAt.runtimeVersion.specVersion.toNumber(), endpoint: VARA_RPC },
    block: { number: blockNumber, hash: hash.toHex() }, extrinsicIndex: index,
    messageIndex, messageCount,
    call: {
      section: ex.method.section, method: ex.method.method,
      signer: ex.isSigned && signer.type === "Id" ? signer.value.toHex() : null,
      args: (ex.method.toJSON() as { args: unknown }).args,
      ...messageCall(ex, mine, messageIndex),
    },
    result: { success: !failed, error }, message, idl: null,
  };
}
