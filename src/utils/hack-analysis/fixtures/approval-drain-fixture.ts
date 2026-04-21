import type { EvidencePacket } from "../../tx-analysis/types";

const VICTIM_EOA = "0x" + "a".repeat(40);
const ATTACKER = "0x" + "b".repeat(40);
const TOKEN = "0x" + "c".repeat(40);

/** Attacker signs the tx; uses pre-existing allowance of VICTIM_EOA to pull tokens. */
export const approvalDrainFixture: EvidencePacket = {
  txHash: "0x" + "5".repeat(64),
  simulationId: "sim-approval-drain",
  chainId: 1,
  from: ATTACKER,
  to: TOKEN,
  success: true,
  revertReason: null,
  writes: [],
  reads: [],
  triggers: [
    {
      id: "t_0",
      contract: TOKEN,
      kind: "CALL",
      selector: "0x23b872dd",
      function: "transferFrom(address,address,uint256)",
      args: [
        { name: "from", value: VICTIM_EOA },
        { name: "to", value: ATTACKER },
        { name: "amount", value: "1000000000000000000000" },
      ],
      logTopics: [],
      opcodeIndex: 5,
    },
  ],
  profit: [
    {
      id: "p_0",
      token: TOKEN,
      asset: "ERC20",
      holder: ATTACKER,
      delta: "1000000000000000000000",
      direction: "in",
      opcodeIndex: 8,
    },
    {
      id: "p_1",
      token: TOKEN,
      asset: "ERC20",
      holder: VICTIM_EOA,
      delta: "-1000000000000000000000",
      direction: "out",
      opcodeIndex: 8,
    },
  ],
  contracts: [],
  heuristics: [{ name: "large_delta", evidenceId: "p_0", reason: "> 10 ETH equiv" }],
  truncated: { writes: false, reads: false, triggers: false, profit: false },
};

/** Legit Uniswap router swap: VICTIM_EOA (=signer) approves router, router does transferFrom(me, router, X). Rule MUST NOT fire. */
const SIGNER = VICTIM_EOA;
const ROUTER = "0x" + "d".repeat(40);
export const routerSwapFixture: EvidencePacket = {
  ...approvalDrainFixture,
  from: SIGNER,
  to: ROUTER,
  triggers: [
    {
      id: "t_0",
      contract: TOKEN,
      kind: "CALL",
      selector: "0x23b872dd",
      function: "transferFrom(address,address,uint256)",
      args: [
        { name: "from", value: SIGNER },
        { name: "to", value: ROUTER },
        { name: "amount", value: "1000000000000000000000" },
      ],
      logTopics: [],
      opcodeIndex: 5,
    },
  ],
  profit: [
    {
      id: "p_0",
      token: TOKEN,
      asset: "ERC20",
      holder: ROUTER,
      delta: "1000000000000000000000",
      direction: "in",
      opcodeIndex: 8,
    },
    {
      id: "p_1",
      token: TOKEN,
      asset: "ERC20",
      holder: SIGNER,
      delta: "-1000000000000000000000",
      direction: "out",
      opcodeIndex: 8,
    },
  ],
};
