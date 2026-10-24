import type { Hex } from "./model";

export const IDEA_INDEXER = "https://explorer-idea.gear-tech.io/api";
export const IDEA_META = "https://meta-storage-idea.gear-tech.io";
export const VARA_GENESIS = "0xfe1b4c55fd4d668101126434206571a7838a8b6b93a6d1b95d607e78e6c53763";
export const IDEA_HEAD_PROBE: Hex = "0x038534fe3ec91c4a9b4074f14908bfeca6358da0515772a428d8c489fdd134a1";

export interface IdeaProgram {
  id: Hex;
  name: string | null;
  status: string;
  owner: Hex | null;
  codeId: Hex;
  createdBlock: number;
  createdAt: string;
}

export interface IdeaMessage {
  id: Hex;
  block: number;
  hash: Hex;
  timestamp: string;
  source: Hex;
  service: string | null;
  fn: string | null;
  panicked: boolean;
}

interface MessageData {
  id: Hex;
  blockNumber: string;
  blockHash: Hex;
  timestamp: string;
  source: Hex;
  service?: string | null;
  fn?: string | null;
  processedWithPanic?: boolean;
}

const cache = new Map<string, Promise<unknown>>();

// Successful answers are cached for the session; a null (network failure, timeout, not found)
// is evicted so the next request asks again instead of reusing a transient failure.
function remember<T>(key: string, load: () => Promise<T | null>): Promise<T | null> {
  if (!cache.has(key)) {
    const pending = load();
    cache.set(key, pending);
    void pending.then((v) => { if (v === null) cache.delete(key); });
  }
  return cache.get(key) as Promise<T | null>;
}

function rpc<T>(method: string, params: Record<string, unknown>): Promise<T | null> {
  const key = method + JSON.stringify(params);
  return remember(key, async () => {
    try {
      const res = await fetch(IDEA_INDEXER, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { genesis: VARA_GENESIS, ...params } }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.error ? null : json.result ?? null;
    } catch { return null; }
  });
}

export async function ideaProgram(id: Hex): Promise<IdeaProgram | null> {
  try {
    const r = await rpc<{ id: Hex; name: string; status: string; owner?: Hex | null; codeId: Hex; blockNumber: string; timestamp: string }>("program.data", { id: id.toLowerCase() });
    return r ? {
      id: r.id, name: r.name === r.id ? null : r.name, status: r.status, owner: r.owner ?? null,
      codeId: r.codeId, createdBlock: Number(r.blockNumber), createdAt: r.timestamp,
    } : null;
  } catch { return null; }
}

export async function ideaIdl(codeId: Hex | null): Promise<string | null> {
  if (!codeId) return null;
  const id = codeId.toLowerCase();
  const key = "sails" + JSON.stringify({ codeId: id });
  return remember(key, async () => {
    try {
      const res = await fetch(`${IDEA_META}/sails?codeId=${id}`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      const json = await res.json();
      return typeof json.data === "string" ? json.data : null;
    } catch { return null; }
  });
}

export async function ideaMessagesTo(programId: Hex, limit: number, offset: number): Promise<{ items: IdeaMessage[]; count: number } | null> {
  try {
    const r = await rpc<{ result: MessageData[]; count: number }>("messageToProgram.all", { destination: programId.toLowerCase(), limit, offset });
    return r ? {
      items: r.result.map((m) => ({
        id: m.id, block: Number(m.blockNumber), hash: m.blockHash, timestamp: m.timestamp, source: m.source,
        service: m.service ?? null, fn: m.fn ?? null, panicked: m.processedWithPanic === true,
      })),
      count: r.count,
    } : null;
  } catch { return null; }
}

export async function ideaHead(): Promise<{ block: number; timestamp: string } | null> {
  // ponytail: the DEX Pair is a head proxy (lower bound); the indexer has no head method.
  const item = (await ideaMessagesTo(IDEA_HEAD_PROBE, 1, 0))?.items[0];
  return item ? { block: item.block, timestamp: item.timestamp } : null;
}

export async function ideaMessageBlock(messageId: Hex): Promise<{ id: Hex; block: number; hash: Hex } | null> {
  try {
    const id = messageId.toLowerCase();
    let r = await rpc<MessageData>("messageToProgram.data", { id });
    if (!r) {
      const sent = await rpc<{ parentId?: Hex | null }>("messageFromProgram.data", { id });
      if (!sent?.parentId) return null;
      r = await rpc<MessageData>("messageToProgram.data", { id: sent.parentId.toLowerCase() });
    }
    return r ? { id: r.id, block: Number(r.blockNumber), hash: r.blockHash } : null;
  } catch { return null; }
}
