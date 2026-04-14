import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchEarnVaults } from "../earnApi";
import type { EarnVaultsResponse } from "../types";

export function useEarnVaults(
  chainId?: number | null,
  sortBy?: string,
  sortDirection?: string,
  protocol?: string | null,
  asset?: string | null,
  minTvlUsd?: number | null,
) {
  return useInfiniteQuery<EarnVaultsResponse>({
    queryKey: [
      "earn-vaults",
      chainId ?? "all",
      sortBy ?? "default",
      sortDirection ?? "default",
      protocol ?? "all",
      asset ?? "all",
      minTvlUsd ?? 0,
    ],
    queryFn: ({ pageParam }) =>
      fetchEarnVaults({
        cursor: pageParam as string | undefined,
        chainId: chainId ?? undefined,
        sortBy,
        sortDirection,
        protocol: protocol ?? undefined,
        asset: asset ?? undefined,
        minTvlUsd: minTvlUsd ?? undefined,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
