import { EVIDENCE_ROW_CAPS, evidencePacketSchema } from "./types";
import type {
  EvidencePacket,
  WriteEvidence,
  ReadEvidence,
  TriggerEvidence,
  ProfitEvidence,
  ContractMeta,
} from "./types";
import type { BridgeSimulationResponsePayload } from "../transaction-simulation/types";

const TRANSFER_TOPIC0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

interface V3Row {
  id?: number;
  kind?: string;
  name?: string;
  pc?: number;
  contract?: string | null;
  sourceFile?: string | null;
  line?: number | null;
  storage_write?: { slot?: string; before?: string | null; after?: string } | null;
  storage_read?: { slot?: string; value?: string } | null;
  entryMeta?: {
    callType?: string;
    target?: string;
    codeAddress?: string;
    selector?: string;
    function?: string;
    args?: Array<{ name: string; value: string }>;
  } | null;
  logInfo?: { topics?: string[] } | null;
  decodedLog?: { args?: Array<{ name: string | number; value: string }> } | null;
}

export interface ExtractorInput {
  simulationId: string;
  from: string;
  to: string | null;
  simulation: BridgeSimulationResponsePayload;
  txHash: string | null;
  contracts?: ContractMeta[];
}

const normalizeHex = (value: string | null | undefined): string | null => {
  if (!value) return null;
  return value.toLowerCase().startsWith("0x")
    ? value.toLowerCase()
    : `0x${value.toLowerCase()}`;
};

const normalizeAddress = (value: string | null | undefined): string | null => {
  const hex = normalizeHex(value);
  if (!hex || hex.length !== 42) return null;
  return hex;
};

const topicToAddress = (topic: string | undefined | null): string | null => {
  if (!topic) return null;
  const hex = topic.toLowerCase().replace(/^0x/, "");
  if (hex.length < 40) return null;
  return `0x${hex.slice(-40)}`;
};

const pickTransferAmount = (row: V3Row): string => {
  const arg = row.decodedLog?.args?.find((a) => /value|amount|wad|tokens/i.test(String(a.name)));
  if (arg?.value) return String(arg.value);
  return "0";
};

function findPrecedingWrite(
  writes: WriteEvidence[],
  contract: string,
  slot: string,
): string | null {
  for (let i = writes.length - 1; i >= 0; i -= 1) {
    const w = writes[i];
    if (w.contract === contract && w.slot === slot) return w.id;
  }
  return null;
}

export function extractEvidence(input: ExtractorInput): EvidencePacket {
  const trace = input.simulation.renderedTrace;
  const writes: WriteEvidence[] = [];
  const reads: ReadEvidence[] = [];
  const triggers: TriggerEvidence[] = [];
  const profit: ProfitEvidence[] = [];

  const rows: V3Row[] = Array.isArray(trace?.rows) ? (trace!.rows as V3Row[]) : [];
  const truncated = { writes: false, reads: false, triggers: false, profit: false };

  const fromAddr = (normalizeAddress(input.from) ?? input.from).toLowerCase();

  const pushProfit = (p: ProfitEvidence) => {
    if (profit.length >= EVIDENCE_ROW_CAPS.profit) {
      truncated.profit = true;
      return;
    }
    profit.push(p);
  };

  for (const row of rows) {
    const contract = normalizeAddress(row.contract);
    const opcodeIndex = typeof row.id === "number" && row.id >= 0 ? row.id : 0;

    if (row.storage_write && contract) {
      if (writes.length >= EVIDENCE_ROW_CAPS.writes) {
        truncated.writes = true;
      } else {
        const slot = normalizeHex(row.storage_write.slot) ?? "0x0";
        const valueAfter = normalizeHex(row.storage_write.after) ?? "0x0";
        writes.push({
          id: `w_${writes.length}`,
          contract,
          slot,
          valueBefore: normalizeHex(row.storage_write.before),
          valueAfter,
          label: null,
          typeHint: null,
          opcodeIndex,
          sourceLine: row.line ?? null,
          sourceFile: row.sourceFile ?? null,
        });
      }
    }

    if (row.storage_read && contract) {
      if (reads.length >= EVIDENCE_ROW_CAPS.reads) {
        truncated.reads = true;
      } else {
        const slot = normalizeHex(row.storage_read.slot) ?? "0x0";
        reads.push({
          id: `r_${reads.length}`,
          contract,
          slot,
          value: normalizeHex(row.storage_read.value) ?? "0x0",
          label: null,
          opcodeIndex,
          sourceLine: row.line ?? null,
          sourceFile: row.sourceFile ?? null,
          followsWriteId: findPrecedingWrite(writes, contract, slot),
        });
      }
    }

    if (row.entryMeta && row.entryMeta.callType) {
      if (triggers.length >= EVIDENCE_ROW_CAPS.triggers) {
        truncated.triggers = true;
      } else {
        const target =
          normalizeAddress(row.entryMeta.codeAddress ?? row.entryMeta.target) ?? contract;
        if (target) {
          triggers.push({
            id: `t_${triggers.length}`,
            contract: target,
            kind: row.entryMeta.callType as TriggerEvidence["kind"],
            selector: row.entryMeta.selector ?? null,
            function: row.entryMeta.function ?? null,
            args: row.entryMeta.args ?? [],
            logTopics: [],
            opcodeIndex,
          });
        }
      }
    }

    if (
      (row.name === "LOG1" || row.name === "LOG2" || row.name === "LOG3" || row.name === "LOG4") &&
      contract
    ) {
      const topics = row.logInfo?.topics?.map((t) => String(t)) ?? [];
      if (triggers.length >= EVIDENCE_ROW_CAPS.triggers) {
        truncated.triggers = true;
      } else {
        triggers.push({
          id: `t_${triggers.length}`,
          contract,
          kind: "LOG",
          selector: null,
          function: null,
          args:
            row.decodedLog?.args?.map((a) => ({ name: String(a.name), value: a.value })) ?? [],
          logTopics: topics,
          opcodeIndex,
        });
      }
      const topic0 = (topics[0] ?? "").toLowerCase();
      if (topic0 === TRANSFER_TOPIC0 && topics.length >= 3) {
        const transferFrom = topicToAddress(topics[1]);
        const transferTo = topicToAddress(topics[2]);
        const delta = pickTransferAmount(row);
        if (transferFrom && transferFrom.toLowerCase() === fromAddr) {
          pushProfit({
            id: `p_${profit.length}`,
            token: contract,
            asset: "ERC20",
            holder: transferFrom,
            delta,
            direction: "out",
            opcodeIndex,
          });
        }
        if (transferTo && transferTo.toLowerCase() === fromAddr) {
          pushProfit({
            id: `p_${profit.length}`,
            token: contract,
            asset: "ERC20",
            holder: transferTo,
            delta,
            direction: "in",
            opcodeIndex,
          });
        }
      }
    }
  }

  const packet: EvidencePacket = {
    txHash: input.txHash,
    simulationId: input.simulationId,
    chainId: input.simulation.chainId ?? 1,
    from: (normalizeAddress(input.from) ?? input.from) as string,
    to: input.to ? ((normalizeAddress(input.to) ?? input.to) as string) : null,
    success: Boolean(input.simulation.success),
    revertReason: input.simulation.revertReason ?? null,
    writes,
    reads,
    triggers,
    profit,
    contracts: input.contracts ?? [],
    heuristics: [],
    truncated,
  };

  return evidencePacketSchema.parse(packet);
}
