import type { EvidencePacket } from "../tx-analysis/types";
import type { ClassifierClass } from "./types";

export interface ClassifierLabel {
  class: ClassifierClass;
  confidence: number;
  rationale: string;
  evidenceIds: string[];
}

type Rule = (packet: EvidencePacket) => ClassifierLabel | null;

// Real EVM selectors (verified).
const FLASHLOAN_SELECTORS = new Set([
  "0xab9c4b5d", // Aave v2: flashLoan(address,address,uint256,bytes)
  "0x42b0b77c", // Aave v3: flashLoanSimple(address,address,uint256,bytes,uint16)
  "0x5c38449e", // Balancer: flashLoan(address,address[],uint256[],bytes)
  "0x5cffe9de", // dYdX / Maker DssFlash: flash(address,uint256,bytes) variants
]);

const reentrancyRule: Rule = (packet) => {
  for (const r of packet.reads) {
    if (!r.followsWriteId) continue;
    const w = packet.writes.find((x) => x.id === r.followsWriteId);
    if (!w) continue;
    const interveningCall = packet.triggers.find(
      (t) =>
        (t.kind === "CALL" || t.kind === "DELEGATECALL") &&
        t.opcodeIndex > w.opcodeIndex &&
        t.opcodeIndex < r.opcodeIndex &&
        t.contract.toLowerCase() !== r.contract.toLowerCase(),
    );
    if (interveningCall) {
      return {
        class: "reentrancy",
        confidence: 0.8,
        rationale:
          "SLOAD on a slot that was SSTOREd earlier, with an external CALL to a different contract between write and read.",
        evidenceIds: [w.id, r.id, interveningCall.id],
      };
    }
  }
  return null;
};

const flashloanRule: Rule = (packet) => {
  const loan = packet.triggers.find((t) => t.selector && FLASHLOAN_SELECTORS.has(t.selector.toLowerCase()));
  if (!loan) return null;

  const slotCounts = new Map<string, number>();
  for (const w of packet.writes) {
    const k = `${w.contract.toLowerCase()}:${w.slot}`;
    slotCounts.set(k, (slotCounts.get(k) ?? 0) + 1);
  }
  const hasRepeatedWrite = [...slotCounts.values()].some((c) => c >= 3);
  if (!hasRepeatedWrite) return null;

  const bigProfit = packet.heuristics.find((h) => h.name === "large_delta");
  if (!bigProfit) return null;
  const profitRow = packet.profit.find((p) => p.id === bigProfit.evidenceId);
  if (!profitRow || profitRow.direction !== "in" || profitRow.holder.toLowerCase() !== packet.from.toLowerCase()) return null;

  return {
    class: "flashloan-price-manipulation",
    confidence: 0.8,
    rationale: `flashLoan selector ${loan.selector}, pool slot written ≥3× in one tx, attacker netted > 10 ETH equivalent.`,
    evidenceIds: [loan.id, profitRow.id],
  };
};

const delegatecallRule: Rule = (packet) => {
  const delegates = packet.triggers.filter((t) => t.kind === "DELEGATECALL");
  if (delegates.length === 0) return null;

  const knownUnverified = delegates.filter((d) => {
    const meta = packet.contracts.find((c) => c.address.toLowerCase() === d.contract.toLowerCase());
    return meta !== undefined && meta.verified === false;
  });
  if (knownUnverified.length === 0) return null;

  const slotZeroWrite = packet.writes.find((w) => w.slot === "0x0" || w.slot === "0x00");
  if (!slotZeroWrite) return null;

  return {
    class: "delegatecall-to-user-controlled",
    confidence: 0.85,
    rationale:
      "DELEGATECALL to an explicitly-unverified contract combined with a slot-0 write (singleton/impl swap pattern).",
    evidenceIds: [...knownUnverified.map((d) => d.id), slotZeroWrite.id],
  };
};

