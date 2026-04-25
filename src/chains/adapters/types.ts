// ChainAdapter is the boundary between generic HexKit code and
// family-specific implementations. Generic code calls getAdapter(family)
// instead of branching on family literals, and capabilities are the gate —
// if adapter.capabilities lacks one, the UI hides the tool.
import type {
  ChainDescriptor,
  ChainFamily,
  EvmChainDescriptor,
  StarknetChainDescriptor,
  SvmChainDescriptor,
} from "../types";
import type { ChainCapability } from "../capabilities";
import type { Address as EvmAddress } from "../types/evm";
import type { StarknetAddress } from "../types/starknet";
import type { PublicKey as SvmPublicKey } from "../types/svm";

// Extend when a new family is added.
export type FamilyAddress<T extends ChainDescriptor> =
  T extends EvmChainDescriptor ? EvmAddress :
  T extends StarknetChainDescriptor ? StarknetAddress :
  T extends SvmChainDescriptor ? SvmPublicKey :
  never;

export type AddressParseResult<T extends ChainDescriptor> =
  | { ok: true; address: FamilyAddress<T> }
  | { ok: false; error: string };

// Family-discriminated so TypeScript rejects passing a Starknet session
// into an EVM-typed slot.
export type WalletSession<T extends ChainDescriptor> = {
  chainFamily: T["chainFamily"];
  address: FamilyAddress<T>;
  disconnect: () => Promise<void>;
};

export interface ChainAdapter<T extends ChainDescriptor = ChainDescriptor> {
  readonly family: T["chainFamily"];
  readonly capabilities: ReadonlySet<ChainCapability>;
  parseAddress(input: string): AddressParseResult<T>;
  formatAddress(address: FamilyAddress<T>, options?: { compact?: boolean }): string;
}

export type AdapterRegistry = {
  [F in ChainFamily]: ChainAdapter | null;
};
