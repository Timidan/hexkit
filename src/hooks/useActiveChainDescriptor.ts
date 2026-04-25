import { useMemo } from "react";
import type { ChainDescriptor, EvmChainDescriptor } from "../chains/types";
import { useActiveChainFamily } from "./useActiveChainFamily";
import { CHAIN_REGISTRY } from "../chains/registry";
import { toEvmChainKey, parseEvmChainId } from "../chains/types/evm";

// Returns Ethereum mainnet for the EVM family and null for the rest.
// Tools that need the user's selected network still go through
// ExtendedChain / NetworkSelector — the descriptor becomes load-bearing
// once adapters expose createRpcClient / createExplorerClient.
export function useActiveChainDescriptor(): ChainDescriptor | null {
  const family = useActiveChainFamily();

  return useMemo<ChainDescriptor | null>(() => {
    if (family !== "evm") return null;
    const mainnet = CHAIN_REGISTRY.find((chain) => chain.id === 1);
    if (!mainnet) return null;
    const descriptor: EvmChainDescriptor = {
      chainFamily: "evm",
      key: toEvmChainKey(mainnet.id),
      chainId: parseEvmChainId(mainnet.id),
      name: mainnet.name,
      nativeCurrency: mainnet.nativeCurrency,
    };
    return descriptor;
  }, [family]);
}
