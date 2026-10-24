import type { GearCoreProgram } from "@gear-js/api";
import type { SubmittableResult } from "@polkadot/api";
import type { Option } from "@polkadot/types";
import { explainRpcError, getVaraApi } from "./case";
import type { RunInputT, RunResultT } from "./case";

type Hex = `0x${string}`;

export function parseInput(i: RunInputT): { block: number | "latest"; origin: Hex; payload: Hex; value: bigint; gasLimit: bigint } {
  if (i.block !== "latest" && !/^\d+$/.test(i.block)) throw new Error("Block must be a number or latest");
  if (i.block !== "latest" && !Number.isSafeInteger(Number(i.block))) throw new Error("Block number is too large");
  if (!/^0x[0-9a-fA-F]{64}$/.test(i.origin)) throw new Error("Origin must be 32-byte hex");
  if (!/^0x([0-9a-fA-F]{2})*$/.test(i.payload)) throw new Error("Payload must be hex");
  if (!/^\d+$/.test(i.value) || BigInt(i.value) >= 2n ** 128n) throw new Error("Value must be an unsigned u128 integer");
  if (!/^\d+$/.test(i.gasLimit) || BigInt(i.gasLimit) >= 2n ** 64n) throw new Error("Gas limit must be an unsigned u64 integer");
  return { block: i.block === "latest" ? "latest" : Number(i.block), origin: i.origin as Hex, payload: i.payload as Hex, value: BigInt(i.value), gasLimit: BigInt(i.gasLimit) };
}

export async function dryRun(programId: Hex, input: ReturnType<typeof parseInput>, queryPayload: Hex | null): Promise<RunResultT> {
  let block: RunResultT["block"] = null;
  try {
    const api = await getVaraApi();
    const hash = input.block === "latest" ? await api.rpc.chain.getFinalizedHead() : await api.rpc.chain.getBlockHash(input.block);
    if (hash.isEmpty) return { block: null, specVersion: null, reply: null, query: null, error: `Block ${input.block} not found` };
    const number = input.block === "latest" ? (await api.rpc.chain.getHeader(hash)).number.toNumber() : input.block;
    block = { number, hash: hash.toHex() };
    const apiAt = await api.at(hash);
    const specVersion = apiAt.runtimeVersion.specVersion.toNumber();
    const p = await apiAt.query.gearProgram.programStorage(programId) as unknown as Option<GearCoreProgram>;
    if (!(p.isSome && p.unwrap().isActive)) return { block, specVersion, reply: null, query: null, error: `Program not active at block ${number}` };
    const r = await api.message.calculateReply({ origin: input.origin, destination: programId, payload: input.payload, value: input.value, gasLimit: input.gasLimit, at: hash.toHex() });
    const reply = { code: JSON.stringify(r.code.toJSON()), success: r.code.isSuccess, payload: r.payload.toHex(), value: r.value.toString() };
    let query: RunResultT["query"] = null;
    if (queryPayload) {
      try {
        const q = await api.message.calculateReply({ origin: input.origin, destination: programId, payload: queryPayload, value: 0, at: hash.toHex() });
        query = { code: JSON.stringify(q.code.toJSON()), success: q.code.isSuccess, payload: q.payload.toHex(), value: q.value.toString() };
      } catch (err) {
        query = { error: explainRpcError(err, number) };
      }
    }
    return { block, specVersion, reply, query, error: null };
  } catch (err) {
    return { block, specVersion: null, reply: null, query: null, error: explainRpcError(err, block?.number ?? input.block) };
  }
}

export async function sendMessage(account: { address: string; source: string }, programId: Hex, input: ReturnType<typeof parseInput>, onStatus: (s: string) => void): Promise<{ block: number; index: number }> {
  const [{ web3FromSource }, api] = await Promise.all([import("@polkadot/extension-dapp"), getVaraApi()]);
  const injector = await web3FromSource(account.source);
  return new Promise((resolve, reject) => {
    let unsub: (() => void) | undefined;
    let settled = false;
    function fail(err: unknown) {
      settled = true;
      unsub?.();
      reject(err);
    }
    try {
      const tx = api.message.send({ destination: programId, payload: input.payload, gasLimit: input.gasLimit, value: input.value, keepAlive: true });
      onStatus("Signing…");
      void tx.signAndSend(account.address, { signer: injector.signer }, (result) => {
        if (settled) return;
        if (result.dispatchError) {
          const e = result.dispatchError;
          if (e.isModule) {
            const m = api.registry.findMetaError(e.asModule);
            fail(new Error(`${m.section}.${m.name}`));
          } else fail(new Error(e.toString()));
        } else if (result.isError) {
          fail(new Error(result.status.type));
        } else if (result.status.isInBlock) {
          const { blockNumber, txIndex } = result as SubmittableResult;
          if (blockNumber !== undefined && txIndex !== undefined) {
            settled = true;
            unsub?.();
            resolve({ block: blockNumber.toNumber(), index: txIndex });
          }
        }
      }).then((unsubscribe) => {
        unsub = unsubscribe;
        if (settled) unsub();
        else onStatus("Submitted");
      }).catch(fail);
    } catch (err) {
      fail(err);
    }
  });
}
