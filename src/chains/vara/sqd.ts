import type { Hex } from "./model";

export const SQD_PORTAL = "https://portal.sqd.dev/datasets/vara";

export interface SqdMessage {
  id: Hex;
  block: number;
  hash: Hex;
  timestamp: number;
  source: Hex;
  destination: Hex;
  entry: string;
}

export class SqdBusyError extends Error {}

interface PortalBlock {
  header: { number: number; hash: Hex; timestamp: number };
  events?: {
    name: string;
    args: { id: Hex; source: Hex; destination: Hex; entry?: { __kind?: string } };
  }[];
}

async function request(path: string, init: RequestInit): Promise<Response> {
  for (let retries = 0; ; retries++) {
    const response = await fetch(`${SQD_PORTAL}/${path}`, init);
    if (![429, 529, 503].includes(response.status)) {
      if (!response.ok) throw new Error(`SQD Portal returned HTTP ${response.status}`);
      return response;
    }
    init.signal?.throwIfAborted();
    if (retries === 3) throw new SqdBusyError("SQD Portal is busy");
    const retryAfter = Number(response.headers.get("retry-after") ?? 10);
    const seconds = Number.isFinite(retryAfter) && retryAfter >= 0 ? Math.min(retryAfter, 30) : 10;
    await new Promise<void>((resolve, reject) => {
      const signal = init.signal;
      signal?.throwIfAborted();
      const onAbort = () => { clearTimeout(timer); reject(signal?.reason); };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, seconds * 1000);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}

export async function sqdHead(signal?: AbortSignal): Promise<number | null> {
  try {
    const response = await request("height", { signal });
    const body = (await response.text()).trim();
    const height = Number(body);
    return /^\d+$/.test(body) && Number.isSafeInteger(height) ? height : null;
  } catch { return null; }
}

// ponytail: the portal's gearMessagesEnqueued programId filter returns nothing for vara (checked 2026-10-01), so every MessageQueued is streamed and filtered here (~150 KiB per 10k blocks); callers page in ~1-day windows.
export async function sqdMessagesTo(programId: Hex | null, fromBlock: number, toBlock: number, signal?: AbortSignal): Promise<SqdMessage[]> {
  const destination = programId?.toLowerCase();
  const messages: SqdMessage[] = [];
  while (fromBlock <= toBlock) {
    const response = await request("stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify({
        type: "substrate", fromBlock, toBlock, ...(programId === null ? { includeAllBlocks: true } : {}),
        fields: { block: { number: true, hash: true, timestamp: true }, event: { name: true, args: true } },
        events: [{ name: ["Gear.MessageQueued"] }],
      }),
    });
    if (response.status === 204) {
      if (programId === null) throw new Error("The index has not supplied the full recent block range. Please refresh.");
      break;
    }
    let lastBlock = fromBlock - 1;
    for (const line of (await response.text()).split("\n")) {
      if (!line.trim()) continue;
      const { header, events } = JSON.parse(line) as PortalBlock;
      if (!header || !Number.isSafeInteger(header.number) || header.number < fromBlock || header.number > toBlock) {
        throw new Error("SQD Portal returned an invalid block header");
      }
      lastBlock = header.number;
      for (const event of events ?? []) {
        if (event.name !== "Gear.MessageQueued" || (destination && event.args.destination.toLowerCase() !== destination)) continue;
        messages.push({
          id: event.args.id.toLowerCase() as Hex,
          block: header.number,
          hash: header.hash.toLowerCase() as Hex,
          timestamp: header.timestamp,
          source: event.args.source.toLowerCase() as Hex,
          destination: event.args.destination.toLowerCase() as Hex,
          entry: event.args.entry?.__kind ?? "Unknown",
        });
      }
    }
    if (lastBlock < fromBlock) throw new Error("SQD Portal returned no block headers");
    fromBlock = lastBlock + 1;
  }
  return messages.sort((a, b) => a.block - b.block).reverse();
}

export interface SqdEvent { block: number; hash: Hex; timestamp: number; id: Hex; source: Hex; destination: Hex; payload: Hex; value: string }

export async function sqdEventsFrom(programId: Hex, fromBlock: number, toBlock: number, signal: AbortSignal): Promise<SqdEvent[]> {
  if (!Number.isSafeInteger(fromBlock) || !Number.isSafeInteger(toBlock) || fromBlock < 0 || toBlock < fromBlock || toBlock - fromBlock >= 2000) throw new Error("Choose an inclusive range of 1–2,000 blocks");
  const events: SqdEvent[] = [];
  while (fromBlock <= toBlock) {
    const response = await request("stream", { method: "POST", headers: { "content-type": "application/json" }, signal,
      body: JSON.stringify({ type: "substrate", fromBlock, toBlock, includeAllBlocks: true,
        fields: { block: { number: true, hash: true, timestamp: true }, event: { name: true, args: true } }, events: [{ name: ["Gear.UserMessageSent"] }] }) });
    if (response.status === 204) throw new Error("The indexer has not supplied the full requested range. Retry with a lower end block.");
    let last = fromBlock - 1;
    for (const line of (await response.text()).split("\n")) {
      if (!line.trim()) continue;
      const b = JSON.parse(line) as { header: { number: number; hash: Hex; timestamp: number }; events?: { name: string; args: { message?: { id: Hex; source: Hex; destination: Hex; payload: Hex; value: string; details?: unknown } } }[] };
      if (!b.header || !Number.isSafeInteger(b.header.number) || b.header.number < fromBlock || b.header.number > toBlock) throw new Error("Invalid indexer block header");
      last = b.header.number;
      for (const e of b.events ?? []) {
        const m = e.args.message;
        if (e.name !== "Gear.UserMessageSent" || !m || m.source.toLowerCase() !== programId.toLowerCase() || m.destination !== `0x${"00".repeat(32)}` || m.details != null) continue;
        if (!/^0x([\da-f]{2})*$/i.test(m.payload) || !/^0x[\da-f]{64}$/i.test(m.id)) throw new Error("Invalid indexed event payload");
        events.push({ block: b.header.number, hash: b.header.hash, timestamp: b.header.timestamp, id: m.id, source: m.source, destination: m.destination, payload: m.payload, value: String(m.value) });
        if (events.length > 5000) throw new Error("More than 5,000 events; use a smaller block range");
      }
    }
    if (last < fromBlock) throw new Error("Indexer returned no block coverage");
    fromBlock = last + 1;
  }
  return events;
}
