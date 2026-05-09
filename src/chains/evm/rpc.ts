// Wraps the existing providerPool so adapter-routed callers don't touch
// ethers directly. Feature code can keep importing providerPool during
// the migration.
import type { ethers } from "ethers";
import { getSharedProvider } from "../../utils/providerPool";
import type { Chain } from "../../types";
import type { EvmChainDescriptor } from "../types";

export interface EvmRpcClient {
  readonly provider: ethers.providers.JsonRpcProvider;
}

function descriptorToLegacyChain(descriptor: EvmChainDescriptor, legacy: Chain): Chain {
  return {
    id: descriptor.chainId as number,
    chainFamily: "evm",
    chainKey: descriptor.key,
    name: descriptor.name,
    rpcUrl: legacy.rpcUrl,
    explorerUrl: legacy.explorerUrl,
    blockExplorer: legacy.blockExplorer,
    apiUrl: legacy.apiUrl,
    explorers: legacy.explorers,
    nativeCurrency: legacy.nativeCurrency,
  };
}

export function createEvmRpcClient(
  descriptor: EvmChainDescriptor,
  legacy: Chain,
): EvmRpcClient {
  const chain = descriptorToLegacyChain(descriptor, legacy);
  return {
    provider: getSharedProvider(chain),
  };
}
