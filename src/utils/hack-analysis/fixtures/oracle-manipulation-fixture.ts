import type { EvidencePacket } from "../../tx-analysis/types";

const ATTACKER = "0x" + "a".repeat(40);
const LENDER = "0x" + "b".repeat(40);
const ORACLE = "0x" + "f".repeat(40);

export const oracleManipulationFixture: EvidencePacket = {
  txHash: "0x" + "6".repeat(64),
  simulationId: "sim-oracle",
  chainId: 1,
  from: ATTACKER,
  to: LENDER,
  success: true,
  revertReason: null,
  writes: [],
  reads: [],
  triggers: [
    { id: "t_0", contract: LENDER, kind: "CALL",       selector: "0xab9c4b5d", function: "flashLoan(address,address,uint256,bytes)", args: [], logTopics: [], opcodeIndex: 5 },
    { id: "t_1", contract: ORACLE, kind: "STATICCALL", selector: "0x50d25bcd", function: "latestAnswer()",                            args: [], logTopics: [], opcodeIndex: 15 },
  ],
  profit: [
    { id: "p_0", token: null, asset: "ETH", holder: ATTACKER, delta: "30000000000000000000", direction: "in", opcodeIndex: 20 },
  ],
  contracts: [],
  heuristics: [],
  truncated: { writes: false, reads: false, triggers: false, profit: false },
};
