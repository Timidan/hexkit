import { useQuery } from "@tanstack/react-query";
import { fetchEvmTokenBalance } from "../../../../features/earn/adapters/evm/evmReads";

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
    queryFn: async () => {
      const raw = await fetchEvmTokenBalance(
        params.chainId!,
        params.tokenAddress!,
        params.ownerAddress!,
      );
      return raw.toString();
    },
    enabled:
      !!params.tokenAddress &&
      !!params.ownerAddress &&
      !!params.chainId,
    // Balance changes after approve/deposit — keep fresh-ish but don't hammer.
    staleTime: 10 * 1000,
    refetchOnWindowFocus: false,
  });
}
