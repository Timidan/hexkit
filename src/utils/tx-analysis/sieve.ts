import type { EvidencePacket, HeuristicHit, TriggerEvidence } from "./types";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const LARGE_DELTA_THRESHOLD = BigInt("0x8ac7230489e80000");

const ORACLE_FN_PATTERNS = [
  /^latestAnswer\b/i,
  /^latestRoundData\b/i,
  /^getPrice\b/i,
  /priceOf\b/i,
  /^getUnderlyingPrice\b/i,
  /^getReserves\b/i,
  /^consult\b/i,
  /^quote\b/i,
  /^getAmountsOut\b/i,
  /^getAmountsIn\b/i,
  /^ethToToken(Input|Output)?/i,
  /^tokenToEth(Input|Output)?/i,
  /^price0CumulativeLast\b/i,
  /^price1CumulativeLast\b/i,
  /\bFetchPrice\b/i,
  /\bgetSpot\b/i,
];

const ADMIN_FN_PATTERNS = [
  /^setOwner\b/i,
  /^transferOwnership\b/i,
  /^upgradeTo\b/i,
  /^upgradeToAndCall\b/i,
  /^setAdmin\b/i,
  /^grantRole\b/i,
  /^revokeRole\b/i,
  /^setKeeper(s)?\b/i,
  /^addKeeper(s)?\b/i,
  /^putCurEpochConKeepers\b/i,
  /^changeBookKeeper\b/i,
  /^_setPendingImplementation\b/i,
  /^_acceptImplementation\b/i,
  /^setPriceOracle\b/i,
  /^setOracle\b/i,
  /^setComptroller\b/i,
];

const GOVERNANCE_FN_PATTERNS = [
  /^execute(Transaction|Proposal)?\b/i,
  /^crossChainExecute\b/i,
  /^verifyHeaderAndExecuteTx\b/i,
];

const matchesAny = (name: string, patterns: RegExp[]): boolean =>
  patterns.some((p) => p.test(name));

function classifyTrigger(t: TriggerEvidence): Array<HeuristicHit["name"]> {
  const hits: Array<HeuristicHit["name"]> = [];
  const fn = t.function ?? "";
  if (!fn) return hits;
  if ((t.kind === "STATICCALL" || t.kind === "CALL") && matchesAny(fn, ORACLE_FN_PATTERNS)) {
    hits.push("oracle_read_cluster");
  }
  if ((t.kind === "CALL" || t.kind === "DELEGATECALL") && matchesAny(fn, ADMIN_FN_PATTERNS)) {
    hits.push("admin_state_mutation");
  }
  if (matchesAny(fn, GOVERNANCE_FN_PATTERNS)) {
    hits.push("suspicious_governance_call");
  }
  return hits;
}

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

  const oracleReadCounts = new Map<string, string[]>();
  const adminWriteHits: Array<{ id: string; fn: string; contract: string }> = [];
  const governanceHits: Array<{ id: string; fn: string; contract: string }> = [];

  for (const t of packet.triggers) {
    const classifications = classifyTrigger(t);
    for (const kind of classifications) {
      if (kind === "oracle_read_cluster") {
        const list = oracleReadCounts.get(t.contract) ?? [];
        list.push(t.id);
        oracleReadCounts.set(t.contract, list);
      } else if (kind === "admin_state_mutation") {
        adminWriteHits.push({ id: t.id, fn: t.function ?? "", contract: t.contract });
      } else if (kind === "suspicious_governance_call") {
        governanceHits.push({ id: t.id, fn: t.function ?? "", contract: t.contract });
      }
    }
  }

  for (const [contract, ids] of oracleReadCounts) {
    if (ids.length >= 2) {
      hits.push({
        name: "oracle_read_cluster",
        evidenceId: ids[0],
        reason: `${ids.length} oracle-shaped reads on ${contract} (ids: ${ids.slice(0, 4).join(", ")}) — possible oracle manipulation`,
      });
    }
  }
  for (const h of adminWriteHits) {
    hits.push({
      name: "admin_state_mutation",
      evidenceId: h.id,
      reason: `Admin-role function ${h.fn} invoked on ${h.contract}`,
    });
  }
  for (const h of governanceHits) {
    hits.push({
      name: "suspicious_governance_call",
      evidenceId: h.id,
      reason: `Cross-chain / governance execute function ${h.fn} invoked on ${h.contract}`,
    });
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
