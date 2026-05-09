import { useQuery } from "@tanstack/react-query";
import { fetchEvmTokenAllowance } from "../../../../features/earn/adapters/evm/evmReads";

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
    queryFn: async () => {
      const raw = await fetchEvmTokenAllowance(
        params.chainId!,
        params.tokenAddress!,
        params.ownerAddress!,
        params.spenderAddress!,
      );
      return raw.toString();
    },
    enabled:
      !!params.tokenAddress &&
      !!params.ownerAddress &&
      !!params.spenderAddress &&
      !!params.chainId,
    staleTime: 15 * 1000,
    refetchOnWindowFocus: false,
  });
}
