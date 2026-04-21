import type { EvidencePacket } from "../../tx-analysis/types";
const ATTACKER = "0x" + "a".repeat(40);
const POOL = "0x" + "c".repeat(40);
const LENDER = "0x" + "b".repeat(40);

export const flashloanFixture: EvidencePacket = {
  txHash: "0x" + "3".repeat(64),
  simulationId: "sim-flashloan",
  chainId: 1,
  from: ATTACKER,
  to: LENDER,
  success: true,
  revertReason: null,
  writes: Array.from({ length: 4 }, (_, i) => ({
    id: `w_${i}`, contract: POOL, slot: "0x5", valueBefore: "0x0", valueAfter: "0x100",
    label: "reserve", typeHint: null, opcodeIndex: 20 + i, sourceLine: null, sourceFile: null,
  })),
  reads: [],
  triggers: [
    { id: "t_0", contract: LENDER, kind: "CALL", selector: "0xab9c4b5d", function: "flashLoan(address,address,uint256,bytes)", args: [], logTopics: [], opcodeIndex: 5 },
    { id: "t_1", contract: POOL,   kind: "CALL", selector: "0x022c0d9f", function: "swap(uint256,uint256,address,bytes)",      args: [], logTopics: [], opcodeIndex: 25 },
    { id: "t_2", contract: LENDER, kind: "CALL", selector: "0xa9059cbb", function: "transfer(address,uint256)",                 args: [], logTopics: [], opcodeIndex: 40 },
  ],
  profit: [
    { id: "p_0", token: null, asset: "ETH", holder: ATTACKER, delta: "50000000000000000000", direction: "in", opcodeIndex: 45 },
  ],
  contracts: [],
  heuristics: [
    { name: "large_delta", evidenceId: "p_0", reason: "attacker profit exceeds 10 ETH" },
    { name: "accumulator", evidenceId: "w_0", reason: "POOL slot 0x5 written 4 times" },
  ],
  truncated: { writes: false, reads: false, triggers: false, profit: false },
};
