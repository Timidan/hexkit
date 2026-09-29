import { useQuery } from "@tanstack/react-query";
import { readErc20Allowance } from "./evmRead";

export async function fetchAllowance(
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
  chainId: number
): Promise<string> {
  return readErc20Allowance(
    tokenAddress,
    ownerAddress,
    spenderAddress,
    chainId
  );
}

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
      fetchAllowance(
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