const TRANSFER_FROM_SEL = "0x23b872dd";
const approvalDrainRule: Rule = (packet) => {
  const hits: string[] = [];
  for (const t of packet.triggers) {
    if (t.kind !== "CALL") continue; // no STATICCALL
    if (t.selector?.toLowerCase() !== TRANSFER_FROM_SEL) continue;
    const fromArg = t.args.find((a) => a.name === "from")?.value?.toString().toLowerCase();
    if (!fromArg) continue;
    if (fromArg === packet.from.toLowerCase()) continue; // signer pulling their own tokens is legit
    hits.push(t.id);
  }
  if (hits.length === 0) return null;

  const attackerProfit = packet.profit.find(
    (p) => p.direction === "in" && p.holder.toLowerCase() === packet.from.toLowerCase(),
  );
  if (!attackerProfit) return null;

  return {
    class: "approval-drain",
    confidence: 0.75,
    rationale:
      "transferFrom moved tokens FROM an address that did not sign the tx, TO the tx signer — the fingerprint of a pre-authorized allowance being exercised by an attacker.",
    evidenceIds: [...hits, attackerProfit.id],
  };
};

// Note: bare "safe" is intentionally excluded — too many unrelated contracts
// (SafeMath-like libs, "SafeVault" wrappers) share that substring. We require
// a disambiguated multisig identifier.
const SAFE_NAMES = new Set(["gnosissafe", "gnosissafeproxy", "safeproxy"]);
const signerCompromiseRule: Rule = (packet) => {
  const meta = packet.contracts.find((c) => c.address.toLowerCase() === packet.to.toLowerCase());
  if (!meta?.name || !SAFE_NAMES.has(meta.name.replace(/\s+/g, "").toLowerCase())) return null;

  const delegate = packet.triggers.find((t) => t.kind === "DELEGATECALL");
  if (!delegate) return null;
  const slotZero = packet.writes.find((w) => w.slot === "0x0" || w.slot === "0x00");
  if (!slotZero) return null;

  return {
    class: "signer-compromise",
    confidence: 0.75,
    rationale:
      "Tx target is a known Safe/multisig, with a delegatecall + slot-0 write — the Bybit-style fingerprint for signers unknowingly approving a singleton swap.",
    evidenceIds: [delegate.id, slotZero.id],
  };
};

const ORACLE_SELECTORS = new Set([
  "0x50d25bcd", // Chainlink latestAnswer()
  "0xfeaf968c", // Chainlink latestRoundData()
  "0xb3596f07", // Aave getAssetPrice(address)
]);
const oracleManipulationRule: Rule = (packet) => {
  const oracleRead = packet.triggers.find(
    (t) => t.kind === "STATICCALL" && t.selector && ORACLE_SELECTORS.has(t.selector.toLowerCase()),
  );
  if (!oracleRead) return null;
  const flash = packet.triggers.find((t) => t.selector && FLASHLOAN_SELECTORS.has(t.selector.toLowerCase()));
  if (!flash) return null;
  const attackerProfit = packet.profit.find((p) => p.direction === "in" && p.holder.toLowerCase() === packet.from.toLowerCase());
  if (!attackerProfit) return null;

  return {
    class: "oracle-manipulation",
    confidence: 0.5,
    rationale:
      "Flashloan co-occurs with an oracle read and attacker profit — consistent with pool-price manipulation feeding into a dependent oracle.",
    evidenceIds: [oracleRead.id, flash.id, attackerProfit.id],
  };
};

const BRIDGE_NAME_RE = /bridge|gateway|crosschain/i;
const BRIDGE_FN_RE = /message|vaa|execute|verify|process/i;
const bridgeForgeryRule: Rule = (packet) => {
  const meta = packet.contracts.find((c) => c.address.toLowerCase() === packet.to.toLowerCase());
  if (!meta?.name || !BRIDGE_NAME_RE.test(meta.name)) return null;
  const bridgeTrigger = packet.triggers.find((t) => t.function && BRIDGE_FN_RE.test(t.function));
  if (!bridgeTrigger) return null;
  const attackerProfit = packet.profit.find(
    (p) => p.direction === "in" && p.holder.toLowerCase() === packet.from.toLowerCase(),
  );
  if (!attackerProfit) return null;

  return {
    class: "bridge-message-forgery",
    confidence: 0.5,
    rationale:
      "Call against a known-bridge contract invokes a message/VAA/execute function and the signer netted value — consistent with a forged-inbound-message shape.",
    evidenceIds: [bridgeTrigger.id, attackerProfit.id],
  };
};

