import type { EvmChainDescriptor } from "../types";
import { DEFAULT_FAMILY_CAPABILITIES } from "../capabilities";
import type {
  AddressParseResult,
  ChainAdapter,
  FamilyAddress,
} from "./types";
import { parseAddress as parseEvmAddress, isAddress as isEvmAddress } from "../types/evm";

export const evmAdapter: ChainAdapter<EvmChainDescriptor> = {
  family: "evm",
  capabilities: DEFAULT_FAMILY_CAPABILITIES.evm,

  parseAddress(input: string): AddressParseResult<EvmChainDescriptor> {
    const trimmed = input.trim();
    if (!isEvmAddress(trimmed)) {
      return { ok: false, error: "Expected a 0x-prefixed 20-byte EVM address" };
    }
    return { ok: true, address: parseEvmAddress(trimmed) };
  },

  formatAddress(
    address: FamilyAddress<EvmChainDescriptor>,
    options?: { compact?: boolean },
  ): string {
    if (options?.compact) {
      return `${address.slice(0, 6)}…${address.slice(-4)}`;
    }
    return address;
  },
};
