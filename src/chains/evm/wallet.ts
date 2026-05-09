import type { EvmChainDescriptor } from "../types";
import type { Address } from "../types/evm";
import type { WalletSession } from "../adapters/types";

export type EvmWalletSession = WalletSession<EvmChainDescriptor>;

export function buildEvmWalletSession(
  address: Address,
  disconnect: () => Promise<void>,
): EvmWalletSession {
  return {
    chainFamily: "evm",
    address,
    disconnect,
  };
}
