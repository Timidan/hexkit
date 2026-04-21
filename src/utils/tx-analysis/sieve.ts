import type { EvidencePacket, HeuristicHit } from "./types";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const LARGE_DELTA_THRESHOLD = BigInt("0x8ac7230489e80000");

export function applyHeuristics(packet: EvidencePacket): EvidencePacket {
  const hits: HeuristicHit[] = [];

  if (!packet.success && packet.revertReason) {
    hits.push({
      name: "revert_on_path",
      evidenceId: "_tx",
      reason: `Transaction reverted: ${packet.revertReason}`,
    });
  }

  for (const r of packet.reads) {
    if (r.followsWriteId) {
      hits.push({
        name: "sload_after_sstore",
        evidenceId: r.id,
        reason: `SLOAD ${r.slot} follows SSTORE ${r.followsWriteId} on ${r.contract}`,
      });
    }
  }

  for (const t of packet.triggers) {
    for (const a of t.args) {
      if (typeof a.value === "string" && a.value.toLowerCase() === ZERO_ADDR) {
        hits.push({
          name: "zero_address_transfer",
          evidenceId: t.id,
          reason: `Argument ${a.name} is the zero address`,
        });
        break;
      }
    }
  }

  for (const p of packet.profit) {
    try {
      const abs = p.delta.startsWith("-") ? BigInt(p.delta.slice(1)) : BigInt(p.delta);
      if (abs >= LARGE_DELTA_THRESHOLD) {
        hits.push({
          name: "large_delta",
          evidenceId: p.id,
          reason: `Balance delta ${p.delta} exceeds 10-ETH threshold`,
        });
      }
    } catch {
      // non-numeric delta (e.g. NFT id)
    }
  }

  const writeCountsBySlot = new Map<string, number>();
  for (const w of packet.writes) {
    const key = `${w.contract}:${w.slot}`;
    writeCountsBySlot.set(key, (writeCountsBySlot.get(key) ?? 0) + 1);
  }
  for (const [key, count] of writeCountsBySlot) {
    if (count >= 3) {
      const evidenceId = packet.writes.find((w) => `${w.contract}:${w.slot}` === key)?.id ?? "_unknown";
      hits.push({
        name: "accumulator",
        evidenceId,
        reason: `Slot ${key} written ${count} times within one tx`,
      });
    }
  }

  return { ...packet, heuristics: hits };
}
