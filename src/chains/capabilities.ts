import type { ChainFamily } from "./types";

export type ChainCapability =
  /** Wallet connection is available for this chain. */
  | "wallet"
  /** Read calls against deployed contracts/programs. */
  | "contract-read"
  /** Signed writes (transactions / instructions) via a connected wallet. */
  | "contract-write"
  /** Replay a prior on-chain transaction/signature through a simulator. */
  | "tx-replay"
  /** Local/remote simulation of a pending transaction. */
  | "simulation"
  /** Source-level step debugger. EVM-only via EDB today. */
  | "debug"
  /** Contract/class/program source lookup + ABI/IDL fetch. */
  | "source-lookup"
  /** Compare two contract code artifacts (bytecode, class hash, program). */
  | "bytecode-diff"
  /** Solidity-style storage-layout decoding. EVM-only. */
  | "storage-layout"
  /** Function-selector / signature / typed-data tools. */
  | "signature-tools"
  /** LI.FI Earn / yield integrations. */
  | "earn";

export const DEFAULT_FAMILY_CAPABILITIES: Record<ChainFamily, ReadonlySet<ChainCapability>> = {
  evm: new Set<ChainCapability>([
    "wallet",
    "contract-read",
    "contract-write",
    "tx-replay",
    "simulation",
    "debug",
    "source-lookup",
    "bytecode-diff",
    "storage-layout",
    "signature-tools",
    "earn",
  ]),
  starknet: new Set<ChainCapability>(),
  // `earn` only, so /solana/integrations/lifi-earn reaches the SVM stub's
  // "coming soon" card. Real capabilities land with the real SVM adapter.
  svm: new Set<ChainCapability>(["earn"]),
};

export function familyHasCapability(
  family: ChainFamily,
  capability: ChainCapability,
): boolean {
  return DEFAULT_FAMILY_CAPABILITIES[family].has(capability);
}
