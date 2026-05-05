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
  /** Interactive transaction builder UI (drag-and-drop call sequencing).
   *  Distinct from `simulation` so families can opt into trace/replay
   *  views without exposing the EVM-only TransactionBuilderHub, which
   *  hard-depends on wagmi's `useAccount` and would crash a non-EVM
   *  WagmiProvider tree. */
  | "tx-builder"
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
    "tx-builder",
    "debug",
    "source-lookup",
    "bytecode-diff",
    "storage-layout",
    "signature-tools",
    "earn",
  ]),
  // `simulation` and `tx-replay` keep the bridge `/trace` + `/simulate`
  // calls reachable. `source-lookup` unlocks /starknet/explorer (the Cairo
  // class explorer). `tx-builder` unlocks /starknet/builder, but it is
  // dispatched by family inside PersistentTools (`BuilderDispatch`) — the
  // hard "EVM-only" check that used to live in `BuilderToolGate` is gone,
  // because Starknet now has its own builder hub. `wallet` stays off here:
  // wallet connection for Starknet is owned by the bridges/StarknetBridge
  // picker, not the generic capability gate.
  starknet: new Set<ChainCapability>([
    "simulation",
    "tx-replay",
    "tx-builder",
    "source-lookup",
  ]),
  // Retained in ChainFamily for type-level compatibility with persisted routes
  // and shared registries. The Solana route/provider surface is disabled for
  // this production release.
  svm: new Set<ChainCapability>([]),
};

export function familyHasCapability(
  family: ChainFamily,
  capability: ChainCapability,
): boolean {
  return DEFAULT_FAMILY_CAPABILITIES[family].has(capability);
}
