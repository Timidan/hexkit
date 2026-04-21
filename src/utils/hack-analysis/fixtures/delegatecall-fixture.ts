import type { EvidencePacket } from "../../tx-analysis/types";

const VICTIM = "0x" + "1".repeat(40);
const ATTACKER_IMPL = "0x" + "e".repeat(40);

export const delegatecallFixture: EvidencePacket = {
  txHash: "0x" + "4".repeat(64),
  simulationId: "sim-delegate",
  chainId: 1,
  from: "0x" + "a".repeat(40),
  to: VICTIM,
  success: true,
  revertReason: null,
  writes: [
    {
      id: "w_0",
      contract: VICTIM,
      slot: "0x0",
      valueBefore: "0x0",
      valueAfter: "0x" + "e".repeat(40).padStart(64, "0"),
      label: "singleton",
      typeHint: null,
      opcodeIndex: 30,
      sourceLine: null,
      sourceFile: null,
    },
  ],
  reads: [],
  triggers: [
    {
      id: "t_0",
      contract: ATTACKER_IMPL,
      kind: "DELEGATECALL",
      selector: "0xa9059cbb",
      function: "transfer(address,uint256)",
      args: [],
      logTopics: [],
      opcodeIndex: 20,
    },
  ],
  profit: [],
  contracts: [
    {
      address: VICTIM,
      name: "Safe",
      proxyImplementation: "0x" + "1".repeat(40),
      verified: true,
      sourceProvider: "etherscan",
    },
    {
      address: ATTACKER_IMPL,
      name: null,
      proxyImplementation: null,
      verified: false,
      sourceProvider: "etherscan",
    },
  ],
  heuristics: [],
  truncated: { writes: false, reads: false, triggers: false, profit: false },
};

/** Benign proxy call — same delegatecall, target is verified, no slot-0 write. Rule must NOT fire. */
export const benignProxyCallFixture: EvidencePacket = {
  ...delegatecallFixture,
  writes: [],
  contracts: [
    {
      address: VICTIM,
      name: "Safe",
      proxyImplementation: "0x" + "1".repeat(40),
      verified: true,
      sourceProvider: "etherscan",
    },
    {
      address: ATTACKER_IMPL,
      name: "SafeSingleton",
      proxyImplementation: null,
      verified: true,
      sourceProvider: "etherscan",
    },
  ],
};
