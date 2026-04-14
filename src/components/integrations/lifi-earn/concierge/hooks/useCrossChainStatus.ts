import { useQuery } from "@tanstack/react-query";
import { fetchCrossChainStatus } from "../../earnApi";

// Poll LI.FI /v1/status until DONE/FAILED/INVALID. NOT_FOUND stays non-terminal
// because fresh tx hashes take a few seconds to be indexed.
export function useCrossChainStatus(args: {
  txHash: string | null;
  fromChain: number;
  toChain: number;
  enabled?: boolean;
  intervalMs?: number;
}) {
  const {
    txHash,
    fromChain,
    toChain,
    enabled = true,
    intervalMs = 4000,
  } = args;

  return useQuery({
    queryKey: ["lifi-status", txHash, fromChain, toChain],
    enabled: enabled && !!txHash && fromChain !== toChain,
    queryFn: async () => {
      if (!txHash) throw new Error("no txHash");
      return fetchCrossChainStatus({ txHash, fromChain, toChain });
    },
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return intervalMs;
      if (
        data.status === "DONE" ||
        data.status === "FAILED" ||
        data.status === "INVALID"
      ) {
        return false;
      }
      return intervalMs;
    },
    retry: 3,
    staleTime: 0,
  });
}
