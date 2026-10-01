import type { MessagesDispatchedData, UserMessageSentData } from "@gear-js/api";
import { explainRpcError, getVaraApi } from "./case";
import { outgoingId, replyId } from "./ids";
import type { Hex, Trace, TraceNode, TraceOptions } from "./model";

const ZERO = `0x${"00".repeat(32)}`;

export async function traceMessage(root: { id: Hex; programId: Hex; block: number }, opts: TraceOptions, onProgress?: (scanned: number, total: number) => void, signal?: AbortSignal): Promise<Trace> {
  if (!Number.isSafeInteger(root.block) || root.block < 0 || !Number.isSafeInteger(opts.maxBlocks) || opts.maxBlocks < 0 || !Number.isSafeInteger(opts.maxNonce) || opts.maxNonce < 0 || opts.maxNonce > 0x100000000) {
    throw new Error("Block range and nonce count must be non-negative integers");
  }
  const id = root.id.toLowerCase() as Hex;
  const rootNode: TraceNode = {
    id, parent: null, kind: "root", derivation: null, source: null, destination: root.programId,
    block: root.block, payload: null, value: null, replyCode: null, replySuccess: null,
    steps: [{ kind: "queued", block: root.block, detail: null }],
  };
  const trace: Trace = { root: id, programId: root.programId, fromBlock: root.block, toBlock: root.block - 1, nodes: [rootNode], complete: false, stateChanges: [] };
  const nodes = new Map<Hex, TraceNode>([[id, rootNode]]);
  const frontier = new Map<Hex, NonNullable<TraceNode["derivation"]>>([[replyId(id), { salt: "reply", nonce: null }]]);
  for (let nonce = 0; nonce < opts.maxNonce; nonce++) frontier.set(outgoingId(id, nonce), { salt: "outgoing", nonce });

  function materialize(candidate: Hex): TraceNode | undefined {
    const existing = nodes.get(candidate);
    if (existing) return existing;
    const derivation = frontier.get(candidate);
    if (!derivation) return;
    const node: TraceNode = {
      id: candidate, parent: id, kind: "hidden", derivation, source: null, destination: null,
      block: null, payload: null, value: null, replyCode: null, replySuccess: null, steps: [],
    };
    nodes.set(candidate, node);
    trace.nodes.push(node);
    return node;
  }

  const api = await getVaraApi();
  const head = (await api.rpc.chain.getHeader(await api.rpc.chain.getFinalizedHead())).number.toNumber();
  const toBlock = Math.min(root.block + opts.maxBlocks, head);
  const total = Math.max(0, toBlock - root.block + 1);
  for (let start = root.block; start <= toBlock && !signal?.aborted; start += 25) {
    const batch = await Promise.all(Array.from({ length: Math.min(25, toBlock - start + 1) }, async (_, offset) => {
      const block = start + offset;
      try {
        const hash = await api.rpc.chain.getBlockHash(block);
        const apiAt = await api.at(hash);
        return { block, records: await apiAt.query.system.events() };
      } catch (err) {
        throw new Error(explainRpcError(err, block));
      }
    }));
    for (const { block, records } of batch) {
      for (const { event } of records) {
        if (event.section !== "gear") continue;
        const { method, data } = event;
        if (method === "UserMessageSent") {
          const message = data[0] as unknown as UserMessageSentData["message"];
          const candidate = message.id.toHex().toLowerCase() as Hex;
          if (!frontier.has(candidate)) continue;
          const node = materialize(candidate)!;
          const details = message.details.isSome ? message.details.unwrap() : null;
          Object.assign(node, {
            kind: details ? "reply" : message.destination.toHex() === ZERO ? "event" : "message",
            source: message.source.toHex(), destination: message.destination.toHex(), payload: message.payload.toHex(),
            value: message.value.toString(), block, replyCode: details ? JSON.stringify(details.code.toJSON()) : null,
            replySuccess: details ? details.code.isSuccess : null,
          });
        } else if (method === "MessageWaited" || method === "MessageWoken" || method === "UserMessageRead") {
          const candidate = data[0].toHex().toLowerCase() as Hex;
          const node = method === "UserMessageRead" ? nodes.get(candidate) : materialize(candidate);
          if (node) node.steps.push({
            kind: method === "MessageWaited" ? "waited" : method === "MessageWoken" ? "woken" : "read", block,
            detail: JSON.stringify(data[method === "MessageWaited" ? 2 : 1].toJSON()),
          });
        } else if (method === "MessagesDispatched") {
          const statuses = data[1] as unknown as MessagesDispatchedData["statuses"];
          for (const [messageId, status] of statuses) {
            if (messageId.toHex().toLowerCase() !== id) continue;
            rootNode.steps.push({ kind: "dispatched", block, detail: status.type });
            const programs = data[2] as unknown as MessagesDispatchedData["stateChanges"];
            trace.stateChanges.push({ block, programs: [...programs].map((program) => program.toHex()) });
          }
        }
      }
      trace.toBlock = block;
    }
    trace.complete = rootNode.steps.some((step) => step.kind === "dispatched") && trace.nodes.every((node) => {
      const waited = node.steps.map((step) => step.kind).lastIndexOf("waited");
      return waited < 0 || node.steps.slice(waited + 1).some((step) => step.kind === "woken" || step.kind === "dispatched");
    });
    onProgress?.(trace.toBlock - root.block + 1, total);
    if (trace.complete) break;
  }
  const highest = trace.nodes.reduce((max, node) => Math.max(max, node.derivation?.salt === "outgoing" ? node.derivation.nonce ?? -1 : -1), -1);
  for (let nonce = 0; nonce < highest; nonce++) materialize(outgoingId(id, nonce));
  return trace;
}
