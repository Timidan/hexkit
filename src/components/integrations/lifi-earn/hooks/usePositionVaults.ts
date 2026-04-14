import { useQuery } from "@tanstack/react-query";
import { fetchEarnVaults } from "../earnApi";
import type { EarnVault, EarnPosition } from "../types";

/**
 * Given the user's positions, fetches ALL vault pages for each chain present
 * in the positions. This ensures the vault lookup map has complete data for
 * matching positions to vaults (the main useEarnVaults infinite query only
 * loads the first page by default).
 */
export function usePositionVaults(positions: EarnPosition[]) {
  // Unique chain IDs from positions
  const chainIds = [...new Set(positions.map((p) => p.chainId))].sort();
  const key = chainIds.join(",");

  return useQuery<EarnVault[]>({
    queryKey: ["position-vaults", key],
    queryFn: async () => {
      if (chainIds.length === 0) return [];

      const allVaults: EarnVault[] = [];

      // Fetch all pages for each chain in parallel
      await Promise.all(
        chainIds.map(async (chainId) => {
          let cursor: string | undefined;
          do {
            const page = await fetchEarnVaults({ chainId, cursor });
            allVaults.push(...page.data);
            cursor = page.nextCursor ?? undefined;
          } while (cursor);
        }),
      );

      return allVaults;
    },
    enabled: chainIds.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
