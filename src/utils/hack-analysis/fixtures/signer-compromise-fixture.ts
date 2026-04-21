import type { EvidencePacket } from "../../tx-analysis/types";
import { delegatecallFixture } from "./delegatecall-fixture";

export const signerCompromiseFixture: EvidencePacket = {
  ...delegatecallFixture,
  contracts: [
    {
      address: delegatecallFixture.to,
      name: "GnosisSafe",
      proxyImplementation: "0x" + "1".repeat(40),
      verified: true,
      sourceProvider: "etherscan",
    },
    {
      address: "0x" + "e".repeat(40),
      name: null,
      proxyImplementation: null,
      verified: false,
      sourceProvider: "etherscan",
    },
  ],
};
