import type { EvidencePacket } from "../../tx-analysis/types";

const ATTACKER = "0x" + "a".repeat(40);
const LENDER = "0x" + "b".repeat(40);
const POOL = "0x" + "c".repeat(40);

export const mathInvariantFixture: EvidencePacket = {
  txHash: "0x" + "a".repeat(64),
  simulationId: "sim-math",
  chainId: 1,
  from: ATTACKER,
  to: LENDER,
  success: true,
  revertReason: null,
  writes: [
    // Only ONE write per slot — no repeated same-slot writes (that would be flashloan-price-manipulation)
    { id: "w_0", contract: POOL, slot: "0x2", valueBefore: "0x0", valueAfter: "0x1", label: null, typeHint: null, opcodeIndex: 10, sourceLine: null, sourceFile: null },
    { id: "w_1", contract: POOL, slot: "0x3", valueBefore: "0x0", valueAfter: "0x1", label: null, typeHint: null, opcodeIndex: 12, sourceLine: null, sourceFile: null },
  ],
  reads: [],
  triggers: [
    { id: "t_0", contract: LENDER, kind: "CALL", selector: "0xab9c4b5d", function: "flashLoan(address,address,uint256,bytes)", args: [], logTopics: [], opcodeIndex: 5 },
    { id: "t_1", contract: POOL,   kind: "CALL", selector: "0xdead0003", function: "donate(uint256)",                          args: [], logTopics: [], opcodeIndex: 15 },
  ],
  profit: [
    { id: "p_0", token: null, asset: "ETH", holder: ATTACKER, delta: "60000000000000000000", direction: "in", opcodeIndex: 20 },
  ],
  contracts: [],
  heuristics: [
    { name: "large_delta", evidenceId: "p_0", reason: "attacker netted > 10 ETH" },
  ],
  truncated: { writes: false, reads: false, triggers: false, profit: false },
};
