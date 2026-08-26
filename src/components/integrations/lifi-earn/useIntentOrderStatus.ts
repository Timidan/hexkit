import { useQuery } from "@tanstack/react-query";
import type { Hex } from "viem";
import {
  fetchIntentOrderStatus,
  isTerminalState,
  readOrderState,
  type CanonicalOrderState,
  type IntentOrderStatus,
} from "./intentsApi";

// Shared between IntentStatusTimeline and IntentBridgeStep so React Query
// dedupes the poll across components.
export interface IntentOrderStatusResult {
  status: IntentOrderStatus | null;
  state: CanonicalOrderState;
  rawLabel: string;
  isLoading: boolean;
}

export function useIntentOrderStatus(params: {
  onChainOrderId?: Hex;
  catalystOrderId?: string;
  enabled?: boolean;
}): IntentOrderStatusResult {
  const enabled =
    (params.enabled ?? true) &&
    Boolean(params.onChainOrderId || params.catalystOrderId);

  const query = useQuery<IntentOrderStatus | null>({
    queryKey: [
      "intent-order-status",
      params.onChainOrderId ?? params.catalystOrderId ?? "",
    ],
    enabled,
    queryFn: () =>
      fetchIntentOrderStatus({
        onChainOrderId: params.onChainOrderId,
        catalystOrderId: params.catalystOrderId,
      }),
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return 3_000;
      const { state } = readOrderState(data);
      if (isTerminalState(state)) return false;
      if (state === "Delivered") return 8_000;
      return 3_000;
    },
    refetchOnWindowFocus: true,
  });

  const { state, rawLabel } = readOrderState(query.data ?? null);
  return {
    status: query.data ?? null,
    state,
    rawLabel,
    isLoading: query.isLoading,
  };
}
