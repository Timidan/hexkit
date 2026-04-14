import { useQuery } from "@tanstack/react-query";
import { fetchEarnPositions } from "../earnApi";

export function useEarnPositions(address: string | null) {
  return useQuery({
    queryKey: ["earn-positions", address],
    queryFn: () => fetchEarnPositions(address!),
    enabled: !!address && /^0x[a-fA-F0-9]{40}$/.test(address),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
