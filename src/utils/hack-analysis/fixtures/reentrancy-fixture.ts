import type { EvidencePacket } from "../../tx-analysis/types";

const VICTIM = "0x" + "1".repeat(40);
const ATTACKER = "0x" + "a".repeat(40);

export const reentrancyFixture: EvidencePacket = {
  txHash: "0x" + "2".repeat(64),
  simulationId: "sim-reentry",
  chainId: 1,
  from: ATTACKER,
  to: VICTIM,
  success: true,
  revertReason: null,
  writes: [
    {
      id: "w_0",
      contract: VICTIM,
      slot: "0x1",
      valueBefore: "0x64",
      valueAfter: "0x0",
      label: "balance",
      typeHint: null,
      opcodeIndex: 15,
      sourceLine: null,
      sourceFile: null,
    },
  ],
  reads: [
    {
      id: "r_0",
      contract: VICTIM,
      slot: "0x1",
      value: "0x64",
      label: null,
      opcodeIndex: 10,
      sourceLine: null,
      sourceFile: null,
      followsWriteId: null,
    },
    {
      id: "r_1",
      contract: VICTIM,
      slot: "0x1",
      value: "0x64",
      label: null,
      opcodeIndex: 22,
      sourceLine: null,
      sourceFile: null,
      followsWriteId: "w_0",
    },
  ],
  triggers: [
    {
      id: "t_0",
      contract: VICTIM,
      kind: "CALL",
      selector: "0x2e1a7d4d",
      function: "withdraw(uint256)",
      args: [],
      logTopics: [],
      opcodeIndex: 5,
    },
    {
      id: "t_1",
      contract: ATTACKER,
      kind: "CALL",
      selector: "0x",
      function: null,
      args: [],
      logTopics: [],
      opcodeIndex: 18,
    },
  ],
  profit: [
    {
      id: "p_0",
      token: null,
      asset: "ETH",
      holder: ATTACKER,
      delta: "200000000000000000000",
      direction: "in",
      opcodeIndex: 28,
    },
  ],
  contracts: [],
  heuristics: [
    {
      name: "sload_after_sstore",
      evidenceId: "r_1",
      reason: "classic reentry re-read",
    },
  ],
  truncated: { writes: false, reads: false, triggers: false, profit: false },
};
