import type { EvidencePacket } from "../../tx-analysis/types";

const A = "0x" + "a".repeat(40);
const B = "0x" + "b".repeat(40);

export const benignVaultDeposit: EvidencePacket = {
  txHash: "0x" + "1".repeat(64),
  simulationId: "sim-benign",
  chainId: 1,
  from: A,
  to: B,
  success: true,
  revertReason: null,
  writes: [
    {
      id: "w_0",
      contract: B,
      slot: "0x1",
      valueBefore: "0x0",
      valueAfter: "0x1",
      label: null,
      typeHint: null,
      opcodeIndex: 10,
      sourceLine: null,
      sourceFile: null,
    },
  ],
  reads: [],
  triggers: [
    {
      id: "t_0",
      contract: B,
      kind: "CALL",
      selector: "0x6e553f65",
      function: "deposit(uint256,address)",
      args: [],
      logTopics: [],
      opcodeIndex: 5,
    },
  ],
  profit: [],
  contracts: [],
  heuristics: [],
  truncated: { writes: false, reads: false, triggers: false, profit: false },
};