const GOV_FN_RE = /propose|queueTransaction|executeTransaction|setAdmin|setOwner|transferOwnership|emergencyPause|grantRole/i;
const governanceTakeoverRule: Rule = (packet) => {
  const govCall = packet.triggers.find((t) => t.function && GOV_FN_RE.test(t.function));
  if (!govCall) return null;
  const attackerProfit = packet.profit.find((p) => p.direction === "in" && p.holder.toLowerCase() === packet.from.toLowerCase());
  const hasLarge = packet.heuristics.some((h) => h.name === "large_delta");
  if (!attackerProfit && !hasLarge) return null;

  return {
    class: "governance-takeover",
    confidence: 0.5,
    rationale: "Governance-flavored selector co-occurs with attacker profit or a large value delta.",
    evidenceIds: [govCall.id, ...(attackerProfit ? [attackerProfit.id] : [])],
  };
};

const accessControlRule: Rule = (packet) => {
  const privilegedWrite = packet.writes.find(
    (w) => w.label !== null && /owner|admin|role|minter|guardian|governor/i.test(w.label),
  );
  if (!privilegedWrite) return null;
  const attackerProfit = packet.profit.find((p) => p.direction === "in" && p.holder.toLowerCase() === packet.from.toLowerCase());
  if (!attackerProfit) return null;

  return {
    class: "access-control-bypass",
    confidence: 0.45,
    rationale: "Write to a storage slot labeled as a privilege role, co-occurring with attacker profit.",
    evidenceIds: [privilegedWrite.id, attackerProfit.id],
  };
};

const MATH_FN_RE = /donate|redeem|liquidate|emergencyWithdraw/i;
const mathInvariantRule: Rule = (packet) => {
  const flash = packet.triggers.find((t) => t.selector && FLASHLOAN_SELECTORS.has(t.selector.toLowerCase()));
  if (!flash) return null;
  const attackerProfit = packet.profit.find((p) => p.direction === "in" && p.holder.toLowerCase() === packet.from.toLowerCase());
  if (!attackerProfit) return null;
  const big = packet.heuristics.some((h) => h.name === "large_delta" && h.evidenceId === attackerProfit.id);
  if (!big) return null;
  const slotCounts = new Map<string, number>();
  for (const w of packet.writes) {
    const k = `${w.contract.toLowerCase()}:${w.slot}`;
    slotCounts.set(k, (slotCounts.get(k) ?? 0) + 1);
  }
  const hasRepeat = [...slotCounts.values()].some((c) => c >= 3);
  if (hasRepeat) return null; // let flashloan-price-manipulation own this case
  const mathFn = packet.triggers.find((t) => t.function && MATH_FN_RE.test(t.function));
  if (!mathFn) return null;

  return {
    class: "math-invariant-manipulation",
    confidence: 0.5,
    rationale: "Flashloan + big attacker profit + math-flavored selector, but without the repeated-write fingerprint of pool-reserve price manipulation.",
    evidenceIds: [flash.id, mathFn.id, attackerProfit.id],
  };
};

const RULES: Rule[] = [reentrancyRule, flashloanRule, delegatecallRule, approvalDrainRule, signerCompromiseRule, oracleManipulationRule, bridgeForgeryRule, governanceTakeoverRule, accessControlRule, mathInvariantRule];

export function classify(packet: EvidencePacket): ClassifierLabel[] {
  const hits = RULES.map((r) => r(packet)).filter(
    (x): x is ClassifierLabel => x !== null,
  );
  if (hits.length === 0) {
    return [
      {
        class: "unknown",
        confidence: 0.5,
        rationale: "No rule matched.",
        evidenceIds: [],
      },
    ];
  }
  return hits;
}
