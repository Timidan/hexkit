import { useQuery } from "@tanstack/react-query";
import { readErc20Allowance } from "./evmRead";

export function useTokenAllowance(params: {
  tokenAddress: string | null;
  ownerAddress: string | null;
  spenderAddress: string | null;
  chainId: number | null;
}) {
  return useQuery({
    queryKey: [
      "token-allowance",
      params.tokenAddress,
      params.ownerAddress,
      params.spenderAddress,
      params.chainId,
    ],
    queryFn: () =>
      readErc20Allowance(
        params.tokenAddress!,
        params.ownerAddress!,
        params.spenderAddress!,
        params.chainId!
      ),
    enabled:
      !!params.tokenAddress &&
      !!params.ownerAddress &&
      !!params.spenderAddress &&
      !!params.chainId,
    staleTime: 15 * 1000,
    refetchOnWindowFocus: false,
  });
}
