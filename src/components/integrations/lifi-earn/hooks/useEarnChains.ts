import { useQuery } from "@tanstack/react-query";
import { fetchEarnChains } from "../earnApi";

// Earn's supported-chain list changes rarely — cache for an hour and never
// refetch on focus. Purely informational, safe to serve stale.
export function useEarnChains() {
  return useQuery({
    queryKey: ["earn-chains"],
    queryFn: fetchEarnChains,
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
