import { useQuery } from "@tanstack/react-query";
import { fetchEarnProtocols } from "../earnApi";

// Protocol registry is static between Earn releases — hour-long cache matches
// useEarnChains. Used to populate the protocol filter chip row.
export function useEarnProtocols() {
  return useQuery({
    queryKey: ["earn-protocols"],
    queryFn: fetchEarnProtocols,
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
