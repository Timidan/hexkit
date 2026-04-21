import type { EvidencePacket } from "../../tx-analysis/types";

const ATTACKER = "0x" + "a".repeat(40);
const BRIDGE = "0x" + "b".repeat(40);

export const bridgeForgeryFixture: EvidencePacket = {
  txHash: "0x" + "7".repeat(64),
  simulationId: "sim-bridge-forgery",
  chainId: 1,
  from: ATTACKER,
  to: BRIDGE,
  success: true,
  revertReason: null,
  writes: [],
  reads: [],
  triggers: [
    { id: "t_0", contract: BRIDGE, kind: "CALL", selector: "0xdeadbeef", function: "processMessage(bytes,bytes)", args: [], logTopics: [], opcodeIndex: 5 },
  ],
  profit: [
    { id: "p_0", token: null, asset: "ETH", holder: ATTACKER, delta: "40000000000000000000", direction: "in", opcodeIndex: 20 },
  ],
  contracts: [
    { address: BRIDGE, name: "L1CrossChainBridge", proxyImplementation: null, verified: true, sourceProvider: "etherscan" },
  ],
  heuristics: [],
  truncated: { writes: false, reads: false, triggers: false, profit: false },
};

/** Legit router swap: contract name does NOT match bridge regex. Rule MUST NOT fire. */
export const normalRouterFixture: EvidencePacket = {
  ...bridgeForgeryFixture,
  contracts: [
    { address: BRIDGE, name: "UniswapV3Router", proxyImplementation: null, verified: true, sourceProvider: "etherscan" },
  ],
};
