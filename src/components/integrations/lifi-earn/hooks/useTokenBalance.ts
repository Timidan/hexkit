import { useQuery } from "@tanstack/react-query";
import { readErc20Balance } from "./evmRead";

export function useTokenBalance(params: {
  tokenAddress: string | null;
  ownerAddress: string | null;
  chainId: number | null;
}) {
  return useQuery({
    queryKey: [
      "token-balance",
      params.tokenAddress,
      params.ownerAddress,
      params.chainId,
    ],
    queryFn: () =>
      readErc20Balance(
        params.tokenAddress!,
        params.ownerAddress!,
        params.chainId!,
      ),
    enabled:
      !!params.tokenAddress &&
      !!params.ownerAddress &&
      !!params.chainId,
    // Balance changes after approve/deposit — keep fresh-ish but don't hammer.
    staleTime: 10 * 1000,
    refetchOnWindowFocus: false,
  });
}
