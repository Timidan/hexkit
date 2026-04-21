import type { EvidencePacket } from "../../tx-analysis/types";

const ATTACKER = "0x" + "a".repeat(40);
const VICTIM = "0x" + "c".repeat(40);

export const accessControlFixture: EvidencePacket = {
  txHash: "0x" + "9".repeat(64),
  simulationId: "sim-access",
  chainId: 1,
  from: ATTACKER,
  to: VICTIM,
  success: true,
  revertReason: null,
  writes: [
    { id: "w_0", contract: VICTIM, slot: "0x3", valueBefore: "0x0", valueAfter: "0x" + "a".repeat(40).padStart(64, "0"), label: "owner", typeHint: null, opcodeIndex: 10, sourceLine: null, sourceFile: null },
  ],
  reads: [],
  triggers: [
    { id: "t_0", contract: VICTIM, kind: "CALL", selector: "0xdead0002", function: "unknownFunction()", args: [], logTopics: [], opcodeIndex: 5 },
  ],
  profit: [
    { id: "p_0", token: null, asset: "ETH", holder: ATTACKER, delta: "20000000000000000000", direction: "in", opcodeIndex: 20 },
  ],
  contracts: [],
  heuristics: [],
  truncated: { writes: false, reads: false, triggers: false, profit: false },
};
