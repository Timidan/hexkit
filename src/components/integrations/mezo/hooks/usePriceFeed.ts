import { useReadContract } from "wagmi";
import { MEZO_CONTRACTS } from "../../../../../data/mezoContracts";
import { MEZO_ABIS } from "../abi";
import { MEZO_TESTNET_CHAIN_ID } from "../constants";

/**
 * Live BTC/USD from Mezo's PriceFeed as a 1e18 bigint. `fetchPrice()` is
 * the supported entry point — Liquity's `lastGoodPrice()` reverts here.
 */
export function usePriceFeed() {
  return useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: MEZO_CONTRACTS.PriceFeed,
    abi: MEZO_ABIS.PriceFeed,
    functionName: "fetchPrice",
    query: {
      refetchInterval: 15_000,
      staleTime: 10_000,
    },
  });
}
