import { GearApi } from "@gear-js/api";
import type { GearCoreProgram, UserMessageSentData } from "@gear-js/api";
import type { Option } from "@polkadot/types";
import type { DispatchError, MultiAddress } from "@polkadot/types/interfaces";
import { z } from "zod";

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
  call: z.object({
    section: z.string(), method: z.string(), signer: Hex.nullable(), args: z.unknown(),
    destination: Hex.nullable(), payload: Hex.nullable(), gasLimit: z.string().nullable(), value: z.string().nullable(), keepAlive: z.boolean().nullable(),
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

export async function fetchCase(blockNumber: number, index: number): Promise<VaraCase> {
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
  const queued = gear("MessageQueued", mine)[0];
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

  const isSend = ex.method.section === "gear" && ex.method.method === "sendMessage";
  const [dest, payload, gas, value, keep] = ex.args;
  const signer = ex.signer as unknown as MultiAddress;
  return {
    format: "hexkit.vara.case", version: 1,
    network: { genesisHash: api.genesisHash.toHex(), specVersion: apiAt.runtimeVersion.specVersion.toNumber(), endpoint: VARA_RPC },
    block: { number: blockNumber, hash: hash.toHex() }, extrinsicIndex: index,
    call: {
      section: ex.method.section, method: ex.method.method,
      signer: ex.isSigned && signer.type === "Id" ? signer.value.toHex() : null,
      args: (ex.method.toJSON() as { args: unknown }).args,
      destination: isSend ? dest.toHex() : null, payload: isSend ? payload.toHex() : null,
      gasLimit: isSend ? gas.toString() : null, value: isSend ? value.toString() : null, keepAlive: isSend ? keep.eq(true) : null,
    },
    result: { success: !failed, error }, message, idl: null,
  };
}
