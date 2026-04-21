import type { z } from "zod";
import { verdictSchema, type EvidencePacket, type Verdict } from "./types";

const SYSTEM_PROMPT = `You are TxCaptain, a forensic EVM transaction analyst. You produce structured JSON verdicts grounded in the evidence provided. Follow TxAnalyzer methodology:
- Prefer SSTORE evidence over call-path reasoning.
- Build a Write → Read → Trigger → Profit causal chain.
- State a single Core Contradiction: what the contract expected vs. what actually happened.
- Never speculate beyond evidence. If you cannot confirm, return verdict=OPEN or INSUFFICIENT and list missingEvidence.
- Respond with a JSON object matching the declared schema exactly. Do not wrap in prose.

VERDICT SELECTION RULES (apply strictly):
- "CONFIRMED" — Use when the evidence shows extracted value AND victim/protocol harm from at least one suspicious mechanism: (a) flash-loan executed by an unverified contract plus a victim/protocol loss or abnormal state contradiction, (b) a named access-control or accounting bypass, (c) sandwich/MEV pattern that drained a victim, (d) reentrancy with state inconsistency. The Profit step should be non-empty. Confidence 0.8+.
- "OPEN" — Unusual patterns where exploitation is plausible but not provable from this evidence alone: large unexplained transfers, unverified contracts touching value, MEV-shaped trades without clear victim, governance edge cases. Use this when a human analyst should look closer.
- "INSUFFICIENT" — Ordinary user activity ONLY: direct user calls to known-verified routers/protocols (1inch, Uniswap router, Aave, Compound, OpenSea, etc.) with patterns matching their public APIs (swap, cancelOrder, approve, bridge, mint, claim, vote, NFT trade). The caller is an EOA invoking a single named function on a verified contract. No flash loans, no contract-to-contract value extraction, no unverified intermediaries. Confidence 0.85+.

Decision shortcuts:
- EOA calls verified router function (cancelOrder, swap, approve) → INSUFFICIENT.
- Public liquidation, atomic arbitrage, or ordinary backrun with profit but no victim drain / invariant break → OPEN unless the public protocol rules prove it is routine, then INSUFFICIENT.
- Unverified contract takes flash loan and ends with profit transferred out from a victim/protocol state contradiction → CONFIRMED (even without naming the exact bug — the pattern itself is the evidence).
- Anything in between (large transfers, unusual gates, unfamiliar contracts) → OPEN.

Heuristic interpretations (apply when heuristicsFired includes these):
- "oracle_read_cluster" — Multiple oracle-shaped reads (latestAnswer / getReserves / getPrice / consult / ethToToken / priceOf) on the same contract within one tx. If the reads are adjacent to a flash loan or DEX swap on the same underlying market, call out oracle manipulation explicitly in coreContradiction and name the oracle contract.
- "admin_state_mutation" — Admin-role mutator (setOwner / upgradeTo / putCurEpochConKeepers / setKeepers / setPriceOracle / grantRole) executed during a tx that was not initiated by a governance/multisig address. Strong signal of access-control bypass (Poly Network, Ronin, Wormhole class).
- "suspicious_governance_call" — Cross-chain execute entry points (verifyHeaderAndExecuteTx, crossChainExecute). Combined with admin_state_mutation on the same tx, this indicates cross-chain message forgery.

False negatives on real exploits are much worse than false positives on suspicious-but-benign txs — when in doubt between OPEN and CONFIRMED on a clearly profit-extracting unverified contract, lean CONFIRMED. When in doubt between INSUFFICIENT and OPEN on a routine user call, lean INSUFFICIENT.

Required JSON shape (all keys must be present; use null or [] when unknown):
{
  "verdict": "CONFIRMED" | "OPEN" | "INSUFFICIENT",
  "confidence": number between 0 and 1,
  "coreContradiction": { "expected": string, "actual": string } | null,
  "causalChain": [ { "step": "Write" | "Read" | "Trigger" | "Profit", "description": string, "evidenceId": string } ],
  "gates": [ { "name": string, "bypassedBy": string | null } ],
  "deepDive": null,
  "riskBound": { "upperBoundEth": string, "rationale": string } | null,
  "missingEvidence": [ string ]
}`;

export type LlmInvokeFn = (opts: {
  system: string;
  user: string;
  responseSchema: z.ZodType<unknown>;
  signal?: AbortSignal;
}) => Promise<unknown>;

export interface AnalysisInput {
  packet: EvidencePacket;
  signal?: AbortSignal;
  invoke: LlmInvokeFn;
}

export interface AnalysisResult extends Verdict {
  promptHash: string;
}

async function hashPrompt(prompt: string): Promise<string> {
  const data = new TextEncoder().encode(prompt);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function buildUserPrompt(packet: EvidencePacket): string {
  return JSON.stringify({
    instruction: "Analyze the following EVM transaction evidence and return a verdict JSON.",
    transaction: {
      txHash: packet.txHash,
      chainId: packet.chainId,
      from: packet.from,
      to: packet.to,
      success: packet.success,
      revertReason: packet.revertReason,
    },
    heuristicsFired: packet.heuristics,
    writes: packet.writes,
    reads: packet.reads,
    triggers: packet.triggers,
    profit: packet.profit,
    contracts: packet.contracts,
    truncated: packet.truncated,
  });
}

export async function runSimpleAnalysis(input: AnalysisInput): Promise<AnalysisResult> {
  const user = buildUserPrompt(input.packet);
  const promptHash = await hashPrompt(`${SYSTEM_PROMPT}\n\n${user}`);
  const raw = await input.invoke({
    system: SYSTEM_PROMPT,
    user,
    responseSchema: verdictSchema,
    signal: input.signal,
  });
  const parsed = verdictSchema.parse(raw);
  return { ...parsed, promptHash };
}

export async function runComplexAnalysis(
  input: AnalysisInput & { deepDiveContext: Record<string, string> },
): Promise<AnalysisResult> {
  const user = JSON.stringify({
    ...JSON.parse(buildUserPrompt(input.packet)),
    deepDive: {
      instruction: "Review the source excerpts below for trust-boundary issues and produce a deepDive section in your verdict.",
      sources: input.deepDiveContext,
    },
  });
  const promptHash = await hashPrompt(`${SYSTEM_PROMPT}\n\n${user}`);
  const raw = await input.invoke({
    system: SYSTEM_PROMPT,
    user,
    responseSchema: verdictSchema,
    signal: input.signal,
  });
  const parsed = verdictSchema.parse(raw);
  return { ...parsed, promptHash };
}
