import type { GearCoreProgram, MessagesDispatchedData, PalletGearVoucherInternalPrepaidCall, UserMessageSentData } from "@gear-js/api";
import type { Option } from "@polkadot/types";
import { explainRpcError, getVaraApi } from "./case";
import type { ActivityItem, Hex, ProgramInfo } from "./model";

export async function loadProgram(id: Hex): Promise<ProgramInfo> {
  let block: number | string = "finalized head";
  try {
    const api = await getVaraApi();
    const hash = await api.rpc.chain.getFinalizedHead();
    block = (await api.rpc.chain.getHeader(hash)).number.toNumber();
    const apiAt = await api.at(hash);
    const stored = await apiAt.query.gearProgram.programStorage(id) as unknown as Option<GearCoreProgram>;
    const program = stored.isSome ? stored.unwrap() : null;
    let balance: string | null = null;
    try { balance = (await api.query.system.account(id)).data.free.toString(); } catch { /* balance is optional */ }
    return {
      id, block, status: program ? program.type.toLowerCase() as ProgramInfo["status"] : "missing",
      codeId: program?.isActive ? program.asActive.codeId.toHex() : null, balance,
    };
  } catch (err) {
    throw new Error(explainRpcError(err, block));
  }
}

export async function recentActivity(programId: Hex, blocks: number, onProgress?: (scanned: number, total: number) => void, signal?: AbortSignal): Promise<ActivityItem[]> {
  if (!Number.isSafeInteger(blocks) || blocks < 0) throw new Error("Block count must be a non-negative integer");
  const api = await getVaraApi();
  const head = (await api.rpc.chain.getHeader(await api.rpc.chain.getFinalizedHead())).number.toNumber();
  const total = Math.min(blocks, head + 1);
  const items: ActivityItem[] = [];
  for (let scanned = 0; scanned < total && !signal?.aborted; scanned += 25) {
    const batch = await Promise.all(Array.from({ length: Math.min(25, total - scanned) }, async (_, offset) => {
      const number = head - scanned - offset;
      try {
        const hash = await api.rpc.chain.getBlockHash(number);
        const apiAt = await api.at(hash);
        return { number, hash, records: await apiAt.query.system.events() };
      } catch (err) {
        throw new Error(explainRpcError(err, number));
      }
    }));
    const activity = await Promise.all(batch.map(async ({ number, hash, records }) => {
      try {
        const queued = records.filter(({ event, phase }) => event.section === "gear" && event.method === "MessageQueued" && phase.isApplyExtrinsic && event.data[2].toHex().toLowerCase() === programId.toLowerCase());
        if (!queued.length) return [];
        const { block } = await api.rpc.chain.getBlock(hash);
        const statuses = new Map<string, string>();
        const replies = new Map<string, boolean>();
        for (const { event } of records) {
          if (event.section !== "gear") continue;
          if (event.method === "MessagesDispatched") {
            for (const [id, status] of event.data[1] as unknown as MessagesDispatchedData["statuses"]) statuses.set(id.toHex().toLowerCase(), status.type);
          } else if (event.method === "UserMessageSent") {
            const message = event.data[0] as unknown as UserMessageSentData["message"];
            if (message.details.isSome) {
              const details = message.details.unwrap();
              replies.set(details.to.toHex().toLowerCase(), details.code.isSuccess);
            }
          }
        }
        const found: ActivityItem[] = [];
        for (const { event, phase } of queued) {
          const extrinsicIndex = phase.asApplyExtrinsic.toNumber();
          const ex = block.extrinsics[extrinsicIndex];
          let payload: Hex | null = null;
          if (ex?.method.section === "gear" && ex.method.method === "sendMessage") payload = ex.args[1].toHex();
          else if (ex?.method.section === "gearVoucher" && ex.method.method === "call") {
            const call = ex.args[1] as unknown as PalletGearVoucherInternalPrepaidCall;
            if (call.isSendMessage) payload = call.asSendMessage.payload.toHex();
          }
          if (payload === null) continue;
          const messageId = event.data[0].toHex();
          found.push({
            block: number, extrinsicIndex, messageId, source: event.data[1].toHex(), payload,
            status: statuses.get(messageId.toLowerCase()) ?? null, replySuccess: replies.get(messageId.toLowerCase()) ?? null,
          });
        }
        return found.sort((a, b) => b.extrinsicIndex - a.extrinsicIndex);
      } catch (err) {
        throw new Error(explainRpcError(err, number));
      }
    }));
    items.push(...activity.flat());
    onProgress?.(scanned + batch.length, total);
  }
  return items;
}

export async function estimateGas(origin: Hex, programId: Hex, payload: Hex, value: bigint): Promise<string> {
  try {
    const api = await getVaraApi();
    return (await api.program.calculateGas.handle(origin, programId, payload, value, true)).min_limit.toString();
  } catch (err) {
    throw new Error(explainRpcError(err, "latest"));
  }
}
