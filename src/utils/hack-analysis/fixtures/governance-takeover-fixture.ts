import type { EvidencePacket } from "../../tx-analysis/types";

const ATTACKER = "0x" + "a".repeat(40);
const GOV = "0x" + "9".repeat(40);

export const governanceTakeoverFixture: EvidencePacket = {
  txHash: "0x" + "8".repeat(64),
  simulationId: "sim-gov",
  chainId: 1,
  from: ATTACKER,
  to: GOV,
  success: true,
  revertReason: null,
  writes: [],
  reads: [],
  triggers: [
    { id: "t_0", contract: GOV, kind: "CALL", selector: "0xdead0001", function: "executeTransaction(address,uint256,string,bytes,uint256)", args: [], logTopics: [], opcodeIndex: 5 },
  ],
  profit: [
    { id: "p_0", token: null, asset: "ETH", holder: ATTACKER, delta: "25000000000000000000", direction: "in", opcodeIndex: 20 },
  ],
  contracts: [],
  heuristics: [],
  truncated: { writes: false, reads: false, triggers: false, profit: false },
};
