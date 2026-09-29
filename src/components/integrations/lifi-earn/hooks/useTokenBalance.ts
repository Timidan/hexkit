import { useQuery } from "@tanstack/react-query";
import { readErc20Balance } from "./evmRead";

export async function fetchBalance(
  tokenAddress: string,
  ownerAddress: string,
  chainId: number,
): Promise<string> {
  return readErc20Balance(tokenAddress, ownerAddress, chainId);
}

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
      fetchBalance(
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
