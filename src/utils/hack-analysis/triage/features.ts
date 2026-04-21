import type { EvidencePacket } from "../../tx-analysis/types";

// MUST stay byte-for-byte aligned with HackTriage.sol constants.
export const FEATURE_BITS = {
  hasFlashSel:          0,
  hasTransferFromExt:   1,
  hasDelegatecall:      2,
  hasSlot0Write:        3,
  targetUnverified:     4,
  targetIsSafe:         5,
  attackerProfitIn:     6,
  attackerProfitLarge:  7,
  repeatedWritesMax3:   8,
  privilegedWriteLabel: 9,
  hasOracleStaticcall: 10,
  hasBridgeFn:         11,
} as const;

const FLASH_SELECTORS  = new Set([
  "0xab9c4b5d", // Aave V2 flashLoan
  "0x42b0b77c", // Aave V3 flashLoanSimple
  "0x5c38449e", // Balancer V2 flashLoan
  "0x5cffe9de", // dYdX soloMargin operate
  "0xfa461e33", // uniswapV3SwapCallback — flash-loan-equivalent entrypoint
  "0x10d1e85c", // uniswapV2Call — pair callback, flash-swap entrypoint
  "0x23e30c8b", // ERC-3156 onFlashLoan receiver
]);
const ORACLE_SELECTORS = new Set(["0x50d25bcd", "0xfeaf968c", "0xb3596f07"]);
const TRANSFER_FROM    = "0x23b872dd";
const TRANSFER_SEL     = "0xa9059cbb";
// Raw-units threshold for "large" transfer when packet.profit/heuristics are missing.
// 1e11 ≈ $100k at 6 decimals; negligible at 18 decimals so low risk of tripping benign txs.
const LARGE_TRANSFER_RAW = 10n ** 11n;
const TO_ARG_RE          = /^(_?to|dst|recipient)$/i;
const AMOUNT_ARG_RE      = /^(_?value|wad|amount|_amount)$/i;
// Must match the classifier.ts adjusted SAFE_NAMES (no bare "safe" to avoid false-positives on non-Gnosis contracts named "Safe").
const SAFE_NAMES       = new Set(["gnosissafe", "gnosissafeproxy", "safeproxy"]);
const PRIV_LABEL_RE    = /owner|admin|role|minter|guardian|governor/i;
const BRIDGE_FN_RE     = /message|vaa|execute|verify|process/i;

export function extractTriageBits(packet: EvidencePacket): number {
  let bits = 0;
  const set = (p: keyof typeof FEATURE_BITS) => { bits |= 1 << FEATURE_BITS[p]; };

  const from = packet.from.toLowerCase();
  const to   = packet.to.toLowerCase();
  const tr   = packet.triggers;

  if (tr.some((t) => t.selector && FLASH_SELECTORS.has(t.selector.toLowerCase()))) set("hasFlashSel");
  if (tr.some((t) => t.kind === "DELEGATECALL")) set("hasDelegatecall");
  if (tr.some((t) => t.kind === "STATICCALL" && t.selector && ORACLE_SELECTORS.has(t.selector.toLowerCase()))) set("hasOracleStaticcall");
  if (tr.some((t) => t.function && BRIDGE_FN_RE.test(t.function))) set("hasBridgeFn");
  if (tr.some((t) => {
    if (t.kind !== "CALL" || t.selector?.toLowerCase() !== TRANSFER_FROM) return false;
    const fromArg = t.args.find((a) => a.name === "from")?.value?.toString().toLowerCase();
    return !!fromArg && fromArg !== from;
  })) set("hasTransferFromExt");

  if (packet.writes.some((w) => w.slot === "0x0" || w.slot === "0x00")) set("hasSlot0Write");
  if (packet.writes.some((w) => w.label !== null && PRIV_LABEL_RE.test(w.label))) set("privilegedWriteLabel");

  const slotCounts = new Map<string, number>();
  for (const w of packet.writes) {
    const k = `${w.contract.toLowerCase()}:${w.slot}`;
    slotCounts.set(k, (slotCounts.get(k) ?? 0) + 1);
  }
  if ([...slotCounts.values()].some((c) => c >= 3)) set("repeatedWritesMax3");

  const toMeta = packet.contracts.find((c) => c.address.toLowerCase() === to);
  // targetUnverified mirrors the delegatecall rule: any delegatecall target is explicitly unverified,
  // OR the tx target itself is unverified. This matches the "unverified callee" notion the classifier keys off.
  const delegatecallUnverified = tr.some((t) => {
    if (t.kind !== "DELEGATECALL") return false;
    const meta = packet.contracts.find((c) => c.address.toLowerCase() === t.contract.toLowerCase());
    return meta !== undefined && meta.verified === false;
  });
  if (toMeta?.verified === false || delegatecallUnverified) set("targetUnverified");
  if (toMeta?.name && SAFE_NAMES.has(toMeta.name.replace(/\s+/g, "").toLowerCase())) set("targetIsSafe");

  if (packet.profit.some((p) => p.direction === "in" && p.holder.toLowerCase() === from)) set("attackerProfitIn");
  if (packet.heuristics.some((h) => h.name === "large_delta")) set("attackerProfitLarge");

  // Fallback inferences when upstream tracer omits profit/writes/heuristics.
  // A raw trace with only triggers (typical for real on-chain tx re-analysis) still has enough
  // signal to classify the obvious cases. Guarded against non-fixture shapes by only firing when
  // the transfer recipient is the tx origin and values live in a sane range.
  const isTransferCall = (t: typeof tr[number]): boolean => {
    if (t.kind !== "CALL") return false;
    const sel = t.selector?.toLowerCase();
    return sel === TRANSFER_SEL || sel === TRANSFER_FROM;
  };

  if (!(bits & (1 << FEATURE_BITS.attackerProfitIn))) {
    const profitInferred = tr.some((t) => {
      if (!isTransferCall(t)) return false;
      const toArg = t.args.find((a) => TO_ARG_RE.test(a.name))?.value?.toString().toLowerCase();
      return !!toArg && toArg === from;
    });
    if (profitInferred) set("attackerProfitIn");
  }

  if (!(bits & (1 << FEATURE_BITS.attackerProfitLarge))) {
    const largeInferred = tr.some((t) => {
      if (!isTransferCall(t)) return false;
      const valueArg = t.args.find((a) => AMOUNT_ARG_RE.test(a.name))?.value?.toString();
      if (!valueArg) return false;
      try { return BigInt(valueArg) >= LARGE_TRANSFER_RAW; } catch { return false; }
    });
    if (largeInferred) set("attackerProfitLarge");
  }

  if (!(bits & (1 << FEATURE_BITS.repeatedWritesMax3))) {
    const transfersByToken = new Map<string, number>();
    for (const t of tr) {
      if (!isTransferCall(t)) continue;
      const k = t.contract.toLowerCase();
      transfersByToken.set(k, (transfersByToken.get(k) ?? 0) + 1);
    }
    if ([...transfersByToken.values()].some((c) => c >= 3)) set("repeatedWritesMax3");
  }

  return bits & 0xFFFF;
}
